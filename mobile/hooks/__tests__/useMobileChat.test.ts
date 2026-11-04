import { renderHook, act } from '@testing-library/react-native';
import { useMobileChat } from '../useMobileChat';
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth } from '../../infrastructure/firebase/config';

// Mocks
jest.mock('firebase/firestore');
jest.mock('../../infrastructure/firebase/config', () => ({
    auth: {
        currentUser: {
            uid: 'test-user',
            getIdToken: jest.fn().mockResolvedValue('test-token')
        }
    },
    db: {}
}));

// Mock TextDecoder
class MockTextDecoder {
    decode(value: Uint8Array) {
        return String.fromCharCode.apply(null, Array.from(value));
    }
}
global.TextDecoder = MockTextDecoder as unknown as typeof TextDecoder;

// Mock Stream Reader
const mockStream = (chunks: string[]) => {
    let index = 0;
    return {
        getReader: () => ({
            read: jest.fn(async () => {
                if (index < chunks.length) {
                    const value = new TextEncoder().encode(chunks[index++]);
                    return { done: false, value };
                }
                return { done: true, value: undefined };
            })
        })
    };
};

describe('useMobileChat', () => {
    const sessionId = 'test-session-id';

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset auth.currentUser to a default valid state
        (auth as unknown as { currentUser: unknown }).currentUser = {
            uid: 'test-user',
            getIdToken: jest.fn().mockResolvedValue('test-token')
        };

        // Setup Firestore Mocks
        (doc as jest.Mock).mockReturnValue('test-doc-ref');
        (onSnapshot as jest.Mock).mockImplementation((ref, callback) => {
            // Initial snapshot with no messages
            callback({
                exists: () => true,
                data: () => ({ messages: [] })
            });
            return jest.fn(); // unsubscribe
        });
        process.env.EXPO_PUBLIC_API_URL = 'http://test-api';
    });

    it('should subscribe to messages on mount', () => {
        const mockMessages = [{ role: 'user', content: 'hello', timestamp: new Date() }];
        
        (onSnapshot as jest.Mock).mockImplementation((ref, callback) => {
            callback({
                exists: () => true,
                data: () => ({ messages: mockMessages })
            });
            return jest.fn();
        });

        const { result } = renderHook(() => useMobileChat(sessionId));

        expect(result.current.messages).toEqual(mockMessages);
        expect(onSnapshot).toHaveBeenCalledWith('test-doc-ref', expect.any(Function), expect.any(Function));
    });

    it('should send text message and stream response', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            body: mockStream(['Hello', ' World'])
        });

        const { result } = renderHook(() => useMobileChat(sessionId));

        await act(async () => {
            await result.current.sendMessage('Hi AI');
        });

        // Verify Firestore update
        expect(updateDoc).toHaveBeenCalledWith(
            'test-doc-ref',
            { messages: arrayUnion(expect.objectContaining({ role: 'user', content: 'Hi AI' })) }
        );

        // Verify API Call
        expect(fetch).toHaveBeenCalledWith(
            'http://test-api/api/chat',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'x-session-id': sessionId
                }),
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hi AI' }]
                })
            })
        );

        // Verify Streaming State (it's fast in test, but should have happened)
        // We can't easily check intermediate states without fake timers, 
        // but we can check if streamingMessage was reset at the end
        expect(result.current.streamingMessage).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it('should send media message with fileData', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            body: mockStream(['Analysis complete'])
        });

        const { result } = renderHook(() => useMobileChat(sessionId));

        const uri = 'file://photo.jpg';
        const gsUri = 'gs://bucket/photo.jpg';
        const mimeType = 'image/jpeg';

        await act(async () => {
            await result.current.sendMedia(uri, gsUri, mimeType, 'Check this');
        });

        // Verify correct structure sent to backend
        expect(fetch).toHaveBeenCalledWith(
            'http://test-api/api/chat',
            expect.objectContaining({
                body: expect.stringContaining(gsUri) // Ensure gsUri is in the payload
            })
        );

        // Check specific payload structure
        const callArgs = (fetch as jest.Mock).mock.calls[0][1];
        const body = JSON.parse(callArgs.body);
        const sentContent = body.messages[0].content;

        expect(sentContent).toHaveLength(3);
        expect(sentContent[0]).toEqual({ type: 'text', text: 'Check this' });
        expect(sentContent[1]).toEqual({ type: 'image', image: uri });
        expect(sentContent[2]).toEqual({ type: 'fileData', fileData: { fileUri: gsUri, mimeType } });
    });

    it('should handle API errors', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            json: () => Promise.resolve({ message: 'Server Error' })
        });

        const { result } = renderHook(() => useMobileChat(sessionId));

        await act(async () => {
            await result.current.sendMessage('Fail me');
        });

        expect(result.current.error).toBe('Server Error');
        expect(result.current.sending).toBe(false);
    });

    describe('Network Error Handling', () => {
        it('should handle network timeout', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('Network request failed'));

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('Hello');
            });

            expect(result.current.error).toBeDefined();
            expect(result.current.sending).toBe(false);
        });

        it('should handle connection refused', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('Hello');
            });

            expect(result.current.error).toBeDefined();
        });

        it('should handle 500 server error', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ message: 'Internal Server Error' })
            });

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('Hello');
            });

            expect(result.current.error).toBe('Internal Server Error');
        });

        it('should handle 503 service unavailable', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 503,
                json: () => Promise.resolve({ message: 'Service Unavailable' })
            });

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('Hello');
            });

            expect(result.current.error).toBe('Service Unavailable');
        });

        it('should handle rate limiting (429)', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 429,
                json: () => Promise.resolve({ message: 'Too Many Requests' })
            });

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('Hello');
            });

            expect(result.current.error).toBe('Too Many Requests');
        });

        it('should handle malformed JSON response', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.reject(new SyntaxError('Unexpected token'))
            });

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('Hello');
            });

            expect(result.current.error).toBeDefined();
        });
    });

    describe('Session Handling', () => {
        it('should handle session not found (Firestore)', async () => {
            (onSnapshot as jest.Mock).mockImplementation((ref, callback) => {
                callback({
                    exists: () => false,
                    data: () => null
                });
                return jest.fn();
            });

            const { result } = renderHook(() => useMobileChat(sessionId));

            // Should not crash, messages should be empty
            expect(result.current.messages).toEqual([]);
        });

        it('should handle Firestore snapshot error', async () => {
            (onSnapshot as jest.Mock).mockImplementation((ref, onSuccess, onError) => {
                onError(new Error('Permission denied'));
                return jest.fn();
            });

            const { result } = renderHook(() => useMobileChat(sessionId));

            // Should handle error gracefully
            expect(result.current.messages).toEqual([]);
        });

        it('should cleanup subscription on unmount', () => {
            const mockUnsubscribe = jest.fn();
            (onSnapshot as jest.Mock).mockImplementation((ref, callback) => {
                callback({ exists: () => true, data: () => ({ messages: [] }) });
                return mockUnsubscribe;
            });

            const { unmount } = renderHook(() => useMobileChat(sessionId));

            unmount();

            expect(mockUnsubscribe).toHaveBeenCalled();
        });
    });

    describe('Auth Error Handling', () => {
        it('should handle expired auth token', async () => {
            (auth.currentUser?.getIdToken as jest.Mock).mockRejectedValue(new Error('Token expired'));

            global.fetch = jest.fn();

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('Hello');
            });

            expect(result.current.error).toBeDefined();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should handle missing auth user', async () => {
            const originalUser = auth.currentUser;
            (auth as unknown as { currentUser: unknown }).currentUser = null;

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('Hello');
            });

            expect(result.current.error).toBeDefined();

            // Restore
            (auth as unknown as { currentUser: unknown }).currentUser = originalUser;
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty message', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                body: mockStream(['Response'])
            });

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('');
            });

            // Should NOT make the API call (client side validation)
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should handle very long message', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                body: mockStream(['Response'])
            });

            const longMessage = 'a'.repeat(50000);
            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage(longMessage);
            });

            expect(global.fetch).toHaveBeenCalled();
        });

        it('should handle special characters in message', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                body: mockStream(['Response'])
            });

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('Message with émojis 🚗 and spëcial chars');
            });

            expect(global.fetch).toHaveBeenCalled();
        });

        it('should handle rapid consecutive messages', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                body: mockStream(['Response'])
            });

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                // Send multiple messages rapidly
                result.current.sendMessage('Message 1');
                result.current.sendMessage('Message 2');
                result.current.sendMessage('Message 3');
            });

            // Should handle without crashing
            expect(global.fetch).toHaveBeenCalled();
        });

        it('should handle stream reader error mid-stream', async () => {
            let callCount = 0;
            const erroringStream = {
                getReader: () => ({
                    read: jest.fn(async () => {
                        callCount++;
                        if (callCount === 1) {
                            return { done: false, value: new TextEncoder().encode('Partial') };
                        }
                        throw new Error('Stream interrupted');
                    })
                })
            };

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                body: erroringStream
            });

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('Hello');
            });

            expect(result.current.error).toBeDefined();
        });

        it('should handle null response body', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                body: null
            });

            const { result } = renderHook(() => useMobileChat(sessionId));

            await act(async () => {
                await result.current.sendMessage('Hello');
            });

            // Should handle gracefully without crashing
            expect(result.current.sending).toBe(false);
        });
    });
});
