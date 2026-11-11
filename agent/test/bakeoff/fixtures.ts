import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { VoiceProviderId } from '../../src/voice/provider';

/** One scripted bake-off turn. See turns.json for the set. */
export const BakeoffTurnSchema = z.object({
    id: z.string(),
    category: z.enum(['code', 'reading', 'interruption', 'guided-test', 'vision']),
    prompt: z.string().min(1),
    noiseBed: z.string().nullable(),
    expectedTargets: z.array(z.string()),
    expectedKeywords: z.array(z.string()),
    expectedTool: z.object({ name: z.string(), argsContain: z.record(z.string()) }).nullable(),
    interrupt: z.object({ afterMs: z.number().int().positive(), phrase: z.string().min(1) }).nullable(),
    clip: z.object({ file: z.string(), still: z.string() }).nullable(),
    notes: z.string(),
});
export type BakeoffTurn = z.infer<typeof BakeoffTurnSchema>;

const BakeoffTurnsFileSchema = z.object({
    version: z.literal(1),
    description: z.string(),
    turns: z.array(BakeoffTurnSchema).min(1),
});

export const NoiseBedSchema = z.object({
    id: z.string(),
    description: z.string(),
    bedGainDb: z.number(),
    file: z.string(),
});
export type NoiseBed = z.infer<typeof NoiseBedSchema>;

const NoiseBedsFileSchema = z.object({
    version: z.literal(1),
    description: z.string(),
    howToRecord: z.string(),
    beds: z.array(NoiseBedSchema).min(1),
});

export const CostRatesSchema = z.object({
    version: z.literal(1),
    asOf: z.string(),
    description: z.string(),
    rates: z.object({
        gemini: z.object({
            audioInPerMillionTokens: z.number(),
            audioOutPerMillionTokens: z.number(),
            textInPerMillionTokens: z.number(),
            textOutPerMillionTokens: z.number(),
            audioTokensPerSecond: z.number(),
            source: z.string(),
            verified: z.boolean(),
        }),
        grok: z.object({ perMinute: z.number(), source: z.string(), verified: z.boolean() }),
        cascade: z.object({
            deepgramSttPerMinute: z.number(),
            cartesiaTtsPerMillionChars: z.number(),
            geminiFlashTextInPerMillionTokens: z.number(),
            geminiFlashTextOutPerMillionTokens: z.number(),
            charsPerToken: z.number(),
            source: z.string(),
            verified: z.boolean(),
        }),
    }),
});
export type CostRates = z.infer<typeof CostRatesSchema>;

/** Loads and validates a bake-off JSON fixture. Throws naming the file on bad data. */
function loadJson<T>(path: string, schema: z.ZodType<T>): T {
    let raw: unknown;
    try {
        raw = JSON.parse(readFileSync(path, 'utf-8'));
    } catch (error) {
        throw new Error(`Cannot read bake-off fixture ${path}: ${(error as Error).message}`);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
        throw new Error(`Invalid bake-off fixture ${path}: ${parsed.error.message}`);
    }
    return parsed.data;
}

export function loadTurns(path: string): BakeoffTurn[] {
    const file = loadJson(path, BakeoffTurnsFileSchema);
    const seen = new Set<string>();
    for (const turn of file.turns) {
        if (seen.has(turn.id)) throw new Error(`Duplicate bake-off turn id ${turn.id} in ${path}`);
        seen.add(turn.id);
    }
    return file.turns;
}

export function loadNoiseBeds(path: string): NoiseBed[] {
    return loadJson(path, NoiseBedsFileSchema).beds;
}

export function loadCostRates(path: string): CostRates {
    return loadJson(path, CostRatesSchema);
}

/** What the runner measured for one provider in one session. */
export interface BakeoffUsage {
    /** Minutes of tech speech sent to the provider. */
    inputAudioMinutes: number;
    /** Minutes of agent speech received. */
    outputAudioMinutes: number;
    /** Characters of agent reply text (cascade TTS input). */
    outputChars: number;
    /** Wall-clock session minutes (grok bills the clock). */
    sessionMinutes: number;
}

/** Cost of one run, in USD, from measured usage and the rates file. */
export function estimateCostUsd(provider: VoiceProviderId, usage: BakeoffUsage, rates: CostRates): number {
    if (provider === 'gemini') {
        const tokensPerMinute = rates.rates.gemini.audioTokensPerSecond * 60;
        const inputCost =
            (usage.inputAudioMinutes * tokensPerMinute * rates.rates.gemini.audioInPerMillionTokens) / 1e6;
        const outputCost =
            (usage.outputAudioMinutes * tokensPerMinute * rates.rates.gemini.audioOutPerMillionTokens) / 1e6;
        return inputCost + outputCost;
    }
    if (provider === 'grok') {
        return usage.sessionMinutes * rates.rates.grok.perMinute;
    }
    const sttCost = usage.inputAudioMinutes * rates.rates.cascade.deepgramSttPerMinute;
    const ttsCost = (usage.outputChars * rates.rates.cascade.cartesiaTtsPerMillionChars) / 1e6;
    const llmTokens = usage.outputChars / rates.rates.cascade.charsPerToken;
    const llmCost =
        (llmTokens * rates.rates.cascade.geminiFlashTextOutPerMillionTokens) / 1e6 +
        (llmTokens * rates.rates.cascade.geminiFlashTextInPerMillionTokens) / 1e6;
    return sttCost + ttsCost + llmCost;
}
