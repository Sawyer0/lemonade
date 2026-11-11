// The sandbox exec contract (LM-16, patterns from Codex and OpenClaw).
// A per-case sandbox runs reasoner scripts against the case's own scan data
// and nothing else: no network, a read-only root, dropped capabilities,
// no-new-privileges, a process limit, and a case-scoped workdir. The
// production sandbox is a container (a Cloud Run job or gVisor); the local
// implementation in infrastructure provides the same contract with Linux
// namespaces for development and tests.

/** Default wall-clock timeout for one script run (10 s). */
export const SANDBOX_DEFAULT_TIMEOUT_MS = 10_000;
/** Chars of output returned inline; longer output is middle-truncated to this. */
export const SANDBOX_PREVIEW_CHARS = 2_000;
/** Chars of output captured before the parent stops accumulating (runaway guard). */
export const SANDBOX_MAX_CAPTURE_CHARS = 1_000_000;
/** Max processes the sandboxed script may run at once. */
export const SANDBOX_MAX_PROCESSES = 128;

export interface SandboxStagedFile {
    /** Workdir-relative name, e.g. `pid-log.json`. No absolute paths, no `..`. */
    name: string;
    content: string;
}

export interface SandboxRunInput {
    caseId: string;
    /** Python source, run inside the sandbox. */
    script: string;
    /**
     * Workdir-relative script name, default `script.py`. The runner names
     * one per loop step (`step-1.py`, ...) so the audit trail keeps which
     * script produced which output.
     */
    scriptName?: string;
    /** Absolute host path of the case workdir. Must already exist. */
    workdir: string;
    /** Files staged into the workdir before the run (freeze frame, PID log). */
    files?: SandboxStagedFile[];
    /** Wall-clock timeout; defaults to SANDBOX_DEFAULT_TIMEOUT_MS. */
    timeoutMs?: number;
}

export interface SandboxRunResult {
    /** Process exit code, or null when the run was killed by its timeout. */
    exitCode: number | null;
    /** Captured stdout, middle-truncated to SANDBOX_PREVIEW_CHARS. */
    stdoutPreview: string;
    /** Captured stderr, middle-truncated to SANDBOX_PREVIEW_CHARS. */
    stderrPreview: string;
    /**
     * Workdir-relative path holding the full captured stdout, present when
     * the output exceeded the preview. The caller reads it from `workdir`.
     */
    outputFile?: string;
    timedOut: boolean;
    /** True when the full output exceeded the preview (and `outputFile` is set). */
    truncated: boolean;
    durationMs: number;
    /** The workdir the run used, for reading result files the script wrote. */
    workdir: string;
}

export class SandboxError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SandboxError';
    }
}

/**
 * The sandbox cannot run here (no user namespaces, no container runtime).
 * Thrown instead of running a script unconfined: a script that cannot be
 * sandboxed does not run at all.
 */
export class SandboxUnavailableError extends SandboxError {
    constructor(message: string) {
        super(message);
        this.name = 'SandboxUnavailableError';
    }
}

export interface ISandbox {
    /** Whether this sandbox can run in this environment. */
    readonly available: boolean;
    runScript(input: SandboxRunInput): Promise<SandboxRunResult>;
}

/**
 * Middle truncation: keeps the head and the tail of a long output and marks
 * how much was cut, so the first lines (what the script did) and the last
 * lines (what it concluded) both survive.
 */
export function truncateMiddle(output: string, limit: number): string {
    if (output.length <= limit) {
        return output;
    }
    const headChars = Math.floor(limit / 2);
    const tailChars = limit - headChars;
    const cutChars = output.length - limit;
    return `${output.slice(0, headChars)}\n... [${cutChars} chars truncated] ...\n${output.slice(output.length - tailChars)}`;
}
