import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatSession, GenerativeModel } from '@google-cloud/vertexai';
import type { ILogger } from '@lemonade/core';
import type { GeminiCoreAdapter } from '../../GeminiCoreAdapter';
import type { FunctionCallService } from '../../FunctionCallHandler';
import { GeminiMediaModel } from '../GeminiMediaModel';

const reply = (parts: object[], usage?: object) => ({
    response: { candidates: [{ content: { parts } }], usageMetadata: usage },
});

describe('GeminiMediaModel', () => {
    let vertexModel: GenerativeModel;
    let chat: ChatSession;
    let functionCalls: FunctionCallService;
    let logger: ILogger;
    let model: GeminiMediaModel;

    beforeEach(() => {
        chat = { sendMessage: vi.fn() } as unknown as ChatSession;
        vertexModel = {
            startChat: vi.fn().mockReturnValue(chat),
            generateContent: vi.fn(),
            countTokens: vi.fn().mockResolvedValue({ totalTokens: 42 }),
        } as unknown as GenerativeModel;
        const core = {
            getGenerativeModel: vi.fn().mockReturnValue(vertexModel),
            commonTools: [],
            commonSafetySettings: [],
        } as unknown as GeminiCoreAdapter;
        functionCalls = {
            handleFunctionCalls: vi.fn().mockImplementation((response) => Promise.resolve(response)),
        } as unknown as FunctionCallService;
        logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger;
        model = new GeminiMediaModel(core, 'gemini-2.5-flash', functionCalls, logger);
    });

    it('reads every media kind', () => {
        expect(['image', 'video', 'audio'].every((k) => model.supports(k as 'image'))).toBe(true);
    });

    it('sends media by reference with a response schema when no tools are allowed', async () => {
        (vertexModel.generateContent as ReturnType<typeof vi.fn>).mockResolvedValue(
            reply([{ text: '{"diagnosis":"x"}' }], { promptTokenCount: 7, candidatesTokenCount: 3 }),
        );

        const result = await model.analyze({
            prompt: 'diagnose',
            media: { kind: 'video', mimeType: 'video/mp4', uri: 'gs://b/v.mp4' },
            structured: true,
        });

        const request = (vertexModel.generateContent as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(request.contents[0].parts[0]).toEqual({ fileData: { mimeType: 'video/mp4', fileUri: 'gs://b/v.mp4' } });
        expect(request.contents[0].parts[1]).toEqual({ text: 'diagnose' });
        expect(request.generationConfig.responseMimeType).toBe('application/json');
        expect(request.generationConfig.responseSchema).toBeDefined();
        expect(result).toEqual({
            text: '{"diagnosis":"x"}',
            toolCalls: [],
            usage: { inputTokens: 7, outputTokens: 3 },
            model: 'gemini-2.5-flash',
        });
        expect(vertexModel.startChat).not.toHaveBeenCalled();
    });

    it('runs server tools in a chat and returns the final answer, billing the first turn', async () => {
        (chat.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(
            reply(
                [
                    { text: 'Checking for recalls.' },
                    { functionCall: { name: 'google_search', args: { query: 'recall' } } },
                ],
                { promptTokenCount: 5, candidatesTokenCount: 5 },
            ),
        );
        (functionCalls.handleFunctionCalls as ReturnType<typeof vi.fn>).mockResolvedValue(
            reply([{ text: '{"diagnosis":"No recalls found"}' }]).response,
        );

        const result = await model.analyze({
            prompt: 'frame',
            media: { kind: 'image', mimeType: 'image/jpeg', data: 'b64' },
            structured: true,
            realtime: true,
            tools: { userId: 'u1', sessionId: 's1', vin: 'VIN' },
        });

        const sent = (chat.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(sent[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'b64' } });
        expect(functionCalls.handleFunctionCalls).toHaveBeenCalledWith(expect.anything(), chat, {
            userId: 'u1',
            sessionId: 's1',
            vin: 'VIN',
        });
        expect(result.text).toBe('{"diagnosis":"No recalls found"}');
        expect(result.toolCalls).toEqual([]);
        expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 5 });
    });

    it('hands back client tool calls with their accompanying text', async () => {
        (chat.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(
            reply([
                { text: 'Opening camera' },
                { functionCall: { name: 'start_video_stream', args: { component: 'belt' } } },
            ]),
        );

        const result = await model.analyze({
            prompt: 'frame',
            media: { kind: 'image', mimeType: 'image/jpeg', data: 'b64' },
            structured: true,
            tools: { userId: 'u1', sessionId: 's1' },
        });

        expect(result.text).toBe('Opening camera');
        expect(result.toolCalls).toEqual([{ name: 'start_video_stream', args: { component: 'belt' } }]);
        expect(result.usage).toBeUndefined();
    });

    it('counts tokens and falls back to zero when the api fails', async () => {
        await expect(model.countTokens('hello')).resolves.toBe(42);
        await expect(model.countTokens([])).resolves.toBe(0);
        (vertexModel.countTokens as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('quota'));
        await expect(model.countTokens('hello')).resolves.toBe(0);
        expect(logger.error).toHaveBeenCalledWith('countTokens failed', expect.any(Error));
    });
});
