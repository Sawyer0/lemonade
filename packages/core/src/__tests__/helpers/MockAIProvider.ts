import { vi } from 'vitest';

export class MockAIProvider {
    static mockStreamText(responseText: string) {
        return {
            toTextStreamResponse: () => new Response(responseText),
            usage: {
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150
            }
        };
    }

    static setup() {
        // Mock the 'ai' package's streamText function
        vi.mock('ai', () => ({
            streamText: vi.fn().mockImplementation(async ({ onFinish }) => {
                // Simulate async processing
                await new Promise(resolve => setTimeout(resolve, 10));
                
                const result = {
                    toTextStreamResponse: vi.fn().mockReturnValue(new Response("Mocked AI Response")),
                    usage: {
                        promptTokens: 100,
                        completionTokens: 50,
                        totalTokens: 150
                    }
                };

                // Trigger the onFinish callback to test billing
                if (onFinish) {
                    await onFinish({ usage: result.usage });
                }

                return result;
            })
        }));
    }
}
