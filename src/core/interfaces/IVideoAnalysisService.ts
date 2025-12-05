/**
 * Service for processing and analyzing vehicle diagnostic videos.
 * Handles video uploads and AI-powered mechanical analysis.
 */
export interface IVideoAnalysisService {
    processVideoUpload(sessionId: string, videoUrl: string): Promise<void>;
}
