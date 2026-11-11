import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
    SANDBOX_DEFAULT_TIMEOUT_MS,
    SANDBOX_MAX_CAPTURE_CHARS,
    SANDBOX_MAX_PROCESSES,
    SANDBOX_PREVIEW_CHARS,
    SandboxUnavailableError,
    truncateMiddle,
} from '@lemonade/core';
import type { ISandbox, SandboxRunInput, SandboxRunResult } from '@lemonade/core';

// Max file size a sandboxed script may write, in bytes (RLIMIT_FSIZE).
const SANDBOX_MAX_FILE_BYTES = 10 * 1024 * 1024;

const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9_.-]+\.py$/;

export interface LocalSandboxOptions {
    /** Host path of packages/diaglib. Defaults to the repo layout. */
    diaglibPath?: string;
    /** Path to unshare. Defaults to `unshare` on PATH. */
    unsharePath?: string;
}

/** Shell-quotes one argument: safe for paths the caller supplies. */
function shellQuote(value: string): string {
    return `'${value.split("'").join(`'\\''`)}'`;
}

/**
 * Local sandbox (LM-16): runs a Python script in Linux user, mount, network
 * and PID namespaces. Inside, the script sees a fresh root with /usr and the
 * diaglib bind-mounted read-only, the case workdir bind-mounted read-write
 * at /work, no network interfaces, capabilities dropped and no-new-privileges,
 * a process limit and a file-size limit. The old root is covered by a tmpfs
 * so nothing outside /work is reachable, let alone writable.
 *
 * When user namespaces are unavailable the sandbox reports `available:
 * false` and `runScript` throws SandboxUnavailableError — it never falls
 * back to running a script unconfined.
 */
export class LocalSandbox implements ISandbox {
    readonly available: boolean;
    private readonly diaglibPath: string;
    private readonly unsharePath: string;

    constructor(options: LocalSandboxOptions = {}) {
        this.diaglibPath = options.diaglibPath ?? resolve(__dirname, '..', '..', '..', '..', 'packages', 'diaglib');
        this.unsharePath = options.unsharePath ?? 'unshare';
        if (!existsSync(join(this.diaglibPath, 'diaglib', 'dtc.py'))) {
            throw new Error(`diaglib not found at ${this.diaglibPath}`);
        }
        this.available = LocalSandbox.probeNamespaces(this.unsharePath);
    }

    /** True when `unshare` can create a mapped user namespace here. */
    private static probeNamespaces(unsharePath: string): boolean {
        try {
            const probe = spawnSync(
                unsharePath,
                ['--user', '--map-root-user', '--mount', '--net', '--pid', '--fork', 'true'],
                { timeout: 5000 },
            );
            return probe.status === 0;
        } catch {
            return false;
        }
    }

    async runScript(input: SandboxRunInput): Promise<SandboxRunResult> {
        if (!this.available) {
            throw new SandboxUnavailableError(
                'Local sandbox unavailable: user namespaces are not usable here, so the script will not run unconfined',
            );
        }
        const scriptName = input.scriptName ?? 'script.py';
        if (!SCRIPT_NAME_PATTERN.test(scriptName)) {
            throw new Error(`scriptName must be a plain .py filename, got: ${scriptName}`);
        }
        if (!input.script.trim()) {
            throw new Error('script must not be empty');
        }
        const workdirStat = await stat(input.workdir).catch(() => null);
        if (!workdirStat?.isDirectory()) {
            throw new Error(`workdir must be an existing directory, got: ${input.workdir}`);
        }
        const stagedFiles = input.files ?? [];
        for (const file of stagedFiles) {
            if (file.name !== basename(file.name) || file.name.startsWith('.')) {
                throw new Error(`staged file name must be a plain filename, got: ${file.name}`);
            }
        }

        const startedAt = Date.now();
        const stagingRoot = await mkdtemp(join(tmpdir(), 'lemonade-sandbox-root-'));
        try {
            await this.prepareStagingRoot(stagingRoot);
            await writeFile(join(input.workdir, scriptName), input.script, 'utf8');
            for (const file of stagedFiles) {
                await writeFile(join(input.workdir, file.name), file.content, 'utf8');
            }
            const timeoutMs = input.timeoutMs ?? SANDBOX_DEFAULT_TIMEOUT_MS;
            const captured = await this.spawnSandboxed(stagingRoot, input.workdir, scriptName, timeoutMs);

            let outputFile: string | undefined;
            const truncated = captured.stdout.length > SANDBOX_PREVIEW_CHARS;
            if (truncated) {
                const outputName = `output-${scriptName.replace(/\.py$/, '')}.txt`;
                await writeFile(join(input.workdir, outputName), captured.stdout, 'utf8');
                outputFile = outputName;
            }
            return {
                exitCode: captured.exitCode,
                stdoutPreview: truncateMiddle(captured.stdout, SANDBOX_PREVIEW_CHARS),
                stderrPreview: truncateMiddle(captured.stderr, SANDBOX_PREVIEW_CHARS),
                ...(outputFile ? { outputFile } : {}),
                timedOut: captured.timedOut,
                truncated,
                durationMs: Date.now() - startedAt,
                workdir: input.workdir,
            };
        } finally {
            await rm(stagingRoot, { recursive: true, force: true });
        }
    }

    /** Builds the fresh root the script pivots into: mount points and merged-usr links. */
    private async prepareStagingRoot(stagingRoot: string): Promise<void> {
        for (const dir of ['usr', 'work', 'diaglib', 'dev', 'oldroot', 'etc']) {
            await mkdir(join(stagingRoot, dir));
        }
        for (const [link, target] of [
            ['lib', 'usr/lib'],
            ['lib64', 'usr/lib64'],
            ['bin', 'usr/bin'],
            ['sbin', 'usr/sbin'],
        ] as const) {
            await symlink(target, join(stagingRoot, link));
        }
    }

    /** The setup script run inside the namespaces: mounts, pivot, limits, exec. */
    private setupScript(stagingRoot: string, workdir: string, scriptName: string): string {
        const root = shellQuote(stagingRoot);
        const diaglib = shellQuote(this.diaglibPath);
        const work = shellQuote(workdir);
        return [
            'set -e',
            'mount --make-rprivate /',
            `mount --bind ${root} ${root}`,
            `mount --bind /usr ${root}/usr`,
            `mount -o remount,ro,bind ${root}/usr`,
            `mount --bind ${diaglib} ${root}/diaglib`,
            `mount -o remount,ro,bind ${root}/diaglib`,
            `mount --bind ${work} ${root}/work`,
            `mount -t tmpfs tmpfs ${root}/dev`,
            `for d in null zero urandom random; do touch ${root}/dev/$d; mount --bind /dev/$d ${root}/dev/$d; done`,
            `mount -o remount,ro,bind ${root}`,
            `cd ${root}`,
            '/usr/sbin/pivot_root . oldroot',
            'mount -t tmpfs tmpfs /oldroot',
            'cd /work',
            `exec setpriv --no-new-privs --bounding-set=-all -- /usr/bin/prlimit --nproc=${SANDBOX_MAX_PROCESSES} --fsize=${SANDBOX_MAX_FILE_BYTES} -- /usr/bin/python3 /work/${scriptName}`,
        ].join('\n');
    }

    private spawnSandboxed(
        stagingRoot: string,
        workdir: string,
        scriptName: string,
        timeoutMs: number,
    ): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
        return new Promise((resolvePromise, rejectPromise) => {
            const child = spawn(
                this.unsharePath,
                [
                    '--user',
                    '--map-root-user',
                    '--mount',
                    '--net',
                    '--pid',
                    '--fork',
                    'sh',
                    '-c',
                    this.setupScript(stagingRoot, workdir, scriptName),
                ],
                {
                    detached: true,
                    env: {
                        PATH: '/usr/bin:/bin',
                        PYTHONPATH: '/diaglib',
                        PYTHONDONTWRITEBYTECODE: '1',
                        PYTHONSAFEPATH: '1',
                        PYTHONNOUSERSITE: '1',
                        TMPDIR: '/work',
                        HOME: '/work',
                        LC_ALL: 'C.UTF-8',
                    },
                },
            );

            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let settled = false;

            const finish = (exitCode: number | null) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                resolvePromise({ exitCode, stdout, stderr, timedOut });
            };

            child.stdout?.on('data', (chunk: Buffer) => {
                if (stdout.length < SANDBOX_MAX_CAPTURE_CHARS) {
                    stdout += chunk.toString('utf8').slice(0, SANDBOX_MAX_CAPTURE_CHARS - stdout.length);
                }
            });
            child.stderr?.on('data', (chunk: Buffer) => {
                if (stderr.length < SANDBOX_MAX_CAPTURE_CHARS) {
                    stderr += chunk.toString('utf8').slice(0, SANDBOX_MAX_CAPTURE_CHARS - stderr.length);
                }
            });
            child.on('error', (error) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    rejectPromise(error);
                }
            });
            child.on('close', (exitCode) => finish(exitCode));

            const timer = setTimeout(() => {
                timedOut = true;
                // Kill the whole process group: the timeout ends the script
                // and anything it spawned, not just the unshare parent.
                if (child.pid !== undefined) {
                    try {
                        process.kill(-child.pid, 'SIGKILL');
                    } catch {
                        // The group is already gone.
                    }
                }
                finish(null);
            }, timeoutMs);
            // The timer must not keep the process alive on its own.
            timer.unref?.();
        });
    }
}
