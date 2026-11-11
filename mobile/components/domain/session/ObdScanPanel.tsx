import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import {
    createEmulatorAdapter,
    type GuidedObdTestOutcome,
    type ObdFaultWindow,
    type ObdScanResult,
    type VerifyFixResult,
} from '@lemonade/core';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';
import { ThemedText } from '@mobile/components/themed-text';
import { GradientButton } from '@mobile/components/ui/GradientButton';
import { createBleObdAdapter, scanForObdAdapters, type ScannedObdAdapter } from '@mobile/modules/obd';
import { HOLD_2500_RPM_TEST, MobileObdCapture } from '@mobile/services/MobileObdCapture';

interface ObdScanPanelProps {
    sessionId: string;
}

type PanelStatus = 'idle' | 'finding' | 'connecting' | 'ready' | 'scanning' | 'capturing' | 'testing' | 'verifying';

function codeList(label: string, codes: readonly string[]): string {
    return `${label} (${codes.length}): ${codes.length > 0 ? codes.join(', ') : 'none'}`;
}

/**
 * LM-03: the session screen's OBD-II panel. One tap scans the car through
 * a BLE adapter (OBDLink CX / MX+) and records the codes, freeze frame,
 * Mode 06, readiness and VIN in the case ledger. It also saves fault
 * windows, runs the guided hold-2,500-RPM test, and runs verify-fix.
 * In development builds the emulator stands in for a real car.
 */
