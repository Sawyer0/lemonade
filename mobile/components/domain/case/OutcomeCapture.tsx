import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@mobile/infrastructure/firebase/config';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';
import { ThemedText } from '@mobile/components/themed-text';
import { TextInput } from '@mobile/components/ui/TextInput';
import { GradientButton } from '@mobile/components/ui/GradientButton';
import type { Case, LedgerEntry, OutcomePayload } from '@lemonade/core';

interface OutcomeCaptureProps {
    sessionId: string;
}

interface CaseDetails {
    case: Case;
    entries: LedgerEntry[];
}

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

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) throw new Error('API_URL is not defined');
    const token = await auth.currentUser?.getIdToken();
    return fetch(`${apiUrl}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
    });
}

/**
 * LM-05: records the repair outcome and closes the case, from the mobile
 * session screen. The session document carries the case id; a session
 * without a case renders nothing. Confirmed means all three checks passed —
 * the form derives it from the checks, so a case can only close confirmed
 * when the fault is proven fixed. A closed case shows its outcome read-only.
 */
export function OutcomeCapture({ sessionId }: OutcomeCaptureProps) {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [caseId, setCaseId] = useState<string | null>(null);
    const [details, setDetails] = useState<CaseDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
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

    useEffect(() => {
        if (!sessionId) return;
        return onSnapshot(
            doc(db, 'sessions', sessionId),
            (snapshot) => {
                const value: unknown = snapshot.data()?.caseId;
                setCaseId(typeof value === 'string' && value.length > 0 ? value : null);
            },
            () => setError('Failed to load session'),
        );
    }, [sessionId]);

    const loadCase = useCallback(async (id: string) => {
        setLoading(true);
        setError(null);
        try {
            const response = await apiFetch(`/api/cases/${id}`);
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? `Case load failed (${response.status})`);
            }
            const body = (await response.json()) as { data: CaseDetails };
            setDetails(body.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Case load failed');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!caseId) {
            setLoading(false);
            return;
        }
        void loadCase(caseId);
    }, [caseId, loadCase]);

    const submitOutcome = async () => {
        if (!caseId) return;
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
            const response = await apiFetch(`/api/cases/${caseId}/close`, {
                method: 'POST',
                body: JSON.stringify({ outcome }),
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? `Close failed (${response.status})`);
            }
            await loadCase(caseId);
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Close failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (!caseId) return null;

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator color={theme.tint} />
            </View>
        );
    }

    if (error || !details) {
        return (
            <View style={styles.container}>
                <ThemedText style={styles.errorText}>{error ?? 'Case could not be loaded'}</ThemedText>
                <GradientButton title="Retry" variant="outline" onPress={() => void loadCase(caseId)} />
            </View>
        );
    }

    if (details.case.status === 'closed') {
        const outcome = outcomeFromEntries(details.entries);
        return (
            <View style={styles.container}>
                <ThemedText type="defaultSemiBold" style={styles.title}>
                    Case closed
                </ThemedText>
                {outcome ? (
                    <View>
                        <ThemedText style={styles.body}>Repair: {outcome.repairPerformed}</ThemedText>
                        {outcome.partsReplaced.length > 0 && (
                            <ThemedText style={styles.body}>Parts: {outcome.partsReplaced.join(', ')}</ThemedText>
                        )}
                        <ThemedText style={styles.body}>
                            Outcome: {outcome.confirmed ? 'Confirmed fixed' : 'Unconfirmed — fault not proven fixed'}
                        </ThemedText>
                        {outcome.notes ? <ThemedText style={styles.body}>Notes: {outcome.notes}</ThemedText> : null}
                    </View>
                ) : (
                    <ThemedText style={styles.body}>No outcome recorded.</ThemedText>
                )}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ThemedText type="defaultSemiBold" style={styles.title}>
                Repair outcome
            </ThemedText>
            <ThemedText style={styles.body}>
                Record the repair and close the case. All three checks pass to close it confirmed.
            </ThemedText>
            <TextInput
                label="Repair performed"
                value={repairPerformed}
                onChangeText={setRepairPerformed}
                multiline
                placeholder="What was repaired"
                accessibilityLabel="Repair performed"
            />
            <TextInput
                label="Parts replaced (comma separated)"
                value={partsReplaced}
                onChangeText={setPartsReplaced}
                placeholder="Radiator hose"
                accessibilityLabel="Parts replaced"
            />
            {CHECKS.map((check) => (
                <TouchableOpacity
                    key={check.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: checkState[check.key] }}
                    accessibilityLabel={check.label}
                    onPress={() => setCheckState[check.key](!checkState[check.key])}
                    style={styles.checkRow}
                >
                    <View style={[styles.checkbox, checkState[check.key] ? styles.checkboxChecked : null]}>
                        {checkState[check.key] ? <ThemedText style={styles.checkMark}>✓</ThemedText> : null}
                    </View>
                    <ThemedText style={styles.body}>{check.label}</ThemedText>
                </TouchableOpacity>
            ))}
            <ThemedText style={styles.body}>
                {confirmed
                    ? 'Confirmed fixed — all checks passed.'
                    : 'Unconfirmed — closes without proof the fault is fixed.'}
            </ThemedText>
            <TextInput
                label="Notes (optional)"
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Anything worth recording"
                accessibilityLabel="Outcome notes"
            />
            {submitError ? <ThemedText style={styles.errorText}>{submitError}</ThemedText> : null}
            <GradientButton
                title={confirmed ? 'Close case — confirmed fixed' : 'Close case — unconfirmed'}
                onPress={() => void submitOutcome()}
                disabled={repairPerformed.trim().length === 0 || submitting}
                loading={submitting}
            />
        </View>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        container: {
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 16,
            padding: 16,
            margin: 16,
            gap: 8,
        },
        title: {
            fontSize: 18,
            color: theme.tint,
        },
        body: {
            color: theme.text,
            lineHeight: 22,
        },
        errorText: {
            color: theme.error,
        },
        checkRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 4,
        },
        checkbox: {
            width: 24,
            height: 24,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        checkboxChecked: {
            backgroundColor: theme.tint,
            borderColor: theme.tint,
        },
        checkMark: {
            color: theme.background,
            fontWeight: 'bold',
        },
    });
