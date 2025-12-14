import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { container } from './infrastructure/di/container';
import { TYPES } from './infrastructure/di/types';
import { VideoAnalysisService } from './application/services/VideoAnalysisService';
import { CONFIG } from './config';
import { RequestContext } from './infrastructure/context/request-context';
import { v4 as uuidv4 } from 'uuid';

export const analyzeUploadedVideo = onObjectFinalized(
    {
        cpu: 2,
        memory: '2GiB',
        timeoutSeconds: 300,
        region: CONFIG.LOCATION,
    },
    async (event) => {
        const traceId = uuidv4();
        
        return RequestContext.run({ traceId }, async () => {
            // Presentation Layer: Trigger -> Service
            const service = container.get<VideoAnalysisService>(TYPES.VideoService);
            
            await service.processEvent({
                filePath: event.data.name,
                contentType: event.data.contentType || 'application/octet-stream',
                bucket: event.data.bucket
            });
        });
    }
);