export function ObdScanPanel({ sessionId }: ObdScanPanelProps) {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const managerRef = useRef<BleManager | null>(null);
    const captureRef = useRef<MobileObdCapture | null>(null);
    const [status, setStatus] = useState<PanelStatus>('idle');
    const [adapters, setAdapters] = useState<ScannedObdAdapter[]>([]);
    const [scan, setScan] = useState<ObdScanResult | null>(null);
    const [testOutcome, setTestOutcome] = useState<GuidedObdTestOutcome | null>(null);
    const [verifyResult, setVerifyResult] = useState<VerifyFixResult | null>(null);
    const [driveCycleDone, setDriveCycleDone] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [liveRpm, setLiveRpm] = useState<number | null>(null);

    const bleManager = useCallback(() => {
        if (!managerRef.current) managerRef.current = new BleManager();
        return managerRef.current;
    }, []);

    const busy =
        status === 'finding' ||
        status === 'connecting' ||
        status === 'scanning' ||
        status === 'capturing' ||
        status === 'testing' ||
        status === 'verifying';
    const connected =
        status === 'ready' ||
        status === 'scanning' ||
        status === 'capturing' ||
        status === 'testing' ||
        status === 'verifying';

    const findAdapters = useCallback(async () => {
        setError(null);
        setNotice(null);
        setStatus('finding');
        try {
            const found = await scanForObdAdapters(bleManager());
            setAdapters(found);
            if (found.length === 0) setNotice('No OBD adapter found nearby. Plug the adapter in and try again.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Bluetooth scan failed.');
        } finally {
            setStatus('idle');
        }
    }, [bleManager]);

    const connectCapture = useCallback(async (capture: MobileObdCapture) => {
        setError(null);
        setNotice(null);
        setStatus('connecting');
        try {
            captureRef.current = capture;
            await capture.connectAndInitialize();
            capture.startLiveSampling((reading) => {
                if (reading.pid === '0C') setLiveRpm(reading.value);
            });
            setStatus('ready');
        } catch (err) {
            captureRef.current = null;
            setError(err instanceof Error ? err.message : 'Could not connect to the adapter.');
            setStatus('idle');
        }
    }, []);

    const handleAutoFaultWindow = useCallback((window: ObdFaultWindow) => {
        setNotice(
            `Fault window saved automatically (${window.trigger}): ${window.samples.length} samples, ` +
                '60 s before to 15 s after the trigger.',
        );
    }, []);

    const connectAdapter = useCallback(
        async (device: ScannedObdAdapter) => {
            await connectCapture(
                new MobileObdCapture(createBleObdAdapter(bleManager(), device), sessionId, undefined, {
                    onAutoFaultWindow: handleAutoFaultWindow,
                }),
            );
        },
        [bleManager, connectCapture, handleAutoFaultWindow, sessionId],
    );

    const connectEmulator = useCallback(async () => {
        const emulator = createEmulatorAdapter();
        await emulator.connect();
        await connectCapture(
            new MobileObdCapture(emulator, sessionId, undefined, {
                onAutoFaultWindow: handleAutoFaultWindow,
            }),
        );
    }, [connectCapture, handleAutoFaultWindow, sessionId]);

    const disconnect = useCallback(async () => {
        const capture = captureRef.current;
        captureRef.current = null;
        setScan(null);
        setTestOutcome(null);
        setVerifyResult(null);
        setLiveRpm(null);
        setStatus('idle');
        if (capture) await capture.disconnect();
    }, []);

    const scanNow = useCallback(async () => {
        const capture = captureRef.current;
        if (!capture) return;
        setError(null);
        setNotice(null);
        setStatus('scanning');
        try {
            setScan(await capture.scanAndRecord());
            setNotice('Scan recorded in the case ledger.');
            setStatus('ready');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Scan failed.');
            setStatus('ready');
        }
    }, []);

    const saveFaultWindow = useCallback(async () => {
        const capture = captureRef.current;
        if (!capture) return;
        setError(null);
        setStatus('capturing');
        // The capture waits 15 s after the tap so the saved window holds
        // samples on both sides of the trigger; the buttons stay disabled
        // until it lands.
        setNotice('Saving fault window — collecting 15 s after the trigger…');
        try {
            const window = await capture.captureFaultWindow('manual', 'tech said now');
            setNotice(`Fault window saved: ${window.samples.length} samples, 60 s before to 15 s after the trigger.`);
            setStatus('ready');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Fault window was not saved.');
            setStatus('ready');
        }
    }, []);

    const runGuidedTest = useCallback(async () => {
        const capture = captureRef.current;
        if (!capture) return;
        setError(null);
        setStatus('testing');
        try {
            setTestOutcome(await capture.runGuidedTest(HOLD_2500_RPM_TEST));
            setStatus('ready');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Guided test failed.');
            setStatus('ready');
        }
    }, []);

    const verifyFix = useCallback(async () => {
        const capture = captureRef.current;
        if (!capture) return;
        setError(null);
        setStatus('verifying');
        try {
            const { result, rescan } = await capture.runVerifyFix(driveCycleDone);
            setVerifyResult(result);
            setScan(rescan);
            setStatus('ready');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Verify-fix failed.');
            setStatus('ready');
        }
    }, [driveCycleDone]);

    const incompleteMonitors =
        scan?.readiness.monitors.filter((monitor) => monitor.supported && !monitor.complete) ?? [];
    const mode06Passed = scan?.mode06.filter((result) => result.passed).length ?? 0;

    return (
        <View style={styles.container}>
            <ThemedText type="defaultSemiBold" style={styles.title}>
                OBD-II
            </ThemedText>
            {connected ? (
                <ThemedText style={styles.status}>
                    Connected: {captureRef.current?.adapterName ?? 'adapter'}
                    {liveRpm !== null ? ` · ${Math.round(liveRpm)} RPM` : ''}
                </ThemedText>
            ) : (
                <ThemedText style={styles.status}>No adapter connected. Plug in an OBDLink CX or MX+.</ThemedText>
            )}

            {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
            {notice ? <ThemedText style={styles.notice}>{notice}</ThemedText> : null}
            {busy ? <ActivityIndicator color={theme.tint} style={styles.spinner} /> : null}

            {!connected ? (
                <View style={styles.actions}>
                    <GradientButton
                        title="Find OBD adapter"
                        accessibilityLabel="find-obd-adapter"
                        onPress={() => void findAdapters()}
                        disabled={busy}
                    />
                    {adapters.map((adapter) => (
                        <TouchableOpacity
                            key={adapter.id}
                            accessibilityLabel={`connect-obd-${adapter.id}`}
                            style={styles.deviceRow}
                            onPress={() => void connectAdapter(adapter)}
                            disabled={busy}
                        >
                            <ThemedText>{adapter.name ?? adapter.id}</ThemedText>
                        </TouchableOpacity>
                    ))}
                    {typeof __DEV__ !== 'undefined' && __DEV__ ? (
                        <GradientButton
                            title="Use emulator (dev only)"
                            accessibilityLabel="use-obd-emulator"
                            variant="outline"
                            onPress={() => void connectEmulator()}
                            disabled={busy}
                        />
                    ) : null}
                </View>
            ) : (
                <View style={styles.actions}>
                    <GradientButton
                        title="Scan now"
                        accessibilityLabel="scan-obd"
                        onPress={() => void scanNow()}
                        disabled={busy}
                    />
                    <GradientButton
                        title="Save fault window"
                        accessibilityLabel="save-fault-window"
                        variant="outline"
                        onPress={() => void saveFaultWindow()}
                        disabled={busy}
                    />
                    <GradientButton
                        title="Run hold-2,500-RPM test"
                        accessibilityLabel="run-guided-test"
                        variant="outline"
                        onPress={() => void runGuidedTest()}
                        disabled={busy}
                    />
                    <TouchableOpacity
                        accessibilityLabel="drive-cycle-done"
                        style={styles.checkRow}
                        onPress={() => setDriveCycleDone((done) => !done)}
                    >
                        <ThemedText>
                            {driveCycleDone ? '✓ Drive cycle completed' : '○ Drive cycle completed'}
                        </ThemedText>
                    </TouchableOpacity>
                    <GradientButton
                        title="Verify fix"
                        accessibilityLabel="verify-fix"
                        variant="outline"
                        onPress={() => void verifyFix()}
                        disabled={busy}
                    />
                    <GradientButton
                        title="Disconnect"
                        variant="ghost"
                        onPress={() => void disconnect()}
                        disabled={busy}
                    />
                </View>
            )}

            {scan ? (
                <View style={styles.results}>
                    <ThemedText style={styles.resultLine}>{codeList('Stored', scan.storedCodes)}</ThemedText>
                    <ThemedText style={styles.resultLine}>{codeList('Pending', scan.pendingCodes)}</ThemedText>
                    <ThemedText style={styles.resultLine}>{codeList('Permanent', scan.permanentCodes)}</ThemedText>
                    <ThemedText style={styles.resultLine}>
                        Freeze frame:{' '}
                        {scan.freezeFrame
                            ? `${scan.freezeFrame.dtc} (${scan.freezeFrame.readings.length} readings)`
                            : 'none'}
                    </ThemedText>
                    <ThemedText style={styles.resultLine}>
                        Mode 06: {mode06Passed}/{scan.mode06.length} passed
                    </ThemedText>
                    <ThemedText style={styles.resultLine}>
                        Readiness: MIL {scan.readiness.milOn ? 'on' : 'off'}
                        {incompleteMonitors.length > 0
                            ? ` · incomplete: ${incompleteMonitors.map((monitor) => monitor.name).join(', ')}`
                            : ' · all supported monitors complete'}
                    </ThemedText>
                    {scan.vin ? <ThemedText style={styles.resultLine}>VIN: {scan.vin}</ThemedText> : null}
                </View>
            ) : null}

            {testOutcome ? (
                <View style={styles.results}>
                    <ThemedText style={styles.resultLine}>
                        Guided test {testOutcome.definitionName}: {testOutcome.result.toUpperCase()}
                    </ThemedText>
                    {testOutcome.checks.map((check) => (
                        <ThemedText key={check.pid} style={styles.resultLine}>
                            {check.pid}: {check.observedMin ?? '?'}..{check.observedMax ?? '?'} {check.unit} (expected{' '}
                            {check.expectedMin}..{check.expectedMax}) {check.passed ? 'pass' : 'fail'}
                        </ThemedText>
                    ))}
                </View>
            ) : null}

            {verifyResult ? (
                <View style={styles.results}>
                    <ThemedText style={styles.resultLine}>
                        Verify fix: {verifyResult.passed ? 'PASS' : 'FAIL'}
                        {!verifyResult.monitorsReady
                            ? ` · monitors not ready: ${verifyResult.monitorsNotReady.join(', ')}`
                            : ''}
                        {verifyResult.returnedPendingCodes.length > 0
                            ? ` · pending returned: ${verifyResult.returnedPendingCodes.join(', ')}`
                            : ''}
                        {verifyResult.returnedPermanentCodes.length > 0
                            ? ` · permanent returned: ${verifyResult.returnedPermanentCodes.join(', ')}`
                            : ''}
                    </ThemedText>
                </View>
            ) : null}
        </View>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        container: {
            marginTop: 16,
            padding: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.background,
        },
        title: {
            fontSize: 18,
            marginBottom: 4,
        },
        status: {
            color: theme.textSecondary,
            marginBottom: 12,
        },
        error: {
            color: theme.error,
            marginBottom: 12,
        },
        notice: {
            color: theme.textSecondary,
            marginBottom: 12,
        },
        spinner: {
            marginVertical: 8,
        },
        actions: {
            gap: 10,
        },
        deviceRow: {
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: theme.border,
        },
        checkRow: {
            paddingVertical: 8,
        },
        results: {
            marginTop: 12,
            gap: 4,
        },
        resultLine: {
            color: theme.text,
        },
    });
