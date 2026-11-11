import { z } from 'zod';
import { DtcCodeSchema } from '../diagnosis/tests/testSchema';

// --- Vehicle knowledge graph (LM-38) ---
// The graph is the structure the logic filter and priors in LM-04 read:
// which parts can cause which symptoms, and how faults propagate. It is
// seed data, not a guess: every entry names its source, and entries drafted
// by an LLM stay `unverified` until a human expert reviews them, the same
// rule the test library (LM-34) uses. The graph never invents a DTC
// meaning, a TSB, or a failure rate.

export const ComponentKindSchema = z.enum([
    'control-module',
    'ignition',
    'fuel',
    'air',
    'exhaust',
    'cooling',
    'electrical',
    'sensor',
    'actuator',
    'transmission',
    'chassis',
    'network',
]);
export type ComponentKind = z.infer<typeof ComponentKindSchema>;

/** A part the tech can point at. Ids are lowercase slugs; names are plain words. */
export const VehicleComponentSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Component ids are lowercase slugs'),
        name: z.string().min(1),
        kind: ComponentKindSchema,
        system: z.string().min(1),
        location: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
    })
    .strict();
export type VehicleComponent = z.infer<typeof VehicleComponentSchema>;

export const ConnectionKindSchema = z.enum(['wiring', 'can', 'fluid', 'mechanical', 'vacuum']);
export type ConnectionKind = z.infer<typeof ConnectionKindSchema>;

/**
 * One link between two components. `from` drives `to`: a fault in `from`
 * can show up in `to`, which is how the graph traces fault propagation.
 * `label` names the physical link (a harness, a bus, a hose) so the tech
 * knows what to look at, not just that two parts are related.
 */
export const ComponentConnectionSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Connection ids are lowercase slugs'),
        fromComponentId: z.string().min(1),
        toComponentId: z.string().min(1),
        kind: ConnectionKindSchema,
        label: z.string().min(1),
    })
    .strict()
    .refine((connection) => connection.fromComponentId !== connection.toComponentId, {
        message: 'A connection must link two different components',
    });
export type ComponentConnection = z.infer<typeof ComponentConnectionSchema>;

/**
 * One DTC pointing at one suspect component. `rank` orders the suspects
 * for that code, cheapest to check first, not most likely first: the
 * planner (LM-04) applies its own likelihood math on top. `basis` says
 * why the component is a suspect, in one sentence.
 */
export const DtcSuspectSchema = z
    .object({
        dtcCode: DtcCodeSchema,
        componentId: z.string().min(1),
        rank: z.number().int().min(1),
        basis: z.string().min(1),
    })
    .strict();
export type DtcSuspect = z.infer<typeof DtcSuspectSchema>;

// --- FMEA failure modes ---
// Severity, occurrence and detection are the standard 1-10 FMEA scales.
// The risk priority number is derived (severity x occurrence x detection),
// never stored, so a stored number can never disagree with its inputs.

export const FailureModeSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Failure mode ids are lowercase slugs'),
        componentId: z.string().min(1),
        /** The LM-34 hypothesis id this mode is: the link to the test library. */
        hypothesisId: z.string().min(1),
        mode: z.string().min(1),
        effect: z.string().min(1),
        cause: z.string().min(1),
        severity: z.number().int().min(1).max(10),
        occurrence: z.number().int().min(1).max(10),
        detection: z.number().int().min(1).max(10),
    })
    .strict();
export type FailureMode = z.infer<typeof FailureModeSchema>;

/** Risk priority number: severity x occurrence x detection, 1-1000. */
export function failureModeRpn(failureMode: FailureMode): number {
    return failureMode.severity * failureMode.occurrence * failureMode.detection;
}

// --- TSBs and recalls ---
// A TSB or recall is only as good as its source. `vinPattern` is a VIN
// prefix the entry applies to, or `any` when it applies to the whole
// vehicle line in the file. Entries drafted by an LLM stay unverified
// until checked against the manufacturer notice or the NHTSA record.

export const TsbRecallKindSchema = z.enum(['tsb', 'recall']);
export type TsbRecallKind = z.infer<typeof TsbRecallKindSchema>;

export const TsbRecallSourceSchema = z.enum(['nhtsa', 'manufacturer', 'llm-draft']);
export type TsbRecallSource = z.infer<typeof TsbRecallSourceSchema>;

