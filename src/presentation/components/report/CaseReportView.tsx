import type { ReactNode } from 'react';
import type { CaseReport, ReportCitation } from '@lemonade/core';

/** The ledger entry a line came from, shown as its place in the chain. */
function Citation({ citation }: { citation: ReportCitation }) {
    return (
        <span
            className="ml-2 font-mono text-xs text-zinc-500"
            title={`Ledger entry ${citation.entryId}`}
        >
            #{citation.sequence}
        </span>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="border-t border-zinc-200 pt-3 [break-inside:avoid]">
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">{title}</h2>
            <div className="mt-2 space-y-1 text-sm">{children}</div>
        </section>
    );
}

function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString();
}

/**
 * LM-06: the one-page report, rendered from the ledger-built report JSON.
 * Presentational only: every line shows the citation of the ledger entry
 * it came from, so a shop owner can trace any statement back to its proof.
 * White on print, so the browser's "Save as PDF" prints the report alone.
 */
export function CaseReportView({ report }: { report: CaseReport }) {
    const vehicleLabel = report.vehicle
        ? [report.vehicle.year, report.vehicle.make, report.vehicle.model, report.vehicle.trim]
              .filter((part) => part !== undefined)
              .join(' ')
        : null;
    return (
        <article className="mx-auto max-w-2xl bg-white px-4 py-4 text-zinc-900 print:max-w-none">
            <header>
                <p className="text-sm text-zinc-500">
                    Case {report.caseId} · {report.caseStatus} · {report.entryCount} ledger entries
                </p>
                <p className="text-sm text-zinc-500">
                    Generated {formatWhen(report.generatedAt)}
                </p>
            </header>
            <div className="mt-4 space-y-4">
                {report.vehicle && (
                    <Section title="Vehicle">
                        <p>
                            {vehicleLabel || 'Vehicle'} · VIN {report.vehicle.vin}
                            <Citation citation={report.vehicle.citation} />
                        </p>
                    </Section>
                )}
                {report.complaint && (
                    <Section title="Complaint">
                        <p>
                            {report.complaint.text}
                            <Citation citation={report.complaint.citation} />
                        </p>
                    </Section>
                )}
                {report.codes.length > 0 && (
                    <Section title="Codes">
                        {report.codes.map((code, index) => (
                            <p key={`${code.code}-${index}`}>
                                {code.code} ({code.state})
                                {code.freezeFrame
                                    ? ` · freeze frame ${JSON.stringify(code.freezeFrame)}`
                                    : ''}
                                <Citation citation={code.citation} />
                            </p>
                        ))}
                    </Section>
                )}
                {report.evidence.length > 0 && (
                    <Section title="Evidence">
                        {report.evidence.map((item, index) => (
                            <p key={`${item.kind}-${index}`}>
                                {formatWhen(item.occurredAt)} —{' '}
                                {item.kind === 'frame'
                                    ? `Frame ${item.mediaUri ?? ''} (sha256 ${item.mediaSha256 ?? ''})`
                                    : (item.text ?? '')}
                                <Citation citation={item.citation} />
                            </p>
                        ))}
                    </Section>
                )}
                {report.differential.length > 0 && (
                    <Section title="Differential">
                        {report.differential.map((item) => (
                            <p key={item.hypothesis}>
                                {item.hypothesis} — {Math.round(item.confidence * 100)}%
                                <Citation citation={item.citation} />
                            </p>
                        ))}
                    </Section>
                )}
                {report.tests.length > 0 && (
                    <Section title="Tests run">
                        {report.tests.map((test, index) => (
                            <p key={`${test.name}-${index}`}>
                                {test.name}: {test.result}
                                {test.measuredValue !== undefined
                                    ? ` — ${test.measuredValue}${test.unit ? ` ${test.unit}` : ''}`
                                    : ''}
                                <Citation citation={test.citation} />
                            </p>
                        ))}
                    </Section>
                )}
                {report.repair && (
                    <Section title="Repair">
                        <p>
                            {report.repair.repairPerformed}
                            {report.repair.partsReplaced.length > 0
                                ? ` · Parts: ${report.repair.partsReplaced.join(', ')}`
                                : ''}
                            <Citation citation={report.repair.citation} />
                        </p>
                    </Section>
                )}
                {report.outcome && (
                    <Section title="Outcome">
                        <p>
                            Codes cleared: {report.outcome.codesCleared ? 'yes' : 'no'} · Symptom
                            gone: {report.outcome.symptomGone ? 'yes' : 'no'} · Re-test passed:{' '}
                            {report.outcome.retestPassed ? 'yes' : 'no'} · Confirmed:{' '}
                            {report.outcome.confirmed ? 'yes' : 'no'}
                            {report.outcome.notes ? ` · ${report.outcome.notes}` : ''}
                            <Citation citation={report.outcome.citation} />
                        </p>
                    </Section>
                )}
                {report.corrections.length > 0 && (
                    <Section title="Corrections">
                        {report.corrections.map((correction) => (
                            <p key={correction.correctedEntryId}>
                                {correction.text} (retracts entry {correction.correctedEntryId})
                                <Citation citation={correction.citation} />
                            </p>
                        ))}
                    </Section>
                )}
            </div>
        </article>
    );
}
