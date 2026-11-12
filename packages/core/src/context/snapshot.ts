import { canonicalJson, type Case, type LedgerEntry } from '../types/case';

type CorrectionEntry = Extract<LedgerEntry, { type: 'correction' }>;

/**
 * Case-facts snapshot (LM-21). Renders every ledger fact into one compact,
 * deterministic text block. The snapshot is lossless by construction: every
 * entry appears in sequence order with its type, source, actor, time, and
 * full payload, and a correction never removes the fact it corrects — the
 * original stays visible and is marked superseded, pointing at the
 * correction entry. Nothing here is ever compressed or pruned.
 */

function quoted(value: string): string {
    return JSON.stringify(value);
}

function optionalText(label: string, value: string | undefined): string | null {
    return value === undefined ? null : `${label}: ${quoted(value)}`;
}

function optionalNumber(label: string, value: number | undefined): string | null {
    return value === undefined ? null : `${label}: ${value}`;
}

function optionalBoolean(label: string, value: boolean | undefined): string | null {
    return value === undefined ? null : `${label}: ${value}`;
}

/** Renders one entry's payload as `label: value` fragments, one per line. */
function renderPayloadLines(entry: LedgerEntry): string[] {
    switch (entry.type) {
        case 'vin_decoded':
            return [
                `vin: ${quoted(entry.payload.vin)}`,
                ...[
                    optionalNumber('year', entry.payload.year),
                    optionalText('make', entry.payload.make),
                    optionalText('model', entry.payload.model),
                    optionalText('trim', entry.payload.trim),
                ].filter((line): line is string => line !== null),
            ];
        case 'dtc_read':
            return [
                `codes: ${entry.payload.codes.map(quoted).join(', ')}`,
                ...(entry.payload.freezeFrame !== undefined
                    ? [`freezeFrame: ${canonicalJson(entry.payload.freezeFrame)}`]
                    : []),
            ];
        case 'observation':
            return [
                `text: ${quoted(entry.payload.text)}`,
                ...(entry.payload.media !== undefined
                    ? [`media: ${quoted(entry.payload.media.storageUri)} sha256:${entry.payload.media.sha256}`]
                    : []),
            ];
        case 'frame_captured':
            return [
                `media: ${quoted(entry.payload.media.storageUri)} sha256:${entry.payload.media.sha256}`,
                `resolution: ${entry.payload.resolution}`,
                ...[optionalText('capturedAt', entry.payload.capturedAt)].filter(
                    (line): line is string => line !== null,
                ),
            ];
        case 'test_result':
            return [
                `test: ${quoted(entry.payload.testName)}`,
                `result: ${entry.payload.result}`,
                ...[
                    optionalNumber('measuredValue', entry.payload.measuredValue),
                    optionalText('unit', entry.payload.unit),
                    optionalText('notes', entry.payload.notes),
                ].filter((line): line is string => line !== null),
            ];
        case 'hypothesis':
            return [`text: ${quoted(entry.payload.text)}`, `confidence: ${entry.payload.confidence}`];
        case 'safety_stop':
            return [
                `reason: ${quoted(entry.payload.reason)}`,
                ...[optionalText('hazard', entry.payload.hazard)].filter((line): line is string => line !== null),
            ];
        case 'outcome':
            return [
                `repair performed: ${quoted(entry.payload.repairPerformed)}`,
                ...(entry.payload.partsReplaced.length > 0
                    ? [`parts replaced: ${entry.payload.partsReplaced.map(quoted).join(', ')}`]
                    : []),
                ...[
                    optionalBoolean('codes cleared', entry.payload.codesCleared),
                    optionalBoolean('symptom gone', entry.payload.symptomGone),
                    optionalBoolean('re-test passed', entry.payload.retestPassed),
                    optionalBoolean('confirmed', entry.payload.confirmed),
                    optionalText('notes', entry.payload.notes),
                ].filter((line): line is string => line !== null),
            ];
        case 'correction':
            return [
                `text: ${quoted(entry.payload.text)}`,
                entry.correctsEntryId === undefined
                    ? 'corrects entry: (missing)'
                    : `corrects entry: ${quoted(entry.correctsEntryId)}`,
            ];
        case 'transcript':
            return [
                `role: ${entry.payload.role}`,
                `text: ${quoted(entry.payload.text)}`,
                `provider: ${quoted(entry.payload.provider)}`,
            ];
        case 'goal_set':
            return [
                `goal: ${quoted(entry.payload.goalId)}`,
                `outcome: ${quoted(entry.payload.goal.outcome)}`,
                `criteria: ${entry.payload.goal.criteria.map((criterion) => criterion.id).join(', ')}`,
                `status: ${entry.payload.goal.status}`,
            ];
        case 'goal_amended':
            return [
                `goal: ${quoted(entry.payload.goalId)}`,
                `version: ${entry.payload.previousVersion} -> ${entry.payload.version}`,
                `amended by tech: ${quoted(entry.payload.amendedByTechId)}`,
                `note: ${quoted(entry.payload.note)}`,
            ];
        case 'criterion_met':
            return [
                `goal: ${quoted(entry.payload.goalId)}`,
                `criterion: ${quoted(entry.payload.criterionId)}`,
                `satisfied by entry: ${quoted(entry.payload.entryId)} (#${entry.payload.entrySequence})`,
            ];
        case 'goal_status_changed':
            return [
                `goal: ${quoted(entry.payload.goalId)}`,
                `status: ${entry.payload.from} -> ${entry.payload.to}`,
                `authority: ${entry.payload.authority}`,
                ...[optionalText('reason', entry.payload.reason)].filter((line): line is string => line !== null),
            ];
        case 'obd_scan':
            return [
                `stored codes: ${entry.payload.storedCodes.map(quoted).join(', ') || '(none)'}`,
                `pending codes: ${entry.payload.pendingCodes.map(quoted).join(', ') || '(none)'}`,
                `permanent codes: ${entry.payload.permanentCodes.map(quoted).join(', ') || '(none)'}`,
                `freeze frame DTC: ${entry.payload.freezeFrame?.dtc ?? '(none)'}`,
                `readiness: MIL ${entry.payload.readiness.milOn ? 'on' : 'off'}, ${entry.payload.readiness.storedCodeCount} stored`,
                ...(entry.payload.vin !== null ? [`vin: ${quoted(entry.payload.vin)}`] : []),
            ];
        case 'obd_fault_window':
            return [
                `trigger: ${entry.payload.trigger}${entry.payload.triggerDetail ? ` (${entry.payload.triggerDetail})` : ''}`,
                `samples: ${entry.payload.samples.length}`,
            ];
        case 'guided_test':
            return [
                `test: ${quoted(entry.payload.definitionName)}`,
                `result: ${entry.payload.result}`,
                ...entry.payload.checks.map(
                    (check) =>
                        `${check.pid}: ${check.observedMin ?? '?'}..${check.observedMax ?? '?'} ${check.unit} (expected ${check.expectedMin}..${check.expectedMax}) ${check.passed ? 'pass' : 'fail'}`,
                ),
            ];
        case 'verify_fix':
            return [
                `result: ${entry.payload.passed ? 'pass' : 'fail'}`,
                `drive cycle: ${entry.payload.driveCycleCompleted ? 'completed' : 'not completed'}`,
                `monitors ready: ${entry.payload.monitorsReady ? 'yes' : `no (${entry.payload.monitorsNotReady.join(', ')})`}`,
                `returned codes: ${[...entry.payload.returnedStoredCodes, ...entry.payload.returnedPendingCodes, ...entry.payload.returnedPermanentCodes].join(', ') || '(none)'}`,
            ];
        case 'advisory':
            // LM-18: a background evidence child's summary. Rendered as a
            // fact like any other entry; the payload itself carries the
            // 'unknown' status when the lookup failed, so a failed lookup
            // shows as unknown in the report, never as 'no recalls'.
            return [
                `kind: ${entry.payload.kind}`,
                `status: ${entry.payload.status}`,
                `summary: ${quoted(entry.payload.summary)}`,
                ...(entry.payload.items.length > 0
                    ? [`items: ${entry.payload.items.map((item) => quoted(item.title)).join(', ')}`]
                    : []),
            ];
    }
}

