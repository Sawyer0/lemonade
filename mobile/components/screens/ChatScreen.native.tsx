import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Text } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Theme } from '@mobile/constants/theme';
import { useLiveSession } from '@web-shared-hooks/useLiveSession';
import { useMobileChat } from '@mobile/hooks/useMobileChat';
import { useToolHandler } from '@mobile/hooks/useToolHandler';
import { ChatBubble } from '../domain/chat/ChatBubble.native';
import { InputBar } from '../domain/chat/InputBar.native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@mobile/infrastructure/firebase/config';

export default function ChatScreen() {
    // The route is /session/[id], so the param is 'id'
    const { id } = useLocalSearchParams<{ id: string }>();
    const sessionId = id;
    const { session, loading: sessionLoading } = useLiveSession(sessionId, db);
    const { sendMessage, sending } = useMobileChat(sessionId);

    // Handle AI tool calls (e.g. openCamera)
    useToolHandler(session);

    const flatListRef = useRef<FlatList>(null);

    // Scroll to bottom on new messages
    useEffect(() => {
        if (session?.messages?.length) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 200);
        }
    }, [session?.messages]);

    if (sessionLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Theme.tint} />
            </View>
        );
    }

    if (!session) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={{ color: 'white' }}>Session not found.</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <Stack.Screen options={{
                title: `Diagnosis: ${session.complaint.slice(0, 20)}...`,
                headerStyle: { backgroundColor: Theme.background },
                headerTintColor: Theme.text,
            }} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <FlatList
                    ref={flatListRef}
                    data={session.messages}
                    keyExtractor={(item, index) => index.toString()}
                    renderItem={({ item }) => (
                        // @ts-ignore - Message structure matches but TS might be strict about unions
                        <ChatBubble role={item.role} content={item.content} sessionId={session.id} />
                    )}
                    contentContainerStyle={styles.listContent}
                // Inverted? No, standard chat usually bottom-up, but FlatList 'inverted' prop is good for that.
                // Here we'll stick to standard top-down with scrollToEnd for simplicity unless messages array is reversed.
                // scrollsToTop={false}
                />

                <InputBar onSend={sendMessage} loading={sending} />
            </KeyboardAvoidingView>
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
    }
});
