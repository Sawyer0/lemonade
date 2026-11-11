import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    lstatContainedEntry,
    readContainedFile,
    resolveContainedPath,
    resolveWorkdirRoot,
    writeContainedFile,
} from '../workdirAccess';

/**
 * Unit tests for the contained workdir guard (LM-16 sandbox-escape fix).
 * These need no namespaces, so they run everywhere — including hosts
 * where the sandbox suite skips. Each refusal test plants the symlink
 * a sandboxed script would plant, then proves the host-side access
 * refuses it instead of following it to a file outside the workdir.
 */
describe('workdirAccess', () => {
    let workdir: string;
    let outside: string;
    let victim: string;

    beforeEach(async () => {
        workdir = await mkdtemp(join(tmpdir(), 'lemonade-workdir-test-'));
        outside = await mkdtemp(join(tmpdir(), 'lemonade-workdir-outside-'));
        victim = join(outside, 'victim.txt');
        await writeFile(victim, 'ORIGINAL', 'utf8');
    });

    afterEach(async () => {
        await rm(workdir, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
    });

    async function plantLink(name: string): Promise<void> {
        await symlink(victim, join(workdir, name));
    }

    it('writes and reads a regular file inside the workdir', async () => {
        const root = await resolveWorkdirRoot(workdir);
        await writeContainedFile(root, 'note.txt', 'hello');
        expect(await readContainedFile(root, 'note.txt')).toBe('hello');
        expect(await readFile(join(workdir, 'note.txt'), 'utf8')).toBe('hello');
    });

    it('refuses to write through a planted symlink and leaves the victim alone', async () => {
        const root = await resolveWorkdirRoot(workdir);
        await plantLink('output-script.txt');
        await expect(writeContainedFile(root, 'output-script.txt', 'x'.repeat(5001))).rejects.toThrow(
            /refusing to follow a symlink in the workdir: output-script\.txt/,
        );
        expect(await readFile(victim, 'utf8')).toBe('ORIGINAL');
        expect((await lstat(join(workdir, 'output-script.txt'))).isSymbolicLink()).toBe(true);
    });

    it('refuses to read through a planted symlink and never returns the victim', async () => {
        const root = await resolveWorkdirRoot(workdir);
        await writeFile(victim, 'TOP-SECRET-DO-NOT-LEAK', 'utf8');
        await plantLink('secret-link.txt');
        await expect(readContainedFile(root, 'secret-link.txt')).rejects.toThrow(
            /refusing to follow a symlink in the workdir: secret-link\.txt/,
        );
    });

    it('refuses names that escape the workdir', async () => {
        const root = await resolveWorkdirRoot(workdir);
        await expect(resolveContainedPath(root, '../victim.txt')).rejects.toThrow(
            /refusing to access outside the workdir/,
        );
        await expect(resolveContainedPath(root, '/etc/passwd')).rejects.toThrow(
            /refusing to access outside the workdir/,
        );
        await expect(resolveContainedPath(root, 'sub/note.txt')).rejects.toThrow(
            /refusing to access outside the workdir/,
        );
    });

    it('resolves a symlinked workdir root to the real directory', async () => {
        const link = join(tmpdir(), `lemonade-workdir-link-${Date.now()}`);
        await symlink(workdir, link);
        try {
            expect(await resolveWorkdirRoot(link)).toBe(await resolveWorkdirRoot(workdir));
        } finally {
            await rm(link, { force: true });
        }
    });

    it('rejects a workdir root that is not a directory', async () => {
        await expect(resolveWorkdirRoot(victim)).rejects.toThrow(/workdir must be an existing directory/);
        await expect(resolveWorkdirRoot(join(workdir, 'missing'))).rejects.toThrow(
            /workdir must be an existing directory/,
        );
    });

    it('lstat reports a symlink without following it to the target size', async () => {
        const root = await resolveWorkdirRoot(workdir);
        await writeFile(victim, 'x'.repeat(6000), 'utf8');
        await plantLink('secret-link.txt');
        const info = await lstatContainedEntry(root, 'secret-link.txt');
        expect(info.isSymbolicLink()).toBe(true);
        expect(info.size).not.toBe(6000);
    });
});
