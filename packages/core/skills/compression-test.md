# compression-test

Description: Measure cranking compression per cylinder to confirm or rule out internal engine sealing loss.
Test: compression-test

## Use when

- The engine misfires, runs rough, or lacks power with fuel and spark already ruled out.
- A cylinder-specific DTC (for example P0301) persists after the ignition and fuel checks pass.
- Burning oil, coolant loss, or a suspected head gasket, valve, or ring problem needs evidence.

## Safety

- The engine will be cranked with the ignition disabled: disable fuel and spark exactly as the manual directs so no fuel sprays and no spark fires while cranking.
- Keep hands, tools, and clothing clear of belts and the cooling fan. The engine and exhaust are hot if the test follows a warm-up run.
- Crank in short bursts only; do not overheat the starter.

## Steps

1. Warm the engine to operating temperature first, unless the manual directs a cold test: warm readings are the comparable ones.
2. Remove all spark plugs so the starter cranks at full speed, and hold the throttle wide open.
3. Screw the compression gauge into the first cylinder, crank for 4 to 5 compression strokes, and record the highest reading the gauge holds.
4. Repeat for every cylinder, cranking each one the same number of strokes.
5. If one cylinder reads low, add a teaspoon of engine oil through the plug hole and retest that cylinder (wet test): a reading that rises sharply points at rings, one that stays low points at valves or the head gasket.
6. Reinstall the plugs to the manual's torque spec and reconnect fuel and ignition.

## Pass criteria

- Every cylinder reads within the manual's specified range for this engine.
- The lowest cylinder reads within 10 percent of the highest, or within the manual's maximum variation where it differs.
- A wet retest is only needed when a cylinder reads low, and its result is recorded with the dry reading.

## Record

Log a `test_result` ledger entry per low cylinder (or one entry for a full pass) with the measured pressure, the unit (psi or kPa), the per-cylinder readings in the notes, and pass, fail, or inconclusive. A fail names rings, valves, or head gasket only when the wet test isolated it.
