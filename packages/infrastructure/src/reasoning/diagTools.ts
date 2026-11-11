import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { truncateMiddle } from '@lemonade/core';
import type { ISandbox, ToolRegistry } from '@lemonade/core';

// Max chars of a workdir file returned to the model by diag.read_file.
const READ_FILE_LIMIT = 2_000;

export interface DiagToolDeps {
    sandbox: ISandbox;
    /** The case workdir the tools run scripts in. */
    workdir: string;
    caseId: string;
}

const ExecPythonArgsSchema = z.object({ script: z.string().min(1) });
const ReadFileArgsSchema = z.object({ name: z.string().min(1) });

/**
 * The reasoner's tools (LM-16), registered into the shared registry under
 * `diag.*`. `diag.exec_python` runs a script in the case sandbox — the
 * CodeAct tool: the model computes over the car's own data with diaglib
 * instead of guessing in JSON. `diag.list_workdir` and `diag.read_file`
 * let it see what the case staged and read back files a script wrote.
 * Scripts are named per step (`step-1.py`, ...) so the audit trail keeps
 * which script produced which output.
 */
export function registerDiagTools(registry: ToolRegistry, deps: DiagToolDeps): void {
    let stepNumber = 0;

    registry.register({
        name: 'diag.exec_python',
        description:
            'Run a Python script in the case sandbox. diaglib is importable, the case files are in /work, there is no network, and writes land only in /work. Returns the script output.',
        side: 'server',
        argsSchema: ExecPythonArgsSchema,
        handler: async (args) => {
            const { script } = ExecPythonArgsSchema.parse(args);
            stepNumber += 1;
            const result = await deps.sandbox.runScript({
                caseId: deps.caseId,
                script,
                scriptName: `step-${stepNumber}.py`,
                workdir: deps.workdir,
            });
            const lines = [`exit_code: ${result.exitCode ?? 'killed'}`];
            if (result.timedOut) {
                lines.push('timed out: the script was killed at its 10 s limit');
            }
            lines.push(`stdout:\n${result.stdoutPreview}`);
            if (result.stderrPreview) {
                lines.push(`stderr:\n${result.stderrPreview}`);
            }
            if (result.outputFile) {
                lines.push(`full output saved to ${result.outputFile}; read it with diag.read_file to cite it`);
            }
            return lines.join('\n');
        },
    });

    registry.register({
        name: 'diag.list_workdir',
        description: 'List the files staged in the case workdir (freeze frame, PID log, stills, script outputs).',
        side: 'server',
        argsSchema: z.object({}),
        handler: async () => {
            const names = await readdir(deps.workdir);
            if (names.length === 0) {
                return 'workdir is empty';
            }
            const lines: string[] = [];
            for (const name of names.sort()) {
                const info = await stat(join(deps.workdir, name));
                lines.push(`${name} (${info.size} bytes)`);
            }
            return lines.join('\n');
        },
    });

    registry.register({
        name: 'diag.read_file',
        description: 'Read a file from the case workdir, capped at 2k chars with middle truncation.',
        side: 'server',
        argsSchema: ReadFileArgsSchema,
        handler: async (args) => {
            const { name } = ReadFileArgsSchema.parse(args);
            if (name !== name.split('/').pop() || name.startsWith('.')) {
                throw new Error(`refusing to read outside the workdir: ${name}`);
            }
            const content = await readFile(join(deps.workdir, name), 'utf8');
            return truncateMiddle(content, READ_FILE_LIMIT);
        },
    });
}
