import { injectable, inject } from 'inversify';
import { TYPES } from '../../infrastructure/di/types';
import { 
    ISessionRepository, 
    IVehicleRepository, 
    IMultimodalUploadAnalyzer, 
    INHTSAService, 
    IVectorRepository, 
    ISafetyMonitor, 
    ILogger, 
    AppError,
    ErrorCode
} from '@lemonade/core';

// Define VideoProcessingEvent locally as it was not part of the shared core
export interface VideoProcessingEvent {
    filePath: string;
    contentType: string;
    bucket: string;
}
@injectable()
export class VideoAnalysisService {
    constructor(
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.VideoAI) private videoAI: IMultimodalUploadAnalyzer,
        @inject(TYPES.NHTSAService) private nhtsaService: INHTSAService,
        @inject(TYPES.VectorRepo) private vectorRepo: IVectorRepository,
        @inject(TYPES.SafetyMonitor) private safetyMonitor: ISafetyMonitor,
        @inject(TYPES.Logger) private logger: ILogger 
    ) { }

    async processEvent(event: VideoProcessingEvent) {
        const pathParts = event.filePath.split('/');
        const sessionId = pathParts.length >= 2 && pathParts[0] === 'sessions' ? pathParts[1] : null;

        if (!sessionId) {
            this.logger.error(`Invalid file path format: ${event.filePath}`);
            return;
        }

        try {
            this.logger.info(`Processing video for session: ${sessionId}`, { event });
            await this.sessionRepo.updateStatus(sessionId, 'analyzing');

            // 2. Build Context (Vehicle DNA + System 2 Knowledge)
            const session = await this.sessionRepo.findById(sessionId);
            if (!session) {
                throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Session ${sessionId} not found`);
            }
            
            const vehicleId = session.vehicleId;
            let context = "Unknown Vehicle";
            let recallContext = "";
            let memoryContext = "";

            if (vehicleId) {
                const vehicle = await this.vehicleRepo.findById(vehicleId);
                if (vehicle && vehicle.specs) {
                    const specs = vehicle.specs;
                    context = `${specs.year} ${specs.make} ${specs.model} ${specs.engine}`;

                    // --- SYSTEM 2a: THE RECALL TRAP (NHTSA) ---
                    this.logger.info(`Checking Recalls for ${context}...`);
                    try {
                        const recalls = await this.nhtsaService.checkRecalls(specs.year, specs.make, specs.model);
                        if (recalls.length > 0) {
                            recallContext = `
                            CRITICAL WARNING - ACTIVE RECALLS FOUND:
                            ${recalls.map(r => `- ${r.Component}: ${r.Summary}`).join('\n')}
                            
                            INSTRUCTION: You MUST cross-reference these recalls. If the video shows symptoms related to these components (e.g., Door Latch, Brake Master Cylinder), you MUST flag this as a Safety Alert and cite the Recall ID.
                            `;
                        } else {
                            recallContext = "No active recalls found for this vehicle.";
                        }
                    } catch (err) {
                        this.logger.error("NHTSA Check Failed", err);
                        recallContext = "NHTSA Recall Database Unavailable.";
                    }

                    // --- SYSTEM 2b: COLLECTIVE MEMORY (Vector Search) ---
                    this.logger.info(`Accessing Collective Memory for ${context}...`);
                    try {
                        const docs = await this.vectorRepo.search(`${context} common failures specs`);
                        if (docs.length > 0) {
                            memoryContext = `
                            OFFICIAL SERVICE MANUAL & TSB CONTEXT:
                            The following technical documents were retrieved from the Collective Memory. Use these specs (Torque, Pressures) over general knowledge.
                            
                            ${docs.map(d => `[Source: ${d.metadata.source}]\n${d.text}`).join('\n\n')}
                            `;
                        }
                    } catch (err) {
                        this.logger.error("Collective Memory Access Failed", err);
                    }
                }
            }

            const fullContext = `
            VEHICLE: ${context}
            
            ${recallContext}
            
            ${memoryContext}
            `;

            const gcsUri = `gs://${event.bucket}/${event.filePath}`;
            
            // Analyze the uploaded video using the interface method
            const analysis = await this.videoAI.analyzeUploadedVideo(
                gcsUri, 
                fullContext, 
                event.contentType, 
                session.userId, 
                sessionId
            );

            // --- 4. SAFETY CHECK (System 2 Verification) ---
            const safetyCheck = await this.safetyMonitor.assess(
                `User uploaded video. AI Diagnosis: "${analysis.diagnosis}". Suggested Actions: "${analysis.suggested_actions.join(', ')}"`,
                context
            );

            if (safetyCheck.intervention_required || analysis.safety_alert) {
                const reasons = safetyCheck.hazards_detected.join(', ');
                this.logger.warn(`SAFETY ALERT (Monitor Score: ${safetyCheck.safety_score})`, { safetyCheck });

                analysis.safety_alert = true;
                analysis.diagnosis = `SAFETY STOP: ${reasons}. ${analysis.diagnosis}`;

                await this.sessionRepo.flagSafetyStop(sessionId, reasons);
            }

            // Update Video URL first (if not already handled by upload trigger)
            await this.sessionRepo.updateVideo(sessionId, gcsUri);
            
            // Then update Analysis
            await this.sessionRepo.updateAnalysis(sessionId, analysis);

        } catch (error) {
            this.logger.error(`Error processing session ${sessionId}:`, error);
            // Revert status to waiting_user or active so it's not stuck in 'analyzing'
            // Using a valid status from the schema
            await this.sessionRepo.updateStatus(sessionId, 'active');
        }
    }
}