export const TsbRecallSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'TSB/recall ids are lowercase slugs'),
        kind: TsbRecallKindSchema,
        title: z.string().min(1),
        componentIds: z.array(z.string().min(1)).min(1),
        vinPattern: z.string().min(1),
        campaignNumber: z.string().min(1).optional(),
        source: TsbRecallSourceSchema,
        sourceNote: z.string().min(1),
        verified: z.boolean(),
    })
    .strict()
    .refine((entry) => entry.source !== 'llm-draft' || !entry.verified, {
        message: 'An LLM-drafted TSB/recall entry can never be marked verified',
    });
export type TsbRecall = z.infer<typeof TsbRecallSchema>;

// --- The graph file ---
// data/knowledge-graph/*.yaml holds one vehicle graph each: a version
// marker plus the vehicle it describes and its components, connections,
// DTC suspects, failure modes and TSB/recall entries. The version lets a
// future schema change reject old files instead of silently misreading
// them. Every entry names the license-manifest source id its facts came
// from (see licenses.ts); a graph file that cites an unrecorded source
// fails validation.

export const VehicleGraphFileSchema = z
    .object({
        version: z.literal(1),
        vehicle: z
            .object({
                label: z.string().min(1),
                fuel: z.enum(['gasoline', 'diesel', 'electric', 'hybrid']),
                protocol: z.enum(['obd2', 'j1939', 'both']),
                sourceId: z.string().min(1),
            })
            .strict(),
        components: z.array(VehicleComponentSchema).min(1),
        connections: z.array(ComponentConnectionSchema),
        dtcSuspects: z.array(DtcSuspectSchema),
        failureModes: z.array(FailureModeSchema),
        tsbRecalls: z.array(TsbRecallSchema),
    })
    .strict()
    .superRefine((file, ctx) => {
        const componentIds = new Set(file.components.map((component) => component.id));
        const checkComponent = (id: string, path: string): void => {
            if (!componentIds.has(id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `References unknown component: ${id}`,
                    path: [path],
                });
            }
        };
        const seenComponents = new Set<string>();
        for (const [index, component] of file.components.entries()) {
            if (seenComponents.has(component.id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate component id: ${component.id}`,
                    path: ['components', index, 'id'],
                });
            }
            seenComponents.add(component.id);
        }
        const seenConnections = new Set<string>();
        for (const [index, connection] of file.connections.entries()) {
            if (seenConnections.has(connection.id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate connection id: ${connection.id}`,
                    path: ['connections', index, 'id'],
                });
            }
            seenConnections.add(connection.id);
            checkComponent(connection.fromComponentId, `connections.${index}.fromComponentId`);
            checkComponent(connection.toComponentId, `connections.${index}.toComponentId`);
        }
        const ranksByDtc = new Map<string, Set<number>>();
        for (const [index, suspect] of file.dtcSuspects.entries()) {
            checkComponent(suspect.componentId, `dtcSuspects.${index}.componentId`);
            const ranks = ranksByDtc.get(suspect.dtcCode) ?? new Set<number>();
            if (ranks.has(suspect.rank)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate rank ${suspect.rank} for DTC ${suspect.dtcCode}`,
                    path: ['dtcSuspects', index, 'rank'],
                });
            }
            ranks.add(suspect.rank);
            ranksByDtc.set(suspect.dtcCode, ranks);
        }
        const seenModes = new Set<string>();
        for (const [index, mode] of file.failureModes.entries()) {
            if (seenModes.has(mode.id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate failure mode id: ${mode.id}`,
                    path: ['failureModes', index, 'id'],
                });
            }
            seenModes.add(mode.id);
            checkComponent(mode.componentId, `failureModes.${index}.componentId`);
        }
        const seenEntries = new Set<string>();
        for (const [index, entry] of file.tsbRecalls.entries()) {
            if (seenEntries.has(entry.id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate TSB/recall id: ${entry.id}`,
                    path: ['tsbRecalls', index, 'id'],
                });
            }
            seenEntries.add(entry.id);
            for (const componentId of entry.componentIds) {
                checkComponent(componentId, `tsbRecalls.${index}.componentIds`);
            }
        }
    });
export type VehicleGraphFile = z.infer<typeof VehicleGraphFileSchema>;
