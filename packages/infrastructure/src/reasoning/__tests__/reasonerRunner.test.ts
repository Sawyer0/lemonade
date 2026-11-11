import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type {
    AppendLedgerEntryInput,
    ICaseRepository,
    ILogger,
    LedgerEntry,
    ReasonerAction,
    ReasonerModel,
} from '@lemonade/core';
import { LocalSandbox } from '../../sandbox/LocalSandbox';
import { ReasonerRunner } from '../ReasonerRunner';

const sandbox = new LocalSandbox();

const ReasonerActionSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('tool'), tool: z.string(), args: z.record(z.unknown()) }),
    z.object({ kind: z.literal('finish'), summary: z.string(), citations: z.array(z.string()) }),
    z.object({ kind: z.literal('needs_tech'), reason: z.string() }),
    z.object({ kind: z.literal('safety_stop'), reason: z.string() }),
]);

const FixtureSchema = z.object({
    caseId: z.string(),
    goal: z.string(),
    freezeFrame: z.record(z.unknown()),
    pidLog: z.array(z.record(z.unknown())),
    modelActions: z.array(ReasonerActionSchema),
});

/** Replays the recorded model actions from a fixture, in order. */
class ReplayModel implements ReasonerModel {
    private readonly queue: ReasonerAction[];

    constructor(actions: ReasonerAction[]) {
        this.queue = [...actions];
    }

    async nextAction(): Promise<ReasonerAction> {
        const action = this.queue.shift();
        if (!action) {
            throw new Error('replay fixture ran out of model actions');
        }
        return action;
    }
}

function fakeCaseRepo(appended: LedgerEntry[]): ICaseRepository {
    return {
        async appendEntry(caseId: string, input: AppendLedgerEntryInput) {
            const entry = {
                id: '22222222-2222-2222-2222-222222222222',
                caseId,
                sequence: appended.length + 1,
                actor: input.actor,
                source: input.source,
                occurredAt: input.occurredAt,
                previousHash: '0'.repeat(64),
                entryHash: '1'.repeat(64),
                createdAt: new Date(),
                type: input.type,
                payload: input.payload,
            } as unknown as LedgerEntry;
            appended.push(entry);
            return entry;
        },
    } as unknown as ICaseRepository;
}

const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as ILogger;

// The replay runs the real sandbox, so it needs Linux user namespaces like
// the sandbox tests. See localSandbox.test.ts for why it skips elsewhere.
describe.skipIf(!sandbox.available)('ReasonerRunner replay fixture', () => {
    const tempDirs: string[] = [];

    afterAll(async () => {
        for (const dir of tempDirs) {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('computes fuel trims in the sandbox and cites the output in the ledger', async () => {
        const fixture = FixtureSchema.parse(
            JSON.parse(await readFile(join(__dirname, 'fixtures', 'fuelTrimCase.json'), 'utf8')),
        );
        const appended: LedgerEntry[] = [];
        const workdirBase = await mkdtemp(join(tmpdir(), 'lemonade-reasoner-test-'));
        tempDirs.push(workdirBase);
        const runner = new ReasonerRunner({ sandbox, logger, caseRepo: fakeCaseRepo(appended), workdirBase });

        const result = await runner.run({
            caseId: fixture.caseId,
            sessionId: 'test-session',
            userId: 'test-user',
            goal: fixture.goal,
            model: new ReplayModel(fixture.modelActions as ReasonerAction[]),
            caseFiles: [
                { name: 'freeze-frame.json', content: JSON.stringify(fixture.freezeFrame) },
                { name: 'pid-log.json', content: JSON.stringify(fixture.pidLog) },
            ],
        });

        expect(result.endState).toBe('finished');
        expect(result.finishSummary).toContain('+20.0%');
        // The sandbox really ran the computation, not the recording.
        const execStep = result.steps[0];
        expect(execStep?.toolResult?.ok).toBe(true);
        if (execStep?.toolResult?.ok) {
            expect(execStep.toolResult.output).toContain("verdict='lean_watch'");
            expect(execStep.toolResult.output).toContain('total_mean=20.0');
        }
        // And the output is cited in the ledger.
        expect(result.ledgerEntryId).toBe('22222222-2222-2222-2222-222222222222');
        expect(appended).toHaveLength(1);
        const entry = appended[0] as unknown as {
            type: string;
            payload: { testName: string; result: string; notes: string };
        };
        expect(entry.type).toBe('test_result');
        expect(entry.payload.testName).toBe('reasoner_sandbox_computation');
        expect(entry.payload.result).toBe('pass');
        expect(entry.payload.notes).toContain('lean_watch');
        expect(entry.payload.notes).toContain('20.0');
        // The run workdir is scratch and deleted when the run settles.
        expect(await readdir(workdirBase)).toEqual([]);
    });

    it('appends no ledger entry when the loop does not finish', async () => {
        const appended: LedgerEntry[] = [];
        const workdirBase = await mkdtemp(join(tmpdir(), 'lemonade-reasoner-test-'));
        tempDirs.push(workdirBase);
        const runner = new ReasonerRunner({ sandbox, logger, caseRepo: fakeCaseRepo(appended), workdirBase });

        const result = await runner.run({
            caseId: '11111111-1111-1111-1111-111111111111',
            sessionId: 'test-session',
            userId: 'test-user',
            goal: 'diagnose',
            model: new ReplayModel([{ kind: 'needs_tech', reason: 'need the freeze frame photo' }]),
            caseFiles: [],
        });

        expect(result.endState).toBe('needs_tech');
        expect(result.ledgerEntryId).toBeUndefined();
        expect(appended).toHaveLength(0);
    });
});
