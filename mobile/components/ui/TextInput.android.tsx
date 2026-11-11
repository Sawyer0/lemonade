import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import {
    HelperText,
    TextInput as PaperTextInput,
    type TextInputProps as PaperTextInputProps,
} from 'react-native-paper';

/**
 * Android (Material 3) text input. Same props as the shared TextInput;
 * on Android it renders a Paper outlined input themed from the brand
 * tokens, with the floating label and the error helper text. The caller
 * `style` styles the inner input, matching the shared component.
 */
interface InputProps extends Omit<PaperTextInputProps, 'mode' | 'error' | 'label' | 'style' | 'theme'> {
    label?: string;
    error?: string;
    style?: StyleProp<TextStyle>;
}

export function TextInput({ label, error, style, ...props }: InputProps) {
    return (
        <View style={styles.container}>
            <PaperTextInput mode="outlined" label={label} error={!!error} contentStyle={style} {...props} />
            {error ? (
                <HelperText type="error" visible>
                    {error}
                </HelperText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
    },
});
