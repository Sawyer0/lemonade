import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useMobileChat } from '../useMobileChat';
import { auth, db } from '@mobile/infrastructure/firebase/config';
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';

// Mocks
jest.mock('firebase/firestore');
jest.mock('@mobile/infrastructure/firebase/config', () => ({
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
global.TextDecoder = MockTextDecoder as any;

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
                body: JSON.stringify({
                    sessionId,
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
});
