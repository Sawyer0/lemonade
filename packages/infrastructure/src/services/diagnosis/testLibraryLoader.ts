// Test library loading from disk (LM-04): the runtime side of the
// seed files in data/tests/*.yaml.
//
// Core stays free of Node-only imports, so the YAML parsing lives in
// core's yamlLoader and this module only reads the directory. The path
// resolves from this file like LocalSandbox resolves diaglib: from
// source it is the repo root, and a caller that runs from anywhere else
// passes its own directory. A missing or unreadable directory fails
// soft with null — the workup skips instead of failing the diagnosis.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseTestLibraryYaml, TestLibrary, type TestDefinition } from '@lemonade/core';

export function defaultTestLibraryDir(): string {
    return resolve(__dirname, '..', '..', '..', '..', '..', 'data', 'tests');
}

/**
 * Loads every seed file in the directory into one library. Throws on a
 * file that does not parse or validate, so a bad seed file is loud at
 * startup instead of silently planning on half a library.
 */
export function loadTestLibraryFromDirectory(directory: string): TestLibrary {
    const files = readdirSync(directory)
        .filter((file) => file.endsWith('.yaml'))
        .sort();
    const definitions: TestDefinition[] = files.flatMap((file) =>
        parseTestLibraryYaml(readFileSync(join(directory, file), 'utf8')),
    );
    return TestLibrary.fromDefinitions(definitions);
}
