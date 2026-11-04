import { ChatSession, GenerateContentResponse, Part } from '@google-cloud/vertexai';
import { injectable, inject } from 'inversify';
import type { ILogger, IGoogleSearchService, IMemoryService } from '@lemonade/core';
import {
    GoogleSearchArgsSchema,
    VerifySafeSupportArgsSchema,
    SaveToMemoryArgsSchema,
    MemoryTags,
} from '@lemonade/core';
import { TracingService } from '../observability/TracingService';
import { TYPES } from '../di/types';

export interface FunctionCallContext {
    userId: string;
    sessionId: string;
    vin?: string;
}

@injectable()
export class FunctionCallService {
    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.GoogleSearchService) private searchService: IGoogleSearchService,
        @inject(TYPES.SupermemoryService) private memoryService: IMemoryService,
        @inject(TYPES.TracingService) private tracer: TracingService,
    ) {}

    async handleFunctionCalls(
        initialResponse: GenerateContentResponse,
        chat: ChatSession,
        context: FunctionCallContext,
    ): Promise<GenerateContentResponse> {
        let response = initialResponse;
        let loopCount = 0;
        const MAX_LOOPS = 3;

        const SERVER_TOOLS = ['google_search', 'verify_safe_support', 'save_to_memory'];

        while (loopCount < MAX_LOOPS) {
            const candidate = response.candidates?.[0];
            const parts = candidate?.content?.parts || [];
            const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

            if (!functionCalls || functionCalls.length === 0) {
                break;
            }

            // If any of the tools are client-side, we MUST stop and return the whole response
            // because we cannot partially respond to tool calls in a turn.
            const hasClientTool = functionCalls.some((f) => f && !SERVER_TOOLS.includes(f.name));
            if (hasClientTool) {
                this.logger.debug('Client-side tool detected, stopping server-side loop', {
                    tools: functionCalls.map((f) => f?.name),
                });
                break;
            }

            this.logger.debug(`Gemini requested server-side function calls`, {
                functionCalls: functionCalls.map((f) => f?.name),
            });

            const functionResponses: Part[] = [];

            for (const call of functionCalls) {
                if (!call) continue;

                if (call.name === 'verify_safe_support') {
                    const args = call.args as Record<string, unknown>;
                    this.logger.debug('Executing verify_safe_support', { args });

                    try {
                        VerifySafeSupportArgsSchema.parse(args);
                        functionResponses.push({
                            functionResponse: {
                                name: 'verify_safe_support',
                                response: {
                                    name: 'verify_safe_support',
                                    content: {
                                        safe: false,
                                        status: 'verification_required',
                                        message: 'User must show jack stands via camera to proceed.',
                                    },
                                },
                            },
                        });
                    } catch (error) {
                        this.logger.error('Verify Safe Support Tool Validation Failed', error as Error);
                        functionResponses.push({
                            functionResponse: {
                                name: 'verify_safe_support',
                                response: {
                                    name: 'verify_safe_support',
                                    content: { error: error instanceof Error ? error.message : 'Validation failed' },
                                },
                            },
                        });
                    }
                } else if (call.name === 'google_search') {
                    const args = call.args as Record<string, unknown>;
                    this.logger.debug('Executing google_search', { query: args['query'] });

                    try {
                        const validatedArgs = GoogleSearchArgsSchema.parse(args);
                        const results = await this.searchService.search({
                            query: validatedArgs.query,
                            limit: 3,
                            userId: context.userId,
                            sessionId: context.sessionId,
                        });
                        functionResponses.push({
                            functionResponse: {
                                name: 'google_search',
                                response: {
                                    name: 'google_search',
                                    content: {
                                        results: results.results,
                                    },
                                },
                            },
                        });
                    } catch (error) {
                        this.logger.error('Google Search Tool Failed', error as Error);
                        functionResponses.push({
                            functionResponse: {
                                name: 'google_search',
                                response: {
                                    name: 'google_search',
                                    content: { error: error instanceof Error ? error.message : 'Search failed' },
                                },
                            },
                        });
                    }
                } else if (call.name === 'save_to_memory') {
                    const args = call.args as Record<string, unknown>;
                    this.logger.debug('Executing save_to_memory', { args });

                    try {
                        const validatedArgs = SaveToMemoryArgsSchema.parse(args);

                        // Use standard isolation tags
                        const tags = [
                            MemoryTags.user(context.userId),
                            ...(context.vin ? [MemoryTags.vin(context.vin)] : []),
                            ...(validatedArgs.tags || []),
                        ];

                        await this.memoryService.addDocument({
                            content: validatedArgs.content,
                            url: validatedArgs.url,
                            tags,
                            metadata: {
                                reason: validatedArgs.reason,
                                sessionId: context.sessionId,
                            },
                        });

                        functionResponses.push({
                            functionResponse: {
                                name: 'save_to_memory',
                                response: {
                                    name: 'save_to_memory',
                                    content: {
                                        success: true,
                                        message: 'Successfully saved to vehicle memory.',
                                    },
                                },
                            },
                        });
                    } catch (error) {
                        this.logger.error('Save to Memory Tool Failed', error as Error);
                        functionResponses.push({
                            functionResponse: {
                                name: 'save_to_memory',
                                response: {
                                    name: 'save_to_memory',
                                    content: { error: error instanceof Error ? error.message : 'Save failed' },
                                },
                            },
                        });
                    }
                }
            }

            if (functionResponses.length > 0) {
                const loopResult = await this.tracer.traceAiCall({
                    name: `function_loop_${loopCount}`,
                    inputs: { functionResponses },
                    exec: () => chat.sendMessage(functionResponses),
                });
                response = loopResult.response;
                loopCount++;
            } else {
                break;
            }
        }

        return response;
    }
}
