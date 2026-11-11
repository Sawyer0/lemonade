import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { BRAND_COLOR_SCHEME_STORAGE_KEY } from '@mobile/constants/brandScheme';
import { BrandColorSchemeProvider } from '../../providers/brandColorScheme';
import { ColorSchemeToggle } from '../ColorSchemeToggle';

let mockSystemScheme: 'light' | 'dark' | null = 'light';
const mockStorage: Record<string, string> = {};

jest.mock('@mobile/hooks/use-color-scheme', () => ({
    useColorScheme: () => mockSystemScheme,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn(async (key: string) => mockStorage[key] ?? null),
        setItem: jest.fn(async (key: string, value: string) => {
            mockStorage[key] = value;
        }),
    },
}));

function renderToggle() {
    return render(
        <PaperProvider>
            <BrandColorSchemeProvider>
                <ColorSchemeToggle />
            </BrandColorSchemeProvider>
        </PaperProvider>,
    );
}

function toggleLabel(toggle: { props: { accessibilityLabel?: string } }): string {
    return toggle.props.accessibilityLabel ?? '';
}

describe('ColorSchemeToggle', () => {
    beforeEach(() => {
        mockSystemScheme = 'light';
        for (const key of Object.keys(mockStorage)) {
            delete mockStorage[key];
        }
        jest.clearAllMocks();
    });

    it('names the current mode and the next mode in its label', async () => {
        mockStorage[BRAND_COLOR_SCHEME_STORAGE_KEY] = 'light';
        const { getByTestId } = renderToggle();

        await waitFor(() => expect(toggleLabel(getByTestId('color-scheme-toggle'))).toContain('Color scheme: Light'));
        expect(toggleLabel(getByTestId('color-scheme-toggle'))).toContain('switch to Dark mode');
    });

    it('cycles Light -> Dark -> System -> Light and persists each choice', async () => {
        mockStorage[BRAND_COLOR_SCHEME_STORAGE_KEY] = 'light';
        const { getByTestId } = renderToggle();

        await waitFor(() => expect(toggleLabel(getByTestId('color-scheme-toggle'))).toContain('Color scheme: Light'));

        fireEvent.press(getByTestId('color-scheme-toggle'));
        await waitFor(() => expect(toggleLabel(getByTestId('color-scheme-toggle'))).toContain('Color scheme: Dark'));
        expect(mockStorage[BRAND_COLOR_SCHEME_STORAGE_KEY]).toBe('dark');

        fireEvent.press(getByTestId('color-scheme-toggle'));
        await waitFor(() => expect(toggleLabel(getByTestId('color-scheme-toggle'))).toContain('Color scheme: System'));
        expect(mockStorage[BRAND_COLOR_SCHEME_STORAGE_KEY]).toBe('system');

        fireEvent.press(getByTestId('color-scheme-toggle'));
        await waitFor(() => expect(toggleLabel(getByTestId('color-scheme-toggle'))).toContain('Color scheme: Light'));
        expect(mockStorage[BRAND_COLOR_SCHEME_STORAGE_KEY]).toBe('light');
    });

    it('defaults to the system mode when nothing is stored', async () => {
        mockSystemScheme = 'dark';
        const { getByTestId } = renderToggle();

        await waitFor(() => expect(toggleLabel(getByTestId('color-scheme-toggle'))).toContain('Color scheme: System'));
    });
});
