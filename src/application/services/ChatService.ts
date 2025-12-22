import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import {
    AppError,
    ErrorCode,
    MessagePart,
    IReactiveSafetyService,
    ISafetyMonitor
} from '@lemonade/core';
import type {
    IChatService,
    IChatAssistantAI,
    ISessionRepository,
    IVehicleRepository,
    ILogger,
    ISummarizationService
} from '@lemonade/core';
import { CONFIG } from '@/infrastructure/config';

import { ComplaintIdentificationService } from '@/application/services/ComplaintIdentificationService';

@injectable()
export class ChatService implements IChatService {
    constructor(
        @inject(TYPES.ChatAI) private chatAI: IChatAssistantAI,
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.ComplaintIdentificationService) private complaintIdentificationService: ComplaintIdentificationService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.SummarizationService) private summarizationService: ISummarizationService,
        @inject(TYPES.ReactiveSafetyService) private reactiveSafety: IReactiveSafetyService,
        @inject(TYPES.SafetyMonitor) private safetyMonitor: ISafetyMonitor,
    ) { }

    private async _pruneHistoryByTokens(
        history: { role: string; content?: unknown }[],
        maxTokens: number
    ): Promise<{ role: string; content?: unknown }[]> {
        const prunedHistory: { role: string; content?: unknown }[] = [];
        let currentTokens = 0;

        for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            let messageContent = '';

            if (typeof message.content === 'string') {
                messageContent = message.content;
            } else if (Array.isArray(message.content)) {
                messageContent = (message.content as MessagePart[])
                    .filter(part => part.type === 'text' && part.text)
                    .map(part => part.text)
                    .join('\n');
            } else if (message.content !== null && message.content !== undefined) {
                messageContent = JSON.stringify(message.content);
            }

            const messageTokens = await this.chatAI.countTokens(messageContent);

            if (currentTokens + messageTokens <= maxTokens) {
                prunedHistory.unshift(message);
                currentTokens += messageTokens;
            } else {

                const excessMessages = history.slice(0, i + 1);

                if (excessMessages.length > 0) {
                    const messagesToSummarizeText = excessMessages
                        .map(msg => {
                            if (typeof msg.content === 'string') return msg.content;
                            if (Array.isArray(msg.content)) return (msg.content as MessagePart[]).filter(p => p.type === 'text' && p.text).map(p => p.text).join(' ');
                            return '';
                        })
                        .join('\n');

                    if (messagesToSummarizeText.trim().length > 0) {
                        try {
                            const summaryText = await this.summarizationService.summarize(messagesToSummarizeText);
                            const summaryTokens = await this.chatAI.countTokens(summaryText);
                            if (currentTokens + summaryTokens <= maxTokens) {
                                prunedHistory.unshift({
                                    role: 'system',
                                    content: `[SUMMARY OF PREVIOUS CONVERSATION]: ${summaryText}`
                                });
                                currentTokens += summaryTokens;
                                this.logger.info('Chat history summarized', { originalLength: history.length, summaryTokens });
                                break;
                            }
                        } catch (error: unknown) {
                            this.logger.error('Failed to summarize chat history segment', error);
                            break;
                        }
                    }
                }
                break;

            }
        }
        this.logger.debug('Chat history pruned by tokens', { initialLength: history.length, prunedLength: prunedHistory.length, currentTokens, maxTokens });
        return prunedHistory;
    }

    async handleChatInteraction(sessionId: string, userMessage: string) {
        const session = await this.sessionRepo.getHistory(sessionId);
        if (!session) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Session not found");

        const vehicle = await this.vehicleRepo.findById(session.vehicleId);

        // System 0: Reactive Safety (Regex)
        const reactiveAssessment = this.reactiveSafety.checkSafety(userMessage);
        if (reactiveAssessment && reactiveAssessment.intervention_required) {
            this.logger.warn('Chat interaction blocked by System 0 Safety', { sessionId, hazard: reactiveAssessment.hazards_detected });
            const safetyReply = reactiveAssessment.suggested_output || "CRITICAL SAFETY STOP: Immediate hazard detected.";
            await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
            await this.sessionRepo.addMessage(sessionId, 'assistant', safetyReply);
            return safetyReply;
        }

        const vehicleContext = `
      VEHICLE: ${vehicle?.specs.year} ${vehicle?.specs.make} ${vehicle?.specs.model}
      LAST DIAGNOSIS: ${JSON.stringify(session.aiAnalysis)}
    `;

        // System 1: Semantic Safety (SafetyMonitor)
        const semanticAssessment = await this.safetyMonitor.assess(userMessage, vehicleContext);
        if (semanticAssessment.intervention_required) {
            this.logger.warn('Chat interaction blocked by System 1 Safety', { sessionId, hazard: semanticAssessment.hazards_detected });
            const safetyReply = semanticAssessment.suggested_output || "SAFETY STOP: Potential hazard detected. Please be careful.";
            await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
            await this.sessionRepo.addMessage(sessionId, 'assistant', safetyReply);
            return safetyReply;
        }

        const processedHistory = await this._pruneHistoryByTokens(session.messages, CONFIG.AI_SETTINGS.MAX_CHAT_HISTORY_TOKENS);

        const reply = await this.chatAI.generateReply(
            processedHistory,
            userMessage,
            vehicleContext,
            session.aiAnalysis,
            session.userId,
            sessionId
        );

        await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
        await this.sessionRepo.addMessage(sessionId, 'assistant', reply);

        this.complaintIdentificationService.identifyAndSetComplaint(sessionId, userMessage)
            .catch((error: unknown) => this.logger.error('Background complaint identification failed', error, { sessionId }));

        return reply;
    }
}

