import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseTestLibraryYaml } from '../../diagnosis/tests/yamlLoader';
import { TestLibrary } from '../../diagnosis/tests/testLibrary';
import { VehicleKnowledgeGraph } from '../graph';
import { VehicleGraphFileSchema, failureModeRpn, type VehicleGraphFile } from '../graphSchema';
import { parseKnowledgeGraphYaml } from '../yamlLoader';

// The first-case seed graph is the graph's source of truth: it must load,
// answer DTC -> candidate components -> tests against the real test
// library, and cite a recorded source.
const seedDir = fileURLToPath(new URL('../../../../../data/knowledge-graph', import.meta.url));
const testSeedDir = fileURLToPath(new URL('../../../../../data/tests', import.meta.url));

function loadSeedGraph(): VehicleKnowledgeGraph {
    const files = readdirSync(seedDir).filter((file) => file.endsWith('.yaml'));
    expect(files).toEqual(['first-case.yaml']);
    const file = parseKnowledgeGraphYaml(readFileSync(join(seedDir, files[0] ?? ''), 'utf8'));
    return VehicleKnowledgeGraph.fromFile(file);
}

function loadSeedLibrary(): TestLibrary {
    const definitions = readdirSync(testSeedDir)
        .filter((file) => file.endsWith('.yaml'))
        .flatMap((file) => parseTestLibraryYaml(readFileSync(join(testSeedDir, file), 'utf8')));
    return TestLibrary.fromDefinitions(definitions);
}

function validGraphFile(): VehicleGraphFile {
    return {
        version: 1,
        vehicle: { label: 'Test vehicle', fuel: 'gasoline', protocol: 'obd2', sourceId: 'lemonade-seed' },
        components: [
            { id: 'ecm', name: 'Engine control module', kind: 'control-module', system: 'powertrain' },
            { id: 'coil', name: 'Ignition coil', kind: 'ignition', system: 'powertrain' },
        ],
        connections: [
            { id: 'ecm-to-coil', fromComponentId: 'ecm', toComponentId: 'coil', kind: 'wiring', label: 'harness' },
        ],
        dtcSuspects: [{ dtcCode: 'P0300', componentId: 'coil', rank: 1, basis: 'A weak coil misfires.' }],
        failureModes: [
            {
                id: 'coil-open',
                componentId: 'coil',
                hypothesisId: 'ignition-coil-failure',
                mode: 'Coil open circuit',
                effect: 'Misfire',
                cause: 'Heat',
                severity: 7,
                occurrence: 5,
                detection: 4,
            },
        ],
        tsbRecalls: [],
    };
}

describe('first-case seed graph', () => {
    it('loads and describes the first-case vehicle', () => {
        const graph = loadSeedGraph();
        expect(graph.vehicleLabel()).toBe('First-case vehicle (gasoline, OBD-II)');
        expect(graph.allComponents().length).toBeGreaterThan(0);
        expect(graph.sourceProblem()).toBeNull();
    });

    it('answers DTC -> candidate components -> tests', () => {
        const graph = loadSeedGraph();
        const library = loadSeedLibrary();
        for (const dtc of ['P0300', 'P0301', 'P0171', 'P0420', 'P0442', 'P0128']) {
            const answer = graph.answerForDtc(dtc, library);
            expect(answer.candidates.length).toBeGreaterThan(0);
            for (const candidate of answer.candidates) {
                expect(candidate.component.id).toBe(candidate.suspect.componentId);
            }
            expect(answer.tests.length).toBeGreaterThan(0);
        }
        // The misfire suspects carry their FMEA modes; the MAF sensor is a
        // suspect for P0171 with no failure mode yet, because the test
        // library has no MAF test to link one to, and the cylinder 1
        // injector is a misfire suspect with no failure mode yet, because
        // the library has no injector hypothesis to link one to — no mode
        // is invented.
        const misfire = graph.answerForDtc('P0300', library);
        expect(misfire.candidates[0]?.failureModes.length).toBeGreaterThan(0);
    });

    it('maps P0301 to cylinder 1 components, not cylinder 3', () => {
        // P0301 is cylinder 1 misfire detected (P0303 is cylinder 3); the
        // seed once named cylinder 3 parts here, so assert the cylinder.
        const graph = loadSeedGraph();
        const library = loadSeedLibrary();
        const answer = graph.answerForDtc('P0301', library);
        expect(answer.candidates.map((candidate) => candidate.component.id)).toEqual([
            'ignition-coil-cyl-1',
            'spark-plug-cyl-1',
            'fuel-injector-cyl-1',
        ]);
        for (const candidate of answer.candidates) {
            expect(candidate.component.id).not.toContain('cyl-3');
            expect(candidate.component.name).toContain('cylinder 1');
        }
        expect(graph.untestedHypothesisIds(library)).toEqual([]);
    });

    it('links every failure mode to a hypothesis the library has a test for', () => {
        const graph = loadSeedGraph();
        expect(graph.untestedHypothesisIds(loadSeedLibrary())).toEqual([]);
    });

    it('traces fault propagation downstream from the ECM', () => {
        const graph = loadSeedGraph();
        const downstream = graph.downstreamComponents('ecm').map((component) => component.id);
        expect(downstream).toContain('ignition-coil-cyl-1');
        expect(downstream).toContain('spark-plug-cyl-1');
        expect(downstream).not.toContain('ecm');
    });

    it('finds TSBs and recalls by component and by VIN', () => {
        const graph = loadSeedGraph();
        expect(graph.tsbRecallsForComponent('ignition-coil-cyl-1')).toHaveLength(1);
        expect(graph.tsbRecallsForComponent('thermostat')).toHaveLength(0);
        expect(graph.tsbRecallsForVin('1HGCM82633A004352')).toHaveLength(2);
        expect(graph.tsbRecallsForVin('')).toHaveLength(0);
    });
});

