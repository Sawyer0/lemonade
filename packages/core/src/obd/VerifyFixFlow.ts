// --- Verify-fix flow (LM-03) ---
// Clear codes, run the drive cycle, rescan: monitors must be ready and no
// pending or permanent code may return. The drive cycle itself is physical
// — the tech drives the car — so the caller confirms it ran; this flow
// records that confirmation next to the rescan, for close-out.
// `evaluateVerifyFix` is pure, so the pass/fail rule is testable without
// an adapter; `runVerifyFix` is the live orchestration over one.
import type { ObdCaptureService } from './ObdCaptureService';
import { VerifyFixResultSchema, type ObdScanResult, type VerifyFixResult } from './types';

export interface VerifyFixInput {
    driveCycleCompleted: boolean;
    rescan: ObdScanResult;
    clearedAt: string;
    rescannedAt: string;
}

export function evaluateVerifyFix(input: VerifyFixInput): VerifyFixResult {
    const monitorsNotReady = input.rescan.readiness.monitors
        .filter((monitor) => monitor.supported && !monitor.complete)
        .map((monitor) => monitor.name);
    const monitorsReady = monitorsNotReady.length === 0;
    const passed =
        input.driveCycleCompleted &&
        monitorsReady &&
        input.rescan.storedCodes.length === 0 &&
        input.rescan.pendingCodes.length === 0 &&
        input.rescan.permanentCodes.length === 0;
    return VerifyFixResultSchema.parse({
        clearedAt: input.clearedAt,
        rescannedAt: input.rescannedAt,
        driveCycleCompleted: input.driveCycleCompleted,
        monitorsReady,
        monitorsNotReady,
        returnedStoredCodes: input.rescan.storedCodes,
        returnedPendingCodes: input.rescan.pendingCodes,
        returnedPermanentCodes: input.rescan.permanentCodes,
        passed,
    });
}

/**
 * Runs the verify-fix flow live: clear the codes, then rescan once the
 * caller confirms the drive cycle ran. The rescan is a full scan, so the
 * ledger keeps the codes, Mode 06 and readiness it was judged against.
 */
export async function runVerifyFix(
    capture: ObdCaptureService,
    driveCycleCompleted: boolean,
    now: () => Date = () => new Date(),
): Promise<{ result: VerifyFixResult; rescan: ObdScanResult }> {
    const clearedAt = now().toISOString();
    await capture.clearStoredCodes();
    const rescan = await capture.captureFullScan();
    const result = evaluateVerifyFix({
        driveCycleCompleted,
        rescan,
        clearedAt,
        rescannedAt: rescan.capturedAt,
    });
    return { result, rescan };
}
