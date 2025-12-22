import { ChatSession, GenerateContentResponse } from '@google-cloud/vertexai';
import { ILogger, IGoogleSearchService, GoogleSearchArgsSchema, VerifySafeSupportArgsSchema } from '@lemonade/core';
import { TracingService } from '../observability/TracingService';
import { TYPES } from '../di/types';

// IMPORTANT: This function is currently standalone but relies on 'traceAiCall'.
// In infrastructure package, traceAiCall is part of TracingService.
// I should probably make this a class 'FunctionCallService' or inject the tracer.

// Quick fix: assume tracer is passed or resolved.
// Since handleFunctionCalls is a utility, let's inject dependencies into options.

export interface FunctionCallHandlerOptions {
    searchService?: IGoogleSearchService;
    userId?: string;
    sessionId?: string;
    tracer?: TracingService; // Injected
}

export async function handleFunctionCalls(
    initialResponse: GenerateContentResponse,
    chat: ChatSession,
    logger: ILogger,
    options: FunctionCallHandlerOptions = {}
): Promise<GenerateContentResponse> {
    const { searchService, userId, sessionId, tracer } = options;
    let response = initialResponse;
    let loopCount = 0;
    const MAX_LOOPS = 3;

    const SERVER_TOOLS = ['google_search', 'verify_safe_support'];

    while (loopCount < MAX_LOOPS) {
        const candidate = response.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const functionCalls = parts.filter(p => p.functionCall).map(p => p.functionCall);

        if (!functionCalls || functionCalls.length === 0) {
            break; 
        }

        // If any of the tools are client-side, we MUST stop and return the whole response
        // because we cannot partially respond to tool calls in a turn.
        const hasClientTool = functionCalls.some(f => f && !SERVER_TOOLS.includes(f.name));
        if (hasClientTool) {
            logger.debug('Client-side tool detected, stopping server-side loop', { 
                tools: functionCalls.map(f => f?.name) 
            });
            break;
        }

        logger.debug(`Gemini requested server-side function calls`, { 
            functionCalls: functionCalls.map(f => f?.name) 
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const functionResponses: any[] = [];

        for (const call of functionCalls) {
            if (!call) continue;

            if (call.name === 'verify_safe_support') {
                const args = call.args as Record<string, unknown>;
                logger.debug('Executing verify_safe_support', { args });
                
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
                                    message: 'User must show jack stands via camera to proceed.'
                                }
                            }
                        }
                    });
                } catch (error) {
                    logger.error('Verify Safe Support Tool Validation Failed', error as Error);
                    functionResponses.push({
                        functionResponse: {
                            name: 'verify_safe_support',
                            response: {
                                name: 'verify_safe_support',
                                content: { error: error instanceof Error ? error.message : 'Validation failed' }
                            }
                        }
                    });
                }

            } else if (call.name === 'google_search') {
                const args = call.args as Record<string, unknown>;
                logger.debug('Executing google_search', { query: args['query'] });
                
                if (searchService) {
                    try {
                        const validatedArgs = GoogleSearchArgsSchema.parse(args);
                        const results = await searchService.search({
                            query: validatedArgs.query,
                            limit: 3,
                            userId,     
                            sessionId   
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
                        logger.error('Google Search Tool Failed', error as Error);
                        functionResponses.push({
                            functionResponse: {
                                name: 'google_search',
                                response: {
                                    name: 'google_search',
                                    content: { error: error instanceof Error ? error.message : 'Search failed' }
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
        }

        if (functionResponses.length > 0) {
            // Use tracer if available, otherwise raw call
            if (tracer) {
                const loopResult = await tracer.traceAiCall({
                    name: `function_loop_${loopCount}`,
                    inputs: { functionResponses },
                    exec: () => chat.sendMessage(functionResponses)
                });
                response = loopResult.response;
            } else {
                const loopResult = await chat.sendMessage(functionResponses);
                response = loopResult.response;
            }
            loopCount++;
        } else {
            break;
        }
    }

    return response;
}
