import React, { useState } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Theme } from '@mobile/constants/theme';
import { Send, Paperclip } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

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
            {/* Media Upload Button */}
            <TouchableOpacity 
                style={styles.iconButton} 
                onPress={handlePickMedia}
                disabled={loading}
            >
                <Paperclip size={24} color={Theme.tint} />
            </TouchableOpacity>

            <TextInput
                style={styles.input}
                placeholder="Ask Master Tech..."
                placeholderTextColor={Theme.textSecondary}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={500}
            />

            <TouchableOpacity
                style={[styles.sendButton, !text.trim() && styles.disabled]}
                onPress={handleSend}
                disabled={!text.trim() || loading}
            >
                {loading ? (
                    <ActivityIndicator color="white" size="small" />
                ) : (
                    <Send size={20} color="white" />
                )}
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        padding: 12,
        backgroundColor: Theme.background,
        borderTopWidth: 1,
        borderTopColor: Theme.border,
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
        backgroundColor: Theme.card,
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        fontSize: 16,
        color: Theme.text,
        borderWidth: 1,
        borderColor: Theme.border,
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Theme.tint, // Yellow
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 0,
    },
    disabled: {
        backgroundColor: Theme.border,
        opacity: 0.5,
    }
});
