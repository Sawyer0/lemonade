import { ChatSession, GenerateContentResponse } from '@google-cloud/vertexai';
import { ILogger, IGoogleSearchService } from '@lemonade/core';
import { traceAiCall } from '@/infrastructure/observability/langsmithTracer';

export interface FunctionCallHandlerOptions {
    searchService?: IGoogleSearchService;
    userId?: string;
    sessionId?: string;
}

export async function handleFunctionCalls(
    initialResponse: GenerateContentResponse,
    chat: ChatSession,
    logger: ILogger,
    options: FunctionCallHandlerOptions = {}
): Promise<GenerateContentResponse> {
    const { searchService, userId, sessionId } = options;
    let response = initialResponse;
    let loopCount = 0;
    const MAX_LOOPS = 3;

    while (loopCount < MAX_LOOPS) {
        const candidate = response.candidates?.[0];
        const functionCalls = candidate?.content?.parts?.filter(p => p.functionCall)?.map(p => p.functionCall);

        if (!functionCalls || functionCalls.length === 0) {
            break; // No function calls, proceed to text generation
        }

        logger.debug(`Gemini requested function calls`, { functionCalls: functionCalls.map(f => f?.name) });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const functionResponses: any[] = [];

        for (const call of functionCalls) {
            if (!call) continue;

            if (call.name === 'verifySafeSupport') {
                logger.debug('Executing verifySafeSupport');
                functionResponses.push({
                    functionResponse: {
                        name: 'verifySafeSupport',
                        response: {
                            name: 'verifySafeSupport',
                            content: {
                                safe: false,
                                status: 'verification_required',
                                message: 'User must show jack stands via camera to proceed.'
                            }
                        }
                    }
                });
            } else if (call.name === 'google_search') {
                const args = call.args as Record<string, unknown>;
                logger.debug('Executing google_search', { query: args['query'] });
                if (searchService) {
                    try {
                        const query = args['query'] as string;
                        const results = await searchService.search({
                            query,
                            limit: 3,
                            userId,     // Pass userId for billing
                            sessionId   // Pass sessionId for billing
                        });
                        functionResponses.push({
                            functionResponse: {
                                name: 'google_search',
                                response: {
                                    name: 'google_search',
                                    content: {
                                        results: results.results
                                    }
                                }
                            }
                        });
                    } catch (error) {
                        logger.error('Google Search Tool Failed', error);
                        functionResponses.push({
                            functionResponse: {
                                name: 'google_search',
                                response: {
                                    name: 'google_search',
                                    content: { error: 'Search failed' }
                                }
                            }
                        });
                    }
                } else {
                    functionResponses.push({
                        functionResponse: {
                            name: 'google_search',
                            response: {
                                name: 'google_search',
                                content: { error: 'Search service not available' }
                            }
                        }
                    });
                }
            }
            // start_video_stream is NOT handled here. It is a client-side tool.
        }

        // Feed results back to the model
        if (functionResponses.length > 0) {
            const loopResult = await traceAiCall({
                name: `function_loop_${loopCount}`,
                inputs: { functionResponses },
                exec: () => chat.sendMessage(functionResponses)
            });
            response = loopResult.response;
            loopCount++;
        } else {
            break;
        }
    }

    return response;
}
