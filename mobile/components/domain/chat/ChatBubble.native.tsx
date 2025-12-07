import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '@/constants/theme';
import { MessagePart } from '@/core/types/models';

interface ChatBubbleProps {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | MessagePart[];
}

export function ChatBubble({ role, content }: ChatBubbleProps) {
    const isUser = role === 'user';

    // Helper to render content
    const renderContent = () => {
        if (typeof content === 'string') {
            return <Text style={[styles.text, isUser ? styles.textDark : styles.textLight]}>{content}</Text>;
        }
        // Simplify for MVP: Join text parts
        const text = content
            .filter(p => p.type === 'text')
            .map(p => p.text)
            .join('\n');
        return <Text style={[styles.text, isUser ? styles.textDark : styles.textLight]}>{text}</Text>;
    };

    if (isUser) {
        return (
            <View style={[styles.container, styles.userContainer]}>
                <LinearGradient
                    colors={[Theme.gradientStart, Theme.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.bubble}
                >
                    {renderContent()}
                </LinearGradient>
            </View>
        );
    }

    return (
        <View style={[styles.container, styles.aiContainer]}>
            <View style={[styles.bubble, styles.aiBubble]}>
                {renderContent()}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginVertical: 4,
        width: '100%',
    },
    userContainer: {
        alignItems: 'flex-end',
    },
    aiContainer: {
        alignItems: 'flex-start',
    },
    bubble: {
        padding: 12,
        borderRadius: 16,
        maxWidth: '85%',
    },
    aiBubble: {
        backgroundColor: Theme.card,
        borderWidth: 1,
        borderColor: Theme.border,
    },
    text: {
        fontSize: 16,
        lineHeight: 24,
    },
    textDark: {
        color: 'black',
        fontWeight: '500',
    },
    textLight: {
        color: Theme.text,
    }
});
