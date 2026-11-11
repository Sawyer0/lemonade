import React from 'react';
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { paperThemeDark } from '../../../constants/paperTheme';
import { GradientButton } from '../GradientButton.android';
import { TextInput } from '../TextInput.android';

/**
 * Smoke coverage for the Android (Material 3) variants. Jest's default
 * platform resolves extensionless imports to `.native`, so these variants
 * get zero coverage from the other suites — import the `.android` files
 * directly and render them under the token-driven Paper theme.
 */
function renderAndroid(children: React.ReactNode) {
    return render(<PaperProvider theme={paperThemeDark}>{children}</PaperProvider>);
}

describe('Android Material 3 components', () => {
    it('GradientButton renders its title', () => {
        const { getByText } = renderAndroid(<GradientButton title="Save" onPress={() => {}} />);
        expect(getByText('Save')).toBeTruthy();
    });

    it('GradientButton is disabled while loading', () => {
        const { getByRole } = renderAndroid(<GradientButton title="Save" loading onPress={() => {}} />);
        expect(getByRole('button').props.accessibilityState).toMatchObject({ disabled: true });
    });

    it('GradientButton is enabled when idle', () => {
        const { getByRole } = renderAndroid(<GradientButton title="Save" onPress={() => {}} />);
        expect(getByRole('button').props.accessibilityState).toMatchObject({ disabled: false });
    });

    it('TextInput renders its floating label', () => {
        const { getAllByText } = renderAndroid(<TextInput label="Email" placeholder="Email" />);
        expect(getAllByText('Email').length).toBeGreaterThan(0);
    });
});
