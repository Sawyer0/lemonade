import { z } from 'zod';

// --- Background evidence sub-agents (LM-18) ---
// As soon as the VIN is decoded, child jobs run in parallel — NHTSA recalls
// by component, TSBs and known failures, similar closed cases — and each
// returns only a schema-validated summary. A child runs in its own context
// (it receives only the request below, never the reasoner's context) and its
// output carries no authority: it can never instruct the tech or change the
// plan directly. It lands in the ledger as an `advisory` entry, and the
// reasoner may read it like any other ledger fact — never as an instruction.
//
// Caps: at most EVIDENCE_MAX_CONCURRENT children run at once, and a child
// never spawns children of its own (depth EVIDENCE_MAX_DEPTH = 1). The cap
// and the depth are structural: sources receive no runner handle, and the
// fan-out below never launches more than the cap concurrently.
//
// A failed lookup is recorded as 'unknown', never as 'no results': a child
// that throws (or returns a summary that fails validation) becomes an
// 'unknown' summary whose text says so, e.g. "Recall status unknown".

/** Max evidence children running at once. */
export const EVIDENCE_MAX_CONCURRENT = 4;
/** Children never spawn children. Enforced structurally: a source gets no runner. */
export const EVIDENCE_MAX_DEPTH = 1;
/** Max items one child summary may carry; the reasoner's context stays small. */
export const EVIDENCE_MAX_ITEMS = 5;

export const EvidenceChildKindSchema = z.enum(['recall', 'tsb', 'known_failure', 'similar_case']);
export type EvidenceChildKind = z.infer<typeof EvidenceChildKindSchema>;

/** Canonical launch order: recalls first, then TSBs, known failures, similar cases. */
export const EVIDENCE_CHILD_KINDS: ReadonlyArray<EvidenceChildKind> = [
    'recall',
    'tsb',
    'known_failure',
    'similar_case',
];

/**
 * What a lookup found. `found` means the source answered with items;
 * `none` means the source answered and there was nothing to report;
 * `unknown` means the lookup failed — the source never answered, so
 * "no recalls" (or "no TSBs") would be a lie. Unknown is the only status a
 * failure may produce.
 */
export const EvidenceChildStatusSchema = z.enum(['found', 'none', 'unknown']);
export type EvidenceChildStatus = z.infer<typeof EvidenceChildStatusSchema>;

export const EvidenceChildItemSchema = z.object({
    /** One line: the recall component, the TSB title, the failure, the repair. */
    title: z.string().min(1),
    /** Supporting detail: campaign number, snippet, outcome. */
    detail: z.string().optional(),
});
export type EvidenceChildItem = z.infer<typeof EvidenceChildItemSchema>;

/**
 * The only thing a child returns: a validated summary. No raw payloads, no
 * model text, no instructions — the ledger stores this object verbatim as an
 * `advisory` entry payload.
 */
export const EvidenceChildSummarySchema = z.object({
    kind: EvidenceChildKindSchema,
    status: EvidenceChildStatusSchema,
    /** One or two sentences, self-contained: the report prints this line. */
    summary: z.string().min(1),
    items: z.array(EvidenceChildItemSchema).max(EVIDENCE_MAX_ITEMS),
    /** Where the summary came from, e.g. 'NHTSA', 'Tavily web search', 'case ledger'. */
    source: z.string().min(1),
});
export type EvidenceChildSummary = z.infer<typeof EvidenceChildSummarySchema>;

/**
 * What a child is launched with. Everything is optional except the case:
 * read-only lookups may start early from partial speech (startedFrom
 * 'partial_speech'), when only some of the vehicle is known yet. A source
 * whose inputs are missing does not run — it is skipped, never recorded as
 * 'unknown' — so an early launch reports only what it could actually look up.
 */
export const EvidenceChildRequestSchema = z.object({
    caseId: z.string().uuid(),
    /** The case's vehicle, for the similar-closed-cases lookup. */
    vehicleId: z.string().min(1).optional(),
    vin: z.string().length(17).optional(),
    year: z.number().int().optional(),
    make: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    trim: z.string().min(1).optional(),
    /** NHTSA component path, e.g. 'ENGINE AND ENGINE COOLING:...'. Filters recalls by component. */
    component: z.string().min(1).optional(),
    /** What the tech described, for the known-failure and similar-case lookups. */
    symptom: z.string().min(1).optional(),
    startedFrom: z.enum(['vin_decoded', 'partial_speech']),
});
export type EvidenceChildRequest = z.infer<typeof EvidenceChildRequestSchema>;
/** What callers pass in: everything but caseId and startedFrom is optional until defaults apply. */
export type EvidenceChildRequestInput = z.input<typeof EvidenceChildRequestSchema>;

