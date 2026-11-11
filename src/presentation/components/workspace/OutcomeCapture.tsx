'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Case, LedgerEntry, OutcomePayload } from '@lemonade/core';
import { Block, BlockTitle, Button } from 'konsta/react';

interface OutcomeCaptureProps {
    caseId: string;
    token: string;
}

type CaseDetails = {
    case: Case;
    entries: LedgerEntry[];
};

const CHECKS = [
    { key: 'codesCleared', label: 'Fault codes cleared' },
    { key: 'symptomGone', label: 'Symptom gone' },
    { key: 'retestPassed', label: 'Re-test passed' },
] as const;

type CheckKey = (typeof CHECKS)[number]['key'];

function outcomeFromEntries(entries: LedgerEntry[]): OutcomePayload | null {
    const outcomeEntry = entries.find((entry) => entry.type === 'outcome');
    return outcomeEntry && outcomeEntry.type === 'outcome' ? outcomeEntry.payload : null;
}

/**
 * LM-05: records the repair outcome and closes the case, from the web
 * session workspace. Confirmed means all three checks passed — the form
 * derives it from the checks, so a case can only close confirmed when the
 * fault is proven fixed. A closed case shows its outcome read-only.
 */
export function OutcomeCapture({ caseId, token }: OutcomeCaptureProps) {
    const [details, setDetails] = useState<CaseDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [repairPerformed, setRepairPerformed] = useState('');
    const [partsReplaced, setPartsReplaced] = useState('');
    const [codesCleared, setCodesCleared] = useState(false);
    const [symptomGone, setSymptomGone] = useState(false);
    const [retestPassed, setRetestPassed] = useState(false);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const confirmed = codesCleared && symptomGone && retestPassed;

    const checkState: Record<CheckKey, boolean> = { codesCleared, symptomGone, retestPassed };
    const setCheckState: Record<CheckKey, (checked: boolean) => void> = {
        codesCleared: setCodesCleared,
        symptomGone: setSymptomGone,
        retestPassed: setRetestPassed,
    };

    const loadCase = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const response = await fetch(`/api/cases/${caseId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? `Case load failed (${response.status})`);
            }
            const body = (await response.json()) as { data: CaseDetails };
            setDetails(body.data);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Case load failed');
        } finally {
            setLoading(false);
        }
    }, [caseId, token]);

    useEffect(() => {
        void loadCase();
    }, [loadCase]);

    const submitOutcome = async () => {
        setSubmitting(true);
        setSubmitError(null);
        const outcome: OutcomePayload = {
            repairPerformed: repairPerformed.trim(),
            partsReplaced: partsReplaced
                .split(',')
                .map((part) => part.trim())
                .filter((part) => part.length > 0),
            codesCleared,
            symptomGone,
            retestPassed,
            confirmed,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
        };
        try {
            const response = await fetch(`/api/cases/${caseId}/close`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ outcome }),
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? `Close failed (${response.status})`);
            }
            await loadCase();
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'Close failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <Block className="m-4 p-4">
                <p className="text-zinc-500 text-sm">Loading case…</p>
            </Block>
        );
    }

    if (loadError || !details) {
        return (
            <Block className="m-4 p-4">
                <p className="text-red-400 text-sm">{loadError ?? 'Case could not be loaded'}</p>
                <Button small onClick={() => void loadCase()} className="mt-2">
                    Retry
                </Button>
            </Block>
        );
    }

    if (details.case.status === 'closed') {
        const outcome = outcomeFromEntries(details.entries);
        return (
            <Block className="bg-zinc-900 border border-white/10 rounded-lg m-4 p-4">
                <BlockTitle className="text-white font-bold mb-2">Case closed</BlockTitle>
                {outcome ? (
                    <div className="text-sm text-zinc-300 space-y-1">
                        <p>
                            <span className="text-zinc-500">Repair: </span>
                            {outcome.repairPerformed}
                        </p>
                        {outcome.partsReplaced.length > 0 && (
                            <p>
                                <span className="text-zinc-500">Parts: </span>
                                {outcome.partsReplaced.join(', ')}
                            </p>
                        )}
                        <p>
                            <span className="text-zinc-500">Outcome: </span>
                            {outcome.confirmed ? 'Confirmed fixed' : 'Unconfirmed — fault not proven fixed'}
                        </p>
                        {outcome.notes && (
                            <p>
                                <span className="text-zinc-500">Notes: </span>
                                {outcome.notes}
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-zinc-500 text-sm">No outcome recorded.</p>
                )}
            </Block>
        );
    }

    return (
        <Block className="bg-zinc-900 border border-white/10 rounded-lg m-4 p-4">
            <BlockTitle className="text-white font-bold mb-2">Repair outcome</BlockTitle>
            <p className="text-zinc-400 text-sm mb-4">
                Record the repair and close the case. All three checks pass to close it confirmed.
            </p>
            <label className="block text-sm text-zinc-300 mb-1" htmlFor="repair-performed">
                Repair performed
            </label>
            <textarea
                id="repair-performed"
                value={repairPerformed}
                onChange={(event) => setRepairPerformed(event.target.value)}
                className="w-full bg-black border border-white/10 rounded-lg p-2 text-white text-sm mb-3"
                rows={3}
            />
            <label className="block text-sm text-zinc-300 mb-1" htmlFor="parts-replaced">
                Parts replaced (comma separated)
            </label>
            <input
                id="parts-replaced"
                type="text"
                value={partsReplaced}
                onChange={(event) => setPartsReplaced(event.target.value)}
                className="w-full bg-black border border-white/10 rounded-lg p-2 text-white text-sm mb-3"
            />
            <div className="space-y-2 mb-3">
                {CHECKS.map((check) => (
                    <label key={check.key} className="flex items-center gap-2 text-sm text-zinc-300">
                        <input
                            type="checkbox"
                            checked={checkState[check.key]}
                            onChange={(event) => setCheckState[check.key](event.target.checked)}
                            className="accent-blue-500"
                        />
                        {check.label}
                    </label>
                ))}
            </div>
            <p className="text-sm mb-3 text-zinc-400">
                {confirmed
                    ? 'Confirmed fixed — all checks passed.'
                    : 'Unconfirmed — closes without proof the fault is fixed.'}
            </p>
            <label className="block text-sm text-zinc-300 mb-1" htmlFor="outcome-notes">
                Notes (optional)
            </label>
            <textarea
                id="outcome-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="w-full bg-black border border-white/10 rounded-lg p-2 text-white text-sm mb-3"
                rows={2}
            />
            {submitError && <p className="text-red-400 text-sm mb-2">{submitError}</p>}
            <Button
                onClick={() => void submitOutcome()}
                disabled={repairPerformed.trim().length === 0 || submitting}
                className="w-full"
            >
                {submitting ? 'Closing…' : confirmed ? 'Close case — confirmed fixed' : 'Close case — unconfirmed'}
            </Button>
        </Block>
    );
}
