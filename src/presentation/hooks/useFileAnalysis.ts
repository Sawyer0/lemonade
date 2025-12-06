import { auth } from '@/infrastructure/firebase/config';
import { useToast } from '@/presentation/context';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

interface UseFileAnalysisOptions {
	sessionId: string;
}

/**
 * Hook for uploading and analyzing files (video/audio)
 * Follows SWR pattern from Agent.md
 *
 * Flow:
 * 1. User selects file
 * 2. Get signed URL from /api/upload/sign
 * 3. Upload directly to GCS
 * 4. Trigger analysis via /api/analysis/trigger
 */
export function useFileAnalysis({ sessionId }: UseFileAnalysisOptions) {
	const { showToast } = useToast();

	const uploadFile = async (file: File): Promise<void> => {
		try {
			// Step 1: Get signed URL for direct GCS upload
			const token = await auth.currentUser?.getIdToken();
			const headers: Record<string, string> = { 'Content-Type': 'application/json' };
			if (token) headers['Authorization'] = `Bearer ${token}`;

			const signResponse = await fetch('/api/upload/sign', {
				method: 'POST',
				headers,
				body: JSON.stringify({
					filename: `${sessionId}/${file.name}`,
					contentType: file.type,
				}),
			});

			if (!signResponse.ok) {
				const error = await signResponse.json();
				throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, error.message || 'Failed to get upload URL');
			}

			const { uploadUrl, publicUrl } = await signResponse.json();

			// Step 2: Upload file directly to GCS
			const uploadRes = await fetch(uploadUrl, {
				method: 'PUT',
				headers: {
					'Content-Type': file.type,
				},
				body: file,
			});

			if (!uploadRes.ok) {
				throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Failed to upload file');
			}

			showToast('File uploaded successfully. AI is analyzing...', 'success');

			// Step 3: Trigger analysis on backend
			const analysisRes = await fetch('/api/analysis/trigger', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId,
					fileUrl: publicUrl,
					fileType: file.type.split('/')[0], // 'video' or 'audio'
				}),
			});

			if (!analysisRes.ok) {
				const error = await analysisRes.json();
				throw new AppError(ErrorCode.AI_SERVICE_ERROR, error.message || 'Failed to trigger analysis');
			}

			const result = await analysisRes.json();
			showToast(result.message, 'info');
		} catch (error) {
			const message = AppError.fromError(error).message;
			console.error('File analysis error:', error);
			showToast(message, 'error');
			throw error;
		}
	};

	return { uploadFile };
}
