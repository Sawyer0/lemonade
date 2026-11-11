import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { SandboxUnavailableError } from '@lemonade/core';
import { LocalSandbox } from '../LocalSandbox';

const sandbox = new LocalSandbox();

async function makeWorkdir(): Promise<string> {
    return mkdtemp(join(tmpdir(), 'lemonade-sandbox-test-'));
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

// The sandbox needs Linux user namespaces, which macOS does not have and
// some locked-down Linux hosts disable. On those machines the suite skips
// with a note; on Linux CI it must run. A sandbox that cannot run must
// never silently run unconfined (see the SandboxUnavailableError test).
describe.skipIf(!sandbox.available)('LocalSandbox', () => {
    const workdirs: string[] = [];

    afterAll(async () => {
        for (const workdir of workdirs) {
            await rm(workdir, { recursive: true, force: true });
        }
    });

    async function runInFreshWorkdir(script: string, options?: { files?: { name: string; content: string }[] }) {
        const workdir = await makeWorkdir();
        workdirs.push(workdir);
        const result = await sandbox.runScript({
            caseId: '00000000-0000-0000-0000-000000000001',
            script,
            workdir,
            files: options?.files,
        });
        return { workdir, result };
    }

    it('computes fuel trims from a staged PID log through diaglib', async () => {
        const pidLog = [
            { pid: 6, value: 12.0 },
            { pid: '0x07', value: 8.0 },
            { pid: 0x08, value: 1.0 },
            { pid: 0x09, value: 0.5 },
        ];
        const { result } = await runInFreshWorkdir(
            [
                'import json',
                'from diaglib import compute_fuel_trims',
                'samples = json.loads(open("/work/pid-log.json").read())',
                'print(compute_fuel_trims(samples))',
            ].join('\n'),
            { files: [{ name: 'pid-log.json', content: JSON.stringify(pidLog) }] },
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdoutPreview).toContain("verdict='lean_watch'");
        expect(result.stdoutPreview).toContain('total_mean=20.0');
        expect(result.timedOut).toBe(false);
    });

    it('proves no network: socket and DNS attempts fail inside', async () => {
        const { result } = await runInFreshWorkdir(
            [
                'import socket',
                'try:',
                '    socket.create_connection(("8.8.8.8", 53), timeout=2)',
                '    print("NETWORK REACHABLE")',
                'except Exception as error:',
                '    print("NO NETWORK:", type(error).__name__)',
                'try:',
                '    socket.getaddrinfo("example.com", 80)',
                '    print("DNS RESOLVED")',
                'except Exception as error:',
                '    print("NO DNS:", type(error).__name__)',
            ].join('\n'),
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdoutPreview).toContain('NO NETWORK');
        expect(result.stdoutPreview).toContain('NO DNS');
        expect(result.stdoutPreview).not.toContain('REACHABLE');
        expect(result.stdoutPreview).not.toContain('RESOLVED');
    });

    it('proves no writes outside the workdir', async () => {
        const stamp = Date.now().toString();
        const outsidePaths = [
            `/evil-${stamp}.txt`,
            `/tmp/evil-${stamp}.txt`,
            `/home/evil-${stamp}.txt`,
            `/home/hatch/evil-${stamp}.txt`,
        ];
        const attempts = outsidePaths.map((path) => `try:\n    open(${JSON.stringify(path)}, "w").write("escape")\n    print("WROTE ${path}")\nexcept Exception as error:\n    print("BLOCKED ${path}:", type(error).__name__)`);
        const { workdir, result } = await runInFreshWorkdir(
            [...attempts, 'open("/work/inside.txt", "w").write("ok")', 'print("WROTE INSIDE")'].join('\n'),
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdoutPreview).toContain('WROTE INSIDE');
        for (const path of outsidePaths) {
            expect(result.stdoutPreview).not.toContain(`WROTE ${path}`);
            expect(await exists(path)).toBe(false);
        }
        expect(await exists(join(workdir, 'inside.txt'))).toBe(true);
    });

    it('proves the root and diaglib are read-only', async () => {
        const diaglibPath = join(sandboxDiaglibPath(), 'diaglib', 'dtc.py');
        const before = createHash('sha256').update(await readFile(diaglibPath)).digest('hex');
        const { result } = await runInFreshWorkdir(
            [
                'try:',
                '    open("/diaglib/dtc.py", "w").write("pwned")',
                '    print("WROTE DIAGLIB")',
                'except Exception as error:',
                '    print("DIAGLIB BLOCKED:", type(error).__name__)',
                'try:',
                '    open("/usr/evil.txt", "w").write("x")',
                '    print("WROTE USR")',
                'except Exception as error:',
                '    print("USR BLOCKED:", type(error).__name__)',
            ].join('\n'),
        );
        expect(result.stdoutPreview).toContain('DIAGLIB BLOCKED');
        expect(result.stdoutPreview).toContain('USR BLOCKED');
        const after = createHash('sha256').update(await readFile(diaglibPath)).digest('hex');
        expect(after).toBe(before);
    });

    it('kills a runaway script at the timeout', async () => {
        const workdir = await makeWorkdir();
        workdirs.push(workdir);
        const result = await sandbox.runScript({
            caseId: '00000000-0000-0000-0000-000000000001',
            script: 'import time\ntime.sleep(30)\nprint("finished")',
            workdir,
            timeoutMs: 1500,
        });
        expect(result.timedOut).toBe(true);
        expect(result.exitCode).toBeNull();
        expect(result.durationMs).toBeLessThan(10000);
        expect(result.stdoutPreview).not.toContain('finished');
    });

    it('saves big output to a file with a 2k-char preview', async () => {
        const { workdir, result } = await runInFreshWorkdir('print("x" * 5000)');
        expect(result.truncated).toBe(true);
        expect(result.stdoutPreview.length).toBeLessThanOrEqual(2100);
        expect(result.stdoutPreview).toContain('chars truncated');
        expect(result.outputFile).toBe('output-script.txt');
        const saved = await readFile(join(workdir, 'output-script.txt'), 'utf8');
        expect(saved).toBe(`${'x'.repeat(5000)}\n`);
    });

    it('applies the process limit', async () => {
        const { result } = await runInFreshWorkdir(
            ['import resource', 'print(resource.getrlimit(resource.RLIMIT_NPROC))'].join('\n'),
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdoutPreview).toContain('(128, 128)');
    });

    it('reports a failing script with its stderr', async () => {
        const { result } = await runInFreshWorkdir('raise ValueError("bad freeze frame")');
        expect(result.exitCode).toBe(1);
        expect(result.stderrPreview).toContain('ValueError: bad freeze frame');
    });
});

describe('LocalSandbox without namespaces', () => {
    it('throws SandboxUnavailableError instead of running unconfined', async () => {
        const confined = new LocalSandbox({ unsharePath: '/nonexistent/unshare' });
        expect(confined.available).toBe(false);
        const workdir = await makeWorkdir();
        try {
            await expect(
                confined.runScript({
                    caseId: '00000000-0000-0000-0000-000000000001',
                    script: 'print("hi")',
                    workdir,
                }),
            ).rejects.toBeInstanceOf(SandboxUnavailableError);
        } finally {
            await rm(workdir, { recursive: true, force: true });
        }
    });
});

function sandboxDiaglibPath(): string {
    // __tests__ -> sandbox -> src -> infrastructure -> packages
    return join(__dirname, '..', '..', '..', '..', 'diaglib');
}

beforeAll(() => {
    if (!sandbox.available) {
        // eslint-disable-next-line no-console
        console.log('[LocalSandbox] user namespaces unavailable here; sandbox tests skipped');
    }
});
