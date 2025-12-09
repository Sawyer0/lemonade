import { injectable, inject } from 'inversify';
import { TYPES } from '../../infrastructure/di/types';
import { ISessionRepository } from '../../core/interfaces/ISessionRepository';
import { IVehicleRepository } from '../../core/interfaces/IVehicleRepository';
import { IVideoDiagnosticAI } from '../../core/interfaces/IAIService';
import { INHTSAService } from '../../core/interfaces/INHTSAService';
import { IVectorRepository } from '../../core/interfaces/IVectorRepository';
import { ISafetyMonitor } from '../../core/interfaces/ISafetyMonitor';
import { ILogger } from '../../core/interfaces/ILogger'; // Injected
import { VideoProcessingEvent } from '../../core/types/models';

@injectable()
export class VideoAnalysisService {
    constructor(
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.VideoAI) private videoAI: IVideoDiagnosticAI,
        @inject(TYPES.NHTSAService) private nhtsaService: INHTSAService,
        @inject(TYPES.VectorRepo) private vectorRepo: IVectorRepository,
        @inject(TYPES.SafetyMonitor) private safetyMonitor: ISafetyMonitor,
        @inject(TYPES.Logger) private logger: ILogger // Logger
    ) {}

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
            const vehicleId = await this.sessionRepo.getVehicleId(sessionId);
            let context = "Unknown Vehicle";
            let recallContext = "";
            let memoryContext = "";
            
            if (vehicleId) {
                const specs = await this.vehicleRepo.getSpecs(vehicleId);
                if (specs) {
                    context = `${specs.year} ${specs.make} ${specs.model} ${specs.engine}`;
                    
                    // --- SYSTEM 2a: THE RECALL TRAP (NHTSA) ---
                    this.logger.info(`Checking Recalls for ${context}...`);
                    try {
                        const recalls = await this.nhtsaService.checkRecalls(specs.year, specs.make, specs.model);
                        if (recalls.length > 0) {
                            recallContext = "
                            CRITICAL WARNING - ACTIVE RECALLS FOUND:
                            " + 
                            recalls.map(r => `- ${r.Component}: ${r.Summary}`).join('\n') + 
                            "\n                            INSTRUCTION: You MUST cross-reference these recalls. If the video shows symptoms related to these components (e.g., Door Latch, Brake Master Cylinder), you MUST flag this as a Safety Alert and cite the Recall ID.
                            ";
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
                            memoryContext = "
                            OFFICIAL SERVICE MANUAL & TSB CONTEXT:
                            The following technical documents were retrieved from the Collective Memory. Use these specs (Torque, Pressures) over general knowledge.
                            
                            " + 
                            docs.map(d => `[Source: ${d.metadata.source}]\n${d.content}`).join('\n\n') + "
                            ";
                        }
                    } catch (err) {
                        this.logger.error("Collective Memory Access Failed", err);
                    }
                }
            }

            const fullContext = "
            VEHICLE: " + context + 
            "\n\n" + 
            recallContext + 
            "\n\n" + 
            memoryContext;

            const gcsUri = `gs://${event.bucket}/${event.filePath}`;
            const analysis = await this.videoAI.analyzeVideo(gcsUri, event.contentType, fullContext);

            // --- 4. SAFETY CHECK (System 2 Verification) ---
            const safetyCheck = await this.safetyMonitor.assess(
                `User uploaded video. AI Diagnosis: "${analysis.diagnosis}". Suggested Actions: "${analysis.suggested_actions.join(', ')}"`, 
                context
            );

            if (safetyCheck.intervention_required || analysis.safety_alert) {
                 this.logger.warn(`SAFETY ALERT (Monitor Score: ${safetyCheck.safety_score})`, { safetyCheck });
                 
                 analysis.safety_alert = true;
                 analysis.diagnosis = `SAFETY STOP: ${safetyCheck.hazards_detected.join(', ')}. ${analysis.diagnosis}`;
                 
                 await this.sessionRepo.updateSafetyAlert(sessionId, safetyCheck.hazards_detected.join(', '));
            }

            await this.sessionRepo.updateAnalysis(sessionId, analysis, gcsUri);

        } catch (error) {
            this.logger.error(`Error processing session ${sessionId}:`, error);
            await this.sessionRepo.updateError(sessionId, error as Error);
        }
    }
}