/**
 * One evidence child. `canRun` says whether the request carries what this
 * lookup needs; `lookup` does the read-only lookup and returns the validated
 * summary. A source never launches children: it receives no runner, only
 * this request, so depth 1 holds by construction.
 */
export interface EvidenceChildSource {
    readonly kind: EvidenceChildKind;
    canRun(request: EvidenceChildRequest): boolean;
    lookup(request: EvidenceChildRequest): Promise<EvidenceChildSummary>;
}

/** Human label for a child kind, for the report line. */
export function evidenceChildKindLabel(kind: EvidenceChildKind): string {
    switch (kind) {
        case 'recall':
            return 'Recalls';
        case 'tsb':
            return 'TSBs';
        case 'known_failure':
            return 'Known failures';
        case 'similar_case':
            return 'Similar closed cases';
    }
}

/** The 'unknown' summary for a child that failed: never 'none', never silent. */
export function unknownChildSummary(kind: EvidenceChildKind, reason: string): EvidenceChildSummary {
    const label = evidenceChildKindLabel(kind);
    const statusWord =
        kind === 'recall' ? 'Recall status unknown' : kind === 'tsb' ? 'TSB status unknown' : `${label} status unknown`;
    return {
        kind,
        status: 'unknown',
        summary: `${statusWord}: ${reason}`,
        items: [],
        source: 'lookup failed',
    };
}

/** One report line per summary, e.g. "Recalls: recall status unknown — NHTSA lookup failed". */
export function evidenceReportLine(summary: EvidenceChildSummary): string {
    return `${evidenceChildKindLabel(summary.kind)}: ${summary.summary}`;
}

/**
 * Runs the runnable children in parallel, at most EVIDENCE_MAX_CONCURRENT
 * at once, and returns one validated summary per launched child in
 * canonical kind order. A child that throws — or returns a summary that
 * fails validation — becomes an 'unknown' summary for its kind; a failure
 * in one child never fails the run or the other children. Sources whose
 * inputs are missing are skipped, not recorded.
 */
export async function runEvidenceChildren(
    sources: ReadonlyArray<EvidenceChildSource>,
    requestInput: EvidenceChildRequestInput,
): Promise<EvidenceChildSummary[]> {
    const request = EvidenceChildRequestSchema.parse(requestInput);
    const runnable = dedupeByKind(sources).filter((source) => source.canRun(request));
    const results: EvidenceChildSummary[] = [];
    const queue = [...runnable];
    const workers = Array.from(
        { length: Math.min(EVIDENCE_MAX_CONCURRENT, queue.length) },
        async () => {
            while (queue.length > 0) {
                const source = queue.shift()!;
                results.push(await runOneChild(source, request));
            }
        },
    );
    await Promise.all(workers);
    return EVIDENCE_CHILD_KINDS.map((kind) => results.find((result) => result.kind === kind)).filter(
        (result): result is EvidenceChildSummary => result !== undefined,
    );
}

/** First source per kind wins; a duplicated kind never runs twice. */
function dedupeByKind(sources: ReadonlyArray<EvidenceChildSource>): EvidenceChildSource[] {
    const seen = new Set<EvidenceChildKind>();
    return sources.filter((source) => {
        if (seen.has(source.kind)) {
            return false;
        }
        seen.add(source.kind);
        return true;
    });
}

/** One child, fail-soft: any throw or invalid summary becomes 'unknown'. */
async function runOneChild(
    source: EvidenceChildSource,
    request: EvidenceChildRequest,
): Promise<EvidenceChildSummary> {
    try {
        const summary = await source.lookup(request);
        const parsed = EvidenceChildSummarySchema.safeParse(summary);
        if (!parsed.success) {
            return unknownChildSummary(source.kind, 'child returned an invalid summary');
        }
        if (parsed.data.kind !== source.kind) {
            return unknownChildSummary(source.kind, 'child returned a summary for a different kind');
        }
        return parsed.data;
    } catch {
        return unknownChildSummary(source.kind, 'lookup failed');
    }
}