/**
 * Renders the full case snapshot: case header, then one block per ledger
 * entry in sequence order. Entries superseded by a later correction carry a
 * `superseded by correction entry #N` line; the corrected text stays in the
 * snapshot. Rendering twice over the same entries returns identical text.
 */
export function renderCaseSnapshot(caseRecord: Case, entries: ReadonlyArray<LedgerEntry>): string {
    const ordered = [...entries].sort((a, b) => a.sequence - b.sequence);
    const correctionByEntryId = new Map<string, CorrectionEntry>();
    for (const entry of ordered) {
        if (entry.type === 'correction' && entry.correctsEntryId !== undefined) {
            correctionByEntryId.set(entry.correctsEntryId, entry);
        }
    }
    const chainHead = ordered.length === 0 ? 'none' : ordered[ordered.length - 1].entryHash;

    const lines: string[] = [
        `CASE ${caseRecord.id}`,
        `vehicle: ${quoted(caseRecord.vehicleId)}`,
        `status: ${caseRecord.status}`,
        `ledger entries: ${ordered.length} (sequences 1..${ordered.length}, chain head ${chainHead})`,
    ];
    if (ordered.length === 0) {
        lines.push('No ledger entries yet.');
        return lines.join('\n');
    }
    for (const entry of ordered) {
        lines.push('');
        lines.push(
            `[${entry.sequence}] ${entry.type} — source ${entry.source}, actor ${entry.actor.kind} ${entry.actor.id}, ${entry.occurredAt.toISOString()}`,
        );
        for (const payloadLine of renderPayloadLines(entry)) {
            lines.push(`    ${payloadLine}`);
        }
        const correction = correctionByEntryId.get(entry.id);
        if (correction !== undefined) {
            lines.push(
                `    superseded by correction entry #${correction.sequence}: ${quoted(correction.payload.text)}`,
            );
        }
    }
    return lines.join('\n');
}
