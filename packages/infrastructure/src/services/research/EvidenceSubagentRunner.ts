import { injectable, inject } from 'inversify';
import {
    runEvidenceChildren,
    type EvidenceChildRequestInput,
    type EvidenceChildSource,
    type EvidenceChildSummary,
    type ICaseRepository,
    type IGoogleSearchService,
    type ILogger,
    type INHTSAService,
} from '@lemonade/core';
import { TYPES } from '../../di/types';
import { createDefaultEvidenceSources } from './sources/createDefaultEvidenceSources';

/** The ledger actor that files background evidence: an agent, never the tech. */
export const EVIDENCE_SUBAGENT_ACTOR = { kind: 'agent', id: 'evidence-subagents' } as const;

/**
 * Background evidence sub-agents (LM-18). Launched as soon as the VIN is
 * decoded — or earlier, from partial speech — the children run in parallel
 * in their own contexts and each returns only a schema-validated summary.
 * The runner appends every summary to the case ledger as an `advisory`
 * entry (source 'research'): child output carries no authority, so it is
 * recorded as advice the reasoner may read, never as an instruction or a
 * plan change.
 *
 * One launch per case per process: a second launch for a case that already
 * ran returns no summaries, so a repeated VIN (a second OBD scan, a
 * re-onboarded vehicle) never files the same advisories twice. A launch
 * that filed nothing — no child could run yet — does not count, so a later
 * launch with more of the vehicle known still runs. A failed lookup is
 * recorded as 'unknown' by the core fan-out, never as 'none'; a failed
 * ledger append is logged and does not fail the other children.
 */
/** What a launch caller passes: the request minus `startedFrom` — the launch fills that in. */
export type EvidenceLaunchRequest = Omit<EvidenceChildRequestInput, 'startedFrom'>;

@injectable()
export class EvidenceSubagentRunner {
    private readonly launchedCases = new Set<string>();

    constructor(
        @inject(TYPES.CaseRepo) private readonly caseRepo: ICaseRepository,
        @inject(TYPES.EvidenceSubagentSources) private readonly sources: EvidenceChildSource[],
        @inject(TYPES.Logger) private readonly logger: ILogger,
    ) {}

    /**
     * The VIN is decoded: launch every runnable child and file the
     * summaries in the ledger before the tech's first test. Returns the
     * summaries filed. A second call for the same case files nothing.
     */
    async launchOnVinDecoded(request: EvidenceLaunchRequest): Promise<EvidenceChildSummary[]> {
        return this.launch({ ...request, startedFrom: 'vin_decoded' });
    }

    /**
     * Early launch from partial speech: read-only lookups may start before
     * the VIN is decoded, from whatever the tech has said so far. Children
     * whose inputs are missing are skipped, not recorded.
     */
    async launchEarlyFromPartialSpeech(request: EvidenceLaunchRequest): Promise<EvidenceChildSummary[]> {
        return this.launch({ ...request, startedFrom: 'partial_speech' });
    }

    private async launch(request: EvidenceChildRequestInput): Promise<EvidenceChildSummary[]> {
        if (this.launchedCases.has(request.caseId)) {
            return [];
        }
        const summaries = await runEvidenceChildren(this.sources, request);
        if (summaries.length === 0) {
            return [];
        }
        this.launchedCases.add(request.caseId);
        for (const summary of summaries) {
            try {
                await this.caseRepo.appendEntry(request.caseId, {
                    type: 'advisory',
                    actor: { kind: EVIDENCE_SUBAGENT_ACTOR.kind, id: EVIDENCE_SUBAGENT_ACTOR.id },
                    source: 'research',
                    occurredAt: new Date(),
                    payload: summary,
                });
            } catch (error) {
                this.logger.error('[EvidenceSubagents] Failed to file advisory entry', error, {
                    caseId: request.caseId,
                    kind: summary.kind,
                });
            }
        }
        this.logger.info('[EvidenceSubagents] Evidence summaries filed', {
            caseId: request.caseId,
            kinds: summaries.map((summary) => summary.kind),
        });
        return summaries;
    }
}

export interface EvidenceSubagentRunnerFactoryDeps {
    nhtsa: INHTSAService;
    search: IGoogleSearchService;
    caseRepo: ICaseRepository;
    logger: ILogger;
}

/** Builds a runner with the default four sources. Used by the DI bindings. */
export function createEvidenceSubagentRunner(deps: EvidenceSubagentRunnerFactoryDeps): EvidenceSubagentRunner {
    return new EvidenceSubagentRunner(
        deps.caseRepo,
        createDefaultEvidenceSources({ nhtsa: deps.nhtsa, search: deps.search, caseRepo: deps.caseRepo }),
        deps.logger,
    );
}
