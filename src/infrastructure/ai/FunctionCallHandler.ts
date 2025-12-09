import { ChatSession, GenerateContentResponse } from '@google-cloud/vertexai';
import { ILogger } from '@/core/interfaces/ILogger';
import { traceAiCall } from '@/infrastructure/observability/langsmithTracer';

export async function handleFunctionCalls(
    initialResponse: GenerateContentResponse,
    chat: ChatSession,
    logger: ILogger
): Promise<GenerateContentResponse> {
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
            }
            // openCamera is NOT handled here. It is a client-side tool.
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
