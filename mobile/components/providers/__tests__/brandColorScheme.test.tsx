import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { BRAND_COLOR_SCHEME_STORAGE_KEY, type BrandColorSchemeMode } from '@mobile/constants/brandScheme';
import { BrandColorSchemeProvider, useBrandColorScheme } from '../brandColorScheme';

let mockSystemScheme: 'light' | 'dark' | null = 'dark';
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

let capturedSetMode: ((mode: BrandColorSchemeMode) => Promise<void>) | null = null;

function Probe() {
    const { scheme, mode, setMode } = useBrandColorScheme();
    useEffect(() => {
        capturedSetMode = setMode;
    }, [setMode]);
    return (
        <>
            <Text testID="scheme">{scheme}</Text>
            <Text testID="mode">{mode}</Text>
        </>
    );
}

describe('BrandColorSchemeProvider', () => {
    beforeEach(() => {
        mockSystemScheme = 'dark';
        for (const key of Object.keys(mockStorage)) {
            delete mockStorage[key];
        }
        capturedSetMode = null;
        jest.clearAllMocks();
    });

    it('follows the OS preference with mode system when nothing is stored', async () => {
        const { getByTestId } = render(
            <BrandColorSchemeProvider>
                <Probe />
            </BrandColorSchemeProvider>,
        );

        await waitFor(() => expect(getByTestId('scheme').props.children).toBe('dark'));
        expect(getByTestId('mode').props.children).toBe('system');
    });

    it('loads the stored mode', async () => {
        mockStorage[BRAND_COLOR_SCHEME_STORAGE_KEY] = 'light';
        const { getByTestId } = render(
            <BrandColorSchemeProvider>
                <Probe />
            </BrandColorSchemeProvider>,
        );

        await waitFor(() => expect(getByTestId('scheme').props.children).toBe('light'));
        expect(getByTestId('mode').props.children).toBe('light');
    });

    it('ignores a stored value that is not a mode', async () => {
        mockStorage[BRAND_COLOR_SCHEME_STORAGE_KEY] = 'banana';
        const { getByTestId } = render(
            <BrandColorSchemeProvider>
                <Probe />
            </BrandColorSchemeProvider>,
        );

        await waitFor(() => expect(getByTestId('scheme').props.children).toBe('dark'));
        expect(getByTestId('mode').props.children).toBe('system');
    });

    it('setMode switches the scheme and persists it', async () => {
        const { getByTestId } = render(
            <BrandColorSchemeProvider>
                <Probe />
            </BrandColorSchemeProvider>,
        );

        await waitFor(() => expect(getByTestId('scheme').props.children).toBe('dark'));
        expect(capturedSetMode).not.toBeNull();

        await act(async () => {
            await capturedSetMode!('light');
        });
        expect(getByTestId('scheme').props.children).toBe('light');
        expect(getByTestId('mode').props.children).toBe('light');
        expect(mockStorage[BRAND_COLOR_SCHEME_STORAGE_KEY]).toBe('light');

        await act(async () => {
            await capturedSetMode!('dark');
        });
        expect(getByTestId('scheme').props.children).toBe('dark');
        expect(mockStorage[BRAND_COLOR_SCHEME_STORAGE_KEY]).toBe('dark');
    });
});

describe('useBrandColorScheme outside a provider', () => {
    it('falls back to the OS preference with mode system', () => {
        const { getByTestId } = render(<Probe />);

        expect(getByTestId('scheme').props.children).toBe('dark');
        expect(getByTestId('mode').props.children).toBe('system');
    });
});
