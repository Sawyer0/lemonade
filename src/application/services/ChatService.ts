import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import { AppError, ErrorCode, MessagePart, AIAnalysis, StreamingEvent } from '@lemonade/core';
import type {
    IReactiveSafetyService,
    ISafetyMonitor,
    VehicleContext, // Import VehicleContext
} from '@lemonade/core';
import type {
    IChatService,
    IChatAssistantAI,
    ISessionRepository,
    IVehicleRepository,
    ILogger,
    ISummarizationService,
} from '@lemonade/core';
import { CONFIG } from '@/infrastructure/config';

import { ComplaintIdentificationService } from '@/application/services/ComplaintIdentificationService';

@injectable()
export class ChatService implements IChatService {
    constructor(
        @inject(TYPES.ChatAI) private chatAI: IChatAssistantAI,
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.ComplaintIdentificationService)
        private complaintIdentificationService: ComplaintIdentificationService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.SummarizationService) private summarizationService: ISummarizationService,
        @inject(TYPES.ReactiveSafetyService) private reactiveSafety: IReactiveSafetyService,
        @inject(TYPES.SafetyMonitor) private safetyMonitor: ISafetyMonitor,
    ) {}

    private async _pruneHistoryByTokens(
        history: { role: string; content?: unknown }[],
        maxTokens: number,
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
                    .filter((part) => part.type === 'text' && part.text)
                    .map((part) => part.text)
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
                        .map((msg) => {
                            if (typeof msg.content === 'string') return msg.content;
                            if (Array.isArray(msg.content))
                                return (msg.content as MessagePart[])
                                    .filter((p) => p.type === 'text' && p.text)
                                    .map((p) => p.text)
                                    .join(' ');
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
                                    content: `[SUMMARY OF PREVIOUS CONVERSATION]: ${summaryText}`,
                                });
                                currentTokens += summaryTokens;
                                this.logger.info('Chat history summarized', {
                                    originalLength: history.length,
                                    summaryTokens,
                                });
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
        this.logger.debug('Chat history pruned by tokens', {
            initialLength: history.length,
            prunedLength: prunedHistory.length,
            currentTokens,
            maxTokens,
        });
        return prunedHistory;
    }

    async *handleChatInteractionStream(
        sessionId: string,
        userMessage: string | MessagePart[],
        vehicleContextOverride?: VehicleContext,
        diagnosticContextOverride?: AIAnalysis,
    ): AsyncGenerator<StreamingEvent, void, unknown> {
        const session = await this.sessionRepo.getHistory(sessionId);
        if (!session) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found');

        const vehicle = await this.vehicleRepo.findById(session.vehicleId, session.userId);

        // Extract text for safety checks
        let userText = '';
        if (typeof userMessage === 'string') {
            userText = userMessage;
        } else if (Array.isArray(userMessage)) {
            userText = userMessage
                .filter((p) => p.type === 'text' && p.text)
                .map((p) => p.text)
                .join('\n');
        }

        // System 0: Reactive Safety (Regex)
        const reactiveAssessment = this.reactiveSafety.checkSafety(userText);
        if (reactiveAssessment && reactiveAssessment.intervention_required) {
            this.logger.warn('Chat interaction blocked by System 0 Safety', {
                sessionId,
                hazard: reactiveAssessment.hazards_detected,
            });
            const safetyReply =
                reactiveAssessment.suggested_output || 'CRITICAL SAFETY STOP: Immediate hazard detected.';
            await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
            await this.sessionRepo.addMessage(sessionId, 'assistant', safetyReply);
            yield { type: 'text', content: safetyReply };
            yield { type: 'done' };
            return;
        }

        // Use override if provided, otherwise fallback to database vehicle
        const year = vehicleContextOverride?.year || vehicle?.specs.year;
        const make = vehicleContextOverride?.make || vehicle?.specs.make;
        const model = vehicleContextOverride?.model || vehicle?.specs.model;

        // Use override if provided, otherwise fallback to session analysis
        const diagnosis = diagnosticContextOverride || session.aiAnalysis;

        const vehicleContext = `
      VEHICLE: ${year} ${make} ${model}
      LAST DIAGNOSIS: ${JSON.stringify(diagnosis)}
    `;

        // System 1: Semantic Safety (SafetyMonitor)
        const semanticAssessment = await this.safetyMonitor.assess(userText, vehicleContext);
        if (semanticAssessment.intervention_required) {
            this.logger.warn('Chat interaction blocked by System 1 Safety', {
                sessionId,
                hazard: semanticAssessment.hazards_detected,
            });
            const safetyReply =
                semanticAssessment.suggested_output || 'SAFETY STOP: Potential hazard detected. Please be careful.';
            await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
            await this.sessionRepo.addMessage(sessionId, 'assistant', safetyReply);
            yield { type: 'text', content: safetyReply };
            yield { type: 'done' };
            return;
        }

        const processedHistory = await this._pruneHistoryByTokens(
            session.messages,
            CONFIG.AI_SETTINGS.MAX_CHAT_HISTORY_TOKENS,
        );

        const additionalParts = Array.isArray(userMessage)
            ? userMessage
                  .filter((p) => p.type === 'fileData' || p.type === 'image_url')
                  .map((p) => {
                      if (p.type === 'fileData' && p.fileData) return { fileData: p.fileData };
                      return {};
                  })
                  .filter((p) => p.fileData)
            : [];

        const stream = this.chatAI.generateReplyStream(
            processedHistory,
            userText,
            vehicleContext,
            session.aiAnalysis,
            session.userId,
            sessionId,
            vehicle?.vin,
            undefined,
            additionalParts,
        );

        let accumulatedText = '';

        // Proxy events and accumulate text for history
        for await (const event of stream) {
            if (event.type === 'text') {
                accumulatedText += event.content;
            }
            yield event;
        }

        // Persist history after stream completes
        await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
        await this.sessionRepo.addMessage(sessionId, 'assistant', accumulatedText);

        this.complaintIdentificationService
            .identifyAndSetComplaint(sessionId, userText)
            .catch((error: unknown) =>
                this.logger.error('Background complaint identification failed', error, { sessionId }),
            );
    }

    async handleChatInteraction(sessionId: string, userMessage: string | MessagePart[]) {
        const session = await this.sessionRepo.getHistory(sessionId);
        if (!session) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found');

        const vehicle = await this.vehicleRepo.findById(session.vehicleId, session.userId);

        // Extract text for safety checks
        let userText = '';
        if (typeof userMessage === 'string') {
            userText = userMessage;
        } else if (Array.isArray(userMessage)) {
            userText = userMessage
                .filter((p) => p.type === 'text' && p.text)
                .map((p) => p.text)
                .join('\n');
        }

        // System 0: Reactive Safety (Regex)
        const reactiveAssessment = this.reactiveSafety.checkSafety(userText);
        if (reactiveAssessment && reactiveAssessment.intervention_required) {
            this.logger.warn('Chat interaction blocked by System 0 Safety', {
                sessionId,
                hazard: reactiveAssessment.hazards_detected,
            });
            const safetyReply =
                reactiveAssessment.suggested_output || 'CRITICAL SAFETY STOP: Immediate hazard detected.';
            await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
            await this.sessionRepo.addMessage(sessionId, 'assistant', safetyReply);
            return safetyReply;
        }

        const vehicleContext = `
      VEHICLE: ${vehicle?.specs.year} ${vehicle?.specs.make} ${vehicle?.specs.model}
      LAST DIAGNOSIS: ${JSON.stringify(session.aiAnalysis)}
    `;

        // System 1: Semantic Safety (SafetyMonitor)
        const semanticAssessment = await this.safetyMonitor.assess(userText, vehicleContext);
        if (semanticAssessment.intervention_required) {
            this.logger.warn('Chat interaction blocked by System 1 Safety', {
                sessionId,
                hazard: semanticAssessment.hazards_detected,
            });
            const safetyReply =
                semanticAssessment.suggested_output || 'SAFETY STOP: Potential hazard detected. Please be careful.';
            await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
            await this.sessionRepo.addMessage(sessionId, 'assistant', safetyReply);
            return safetyReply;
        }

        const processedHistory = await this._pruneHistoryByTokens(
            session.messages,
            CONFIG.AI_SETTINGS.MAX_CHAT_HISTORY_TOKENS,
        );

        // Handle multimodal content separation if necessary for specific adapters,
        // but for now we pass userMessage directly to generateReply which should support it.
        // We might need to split 'fileData' if the adapter interface requires 'additionalParts'.
        // Let's assume the adapter's generateReply can take string or MessagePart[] for the 'message' arg.
        // Wait, IChatAssistantAI.generateReply signature check needed.

        // Checking IChatAssistantAI.ts signature...
        // generateReply(history, message: string, ... additionalParts?: ...)

        // If the interface expects 'message' to be a string, we need to adapt.
        // I should update IChatAssistantAI as well to support multimodal directly in the message arg.

        // For now, I'll extract text and pass the rest as 'additionalParts' if the interface demands it.
        // Let's check IAIService.ts again to be sure.

        const reply = await this.chatAI.generateReply(
            processedHistory,
            userText, // Pass text component
            vehicleContext,
            session.aiAnalysis,
            session.userId,
            sessionId,
            vehicle?.vin,
            undefined, // reasoningEffort
            // Extract fileData parts for the 'additionalParts' argument if multimodal
            Array.isArray(userMessage)
                ? userMessage
                      .filter((p) => p.type === 'fileData' || p.type === 'image_url')
                      .map((p) => {
                          if (p.type === 'fileData' && p.fileData) return { fileData: p.fileData };
                          // if (p.type === 'image_url' && p.image_url) ... needs adapter support
                          return {};
                      })
                      .filter((p) => p.fileData)
                : [],
        );

        await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
        await this.sessionRepo.addMessage(sessionId, 'assistant', reply);

        this.complaintIdentificationService
            .identifyAndSetComplaint(sessionId, userText)
            .catch((error: unknown) =>
                this.logger.error('Background complaint identification failed', error, { sessionId }),
            );

        return reply;
    }
}
