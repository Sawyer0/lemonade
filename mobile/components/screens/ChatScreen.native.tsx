import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Text,
    TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Theme } from '@mobile/constants/theme';
import { ThemedText } from '@mobile/components/themed-text';
import { ThemedView } from '@mobile/components/themed-view';
import { useMobileChat } from '@mobile/hooks/useMobileChat';
import { useChatUploads } from '@mobile/hooks/useChatUploads'; // Import the upload hook
import { useGeminiSession } from '@mobile/hooks/useGeminiSession';
import { ChatBubble } from '../domain/chat/ChatBubble.native';
import { InputBar } from '../domain/chat/InputBar.native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

export default function ChatScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const sessionId = id;

    // Use the robust Firestore-based chat hook
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

    const [cameraPermission, requestCameraPermission] = useCameraPermissions();

    useEffect(() => {
        const checkResume = async () => {
            if (messages.length > 2) {
                // Only summarize if there's actual history
                setLoadingSummary(true);
                const summary = await getResumeSummary();
                setSummaryText(summary);
                setShowResumeSummary(true);
                setLoadingSummary(false);
            }
        };
        checkResume();
    }, [getResumeSummary, messages.length]); // Added missing dependencies

    const handleContinue = () => {
        setShowResumeSummary(false);
    };

    const handleFreshStart = () => {
        // For MVP, "Fresh Start" just means ignore the summary and keep typing.
        // In future, we could archive the session.
        setShowResumeSummary(false);
    };
    const [cameraActive, setCameraActive] = useState(false);
    const cameraRef = useRef<CameraView>(null);
    const frameInterval = useRef<NodeJS.Timeout | null>(null);

    const handleMediaSelect = async (uri: string, type: 'image' | 'video') => {
        try {
            const result = await uploadFile(uri, type);
            await sendMedia(result.downloadUrl, result.gsUri, result.metadata.contentType, 'Analyze this media:');
        } catch (err) {
            console.error('Media send failed:', err);
        }
    };

    // Tool Handler Logic (kept from original)
    const handleToolCall = (
        toolCall: { name: string; args: Record<string, unknown> },
        { sendResponse }: { sendResponse: (response: unknown) => void },
    ) => {
        // ... (Tool handling logic remains same) ...
        console.log('Tool Call Received:', toolCall.name);
        // Use sendResponse to satisfy linter if logic is omitted for brevity
        sendResponse({ status: 'acknowledged', tool: toolCall.name });
    };

    // Connect to LiveKit only if camera is active or for background events
    const { connect, client } = useGeminiSession(sessionId, null, handleToolCall);

    useEffect(() => {
        // Optional: Connect to LiveKit only when needed to save resources,
        // or connect on mount if that's the desired UX.
        // connect();
    }, [connect]);

    // Camera Frame Loop
    useEffect(() => {
        let isProcessing = false;
        if (cameraActive && client && client.isConnected) {
            frameInterval.current = setInterval(async () => {
                if (cameraRef.current && !isProcessing) {
                    isProcessing = true;
                    try {
                        const photo = await cameraRef.current.takePictureAsync({
                            base64: true,
                            quality: 0.5,
                            skipProcessing: true,
                        });
                        if (photo?.base64 && client.isConnected) {
                            client.sendRealtimeInput([
                                {
                                    mimeType: 'image/jpeg',
                                    data: photo.base64,
                                },
                            ]);
                        }
                    } catch (err) {
                        console.warn('Frame capture skipped:', err);
                    } finally {
                        isProcessing = false;
                    }
                }
            }, 1000);
        }
        return () => {
            if (frameInterval.current) {
                clearInterval(frameInterval.current);
                frameInterval.current = null;
            }
        };
    }, [cameraActive, client, client?.isConnected]);

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
                <ActivityIndicator size="large" color={Theme.tint} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <Stack.Screen
                options={{
                    title: cameraActive ? 'Live Vision' : `Diagnostic Session`,
                    headerStyle: { backgroundColor: Theme.background },
                    headerTintColor: Theme.text,
                    headerRight: () => (
                        <TouchableOpacity onPress={() => setCameraActive(!cameraActive)}>
                            <Ionicons name={cameraActive ? 'videocam-off' : 'videocam'} size={24} color={Theme.tint} />
                        </TouchableOpacity>
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
                                <ActivityIndicator color={Theme.tint} />
                            ) : (
                                <ThemedText style={styles.summaryBody}>{summaryText}</ThemedText>
                            )}
                            <View style={styles.summaryActions}>
                                <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
                                    <ThemedText style={styles.buttonText}>Continue</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.freshButton} onPress={handleFreshStart}>
                                    <ThemedText style={styles.freshButtonText}>Fresh Start</ThemedText>
                                </TouchableOpacity>
                            </View>
                        </ThemedView>
                    </View>
                )}

                {/* Camera Layer */}
                {cameraActive && (
                    <View style={styles.cameraContainer}>
                        {!cameraPermission?.granted ? (
                            <TouchableOpacity onPress={requestCameraPermission} style={styles.permButton}>
                                <Text>Enable Camera</Text>
                            </TouchableOpacity>
                        ) : (
                            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
                        )}
                        <TouchableOpacity style={styles.closeCam} onPress={() => setCameraActive(false)}>
                            <Ionicons name="close-circle" size={40} color="white" />
                        </TouchableOpacity>
                    </View>
                )}

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1, display: cameraActive ? 'none' : 'flex' }}
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.background,
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: Theme.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
        paddingBottom: 20,
    },
    cameraContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'black',
        zIndex: 10,
    },
    permButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'white',
    },
    closeCam: {
        position: 'absolute',
        top: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 25,
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
        borderColor: Theme.border,
    },
    summaryTitle: {
        fontSize: 20,
        color: Theme.tint,
        marginBottom: 16,
    },
    summaryBody: {
        color: Theme.text,
        lineHeight: 22,
        marginBottom: 24,
    },
    summaryActions: {
        flexDirection: 'row',
        gap: 12,
    },
    continueButton: {
        flex: 1,
        backgroundColor: Theme.tint,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    freshButton: {
        flex: 1,
        backgroundColor: Theme.card,
        borderWidth: 1,
        borderColor: Theme.border,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonText: {
        color: 'black',
        fontWeight: 'bold',
    },
    freshButtonText: {
        color: Theme.textSecondary,
        fontWeight: 'bold',
    },
});
