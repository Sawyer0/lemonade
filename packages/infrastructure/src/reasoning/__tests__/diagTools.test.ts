import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
});
