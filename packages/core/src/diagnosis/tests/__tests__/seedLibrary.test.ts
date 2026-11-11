import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseTestLibraryYaml } from '../yamlLoader';
import { TestLibrary } from '../testLibrary';
import { renderTestSpoken } from '../stepSpeech';
import type { TestDefinition } from '../testSchema';

// The seed files are the library's source of truth: every file under
// data/tests must parse, validate, and load, and every seeded step must
// render to speakable words.
const seedDir = fileURLToPath(new URL('../../../../../../data/tests', import.meta.url));

function loadSeedLibrary(): { library: TestLibrary; definitions: TestDefinition[]; files: string[] } {
    const files = readdirSync(seedDir)
        .filter((file) => file.endsWith('.yaml'))
        .sort();
    const definitions = files.flatMap((file) => parseTestLibraryYaml(readFileSync(join(seedDir, file), 'utf8')));
    return { library: TestLibrary.fromDefinitions(definitions), definitions, files };
}

describe('seed library', () => {
    it('loads every seed file with no duplicate test ids', () => {
        const { library, files } = loadSeedLibrary();
        expect(files).toEqual([
            'catalyst.yaml',
            'cooling.yaml',
            'evap.yaml',
            'first-case.yaml',
            'lean-fuel.yaml',
            'misfire.yaml',
        ]);
        expect(library.all()).toHaveLength(12);
    });

    it('marks every seed entry as an unverified LLM draft', () => {
        const { definitions } = loadSeedLibrary();
        for (const definition of definitions) {
            expect(definition.verification).toEqual({ status: 'unverified', source: 'llm-draft' });
        }
    });

    it('covers every cost tier', () => {
        const { library } = loadSeedLibrary();
        for (const tier of ['ask', 'look', 'measure', 'swap', 'tear-down'] as const) {
            expect(library.byCostTier(tier).length).toBeGreaterThan(0);
        }
    });

    it('covers the top DTC families', () => {
        const { library } = loadSeedLibrary();
        for (const dtc of ['P0300', 'P0171', 'P0420', 'P0442', 'P0128']) {
            expect(library.forDtc(dtc).length).toBeGreaterThan(0);
        }
    });

    it('renders every seeded step to speakable words', () => {
        const { definitions } = loadSeedLibrary();
        for (const definition of definitions) {
            const lines = renderTestSpoken(definition);
            expect(lines).toHaveLength(definition.steps.length + 1);
            for (const [index, line] of lines.slice(1).entries()) {
                expect(line).toContain(`Step ${index + 1} of ${definition.steps.length}.`);
                expect(line).toContain('If yes,');
                expect(line).toContain('If no,');
            }
        }
    });

    it('keeps the hazardous EVAP smoke test gated until its safety preconditions are met', () => {
        const { library } = loadSeedLibrary();
        const smokeTest = library.byId('smoke-test-evap');
        expect(smokeTest).toBeDefined();
        if (!smokeTest) {
            return;
        }
        const unsatisfied = {
            disassemblyState: 'component-exposed',
            satisfiedPreconditionIds: new Set<string>(),
        } as const;
        expect(library.safetyBlockers(smokeTest, unsatisfied.satisfiedPreconditionIds)).toHaveLength(2);
        expect(library.isEligible(smokeTest, unsatisfied)).toBe(false);
        expect(
            library.isEligible(smokeTest, {
                disassemblyState: 'component-exposed',
                satisfiedPreconditionIds: new Set(['no-ignition-sources', 'engine-off']),
            }),
        ).toBe(true);
    });

    it('rejects malformed YAML instead of loading a partial library', () => {
        expect(() => parseTestLibraryYaml('version: [unclosed')).toThrow(/does not parse/);
    });

    it('rejects a seed-shaped file that fails validation', () => {
        expect(() => parseTestLibraryYaml('version: 1\ntests:\n  - id: broken\n')).toThrow(/failed validation/);
    });
});
