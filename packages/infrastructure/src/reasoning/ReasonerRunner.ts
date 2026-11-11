import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLemonadeToolRegistry, runReasonerLoop } from '@lemonade/core';
import type {
    ICaseRepository,
    ILogger,
    ISandbox,
    ReasonerLoopResult,
    ReasonerModel,
    SandboxStagedFile,
} from '@lemonade/core';
import { registerDiagTools } from './diagTools';

// Max chars of loop citations kept in the ledger entry's notes.
const LEDGER_NOTES_LIMIT = 2_000;

export interface ReasonerRunInput {
    caseId: string;
    sessionId: string;
    userId: string;
    goal: string;
    model: ReasonerModel;
    /** Case files staged into the workdir: freeze frame JSON, PID log JSON, stills. */
    caseFiles: SandboxStagedFile[];
}

export interface ReasonerRunResult extends ReasonerLoopResult {
    /** Id of the ledger entry citing the computation, when one was appended. */
    ledgerEntryId?: string;
}

export interface ReasonerRunnerDeps {
    sandbox: ISandbox;
    logger: ILogger;
    /** When bound, a finished run appends a `test_result` ledger entry citing the sandbox output. */
    caseRepo?: ICaseRepository;
    /** Parent dir for per-run workdirs. Defaults to the OS temp dir. */
    workdirBase?: string;
}

/**
 * Runs one reasoner loop for a case (LM-16): stages the case files into a
 * fresh workdir, registers the `diag.*` tools against the sandbox, runs the
 * loop, and — when the loop finishes — appends a `test_result` ledger entry
 * citing the sandbox output, so the computation is on the case record and
 * not just in the transcript. The workdir is scratch: the staged files
 * already live on the case, so it is deleted when the run settles.
 */
export class ReasonerRunner {
    private readonly sandbox: ISandbox;
    private readonly logger: ILogger;
    private readonly caseRepo?: ICaseRepository;
    private readonly workdirBase: string;

    constructor(deps: ReasonerRunnerDeps) {
        this.sandbox = deps.sandbox;
        this.logger = deps.logger;
        this.caseRepo = deps.caseRepo;
        this.workdirBase = deps.workdirBase ?? join(tmpdir(), 'lemonade-reasoner');
    }

    async run(input: ReasonerRunInput): Promise<ReasonerRunResult> {
        await mkdir(this.workdirBase, { recursive: true });
        const workdir = await mkdtemp(join(this.workdirBase, `${input.caseId}-`));
        try {
            // Stage the case files before the loop starts, so the first
            // script can already read the freeze frame and the PID log.
            for (const file of input.caseFiles) {
                if (file.name !== file.name.split('/').pop() || file.name.startsWith('.')) {
                    throw new Error(`case file name must be a plain filename, got: ${file.name}`);
                }
                await writeFile(join(workdir, file.name), file.content, 'utf8');
            }
            const registry = createLemonadeToolRegistry();
            registerDiagTools(registry, { sandbox: this.sandbox, workdir, caseId: input.caseId });
            const loopResult = await runReasonerLoop({
                model: input.model,
                tools: registry,
                goal: input.goal,
                toolContext: { caseId: input.caseId, sessionId: input.sessionId, userId: input.userId },
            });
            const ledgerEntryId = await this.citeInLedger(input, loopResult);
            return { ...loopResult, ...(ledgerEntryId ? { ledgerEntryId } : {}) };
        } finally {
            await rm(workdir, { recursive: true, force: true }).catch((error: unknown) =>
                this.logger.warn('[ReasonerRunner] Failed to delete run workdir', { workdir, error }),
            );
        }
    }

    /**
     * A finished run cites its computation in the ledger as a `test_result`:
     * the model's conclusion plus the sandbox outputs it cited. A failed
     * append is logged, not fatal: the diagnosis still stands, and the
     * failure is visible instead of silently dropping the citation.
     */
    private async citeInLedger(input: ReasonerRunInput, loopResult: ReasonerLoopResult): Promise<string | undefined> {
        if (!this.caseRepo || loopResult.endState !== 'finished') {
            return undefined;
        }
        const notes = [loopResult.finishSummary ?? '', ...loopResult.citations]
            .filter((part) => part.length > 0)
            .join('\n');
        try {
            const entry = await this.caseRepo.appendEntry(input.caseId, {
                actor: { kind: 'agent', id: 'reasoner' },
                source: 'model',
                occurredAt: new Date(),
                type: 'test_result',
                payload: {
                    testName: 'reasoner_sandbox_computation',
                    result: 'pass',
                    notes: notes.slice(0, LEDGER_NOTES_LIMIT),
                },
            });
            return entry.id;
        } catch (error) {
            this.logger.warn('[ReasonerRunner] Failed to cite the reasoner computation in the ledger', {
                caseId: input.caseId,
                error,
            });
            return undefined;
        }
    }
}
