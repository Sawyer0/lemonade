import { auth } from '@/infrastructure/firebase/config';
import { ApiClient } from '@/infrastructure/api/ApiClient';
import { useToast } from '@/presentation/context';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';
import { clientContainer } from '@/infrastructure/di/clientContainer';
import { TYPES } from '@/infrastructure/di/types';
import { ILogger } from '@/core/interfaces/ILogger';

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
			const { uploadUrl, publicUrl } = await ApiClient.post<{ uploadUrl: string; publicUrl: string }, { filename: string; contentType: string }>('/api/upload/sign', {
				filename: `${sessionId}/${file.name}`,
				contentType: file.type,
			});

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
			const result = await ApiClient.post<{ message: string }, { sessionId: string; fileUrl: string; fileType: string }>('/api/analysis/trigger', {
				sessionId,
				fileUrl: publicUrl,
				fileType: file.type.split('/')[0], // 'video' or 'audio'
			});

			showToast(result.message, 'info');
		} catch (error) {
			const message = AppError.fromError(error).message;
			const logger = clientContainer.get<ILogger>(TYPES.Logger);
			logger.error('File analysis error:', error);
			showToast(message, 'error');
			throw error;
		}
	};

	return { uploadFile };
}
