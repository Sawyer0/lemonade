import { AIAnalysis } from '../types/models';

export interface IVideoAnalysisService {
    processVideoUpload(sessionId: string, videoUrl: string): Promise<void>;
    analyzeVideo(
        url: string,
        context: string,
        mimeType: string,
        userId: string,
        sessionId: string,
    ): Promise<AIAnalysis>;
}
