import React, { useMemo, useState } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';
import { Send, Paperclip } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

interface InputBarProps {
    onSend: (text: string) => Promise<void>;
    onMediaSelect?: (uri: string, type: 'image' | 'video') => Promise<void>;
    loading?: boolean;
}

export function InputBar({ onSend, onMediaSelect, loading }: InputBarProps) {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
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
            {/* Media Upload Button */}
            <TouchableOpacity
                testID="chat-media-button"
                style={styles.iconButton}
                onPress={handlePickMedia}
                disabled={loading}
            >
                <Paperclip size={24} color={theme.tint} />
            </TouchableOpacity>

            <TextInput
                testID="chat-input"
                style={styles.input}
                placeholder="Ask Master Tech..."
                placeholderTextColor={theme.textSecondary}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={500}
            />

            <TouchableOpacity
                testID="chat-send-button"
                style={[styles.sendButton, !text.trim() && styles.disabled]}
                onPress={handleSend}
                disabled={!text.trim() || loading}
            >
                {loading ? (
                    <ActivityIndicator color={theme.onAccent} size="small" />
                ) : (
                    <Send size={20} color={theme.onAccent} />
                )}
            </TouchableOpacity>
        </View>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            padding: 12,
            backgroundColor: theme.background,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            gap: 8,
        },
        iconButton: {
            padding: 10,
            justifyContent: 'center',
            alignItems: 'center',
        },
        input: {
            flex: 1,
            minHeight: 44,
            maxHeight: 120,
            backgroundColor: theme.card,
            borderRadius: 22,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 12,
            fontSize: 16,
            color: theme.text,
            borderWidth: 1,
            borderColor: theme.border,
        },
        sendButton: {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.tint,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 0,
        },
        disabled: {
            backgroundColor: theme.border,
            opacity: 0.5,
        },
    });
