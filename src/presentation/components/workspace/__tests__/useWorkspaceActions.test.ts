// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkspaceActions } from '../useWorkspaceActions';
import { ApiClient } from '@/infrastructure/api/ApiClient';

vi.mock('@/infrastructure/api/ApiClient', () => ({ ApiClient: { post: vi.fn() } }));

function setup() {
    const append = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const uploadFile = vi.fn().mockResolvedValue('https://cdn.test/photo.jpg');
    const { result } = renderHook(() =>
        useWorkspaceActions({
            sessionId: 's1',
            uploadFile,
            chatHelpers: { append, messages: [], setMessages: vi.fn() },
            setInput: vi.fn(),
            showToast,
        }),
    );
    return { actions: result.current, append, showToast, uploadFile };
}

const photo = () => new File(['x'], 'part.jpg', { type: 'image/jpeg' });

describe('useWorkspaceActions.handleImageCapture', () => {
    beforeEach(() => vi.clearAllMocks());

    it('answers an agent camera request by sending the photo into the chat', async () => {
        const { actions, append, showToast } = setup();
        await actions.handleImageCapture(photo(), 'tool-1');

        expect(append).toHaveBeenCalledWith({
            role: 'user',
            content: [
                { type: 'text', text: 'Here is the photo you asked for.' },
                { type: 'image', image: 'https://cdn.test/photo.jpg' },
            ],
        });
        expect(showToast).toHaveBeenCalledWith('Photo sent to the Master Tech', 'success');
        expect(ApiClient.post).not.toHaveBeenCalled();
    });

    it('sends video uploads to background analysis', async () => {
        const { actions, append } = setup();
        await actions.handleImageCapture(new File(['v'], 'clip.mp4', { type: 'video/mp4' }));

        expect(ApiClient.post).toHaveBeenCalledWith(expect.any(String), {
            sessionId: 's1',
            publicUrl: 'https://cdn.test/photo.jpg',
            fileType: 'video',
        });
        expect(append).not.toHaveBeenCalled();
    });

    it('reports upload failures', async () => {
        const { actions, showToast, uploadFile } = setup();
        uploadFile.mockRejectedValueOnce(new Error('quota exceeded'));
        await actions.handleImageCapture(photo(), 'tool-1');
        expect(showToast).toHaveBeenCalledWith('quota exceeded', 'error');
    });
});
