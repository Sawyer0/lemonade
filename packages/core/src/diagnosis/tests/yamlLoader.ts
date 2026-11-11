import { parse } from 'yaml';
import { z } from 'zod';
import { SHARED_CONFIG } from '../../config';
import { TestLibraryFileSchema, type TestDefinition } from './testSchema';

// --- YAML loading (LM-34) ---
// Seed files live in data/tests/*.yaml. This module is the only place YAML
// is parsed: it turns file text into validated definitions, and any failure
// (bad YAML, wrong version, incomplete test) throws an Error that names the
// problem instead of returning a half-valid library. Core stays free of
// Node-only imports, so the loader takes text, not a file path; callers
// that read from disk pass the text in.

export const TEST_LIBRARY_YAML_VERSION = SHARED_CONFIG.TEST_LIBRARY.YAML_VERSION;

/** Parses one seed file's text into its validated test definitions. */
export function parseTestLibraryYaml(yamlText: string): TestDefinition[] {
    let parsedYaml: unknown;
    try {
        parsedYaml = parse(yamlText);
    } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown YAML error';
        throw new Error(`Test library YAML does not parse: ${detail}`);
    }
    try {
        const file = TestLibraryFileSchema.parse(parsedYaml);
        return file.tests;
    } catch (error) {
        if (error instanceof z.ZodError) {
            const problems = error.issues
                .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
                .join('; ');
            throw new Error(`Test library YAML failed validation: ${problems}`);
        }
        throw error;
    }
}