describe('VehicleKnowledgeGraph queries', () => {
    it('orders suspects by rank and failure modes by risk priority', () => {
        const graph = VehicleKnowledgeGraph.fromFile(validGraphFile());
        expect(graph.suspectsForDtc('p0300').map((suspect) => suspect.componentId)).toEqual(['coil']);
        expect(graph.failureModesForComponent('coil').map((mode) => mode.id)).toEqual(['coil-open']);
        expect(failureModeRpn({ ...validGraphFile().failureModes[0]! })).toBe(140);
    });

    it('returns no candidates for an unknown DTC', () => {
        const graph = VehicleKnowledgeGraph.fromFile(validGraphFile());
        expect(graph.answerForDtc('P9999').candidates).toEqual([]);
        expect(graph.answerForDtc('P9999').tests).toEqual([]);
    });

    it('reports a source id missing from the license manifest', () => {
        const file = validGraphFile();
        file.vehicle.sourceId = 'no-such-source';
        expect(VehicleKnowledgeGraph.fromFile(file).sourceProblem()).toMatch(/not recorded in the license manifest/);
    });
});

describe('VehicleGraphFileSchema', () => {
    it('rejects a reference to an unknown component', () => {
        const file = validGraphFile();
        file.dtcSuspects = [{ dtcCode: 'P0300', componentId: 'no-such-part', rank: 1, basis: 'Guess.' }];
        expect(() => VehicleGraphFileSchema.parse(file)).toThrow(/unknown component/i);
    });

    it('reports an unknown connection component with segmented paths', () => {
        const file = validGraphFile();
        file.connections = [
            { id: 'ecm-to-ghost', fromComponentId: 'ecm', toComponentId: 'ghost', kind: 'wiring', label: 'harness' },
        ];
        try {
            VehicleGraphFileSchema.parse(file);
            expect.unreachable('parse should have thrown for an unknown component');
        } catch (error) {
            expect(error).toBeInstanceOf(z.ZodError);
            expect((error as z.ZodError).issues[0]?.path).toEqual(['connections', 0, 'toComponentId']);
        }
    });

    it('rejects a duplicate rank for one DTC', () => {
        const file = validGraphFile();
        file.dtcSuspects = [
            { dtcCode: 'P0300', componentId: 'coil', rank: 1, basis: 'First.' },
            { dtcCode: 'P0300', componentId: 'ecm', rank: 1, basis: 'Second.' },
        ];
        expect(() => VehicleGraphFileSchema.parse(file)).toThrow(/Duplicate rank 1 for DTC P0300/);
    });

    it('rejects an LLM-drafted TSB marked verified', () => {
        const file = validGraphFile();
        file.tsbRecalls = [
            {
                id: 'tsb-draft',
                kind: 'tsb',
                title: 'Draft TSB',
                componentIds: ['coil'],
                vinPattern: 'any',
                source: 'llm-draft',
                sourceNote: 'Draft.',
                verified: true,
            },
        ];
        expect(() => VehicleGraphFileSchema.parse(file)).toThrow(/can never be marked verified/);
    });

    it('rejects a connection from a component to itself', () => {
        const file = validGraphFile();
        file.connections = [
            { id: 'coil-to-coil', fromComponentId: 'coil', toComponentId: 'coil', kind: 'wiring', label: 'loop' },
        ];
        expect(() => VehicleGraphFileSchema.parse(file)).toThrow(/two different components/);
    });
});

describe('parseKnowledgeGraphYaml', () => {
    it('rejects YAML that does not parse', () => {
        expect(() => parseKnowledgeGraphYaml('version: [unclosed')).toThrow(/does not parse/);
    });

    it('rejects YAML that fails validation, naming the problem', () => {
        expect(() => parseKnowledgeGraphYaml('version: 2\nvehicle: {}\ncomponents: []\n')).toThrow(/failed validation/);
    });
});
