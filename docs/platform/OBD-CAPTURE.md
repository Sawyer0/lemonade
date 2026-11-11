# OBD-II capture (LM-03)

One tap in the session screen reads the car through a BLE ELM327 adapter
and records the result in the case ledger as typed events with source
`OBD`. This doc is the adapter standard, the module map, and the manual
real-vehicle checklist — the part no test in this repo can run.

## Adapter standard for M1

- **OBDLink CX or OBDLink MX+** (Bluetooth LE). Cheap classic-Bluetooth
  ELM327 clones do not connect to iPhone, so they are not supported.
- The adapter speaks **BLE UART over the Nordic UART Service**
  (`6E400001-B5A3-F393-E0A9-E50E24DCCA9E`; write `...0002`, notify
  `...0003`). Those UUIDs are the defaults in
  `mobile/modules/obd/ObdBlePeripheral.ts`; an adapter that speaks a
  different UART service can pass its own UUIDs to `BlePlxObdPeripheral`.
- The transport behind the capture is the `IObdTransport` interface
  (`packages/core/src/obd/adapter.ts`): send an ELM327 command, get raw
  reply text back. Wi-Fi and Android adapters implement the same
  interface later; the capture service never sees the difference.

## What a scan reads

| Mode | What | Ledger event |
| --- | --- | --- |
| 03 | Stored codes | `obd_scan` |
| 07 | Pending codes | `obd_scan` |
| 0A | Permanent codes | `obd_scan` |
| 02 | Freeze frame (triggering DTC + PIDs) | `obd_scan` |
| 06 | On-board monitor test results, value vs limits | `obd_scan` |
| 01 PID 01 | Readiness monitors, MIL, stored-code count | `obd_scan` |
| 09 | VIN, calibration IDs, calibration verification numbers | `obd_scan` |
| 01 | Live-PID snapshot (coolant, RPM, speed, throttle, fuel) | `obd_scan` |

Every reading carries a timestamp and a unit. A mode that answers
`NO DATA` contributes nothing instead of failing the scan; a car that
will not even answer the `0100` probe fails the whole scan, so a partial
scan never poses as a complete one.

## Module map

- `packages/core/src/obd/elm327.ts` — pure SAE J1979 parsing: DTC bytes,
  PID decoders, readiness bits, Mode 06, VIN / calibration IDs, freeze
  frame. The decode table is hand-written from SAE J1979; no OBDb data
  is shipped. OBDb (CC-BY-SA) remains the reference for expanding the
  PID table later, kept as a separate asset — never bundled, and no GPL
  python-OBD code is shipped.
- `packages/core/src/obd/adapter.ts` — `IObdTransport` / `IObdAdapter`
  and `FakeObdAdapter`, the scripted adapter used by tests and CI.
- `packages/core/src/obd/emulator.ts` — the ELM327 emulator: canned
  replies from a car with a stored P0300 + P0420, a pending P0300, a
  freeze frame, and a clean Mode 06. The OBD test suites run a full scan
  against it; the mobile app's dev-only emulator button uses it too.
- `packages/core/src/obd/ObdCaptureService.ts` — the one-tap scan, run
  strictly sequentially (the adapter is one serial link).
- `packages/core/src/obd/FaultWindowBuffer.ts` — rolling live-PID buffer;
  a window is 60 s before to 15 s after the trigger (manual, code-set,
  or out-of-range) and lands as `obd_fault_window`.
- `packages/core/src/obd/GuidedTestRunner.ts` — guided-test API for
  LM-04 / LM-34: sample PIDs for the duration, return pass / fail /
  inconclusive against the expected range, recorded as `guided_test`.
  The built-in test is hold 2,500 RPM for 30 s (STFT/LTFT, O2, MAF).
- `packages/core/src/obd/VerifyFixFlow.ts` — clear codes, drive cycle,
  rescan: monitors ready and no pending / permanent code returned,
  recorded as `verify_fix` for close-out.
- `packages/core/src/types/case.ts` — the four new ledger event types
  (`obd_scan`, `obd_fault_window`, `guided_test`, `verify_fix`) and
  `db/migrations/0003_obd_ledger_types.sql`, which extends the ledger
  type CHECK. The OBD events are also fact-eligible for memory (LM-31)
  and guided-test / verify-fix verdicts are context milestones (LM-21).
- `src/application/services/SessionService.ts` — `recordObdScan` (ledger
  + session obdCodes) and `recordObdLedgerEvent` (the three post-scan
  events); `src/app/api/session/[sessionId]/obd-scan` and `.../obd-event`
  expose them to mobile.
- `mobile/modules/obd/` — BLE UART transport over react-native-ble-plx
  (`BleObdTransport` frames replies on the `>` prompt, one command at a
  time) and `BleObdAdapter`.
- `mobile/services/MobileObdCapture.ts` — the session screen's OBD
  client: scan, 1 Hz live sampling into the fault buffer, fault window,
  guided test, verify-fix.
- `mobile/components/domain/session/ObdScanPanel.tsx` — the panel in the
  session screen footer: find adapter, scan, save fault window, guided
  test, verify-fix.

## Manual run on a real vehicle (not run in CI)

Maestro and on-device checks cannot run in this VM, so the first real-car
run is manual. Do it once per adapter model:

1. Plug the OBDLink into the OBD port, ignition on (engine off is
   enough for codes; running for live PIDs).
2. In the app, open a session on a case, tap **Find OBD adapter**, tap
   the adapter's name. Confirm the panel shows **Connected** and a live
   RPM once the engine runs.
3. Tap **Scan now**. Confirm the stored / pending / permanent codes, the
   freeze frame, Mode 06 results, readiness and VIN appear, and the
   notice says the scan was recorded in the ledger.
4. In the case ledger, confirm one `obd_scan` entry with source `OBD`.
5. Tap **Save fault window**; confirm an `obd_fault_window` entry with
   samples on both sides of now.
6. Tap **Run hold-2,500-RPM test**, hold 2,500 RPM for 30 s; confirm a
   `guided_test` entry with result pass or fail against its range.
7. Tap **Verify fix** after clearing codes and a drive cycle; confirm a
   `verify_fix` entry and that the rescan landed as a second `obd_scan`.
8. If the adapter does not appear in the scan, check the UUIDs first:
   confirm the adapter advertises the Nordic UART Service (nRF Connect
   shows it); if it uses a different UART service, pass its UUIDs to
   `BlePlxObdPeripheral` instead of changing the defaults.
