// --- ELM327 emulator (LM-03) ---
// A scripted adapter for tests, CI and development: canned replies from a
// car with a stored P0300 + P0420, a pending P0300, no permanent codes, a
// freeze frame on the P0300, and a clean Mode 06. Every reply is written
// exactly as an ELM327 returns it (echo off, spaces off, `>` prompt), so
// the emulator speaks the same wire format as a real OBDLink on a real car.
// This is the emulator the issue asks for in CI.
import { FakeObdAdapter } from './adapter';
import type { ObdAdapterInfo } from './types';

export const EMULATOR_ADAPTER_INFO: ObdAdapterInfo = { name: 'ELM327 emulator', transport: 'emulator' };

export const FULL_SCAN_TRANSCRIPT: Readonly<Record<string, string>> = {
    ATZ: 'ELM327 v2.1\r\r>',
    ATE0: 'OK\r\r>',
    ATL0: 'OK\r\r>',
    ATS0: 'OK\r\r>',
    ATH0: 'OK\r\r>',
    ATSP0: 'OK\r\r>',
    '0100': '41 00 BE 1F A8 13\r\r>',
    // Stored: P0300 (03 00) + P0420 (04 20).
    '03': '43 03 00 04 20\r\r>',
    // Pending: P0300.
    '07': '47 03 00\r\r>',
    // Permanent: none.
    '0A': '4A\r\r>',
    // Freeze frame DTC: P0300.
    '02 02': '42 02 03 00\r\r>',
    '02 05': '42 05 82\r\r>',
    '02 0C': '42 0C 27 10\r\r>',
    '02 0D': '42 0D 00\r\r>',
    '02 11': '42 11 26\r\r>',
    '02 2F': '42 2F 80\r\r>',
    // Mode 06: TIDs 01, 07, 0A supported.
    '06 00': '46 00 82 40 00 00\r\r>',
    '06 01': '46 01 01 00 0A 00 00 00 80\r\r>',
    '06 07': '46 07 90 01 2C 00 00 01 F4\r\r>',
    '06 0A': '46 0A 11 00 1D 00 00 00 36\r\r>',
    // Readiness: MIL on, 1 stored code; continuous monitors complete;
    // catalyst, evap, O2, O2 heater, EGR supported and complete.
    '01 01': '41 01 81 07 E5 00\r\r>',
    // VIN 1HGCM82633A004352, multi-frame.
    '09 02': '014\r0: 49 02 01 31 48 47 43\r1: 4D 38 32 36 33 33 41 30\r2: 30 34 33 35 32\r\r>',
    '09 04': '49 04 01 50 30 31 32 33 34 35 36\r\r>',
    '09 06': '49 06 01 12 34 56 78\r\r>',
    // Live snapshot: coolant 90 C, RPM 2500, speed 0, throttle ~15%, fuel ~50%.
    '01 05 0C 0D 11 2F': '41 05 82 0C 27 10 0D 00 11 26 2F 80\r\r>',
    '01 0C': '41 0C 27 10\r\r>',
    // Guided hold-2,500-RPM test: RPM 2500, STFT 0%, LTFT 0%, O2 0.5 V, MAF 5 g/s.
    '01 0C 06 07 14 10': '41 0C 27 10 06 80 07 80 14 64 10 01 F4\r\r>',
    '04': '44\r\r>',
};

/** A clean car: no codes, no freeze frame, all supported monitors complete. */
export const CLEAN_CAR_TRANSCRIPT: Readonly<Record<string, string>> = {
    ...FULL_SCAN_TRANSCRIPT,
    '03': '43 00 00\r\r>',
    '07': '47 00 00\r\r>',
    '02 02': '42 02 00 00\r\r>',
    '01 01': '41 01 00 07 E5 00\r\r>',
};

/** A connected emulator over the full-scan transcript. */
export function createEmulatorAdapter(
    transcript: Readonly<Record<string, string>> = FULL_SCAN_TRANSCRIPT,
): FakeObdAdapter {
    return new FakeObdAdapter(transcript, { adapterInfo: EMULATOR_ADAPTER_INFO });
}
