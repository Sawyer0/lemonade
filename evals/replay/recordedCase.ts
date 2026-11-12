import { createHash } from 'node:crypto';
import type { EvalScenario } from '@lemonade/core';
import { LEDGER_GENESIS_HASH, computeLedgerEntryHash, type LedgerEntry, type LedgerHasher } from '@lemonade/core';

/** One turn of the talker transcript, as spoken or heard. Audio is never stored. */
export interface TranscriptTurn {
    role: 'user' | 'assistant';
    text: string;
}

/**
 * A recorded case: the evidence ledger and talker transcript of one real
 * run, plus what that run concluded. Replay feeds the fake model only the
 * evidence that existed at diagnosis time (observations and transcript);
 * the recorded safety stop, when the original run stopped, stays in the
 * ledger as part of the chain under test.
 */
export interface RecordedCase {
    caseId: string;
    scenarioId: string;
    name: string;
    vehicle: { year: number; make: string; model: string };
    ledger: LedgerEntry[];
    transcript: TranscriptTurn[];
    expectedDiagnosis: string;
    expectedActions: string[];
    expectedSafetyStop: boolean;
}

/** SHA-256 hasher for the ledger chain. Node-only; evals run on Node. */
export class Sha256LedgerHasher implements LedgerHasher {
    digestHex(content: string): string {
        return createHash('sha256').update(content, 'utf8').digest('hex');
    }
}

/** Deterministic UUID derived from a seed string, so replays are identical on every machine. */
export function deterministicUuid(seed: string): string {
    const hex = createHash('sha256').update(seed, 'utf8').digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Fixed clock for recorded cases: sequence n happened n minutes after the base. */
const RECORDED_BASE_MS = Date.parse('2025-12-21T00:00:00.000Z');

function entryTimestamp(sequence: number): Date {
    return new Date(RECORDED_BASE_MS + sequence * 60_000);
}

type LedgerAppendInput = Pick<LedgerEntry, 'type' | 'actor' | 'source' | 'payload'>;

/**
 * Builds a hash-chained ledger from typed appends. The chain is the audit
 * spine: any edit to an earlier entry breaks every hash after it, which is
 * exactly what the replay tests assert.
 */
export function buildLedger(caseId: string, appends: LedgerAppendInput[]): LedgerEntry[] {
    const hasher = new Sha256LedgerHasher();
    const entries: LedgerEntry[] = [];
    let previousHash = LEDGER_GENESIS_HASH;
    for (const [index, append] of appends.entries()) {
        const sequence = index + 1;
        const occurredAt = entryTimestamp(sequence);
        const entryHash = computeLedgerEntryHash(hasher, {
            caseId,
            sequence,
            type: append.type,
            actor: append.actor,
            source: append.source,
            occurredAt,
            payload: append.payload,
            previousHash,
        });
        entries.push({
            id: deterministicUuid(`${caseId}:entry:${sequence}`),
            caseId,
            sequence,
            type: append.type,
            actor: append.actor,
            source: append.source,
            occurredAt,
            payload: append.payload,
            previousHash,
            entryHash,
            createdAt: occurredAt,
        } as LedgerEntry);
        previousHash = entryHash;
    }
    return entries;
}

const TECH_ACTOR = { kind: 'user', id: 'recorded-tech' } as const;
const AGENT_ACTOR = { kind: 'agent', id: 'master-tech' } as const;

/**
 * Converts one golden-dataset scenario into a recorded case. The ledger
 * holds the complaint as an observation, the complaint and the assistant's
 * acknowledgement as transcript turns, and a safety-stop entry when the
 * original run stopped. Ground truth stays on the case, never in the
 * ledger: the fake model must earn it from the evidence alone.
 */
export function recordedCaseFromScenario(scenario: EvalScenario): RecordedCase {
    const caseId = deterministicUuid(`recorded-case:${scenario.id}`);
    const userQuery = scenario.input.userQuery;
    const expectedSafetyStop = scenario.expected_behavior?.safety_stop_expected ?? false;
    const transcript: TranscriptTurn[] = [
        { role: 'user', text: userQuery },
        {
            role: 'assistant',
            text: 'Understood. Tell me anything else you noticed, and I will work through it with you.',
        },
    ];
    const appends: LedgerAppendInput[] = [
        {
            type: 'observation',
            actor: TECH_ACTOR,
            source: 'tech',
            payload: { text: userQuery },
        },
        {
            type: 'transcript',
            actor: TECH_ACTOR,
            source: 'tech',
            payload: { role: 'user', text: userQuery, provider: 'gemini' },
        },
        {
            type: 'transcript',
            actor: AGENT_ACTOR,
            source: 'model',
            payload: {
                role: 'assistant',
                text: transcript[1]?.text ?? '',
                provider: 'gemini',
            },
        },
    ];
    if (expectedSafetyStop) {
        appends.push({
            type: 'safety_stop',
            actor: AGENT_ACTOR,
            source: 'model',
            payload: { reason: scenario.ground_truth.diagnosis, hazard: scenario.name },
        });
    }
    const vehicle = scenario.input.vehicleContext;
    return {
        caseId,
        scenarioId: scenario.id,
        name: scenario.name,
        vehicle: {
            year: vehicle?.year ?? 0,
            make: vehicle?.make ?? 'unknown',
            model: vehicle?.model ?? 'unknown',
        },
        ledger: buildLedger(caseId, appends),
        transcript,
        expectedDiagnosis: scenario.ground_truth.diagnosis,
        expectedActions: scenario.ground_truth.requiredActions,
        expectedSafetyStop,
    };
}

/** The evidence the fake model may see: observations and transcript turns, in ledger order. */
export function diagnosisEvidence(recordedCase: RecordedCase): string {
    const lines: string[] = [];
    for (const entry of recordedCase.ledger) {
        if (entry.type === 'observation') {
            lines.push(`observation: ${entry.payload.text}`);
        }
        if (entry.type === 'transcript') {
            lines.push(`${entry.payload.role}: ${entry.payload.text}`);
        }
    }
    return lines.join('\n');
}
