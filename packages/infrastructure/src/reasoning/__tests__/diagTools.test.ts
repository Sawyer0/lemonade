import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolRegistry } from '@lemonade/core';
import type { ISandbox, SandboxRunResult } from '@lemonade/core';
import { registerDiagTools } from '../diagTools';

function stubSandbox(run: (script: string) => string): ISandbox {
    return {
        available: true,
        async runScript(input): Promise<SandboxRunResult> {
            return {
                exitCode: 0,
                stdoutPreview: run(input.script),
                stderrPreview: '',
                timedOut: false,
                truncated: false,
                durationMs: 1,
                workdir: input.workdir,
            };
        },
    };
}

describe('registerDiagTools', () => {
    let workdir: string;

    beforeEach(async () => {
        workdir = await mkdtemp(join(tmpdir(), 'lemonade-diag-tools-test-'));
    });

    afterEach(async () => {
        await rm(workdir, { recursive: true, force: true });
    });

    it('executes a script in the sandbox and names it per step', async () => {
        const seen: string[] = [];
        const registry = new ToolRegistry();
        registerDiagTools(registry, {
            sandbox: {
                available: true,
                async runScript(input): Promise<SandboxRunResult> {
                    seen.push(input.scriptName ?? '');
                    return {
                        exitCode: 0,
                        stdoutPreview: 'lean_watch',
                        stderrPreview: '',
                        timedOut: false,
                        truncated: false,
                        durationMs: 1,
                        workdir: input.workdir,
                    };
                },
            },
            workdir,
            caseId: 'case-1',
        });
        const first = await registry.call('diag.exec_python', { script: 'print(1)' });
        const second = await registry.call('diag.exec_python', { script: 'print(2)' });
        expect(first).toEqual({ ok: true, output: 'exit_code: 0\nstdout:\nlean_watch' });
        expect(second.ok).toBe(true);
        expect(seen).toEqual(['step-1.py', 'step-2.py']);
    });

    it('reports a timed-out script in the tool output', async () => {
        const timeoutRegistry = new ToolRegistry();
        registerDiagTools(timeoutRegistry, {
            sandbox: {
                available: true,
                async runScript(input): Promise<SandboxRunResult> {
                    return {
                        exitCode: null,
                        stdoutPreview: 'partial',
                        stderrPreview: '',
                        timedOut: true,
                        truncated: false,
                        durationMs: 10000,
                        workdir: input.workdir,
                    };
                },
            },
            workdir,
            caseId: 'case-1',
        });
        const result = await timeoutRegistry.call('diag.exec_python', { script: 'import time; time.sleep(30)' });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.output).toContain('timed out');
            expect(result.output).toContain('partial');
        }
    });

    it('lists workdir files and reads one back', async () => {
        await writeFile(join(workdir, 'pid-log.json'), '{"pid": 6}', 'utf8');
        const registry = new ToolRegistry();
        registerDiagTools(registry, { sandbox: stubSandbox(() => ''), workdir, caseId: 'case-1' });
        const listed = await registry.call('diag.list_workdir', {});
        expect(listed).toEqual({ ok: true, output: 'pid-log.json (10 bytes)' });
        const read = await registry.call('diag.read_file', { name: 'pid-log.json' });
        expect(read).toEqual({ ok: true, output: '{"pid": 6}' });
    });

    it('refuses to read outside the workdir', async () => {
        const registry = new ToolRegistry();
        registerDiagTools(registry, { sandbox: stubSandbox(() => ''), workdir, caseId: 'case-1' });
        expect(await registry.call('diag.read_file', { name: '../secret.txt' })).toEqual({
            ok: false,
            error: 'refusing to read outside the workdir: ../secret.txt',
        });
        expect(await registry.call('diag.read_file', { name: '.hidden' })).toEqual({
            ok: false,
            error: 'refusing to read outside the workdir: .hidden',
        });
    });

    it('refuses to read through a script-planted symlink and never returns the victim', async () => {
        // Finding 2 (review exploit): a script plants a symlink in /work
        // pointing at a host file outside the workdir; diag.read_file must
        // refuse it instead of returning the victim's contents to the model.
        const outside = await mkdtemp(join(tmpdir(), 'lemonade-diag-tools-outside-'));
        try {
            const victim = join(outside, 'secret.txt');
            await writeFile(victim, 'TOP-SECRET-DO-NOT-LEAK', 'utf8');
            await symlink(victim, join(workdir, 'secret-link.txt'));
            const registry = new ToolRegistry();
            registerDiagTools(registry, { sandbox: stubSandbox(() => ''), workdir, caseId: 'case-1' });
            expect(await registry.call('diag.read_file', { name: 'secret-link.txt' })).toEqual({
                ok: false,
                error: 'refusing to follow a symlink in the workdir: secret-link.txt',
            });
        } finally {
            await rm(outside, { recursive: true, force: true });
        }
    });

    it('lists a planted symlink without leaking its target size', async () => {
        const outside = await mkdtemp(join(tmpdir(), 'lemonade-diag-tools-outside-'));
        try {
            const victim = join(outside, 'secret.txt');
            await writeFile(victim, 'x'.repeat(6000), 'utf8');
            await writeFile(join(workdir, 'pid-log.json'), '{"pid": 6}', 'utf8');
            await symlink(victim, join(workdir, 'secret-link.txt'));
            const registry = new ToolRegistry();
            registerDiagTools(registry, { sandbox: stubSandbox(() => ''), workdir, caseId: 'case-1' });
            const listed = await registry.call('diag.list_workdir', {});
            expect(listed).toEqual({
                ok: true,
                output: 'pid-log.json (10 bytes)\nsecret-link.txt (symlink)',
            });
        } finally {
            await rm(outside, { recursive: true, force: true });
        }
    });
});
