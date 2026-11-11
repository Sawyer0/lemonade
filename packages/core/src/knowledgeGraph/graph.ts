import { TestLibrary } from '../diagnosis/tests/testLibrary';
import type { TestDefinition } from '../diagnosis/tests/testSchema';
import { sourceLicenseById } from './licenses';
import {
    VehicleGraphFileSchema,
    type ComponentConnection,
    type DtcSuspect,
    type FailureMode,
    type TsbRecall,
    type VehicleComponent,
    type VehicleGraphFile,
} from './graphSchema';

// --- Vehicle knowledge graph (LM-38) ---
// The planner-facing read side of the graph. A graph is built from a
// validated seed file (data/knowledge-graph/*.yaml, parsed by yamlLoader);
// it never invents a component, a suspect, or a test. The core query is
// DTC -> candidate components -> tests, which the logic filter and priors
// in LM-04 read.

export interface DtcCandidate {
    /** The suspect link, with its rank and basis. */
    suspect: DtcSuspect;
    component: VehicleComponent;
    /** FMEA failure modes of this component, highest risk priority first. */
    failureModes: FailureMode[];
}

export interface DtcAnswer {
    dtcCode: string;
    candidates: DtcCandidate[];
    /** Tests from the LM-34 library that speak to this DTC, cheapest first. */
    tests: TestDefinition[];
}

export class VehicleKnowledgeGraph {
    private readonly file: VehicleGraphFile;
    private readonly componentsById: Map<string, VehicleComponent>;
    private readonly connectionsByComponent: Map<string, ComponentConnection[]>;

    private constructor(file: VehicleGraphFile) {
        this.file = file;
        this.componentsById = new Map(file.components.map((component) => [component.id, component]));
        this.connectionsByComponent = new Map<string, ComponentConnection[]>();
        for (const connection of file.connections) {
            for (const componentId of [connection.fromComponentId, connection.toComponentId]) {
                const listed = this.connectionsByComponent.get(componentId) ?? [];
                listed.push(connection);
                this.connectionsByComponent.set(componentId, listed);
            }
        }
    }

    /** Builds a graph from an already-validated file; cross-references were checked by the schema. */
    static fromFile(file: VehicleGraphFile): VehicleKnowledgeGraph {
        return new VehicleKnowledgeGraph(VehicleGraphFileSchema.parse(file));
    }

    vehicleLabel(): string {
        return this.file.vehicle.label;
    }

    allComponents(): VehicleComponent[] {
        return [...this.file.components];
    }

    componentById(id: string): VehicleComponent | undefined {
        return this.componentsById.get(id);
    }

    allConnections(): ComponentConnection[] {
        return [...this.file.connections];
    }

    connectionsForComponent(componentId: string): ComponentConnection[] {
        return [...(this.connectionsByComponent.get(componentId) ?? [])];
    }

    /**
     * Fault propagation: every component reachable from `componentId` by
     * following connections downstream (from -> to), in breadth-first
     * order, excluding the starting component. A fault in the starting
     * component can show up in any of these, which is how the graph traces
     * where a symptom can travel.
     */
    downstreamComponents(componentId: string): VehicleComponent[] {
        const reached = new Set<string>([componentId]);
        const queue: string[] = [componentId];
        const downstream: VehicleComponent[] = [];
        while (queue.length > 0) {
            const current = queue.shift();
            if (current === undefined) {
                break;
            }
            for (const connection of this.file.connections) {
                if (connection.fromComponentId !== current) {
                    continue;
                }
                if (reached.has(connection.toComponentId)) {
                    continue;
                }
                reached.add(connection.toComponentId);
                queue.push(connection.toComponentId);
                const component = this.componentsById.get(connection.toComponentId);
                if (component !== undefined) {
                    downstream.push(component);
                }
            }
        }
        return downstream;
    }

    /** Suspects for one DTC, rank order (cheapest to check first). */
    suspectsForDtc(dtcCode: string): DtcSuspect[] {
        const code = dtcCode.toUpperCase();
        return this.file.dtcSuspects.filter((suspect) => suspect.dtcCode === code).sort((a, b) => a.rank - b.rank);
    }

    /** FMEA failure modes of one component, highest risk priority first. */
    failureModesForComponent(componentId: string): FailureMode[] {
        return this.file.failureModes
            .filter((mode) => mode.componentId === componentId)
            .sort(
                (a, b) =>
                    b.severity * b.occurrence * b.detection - a.severity * a.occurrence * a.detection ||
                    a.id.localeCompare(b.id),
            );
    }

    failureModesForHypothesis(hypothesisId: string): FailureMode[] {
        return this.file.failureModes.filter((mode) => mode.hypothesisId === hypothesisId);
    }

    /** TSBs and recalls for one component, verified entries first. */
    tsbRecallsForComponent(componentId: string): TsbRecall[] {
        return this.file.tsbRecalls
            .filter((entry) => entry.componentIds.includes(componentId))
            .sort((a, b) => Number(b.verified) - Number(a.verified) || a.id.localeCompare(b.id));
    }

    /**
     * TSBs and recalls whose VIN pattern matches this VIN. A pattern is a
     * VIN prefix (the first characters of the VIN), or `any` for the whole
     * vehicle line. A pattern that is not a prefix of the VIN does not
     * match; nothing is matched by guessing. An empty VIN matches nothing,
     * not even the `any` entries.
     */
    tsbRecallsForVin(vin: string): TsbRecall[] {
        const normalizedVin = vin.trim().toUpperCase();
        if (normalizedVin === '') {
            return [];
        }
        return this.file.tsbRecalls.filter(
            (entry) => entry.vinPattern === 'any' || normalizedVin.startsWith(entry.vinPattern.toUpperCase()),
        );
    }

    /**
     * The graph's core query: one DTC to its candidate components, each
     * with its failure modes, plus the LM-34 tests that speak to the DTC.
     * A library is optional; without one the answer carries no tests.
     */
    answerForDtc(dtcCode: string, library?: TestLibrary): DtcAnswer {
        const code = dtcCode.toUpperCase();
        const candidates: DtcCandidate[] = [];
        for (const suspect of this.suspectsForDtc(code)) {
            const component = this.componentsById.get(suspect.componentId);
            if (component === undefined) {
                throw new Error(`Graph references unknown component for DTC ${code}: ${suspect.componentId}`);
            }
            candidates.push({
                suspect,
                component,
                failureModes: this.failureModesForComponent(suspect.componentId),
            });
        }
        return {
            dtcCode: code,
            candidates,
            tests: library === undefined ? [] : library.forDtc(code),
        };
    }

    /**
     * Cross-checks the graph against a test library: every failure mode's
     * hypothesis id must be one the library has a test for, or the graph
     * points the planner at a hypothesis with nothing to run. Returns the
     * hypothesis ids with no test; an empty list means every link lands.
     */
    untestedHypothesisIds(library: TestLibrary): string[] {
        const missing: string[] = [];
        for (const mode of this.file.failureModes) {
            if (library.forHypothesis(mode.hypothesisId).length === 0 && !missing.includes(mode.hypothesisId)) {
                missing.push(mode.hypothesisId);
            }
        }
        return missing.sort();
    }

    /**
     * Checks the graph file's source citation: the vehicle's source id must
     * be recorded in the license manifest. Returns the problem, or null
     * when the source is recorded.
     */
    sourceProblem(): string | null {
        if (sourceLicenseById(this.file.vehicle.sourceId) === undefined) {
            return `Graph source id is not recorded in the license manifest: ${this.file.vehicle.sourceId}`;
        }
        return null;
    }
}
