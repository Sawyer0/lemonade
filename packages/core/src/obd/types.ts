// --- OBD-II capture types (LM-03) ---
// Typed readings from a BLE ELM327 adapter. Every reading that lands in the
// case ledger carries a timestamp and a unit, and every payload timestamp is
// an ISO string: ledger payloads round-trip through Postgres JSONB, where a
// Date would come back as a string and fail validation on read.
import { z } from 'zod';

// The transport the adapter talks over. M1 standard is Bluetooth LE on iOS
// (OBDLink CX / MX+); Wi-Fi and Android classic-Bluetooth adapters hang off
// the same IObdTransport interface later. `emulator` is the scripted fake
// adapter used by tests and CI, never a real car.
export const ObdTransportSchema = z.enum(['ble', 'wifi', 'usb', 'emulator']);
export type ObdTransport = z.infer<typeof ObdTransportSchema>;

export const ObdAdapterInfoSchema = z
    .object({
        name: z.string().min(1),
        transport: ObdTransportSchema,
        model: z.string().min(1).optional(),
    })
    .strict();
export type ObdAdapterInfo = z.infer<typeof ObdAdapterInfoSchema>;

// One live-PID sample. `pid` is the two-hex-digit Mode 01 PID (e.g. '0C'
// for engine RPM); `label` is the human name from the SAE J1979 table.
export const ObdPidReadingSchema = z
    .object({
        pid: z.string().regex(/^[0-9A-F]{2}$/, 'pid must be two hex digits'),
        label: z.string().min(1),
        value: z.number(),
        unit: z.string().min(1),
        capturedAt: z.string().datetime(),
    })
    .strict();
export type ObdPidReading = z.infer<typeof ObdPidReadingSchema>;

// One Mode 06 on-board monitor test result. Value, min and max share the
// manufacturer's scale, so pass/fail is a plain range check even when the
// unit is an unconverted raw count.
export const ObdMode06ResultSchema = z
    .object({
        testId: z.string().regex(/^[0-9A-F]{2}$/, 'testId must be two hex digits'),
        componentId: z.string().regex(/^[0-9A-F]{2}$/, 'componentId must be two hex digits'),
        value: z.number(),
        min: z.number(),
        max: z.number(),
        unit: z.string().min(1),
        passed: z.boolean(),
    })
    .strict();
export type ObdMode06Result = z.infer<typeof ObdMode06ResultSchema>;

// One readiness monitor from Mode 01 PID 01. A monitor the car was not
// built with reports supported false and is never counted as incomplete.
export const ObdReadinessMonitorSchema = z
    .object({
        name: z.string().min(1),
        supported: z.boolean(),
        complete: z.boolean(),
    })
    .strict();
export type ObdReadinessMonitor = z.infer<typeof ObdReadinessMonitorSchema>;

export const ObdReadinessSchema = z
    .object({
        milOn: z.boolean(),
        storedCodeCount: z.number().int().min(0),
        monitors: z.array(ObdReadinessMonitorSchema),
    })
    .strict();
export type ObdReadiness = z.infer<typeof ObdReadinessSchema>;

// Freeze frame (Mode 02): the DTC that triggered the snapshot plus the
// live-PID values frozen at that moment. A null dtc means the car holds no
// snapshot and every other Mode 02 value is meaningless.
export const ObdFreezeFrameSchema = z
    .object({
        dtc: z.string().nullable(),
        readings: z.array(ObdPidReadingSchema),
    })
    .strict();
export type ObdFreezeFrame = z.infer<typeof ObdFreezeFrameSchema>;

// The full one-tap scan: every code state (Mode 03 stored, 07 pending,
// 0A permanent), freeze frame, Mode 06, readiness, VIN + calibration IDs
// (Mode 09), and a snapshot of live PIDs. One scan becomes one `obd_scan`
// ledger entry with source `OBD`.
export const ObdScanResultSchema = z
    .object({
        adapter: ObdAdapterInfoSchema,
        capturedAt: z.string().datetime(),
        storedCodes: z.array(z.string().min(1)),
        pendingCodes: z.array(z.string().min(1)),
        permanentCodes: z.array(z.string().min(1)),
        freezeFrame: ObdFreezeFrameSchema.nullable(),
        mode06: z.array(ObdMode06ResultSchema),
        readiness: ObdReadinessSchema,
        vin: z.string().length(17).nullable(),
        calibrationIds: z.array(z.string().min(1)),
        calibrationVerificationNumbers: z.array(z.string().min(1)),
        liveReadings: z.array(ObdPidReadingSchema),
    })
    .strict();
