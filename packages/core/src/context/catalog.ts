import type { LoadedProcedureSkill } from './types';

/**
 * Procedure skills catalog (LM-21). Repair and test procedures live as
 * SKILL.md files under packages/core/skills/; the catalog below is the short
 * list that rides in the prompt (name + description only — never the body).
 * The full body loads on demand, and only when its test is chosen. The
 * catalog entries must match the SKILL.md files one to one; the catalog test
 * reads the files and enforces that.
 */

export interface ProcedureSkillEntry {
    /** File stem, e.g. `fuel-pressure-test` for `fuel-pressure-test.md`. */
    name: string;
    /** One-line description, shown in the prompt catalog. */
    description: string;
    /** Ledger `test_result` testName this procedure covers. */
    testName: string;
    /** SKILL.md file under packages/core/skills/. */
    fileName: string;
}

export const PROCEDURE_SKILLS_CATALOG: ReadonlyArray<ProcedureSkillEntry> = [
    {
        name: 'fuel-pressure-test',
        description: 'Measure fuel rail pressure against spec to confirm or rule out the fuel delivery path.',
        testName: 'fuel-pressure-test',
        fileName: 'fuel-pressure-test.md',
    },
    {
        name: 'parasitic-draw-test',
        description: 'Measure key-off battery drain to confirm or rule out a parasitic draw flattening the battery.',
        testName: 'parasitic-draw-test',
        fileName: 'parasitic-draw-test.md',
    },
    {
        name: 'compression-test',
        description: 'Measure cranking compression per cylinder to confirm or rule out internal engine sealing loss.',
        testName: 'compression-test',
        fileName: 'compression-test.md',
    },
];

export function findProcedureSkill(testName: string): ProcedureSkillEntry | null {
    return PROCEDURE_SKILLS_CATALOG.find((entry) => entry.testName === testName) ?? null;
}

/**
 * Renders the short catalog for the prompt: name + description per skill.
 * The full procedure body is never rendered here; it loads only on demand.
 */
export function renderSkillsCatalog(catalog: ReadonlyArray<ProcedureSkillEntry>): string {
    const lines = catalog.map((entry) => `- ${entry.name}: ${entry.description}`);
    return [
        'PROCEDURE SKILLS (load the full procedure only when its test is chosen):',
        ...lines,
    ].join('\n');
}

/**
 * Reads one procedure body by skill name. Core stays free of Node-only
 * imports so the mobile app can import it, so the reader is injected: the
 * caller supplies the filesystem (or bundled asset) reader. Returns null
 * when no body exists for the name.
 */
export interface ProcedureSkillStore {
    readSkillBody(name: string): Promise<string | null>;
}

/** In-memory store, for tests and for callers that bundle the skill bodies. */
export function createInMemorySkillStore(bodies: Readonly<Record<string, string>>): ProcedureSkillStore {
    return {
        readSkillBody: async (name: string): Promise<string | null> => bodies[name] ?? null,
    };
}

export type ChosenSkillLoad =
    | { ok: true; skill: LoadedProcedureSkill }
    | { ok: false; reason: 'unknown-test' | 'skill-not-found' | 'empty-body'; testName: string };

/**
 * Loads the full body of exactly one procedure: the one whose test was
 * chosen. No other skill body is read. An unknown test name, a missing
 * file, or an empty body is an explicit rejection, never a silent skip.
 */
export async function loadChosenSkill(store: ProcedureSkillStore, testName: string): Promise<ChosenSkillLoad> {
    const entry = findProcedureSkill(testName);
    if (entry === null) {
        return { ok: false, reason: 'unknown-test', testName };
    }
    const body = await store.readSkillBody(entry.name);
    if (body === null) {
        return { ok: false, reason: 'skill-not-found', testName };
    }
    if (body.trim().length === 0) {
        return { ok: false, reason: 'empty-body', testName };
    }
    return { ok: true, skill: { name: entry.name, body } };
}
