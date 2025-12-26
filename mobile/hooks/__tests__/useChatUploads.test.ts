import { renderHook, act } from '@testing-library/react-native';
import { useChatUploads } from '../useChatUploads';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

// Mocks
jest.mock('firebase/storage');
jest.mock('@mobile/infrastructure/firebase/config', () => ({
    storage: {
        app: {
            options: {
                storageBucket: 'test-bucket'
            }
        }
    }
}));

// Mock fetch for blob creation
global.fetch = jest.fn(() =>
    Promise.resolve({
        blob: () => Promise.resolve(new Blob(['test-content'], { type: 'image/jpeg' })),
    })
) as jest.Mock;

describe('useChatUploads', () => {
    const sessionId = 'test-session-id';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should upload a file and return correct URLs', async () => {
        const mockDownloadUrl = 'https://firebasestorage.googleapis.com/test-url';
        
        // Mock upload task behavior
        const mockUploadTask = {
            on: jest.fn((_event, _onProgress, _onError, onSuccess) => {
                // Simulate success immediately
                onSuccess();
            }),
            snapshot: { ref: 'test-ref' }
        };

        (ref as jest.Mock).mockReturnValue('test-storage-ref');
        (uploadBytesResumable as jest.Mock).mockReturnValue(mockUploadTask);
        (getDownloadURL as jest.Mock).mockResolvedValue(mockDownloadUrl);

        const { result } = renderHook(() => useChatUploads(sessionId));

        let uploadResult;
        await act(async () => {
            uploadResult = await result.current.uploadFile('file://test.jpg', 'image');
        });

        expect(uploadResult).toEqual({
            downloadUrl: mockDownloadUrl,
            gsUri: expect.stringMatching(/^gs:\/\/test-bucket\/sessions\/test-session-id\/uploads\/.*\.jpg$/),
            metadata: expect.objectContaining({
                contentType: 'image/jpeg',
                size: expect.any(Number),
                path: expect.stringMatching(/^sessions\/test-session-id\/uploads\/.*\.jpg$/)
            })
        });

        expect(result.current.uploading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('should handle upload errors', async () => {
        const mockError = new Error('Upload failed');
        
        const mockUploadTask = {
            on: jest.fn((_event, _onProgress, onError) => {
                onError(mockError);
            })
        };

        (uploadBytesResumable as jest.Mock).mockReturnValue(mockUploadTask);

        const { result } = renderHook(() => useChatUploads(sessionId));

        await act(async () => {
            try {
                await result.current.uploadFile('file://test.jpg', 'image');
            } catch (e) {
                expect(e).toBe(mockError);
            }
        });

        expect(result.current.error).toBe('Upload failed');
        expect(result.current.uploading).toBe(false);
    });
});