export type ObdScanResult = z.infer<typeof ObdScanResultSchema>;

// --- Fault window (LM-03) ---
// The rolling live-PID buffer saves 60 s before to 15 s after a trigger:
// the tech saying "now", a code setting, or a value going out of range.
export const FaultWindowTriggerSchema = z.enum(['manual', 'code-set', 'out-of-range']);
export type FaultWindowTrigger = z.infer<typeof FaultWindowTriggerSchema>;

export const ObdFaultWindowSchema = z
    .object({
        trigger: FaultWindowTriggerSchema,
        triggerDetail: z.string().min(1).optional(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
        samples: z.array(ObdPidReadingSchema),
    })
    .strict();
export type ObdFaultWindow = z.infer<typeof ObdFaultWindowSchema>;

// --- Guided test (LM-03, consumed by LM-04 / LM-34) ---
// A test the decision model asks for: hold a condition, log PIDs, and get
// pass/fail against the expected range, so the tech types nothing.
export const GuidedObdTestDefinitionSchema = z
    .object({
        id: z.string().min(1),
        name: z.string().min(1),
        instruction: z.string().min(1),
        durationSeconds: z.number().int().min(1).max(600),
        pids: z.array(z.string().regex(/^[0-9A-F]{2}$/, 'pid must be two hex digits')).min(1),
        expectedRanges: z
            .array(
                z
                    .object({
                        pid: z.string().regex(/^[0-9A-F]{2}$/, 'pid must be two hex digits'),
                        min: z.number(),
                        max: z.number(),
                        unit: z.string().min(1),
                    })
                    .strict()
                    .refine((range) => range.min < range.max, {
                        message: 'An expected range must have min below max',
                    }),
            )
            .min(1),
    })
    .strict();
export type GuidedObdTestDefinition = z.infer<typeof GuidedObdTestDefinitionSchema>;

export const GuidedObdTestCheckSchema = z
    .object({
        pid: z.string().regex(/^[0-9A-F]{2}$/, 'pid must be two hex digits'),
        label: z.string().min(1),
        unit: z.string().min(1),
        observedMin: z.number().nullable(),
        observedMax: z.number().nullable(),
        expectedMin: z.number(),
        expectedMax: z.number(),
        passed: z.boolean(),
    })
    .strict();
export type GuidedObdTestCheck = z.infer<typeof GuidedObdTestCheckSchema>;

export const GuidedObdTestOutcomeSchema = z
    .object({
        definitionId: z.string().min(1),
        definitionName: z.string().min(1),
        result: z.enum(['pass', 'fail', 'inconclusive']),
        checks: z.array(GuidedObdTestCheckSchema).min(1),
        samplesRecorded: z.number().int().min(0),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
    })
    .strict();
export type GuidedObdTestOutcome = z.infer<typeof GuidedObdTestOutcomeSchema>;

// --- Verify-fix flow (LM-03, recorded for close-out) ---
// Clear codes, run the drive cycle, rescan: monitors must be ready and no
// pending or permanent code may return. Stored codes returning fail too —
// a fault that comes back is not fixed.
export const VerifyFixResultSchema = z
    .object({
        clearedAt: z.string().datetime(),
        rescannedAt: z.string().datetime(),
        driveCycleCompleted: z.boolean(),
        monitorsReady: z.boolean(),
        monitorsNotReady: z.array(z.string().min(1)),
        returnedStoredCodes: z.array(z.string().min(1)),
        returnedPendingCodes: z.array(z.string().min(1)),
        returnedPermanentCodes: z.array(z.string().min(1)),
        passed: z.boolean(),
    })
    .strict();
export type VerifyFixResult = z.infer<typeof VerifyFixResultSchema>;
