import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

/**
 * Contained workdir access (LM-16 sandbox-escape fix).
 *
 * A sandboxed script runs with /work read-write, so anything it leaves
 * behind — including a symlink pointing outside the workdir — is hostile
 * input to the next host-side access. A plain `readFile`/`writeFile`/
 * `stat` on `join(workdir, name)` follows that symlink, letting one script
 * overwrite or read an arbitrary host file (the truncated-stdout write and
 * `diag.read_file` both did this). Every host-side workdir access in the
 * sandbox/runner/tool path goes through here instead:
 *
 * - the workdir root is canonicalised once with `realpath`, so a symlinked
 *   workdir cannot smuggle the root itself outside;
 * - a name must stay inside that root after resolution (`lstat` refuses a
 *   symlink outright, and an existing target's `realpath` must stay
 *   inside);
 * - reads and writes additionally open with `O_NOFOLLOW`, so a symlink
 *   swapped in between the check and the open still fails with `ELOOP`
 *   instead of following the link.
 */

function isInside(rootReal: string, candidateReal: string): boolean {
    return candidateReal === rootReal || candidateReal.startsWith(rootReal + sep);
}

function symlinkRefusal(name: string): Error {
    return new Error(`refusing to follow a symlink in the workdir: ${name}`);
}

/** Canonicalises the workdir root; throws unless it is a real directory. */
export async function resolveWorkdirRoot(workdir: string): Promise<string> {
    const rootReal = await realpath(workdir).catch(() => null);
    if (rootReal === null) {
        throw new Error(`workdir must be an existing directory, got: ${workdir}`);
    }
    const rootStat = await stat(rootReal);
    if (!rootStat.isDirectory()) {
        throw new Error(`workdir must be an existing directory, got: ${workdir}`);
    }
    return rootReal;
}

/**
 * Resolves a plain filename inside the canonical workdir root. Rejects
 * separators, `.`/`..` escapes and absolute names, refuses a symlinked
 * entry, and refuses a target whose real path leaves the root.
 */
export async function resolveContainedPath(rootReal: string, name: string): Promise<string> {
    if (name !== name.split('/').pop() || name.startsWith('.') || name.includes('\\')) {
        throw new Error(`refusing to access outside the workdir: ${name}`);
    }
    const candidate = resolve(rootReal, name);
    if (!isInside(rootReal, candidate)) {
        throw new Error(`refusing to access outside the workdir: ${name}`);
    }
    const entry = await lstat(candidate).catch(() => null);
    if (entry?.isSymbolicLink()) {
        throw symlinkRefusal(name);
    }
    if (entry) {
        const targetReal = await realpath(candidate);
        if (!isInside(rootReal, targetReal)) {
            throw symlinkRefusal(name);
        }
        return targetReal;
    }
    return candidate;
}

/** Writes a file inside the workdir without ever following a symlink. */
export async function writeContainedFile(rootReal: string, name: string, content: string): Promise<void> {
    const path = await resolveContainedPath(rootReal, name);
    let handle;
    try {
        handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
            throw symlinkRefusal(name);
        }
        throw error;
    }
    try {
        await handle.writeFile(content, 'utf8');
    } finally {
        await handle.close();
    }
}

/** Reads a file inside the workdir without ever following a symlink. */
export async function readContainedFile(rootReal: string, name: string): Promise<string> {
    const path = await resolveContainedPath(rootReal, name);
    let handle;
    try {
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
            throw symlinkRefusal(name);
        }
        throw error;
    }
    try {
        return await handle.readFile('utf8');
    } finally {
        await handle.close();
    }
}

/** `lstat` of a workdir entry: never follows a symlink, so no size leak. */
export async function lstatContainedEntry(rootReal: string, name: string) {
    return lstat(resolve(rootReal, name));
}
