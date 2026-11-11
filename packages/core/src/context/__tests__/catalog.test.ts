import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    PROCEDURE_SKILLS_CATALOG,
    createInMemorySkillStore,
    findProcedureSkill,
    loadChosenSkill,
    renderSkillsCatalog,
    type ProcedureSkillStore,
} from '../catalog';

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../skills');

function recordingStore(bodies: Readonly<Record<string, string>>): { store: ProcedureSkillStore; reads: string[] } {
    const reads: string[] = [];
    const inner = createInMemorySkillStore(bodies);
    return {
        store: {
            readSkillBody: async (name: string): Promise<string | null> => {
                reads.push(name);
                return inner.readSkillBody(name);
            },
        },
        reads,
    };
}

describe('renderSkillsCatalog', () => {
    it('lists name and description only, never a procedure body', () => {
        const catalog = renderSkillsCatalog(PROCEDURE_SKILLS_CATALOG);
        for (const entry of PROCEDURE_SKILLS_CATALOG) {
            expect(catalog).toContain(entry.name);
            expect(catalog).toContain(entry.description);
        }
        // Body-only phrases from the SKILL.md files must not leak into the prompt.
        expect(catalog).not.toContain('Schrader valve');
        expect(catalog).not.toContain('multimeter in series');
        expect(catalog).not.toContain('wet test');
    });
});

describe('loadChosenSkill', () => {
    it('reads only the chosen test’s skill body', async () => {
        const { store, reads } = recordingStore({
            'fuel-pressure-test': 'fuel body',
            'parasitic-draw-test': 'draw body',
            'compression-test': 'compression body',
        });
        const loaded = await loadChosenSkill(store, 'parasitic-draw-test');
        expect(loaded).toEqual({ ok: true, skill: { name: 'parasitic-draw-test', body: 'draw body' } });
        expect(reads).toEqual(['parasitic-draw-test']);
    });

    it('rejects an unknown test name without reading any skill', async () => {
        const { store, reads } = recordingStore({ 'fuel-pressure-test': 'fuel body' });
        const loaded = await loadChosenSkill(store, 'smoke-test');
        expect(loaded).toEqual({ ok: false, reason: 'unknown-test', testName: 'smoke-test' });
        expect(reads).toEqual([]);
    });

    it('rejects a missing skill body explicitly', async () => {
        const { store } = recordingStore({});
        const loaded = await loadChosenSkill(store, 'fuel-pressure-test');
        expect(loaded).toEqual({ ok: false, reason: 'skill-not-found', testName: 'fuel-pressure-test' });
    });

    it('rejects an empty skill body explicitly', async () => {
        const { store } = recordingStore({ 'fuel-pressure-test': '   \n' });
        const loaded = await loadChosenSkill(store, 'fuel-pressure-test');
        expect(loaded).toEqual({ ok: false, reason: 'empty-body', testName: 'fuel-pressure-test' });
    });
});

describe('findProcedureSkill', () => {
    it('finds a catalog entry by test name and returns null for an unknown one', () => {
        expect(findProcedureSkill('compression-test')?.name).toBe('compression-test');
        expect(findProcedureSkill('smoke-test')).toBeNull();
    });
});

describe('procedure skills on disk', () => {
    function parseSkillFile(fileName: string): { name: string; description: string; testName: string } {
        const body = readFileSync(join(SKILLS_DIR, fileName), 'utf8');
        const name = body.match(/^# (.+)$/m)?.[1]?.trim() ?? '';
        const description = body.match(/^Description: (.+)$/m)?.[1]?.trim() ?? '';
        const testName = body.match(/^Test: (.+)$/m)?.[1]?.trim() ?? '';
        return { name, description, testName };
    }

    it('catalog matches the SKILL.md files one to one', () => {
        const files = readdirSync(SKILLS_DIR).filter((file) => file.endsWith('.md')).sort();
        const catalogNames = PROCEDURE_SKILLS_CATALOG.map((entry) => entry.fileName).sort();
        expect(files).toEqual(catalogNames);
        for (const entry of PROCEDURE_SKILLS_CATALOG) {
            const parsed = parseSkillFile(entry.fileName);
            expect(parsed.name).toBe(entry.name);
            expect(parsed.description).toBe(entry.description);
            expect(parsed.testName).toBe(entry.testName);
        }
    });

    it('every skill file carries steps, pass criteria, and a safety section', () => {
        for (const entry of PROCEDURE_SKILLS_CATALOG) {
            const body = readFileSync(join(SKILLS_DIR, entry.fileName), 'utf8');
            expect(body).toContain('## Steps');
            expect(body).toContain('## Pass criteria');
            expect(body).toContain('## Safety');
        }
    });
});
