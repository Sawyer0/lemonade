import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';
import { GlassCard } from '@mobile/components/ui/GlassCard';
import { MessagePart } from '@lemonade/core';

interface ChatBubbleProps {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | MessagePart[];
    sessionId?: string; // Added for navigation
}

export function ChatBubble({ role, content, sessionId }: ChatBubbleProps) {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const isUser = role === 'user';

    // Helper to render content
    const renderContent = () => {
        if (typeof content === 'string') {
            return <Text style={[styles.text, isUser ? styles.textDark : styles.textLight]}>{content}</Text>;
        }

        return (
            <View>
                {content.map((p, index) => {
                    if (p.type === 'text') {
                        return (
                            <Text
                                key={index}
                                style={[styles.text, isUser ? styles.textDark : styles.textLight, { marginBottom: 4 }]}
                            >
                                {p.text}
                            </Text>
                        );
                    }
                    if (p.type === 'tool-call' && p.toolName === 'start_video_stream') {
                        return (
                            <TouchableOpacity
                                key={index}
                                onPress={() => router.push(`/live-mechanic?sessionId=${sessionId}`)}
                                style={{ marginTop: 8 }}
                            >
                                <GlassCard
                                    variant="thin"
                                    style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}
                                >
                                    <View
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 16,
                                            backgroundColor: theme.tint,
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            marginRight: 12,
                                        }}
                                    >
                                        <Text style={{ fontSize: 18 }}>📷</Text>
                                    </View>
                                    <Text style={{ color: theme.text, fontWeight: 'bold' }}>Tap to Open Camera</Text>
                                </GlassCard>
                            </TouchableOpacity>
                        );
                    }
                    if (p.type === 'tool_result' || p.type === 'tool-result') {
                        return (
                            <Text key={index} style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                                [Action Completed]
                            </Text>
                        );
                    }
                    return null;
                })}
            </View>
        );
    };

    if (isUser) {
        return (
            <View style={[styles.container, styles.userContainer]}>
                <LinearGradient
                    colors={[theme.gradientStart, theme.gradientEnd]}
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
            <View style={[styles.bubble, styles.aiBubble]}>{renderContent()}</View>
        </View>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
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
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
        },
        text: {
            fontSize: 16,
            lineHeight: 24,
        },
        textDark: {
            color: theme.onPrimary,
            fontWeight: '500',
        },
        textLight: {
            color: theme.text,
        },
    });
