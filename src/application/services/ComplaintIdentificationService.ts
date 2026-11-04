import { injectable, inject } from 'inversify';
import type { ISessionRepository, IChatAssistantAI, ILogger, IComplaintIdentificationService } from '@lemonade/core';
import { ComplaintPrompts, MessagePart } from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';

@injectable()
export class ComplaintIdentificationService implements IComplaintIdentificationService {
    constructor(
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.ChatAI) private chatAssistantAI: IChatAssistantAI,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {}

    public async identifyAndSetComplaint(sessionId: string, currentMessageContent: string): Promise<void> {
        try {
            const session = await this.sessionRepo.findById(sessionId);

            if (!session) {
                this.logger.warn('Session not found for complaint identification', { sessionId });
                return;
            }

            if (session.complaint) {
                this.logger.info('Complaint already set for session', { sessionId, complaint: session.complaint });
                return;
            }

            const prompt = ComplaintPrompts.identification(currentMessageContent);

            const aiResponse = await this.chatAssistantAI.generateReply(
                [],
                prompt,
                session.vehicleId,
                null,
                session.userId,
                sessionId,
            );

            let identifiedComplaint: string | null = null;
            if (typeof aiResponse === 'string') {
                identifiedComplaint = aiResponse.trim();
            } else if (Array.isArray(aiResponse)) {
                const textPart = aiResponse.find((p: MessagePart) => p.type === 'text' && p.text);
                identifiedComplaint = textPart ? (textPart.text || '').trim() : null;
            }

            if (identifiedComplaint && identifiedComplaint !== 'N/A') {
                await this.sessionRepo.updateComplaint(sessionId, identifiedComplaint);
                this.logger.info('Complaint identified and set for session', {
                    sessionId,
                    complaint: identifiedComplaint,
                });
            } else {
                this.logger.info('No clear complaint identified from message', {
                    sessionId,
                    message: currentMessageContent,
                });
            }
        } catch (error) {
            this.logger.error('Error during complaint identification', error, {
                sessionId,
                message: currentMessageContent,
            });
        }
    }
}
