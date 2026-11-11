import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, TextInput as PaperTextInput } from 'react-native-paper';
import { Paperclip, Send } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Android (Material 3) chat input bar. Same props as the shared
 * InputBar; on Android it renders a Paper outlined input with Paper icon
 * buttons, themed from the brand tokens. Test IDs are unchanged so the
 * Maestro flows keep working.
 */
interface InputBarProps {
    onSend: (text: string) => Promise<void>;
    onMediaSelect?: (uri: string, type: 'image' | 'video') => Promise<void>;
    loading?: boolean;
}

export function InputBar({ onSend, onMediaSelect, loading }: InputBarProps) {
    const [text, setText] = useState('');

    const handleSend = async () => {
        if (!text.trim() || loading) return;
        const msg = text;
        setText(''); // Clear immediately
        await onSend(msg);
    };

    const handlePickMedia = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: true,
            quality: 0.8,
        });

        if (!result.canceled && onMediaSelect) {
            const asset = result.assets[0];
            await onMediaSelect(asset.uri, asset.type === 'video' ? 'video' : 'image');
        }
    };

    return (
        <View style={styles.container}>
            <IconButton
                testID="chat-media-button"
                mode="contained-tonal"
                icon={({ size, color }) => <Paperclip size={size} color={color} />}
                onPress={handlePickMedia}
                disabled={loading}
            />

            <PaperTextInput
                testID="chat-input"
                style={styles.input}
                outlineStyle={styles.inputOutline}
                contentStyle={styles.inputContent}
                placeholder="Ask Master Tech..."
                value={text}
                onChangeText={setText}
                multiline
                maxLength={500}
                mode="outlined"
                dense
            />

            <IconButton
                testID="chat-send-button"
                mode="contained"
                icon={({ size, color }) => <Send size={size} color={color} />}
                onPress={handleSend}
                disabled={!text.trim() || loading}
                loading={loading}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        padding: 12,
        gap: 8,
    },
    input: {
        flex: 1,
        minHeight: 44,
        maxHeight: 120,
    },
    inputOutline: {
        borderRadius: 22,
    },
    inputContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        fontSize: 16,
    },
});
