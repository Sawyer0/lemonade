// Challenger (LM-19 task 1): the debate role that argues against the
// leading hypothesis using the case ledger.
//
// The challenger is a separate model call from the reasoner, on the
// worker model (Flash) while the reasoner thinks on Pro — it never grades
// the reasoner's own reasoning, only the ledger entries it is shown.
// Every objection must cite the ledger entries it rests on, and only an
// objection a cited entry directly supports may be marked decisive. A
// model failure propagates: the FinishGate treats a challenger that
// cannot run as a failed attempt, never as a silent pass.
import type { GenerationConfig, GenerativeModel } from '@google-cloud/vertexai';
import type { ChallengerObjection, ILogger, LedgerEntry } from '@lemonade/core';
import { citableLedgerSummaries } from '@lemonade/core';
import { parseModelJson } from './modelJson';

function buildChallengerPrompt(hypothesis: string, ledgerLines: string[]): string {
    const ledgerText = ledgerLines.length > 0 ? ledgerLines.join('\n') : 'No citable ledger entries.';
    return [
        'You are the challenger in a diagnostic debate. Your job is to argue AGAINST the leading hypothesis below,',
        'using ONLY the case ledger entries listed. You are not the diagnostician: do not propose a replacement',
        'diagnosis, do not restate the hypothesis, and do not use any knowledge beyond these entries.',
        '',
        'Rules:',
        '- Every objection must cite the ledger entry ids it rests on (the [id] at the start of each line).',
        '- Mark an objection decisive=true ONLY when a cited entry directly contradicts the hypothesis',
        '  (a test that failed, a reading outside its expected range, a code that points elsewhere).',
        '- An objection with no supporting entry is not an objection: leave it out.',
        '- If nothing in the ledger argues against the hypothesis, return an empty objections list.',
        '',
        'OUTPUT FORMAT: JSON ONLY',
        '{',
        '  "objections": [',
        '    { "text": "What the ledger shows against the hypothesis", "ledgerEntryIds": ["<entry id>"], "decisive": true }',
        '  ]',
        '}',
        '',
        `Leading hypothesis: "${hypothesis}"`,
        '',
        'Case ledger (citable entries only):',
        ledgerText,
    ].join('\n');
}

interface ChallengerReply {
    objections?: ChallengerObjection[];
}

/** A challenger reply is only usable when every objection has text, entry ids and a decisive flag. */
function isUsableReply(parsed: unknown): parsed is ChallengerReply {
    if (typeof parsed !== 'object' || parsed === null || !('objections' in parsed)) return false;
    const objections = (parsed as ChallengerReply).objections;
    if (!Array.isArray(objections)) return false;
    return objections.every(
        (objection) =>
            typeof objection === 'object' &&
            objection !== null &&
            typeof (objection as ChallengerObjection).text === 'string' &&
            Array.isArray((objection as ChallengerObjection).ledgerEntryIds) &&
            typeof (objection as ChallengerObjection).decisive === 'boolean',
    );
}

export class Challenger {
    constructor(
        private readonly model: GenerativeModel,
        private readonly logger: ILogger,
    ) {}

    /**
     * Argues against the leading hypothesis from the ledger. Returns the
     * objections, each citing the entries that support it. Throws when
     * the model call fails or returns unusable JSON: the caller must
     * treat that as a failed gate attempt, not as "no objections".
     */
    async challenge(hypothesis: string, ledger: LedgerEntry[], traceId?: string): Promise<ChallengerObjection[]> {
        this.logger.debug('Challenging leading hypothesis against the ledger', { hypothesis, traceId });
        const result = await this.model.generateContent({
            contents: [
                { role: 'user', parts: [{ text: buildChallengerPrompt(hypothesis, citableLedgerSummaries(ledger)) }] },
            ],
            generationConfig: { responseMimeType: 'application/json' } as unknown as GenerationConfig,
        });
        const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            throw new Error('Empty challenger response');
        }
        const parsed: unknown = parseModelJson(text);
        if (!isUsableReply(parsed)) {
            throw new Error('Challenger response did not contain a usable objections list');
        }
        const objections = parsed.objections ?? [];
        this.logger.info('Challenger returned objections', {
            count: objections.length,
            decisive: objections.filter((o) => o.decisive).length,
            traceId,
        });
        return objections;
    }
}
