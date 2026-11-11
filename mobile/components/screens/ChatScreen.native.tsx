import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';
import { ThemedText } from '@mobile/components/themed-text';
import { ThemedView } from '@mobile/components/themed-view';
import { useMobileChat } from '@mobile/hooks/useMobileChat';
import { useChatUploads } from '@mobile/hooks/useChatUploads';
import { useSessionVehicle } from '@mobile/hooks/useSessionVehicle';
import { ChatBubble } from '../domain/chat/ChatBubble';
import { OutcomeCapture } from '../domain/case/OutcomeCapture';
import { ObdScanPanel } from '../domain/session/ObdScanPanel';
import { InputBar } from '../domain/chat/InputBar';
import { GradientButton } from '../ui/GradientButton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function ChatScreen() {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { id } = useLocalSearchParams<{ id: string }>();
    const sessionId = id;
    const router = useRouter();
    const { vehicleId } = useSessionVehicle(sessionId);

    const {
        messages,
        sendMessage,
        sendMedia,
        getResumeSummary,
        sending,
        streamingMessage,
        error: chatError,
    } = useMobileChat(sessionId);
    const { uploadFile, uploading: fileUploading } = useChatUploads(sessionId);

    const [showResumeSummary, setShowResumeSummary] = useState(false);
    const [summaryText, setSummaryText] = useState<string | null>(null);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const summaryRequested = useRef(false);

    // Offer a "where we left off" recap once per visit, when the session already has history.
    useEffect(() => {
        if (summaryRequested.current || messages.length <= 2) return;
        summaryRequested.current = true;

        const loadSummary = async () => {
            setLoadingSummary(true);
            setShowResumeSummary(true);
            setSummaryText(await getResumeSummary());
            setLoadingSummary(false);
        };
        loadSummary();
    }, [getResumeSummary, messages.length]);

    const handleContinue = () => setShowResumeSummary(false);

    // A fresh start opens a new diagnostic session for the same vehicle; this one stays in history.
    const handleFreshStart = () => {
        setShowResumeSummary(false);
        if (vehicleId) router.replace(`/session/new?vehicleId=${vehicleId}`);
    };

    const handleMediaSelect = async (uri: string, type: 'image' | 'video') => {
        try {
            const result = await uploadFile(uri, type);
            await sendMedia(result.downloadUrl, result.gsUri, result.metadata.contentType, 'Analyze this media:');
        } catch (err) {
            console.error('Media send failed:', err);
        }
    };

    const flatListRef = useRef<FlatList>(null);

    // Scroll to bottom on new messages
    useEffect(() => {
        if (messages?.length) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 200);
        }
    }, [messages]);

    // Render Logic
    // Construct display messages: history + streaming chunk (if any)
    const displayMessages = [...messages];
    if (streamingMessage) {
        displayMessages.push({
            role: 'assistant',
            content: streamingMessage,
            timestamp: new Date(),
        });
    }

    if (!messages && !chatError) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.tint} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <Stack.Screen
                options={{
                    title: 'Diagnostic Session',
                    headerStyle: { backgroundColor: theme.background },
                    headerTintColor: theme.text,
                    headerRight: () => (
                        <View style={styles.headerActions}>
                            <TouchableOpacity
                                accessibilityLabel="Open live camera with the Master Tech"
                                onPress={() => router.push(`/live-mechanic?sessionId=${sessionId}`)}
                            >
                                <Ionicons name="videocam" size={24} color={theme.tint} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                accessibilityLabel="Stream from Ray-Ban Meta glasses"
                                onPress={() => router.push(`/connect-glasses?sessionId=${sessionId}`)}
                            >
                                <Ionicons name="glasses-outline" size={24} color={theme.tint} />
                            </TouchableOpacity>
                        </View>
                    ),
                }}
            />

            <View style={{ flex: 1 }}>
                {/* Resume Summary Overlay */}
                {showResumeSummary && (
                    <View style={styles.summaryOverlay}>
                        <ThemedView style={styles.summaryCard}>
                            <ThemedText type="defaultSemiBold" style={styles.summaryTitle}>
                                Where we left off...
                            </ThemedText>
                            {loadingSummary ? (
                                <ActivityIndicator color={theme.tint} />
                            ) : (
                                <ThemedText style={styles.summaryBody}>{summaryText}</ThemedText>
                            )}
                            <View style={styles.summaryActions}>
                                <GradientButton
                                    title="Continue"
                                    onPress={handleContinue}
                                    style={styles.summaryButton}
                                />
                                <GradientButton
                                    title="Fresh Start"
                                    variant="outline"
                                    onPress={handleFreshStart}
                                    style={styles.summaryButton}
                                />
                            </View>
                        </ThemedView>
                    </View>
                )}

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                >
                    <FlatList
                        ref={flatListRef}
                        data={displayMessages}
                        keyExtractor={(item, index) => index.toString()}
                        renderItem={({ item }) => (
                            <ChatBubble role={item.role} content={item.content} sessionId={sessionId} />
                        )}
                        contentContainerStyle={styles.listContent}
                        ListFooterComponent={
                            <View>
                                <OutcomeCapture sessionId={sessionId ?? ''} />
                                <ObdScanPanel sessionId={sessionId ?? ''} />
                            </View>
                        }
                    />

                    <InputBar
                        onSend={sendMessage}
                        onMediaSelect={handleMediaSelect}
                        loading={sending || fileUploading}
                    />
                </KeyboardAvoidingView>
            </View>
        </SafeAreaView>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        loadingContainer: {
            flex: 1,
            backgroundColor: theme.background,
            justifyContent: 'center',
            alignItems: 'center',
        },
        listContent: {
            padding: 16,
            paddingBottom: 20,
        },
        headerActions: {
            flexDirection: 'row',
            gap: 16,
        },
        summaryOverlay: {
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: 20,
            justifyContent: 'center',
            padding: 24,
        },
        summaryCard: {
            padding: 24,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.border,
        },
        summaryTitle: {
            fontSize: 20,
            color: theme.tint,
            marginBottom: 16,
        },
        summaryBody: {
            color: theme.text,
            lineHeight: 22,
            marginBottom: 24,
        },
        summaryActions: {
            flexDirection: 'row',
            gap: 12,
        },
        summaryButton: {
            flex: 1,
        },
    });
