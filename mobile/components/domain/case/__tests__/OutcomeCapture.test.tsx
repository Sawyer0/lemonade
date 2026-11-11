import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { OutcomeCapture } from '../OutcomeCapture';

jest.mock('firebase/firestore');
jest.mock('@mobile/hooks/use-color-scheme', () => ({
    useColorScheme: () => 'dark' as const,
}));
jest.mock('@mobile/infrastructure/firebase/config', () => ({
    auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue('test-token') } },
    db: {},
}));

// GradientButton renders an expo-linear-gradient; keep the test on the
// outcome behavior, not the gradient.
jest.mock('@mobile/components/ui/GradientButton', () => ({
    GradientButton: ({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) => {
        const { TouchableOpacity, Text } = require('react-native');
        return (
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={title}
                onPress={onPress}
                disabled={disabled}
            >
                <Text>{title}</Text>
            </TouchableOpacity>
        );
    },
}));

type SnapshotListener = (snapshot: { exists: () => boolean; data: () => Record<string, unknown> | undefined }) => void;

const listeners = new Map<string, SnapshotListener>();
const caseId = '123e4567-e89b-12d3-a456-426614174000';

const openCase = {
    id: caseId,
    vehicleId: 'vehicle-1',
    userId: 'user-123',
    status: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

function caseDetailsResponse(status: 'open' | 'closed', entries: unknown[] = []) {
    return {
        ok: true,
        json: async () => ({ data: { case: { ...openCase, status }, entries } }),
    };
}

describe('OutcomeCapture', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        listeners.clear();
        process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
        (doc as jest.Mock).mockImplementation((_db: unknown, collection: string, id: string) => `${collection}/${id}`);
        (onSnapshot as jest.Mock).mockImplementation((path: string, listener: SnapshotListener) => {
            listeners.set(path, listener);
            return jest.fn();
        });
        global.fetch = jest.fn();
    });

    // The session listener fires outside React's render pass; wrap the
    // emission in act so the case-id update and its load effect flush
    // before the queries below poll, instead of racing findByText.
    const emitSession = (data: Record<string, unknown> | undefined) =>
        act(() => {
            listeners.get('sessions/session-1')?.({ exists: () => data !== undefined, data: () => data });
        });

    const renderCapture = () => render(<OutcomeCapture sessionId="session-1" />);

    it('renders nothing when the session has no case', async () => {
        const { toJSON } = renderCapture();
        emitSession({ status: 'active' });
        await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
        expect(toJSON()).toBeNull();
    });

    it('shows the outcome form for an open case', async () => {
        (global.fetch as jest.Mock).mockResolvedValue(caseDetailsResponse('open'));
        const { findByText, getByLabelText } = renderCapture();
        emitSession({ caseId });

        expect(await findByText('Repair outcome')).toBeTruthy();
        expect(getByLabelText('Repair performed')).toBeTruthy();
        expect(getByLabelText('Fault codes cleared')).toBeTruthy();
        expect(global.fetch).toHaveBeenCalledWith(
            `https://api.example.com/api/cases/${caseId}`,
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
        );
    });

    it('closes the case confirmed when all three checks pass', async () => {
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce(caseDetailsResponse('open'))
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) })
            .mockResolvedValueOnce(
                caseDetailsResponse('closed', [
                    {
                        id: 'entry-1',
                        type: 'outcome',
                        payload: {
                            repairPerformed: 'Replaced radiator hose',
                            partsReplaced: ['Radiator hose'],
                            codesCleared: true,
                            symptomGone: true,
                            retestPassed: true,
                            confirmed: true,
                        },
                    },
                ]),
            );
        const { findByText, getByLabelText, getByText } = renderCapture();
        emitSession({ caseId });
        await findByText('Repair outcome');

        fireEvent.changeText(getByLabelText('Repair performed'), 'Replaced radiator hose');
        fireEvent.changeText(getByLabelText('Parts replaced'), 'Radiator hose');
        fireEvent.press(getByLabelText('Fault codes cleared'));
        fireEvent.press(getByLabelText('Symptom gone'));
        fireEvent.press(getByLabelText('Re-test passed'));

        await waitFor(() => expect(getByText('Confirmed fixed — all checks passed.')).toBeTruthy());
        fireEvent.press(getByText('Close case — confirmed fixed'));

        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(
                `https://api.example.com/api/cases/${caseId}/close`,
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        outcome: {
                            repairPerformed: 'Replaced radiator hose',
                            partsReplaced: ['Radiator hose'],
                            codesCleared: true,
                            symptomGone: true,
                            retestPassed: true,
                            confirmed: true,
                        },
                    }),
                }),
            ),
        );
        expect(await findByText('Case closed')).toBeTruthy();
        expect(getByText('Outcome: Confirmed fixed')).toBeTruthy();
    });

    it('closes the case unconfirmed when checks fail and shows it read-only', async () => {
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce(caseDetailsResponse('open'))
            .mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) })
            .mockResolvedValueOnce(
                caseDetailsResponse('closed', [
                    {
                        id: 'entry-1',
                        type: 'outcome',
                        payload: {
                            repairPerformed: 'Tightened hose clamp',
                            partsReplaced: [],
                            codesCleared: false,
                            symptomGone: false,
                            retestPassed: false,
                            confirmed: false,
                        },
                    },
                ]),
            );
        const { findByText, getByLabelText, getByText } = renderCapture();
        emitSession({ caseId });
        await findByText('Repair outcome');

        fireEvent.changeText(getByLabelText('Repair performed'), 'Tightened hose clamp');
        fireEvent.press(getByText('Close case — unconfirmed'));

        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/close'),
                expect.objectContaining({
                    body: expect.stringContaining('"confirmed":false'),
                }),
            ),
        );
        expect(await findByText('Case closed')).toBeTruthy();
        expect(getByText('Outcome: Unconfirmed — fault not proven fixed')).toBeTruthy();
    });

    it('shows the closed outcome read-only without a form', async () => {
        (global.fetch as jest.Mock).mockResolvedValue(
            caseDetailsResponse('closed', [
                {
                    id: 'entry-1',
                    type: 'outcome',
                    payload: {
                        repairPerformed: 'Replaced radiator hose',
                        partsReplaced: ['Radiator hose'],
                        codesCleared: true,
                        symptomGone: true,
                        retestPassed: true,
                        confirmed: true,
                    },
                },
            ]),
        );
        const { findByText, queryByLabelText } = renderCapture();
        emitSession({ caseId });

        expect(await findByText('Case closed')).toBeTruthy();
        expect(await findByText('Repair: Replaced radiator hose')).toBeTruthy();
        expect(queryByLabelText('Repair performed')).toBeNull();
    });
});
