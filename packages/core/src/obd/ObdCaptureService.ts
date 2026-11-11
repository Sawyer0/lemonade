// --- OBD capture service (LM-03) ---
// Runs a full scan against any IObdAdapter: init, stored / pending /
// permanent codes, freeze frame, Mode 06, readiness, VIN + calibration
// IDs, and a live-PID snapshot. A mode that answers NO DATA contributes
// nothing instead of failing the scan — a car that has never set a code
// still has readiness and live data worth recording. A disconnected or
// unresponsive adapter fails the whole scan: a partial scan must never
// pose as a complete one.
import {
    ELM327_INIT_COMMANDS,
    FREEZE_FRAME_PIDS,
    LIVE_SCAN_PIDS,
    ObdError,
    assertPid,
    parseCalibrationIdResponse,
    parseCalibrationVerificationResponse,
    parseDtcResponse,
    parseFreezeFrameDtcResponse,
    parseFreezeFramePidResponse,
    parseLivePidResponse,
    parseMode06Response,
    parseMode06SupportedResponse,
    parseReadinessResponse,
    parseVinResponse,
    scrubElm327Response,
} from './elm327';
import type { IObdAdapter } from './adapter';
import {
    ObdScanResultSchema,
    type ObdMode06Result,
    type ObdPidReading,
    type ObdReadiness,
    type ObdScanResult,
} from './types';

/** How many Mode 06 test IDs one scan asks for, at most. */
const MAX_MODE06_TESTS = 32;

const EMPTY_READINESS: ObdReadiness = { milOn: false, storedCodeCount: 0, monitors: [] };

export class ObdCaptureService {
    constructor(
        private readonly adapter: IObdAdapter,
        private readonly now: () => Date = () => new Date(),
    ) {}

    private requireConnected(): void {
        if (!this.adapter.isConnected) {
            throw new ObdError('not-connected', 'OBD adapter is not connected.');
        }
    }

    private timestamp(): string {
        return this.now().toISOString();
    }

    /** Sends the init sequence and proves the bus answers (0100 must reply). */
    public async initialize(): Promise<void> {
        this.requireConnected();
        for (const command of ELM327_INIT_COMMANDS) {
            const reply = await this.adapter.sendCommand(command);
            if (command === '0100') {
                // The probe is the proof the bus answers: scrubbing raises
                // on UNABLE TO CONNECT and on any other adapter error.
                const { bytes } = scrubElm327Response(reply);
                if (bytes.length === 0 || bytes[0] !== 0x41) {
                    throw new ObdError('invalid-response', 'Vehicle did not answer the Mode 01 probe (0100).');
                }
            }
        }
    }

    public async readStoredCodes(): Promise<string[]> {
        this.requireConnected();
        return parseDtcResponse(await this.adapter.sendCommand('03'), 3);
    }

    public async readPendingCodes(): Promise<string[]> {
        this.requireConnected();
        return parseDtcResponse(await this.adapter.sendCommand('07'), 7);
    }

    public async readPermanentCodes(): Promise<string[]> {
        this.requireConnected();
        return parseDtcResponse(await this.adapter.sendCommand('0A'), 0x0a);
    }

    /** Reads one or more live PIDs in a single Mode 01 command. */
    public async readLivePids(pids: readonly string[]): Promise<ObdPidReading[]> {
        this.requireConnected();
        if (pids.length === 0) return [];
        for (const pid of pids) assertPid(pid);
        const command = `01 ${pids.map((pid) => pid.toUpperCase()).join(' ')}`;
        return parseLivePidResponse(await this.adapter.sendCommand(command), this.timestamp());
    }

    public async readReadiness(): Promise<ObdReadiness> {
        this.requireConnected();
        try {
            return parseReadinessResponse(await this.adapter.sendCommand('01 01'));
        } catch (error) {
            if (error instanceof ObdError && error.kind === 'no-data') return EMPTY_READINESS;
            throw error;
        }
    }

    public async readMode06(): Promise<ObdMode06Result[]> {
        this.requireConnected();
        const supported = parseMode06SupportedResponse(await this.adapter.sendCommand('06 00'));
        const results: ObdMode06Result[] = [];
        for (const testId of supported.slice(0, MAX_MODE06_TESTS)) {
            results.push(...parseMode06Response(await this.adapter.sendCommand(`06 ${testId}`)));
        }
        return results;
    }

    public async readFreezeFrame(): Promise<ObdScanResult['freezeFrame']> {
        this.requireConnected();
        const dtc = parseFreezeFrameDtcResponse(await this.adapter.sendCommand('02 02'));
        if (dtc === null) return null;
        const capturedAt = this.timestamp();
        const readings: ObdPidReading[] = [];
        for (const pid of FREEZE_FRAME_PIDS) {
            const reading = parseFreezeFramePidResponse(await this.adapter.sendCommand(`02 ${pid}`), capturedAt);
            if (reading) readings.push(reading);
        }
        return { dtc, readings };
    }

    public async readVin(): Promise<string | null> {
        this.requireConnected();
        return parseVinResponse(await this.adapter.sendCommand('09 02'));
    }

    public async readCalibrationIds(): Promise<string[]> {
        this.requireConnected();
        return parseCalibrationIdResponse(await this.adapter.sendCommand('09 04'));
    }

    public async readCalibrationVerificationNumbers(): Promise<string[]> {
        this.requireConnected();
        return parseCalibrationVerificationResponse(await this.adapter.sendCommand('09 06'));
    }

    /** The one-tap scan: every mode above, in order, as one ledger-ready result. */
    public async captureFullScan(): Promise<ObdScanResult> {
        await this.initialize();
        // Sequential on purpose: the adapter is one serial link, and
        // interleaved commands would scramble the replies.
        const storedCodes = await this.readStoredCodes();
        const pendingCodes = await this.readPendingCodes();
        const permanentCodes = await this.readPermanentCodes();
        const freezeFrame = await this.readFreezeFrame();
        const mode06 = await this.readMode06();
        const readiness = await this.readReadiness();
        const vin = await this.readVin();
        const calibrationIds = await this.readCalibrationIds();
        const calibrationVerificationNumbers = await this.readCalibrationVerificationNumbers();
        const liveReadings = await this.readLivePids(LIVE_SCAN_PIDS);
        return ObdScanResultSchema.parse({
            adapter: this.adapter.adapterInfo,
            capturedAt: this.timestamp(),
            storedCodes,
            pendingCodes,
            permanentCodes,
            freezeFrame,
            mode06,
            readiness,
            vin,
            calibrationIds,
            calibrationVerificationNumbers,
            liveReadings,
        });
    }

    /** Clears stored codes and freeze frame (Mode 04). The caller rescans to confirm. */
    public async clearStoredCodes(): Promise<void> {
        this.requireConnected();
        const reply = await this.adapter.sendCommand('04');
        if (!/44/.test(reply.replace(/[^0-9A-F]/g, ''))) {
            throw new ObdError('invalid-response', 'Adapter did not confirm clearing codes (expected a 44 reply).');
        }
    }
}
