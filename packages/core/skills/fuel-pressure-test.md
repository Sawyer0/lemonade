# fuel-pressure-test

Description: Measure fuel rail pressure against spec to confirm or rule out the fuel delivery path.
Test: fuel-pressure-test

## Use when

- The engine cranks but does not start, starts then stalls, or hesitates under load.
- A lean DTC (for example P0171) or a fuel trim reading points at delivery rather than air or spark.
- A fuel pump, filter, or pressure regulator is suspected.

## Safety

- Fuel is flammable and under pressure. Work outdoors or in a ventilated bay, away from sparks and open flame.
- Relieve residual pressure before disconnecting a line, and catch fuel in a rag and a container, never on the floor.
- Keep a fire extinguisher within reach. Do not crank the engine with a fuel line open.

## Steps

1. Find the fuel pressure specification for this exact year, make, model, and engine in the service manual. Do not guess it.
2. Connect a fuel pressure gauge to the rail test port (Schrader valve) or tee into the feed line where the manual directs.
3. Key on, engine off: record the pressure after the pump primes, and note whether it holds or bleeds down over 5 minutes.
4. Start the engine: record idle pressure and pressure under load (snap throttle or a short road test where safe).
5. If pressure is low, pinch the return line briefly where the manual allows it: pressure rising toward spec points at the regulator, staying low points at the pump or filter.
6. Key off and watch the gauge: a fast bleed-down points at a leaking injector, regulator, or check valve.

## Pass criteria

- Key-on prime pressure and idle pressure both sit inside the manual's specified range.
- Pressure holds within spec for 5 minutes after key-off, with no fast bleed-down.
- Pressure rises under load as the manual requires, with no drop when the throttle snaps open.

## Record

Log a `test_result` ledger entry with the measured pressure, the unit (psi or kPa), the manual's specified range in the notes, and pass, fail, or inconclusive. A fail names the suspect part (pump, filter, regulator, injector) only when the pinch or bleed-down step isolated it.
