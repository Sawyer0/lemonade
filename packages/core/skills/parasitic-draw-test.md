# parasitic-draw-test

Description: Measure key-off battery drain to confirm or rule out a parasitic draw flattening the battery.
Test: parasitic-draw-test

## Use when

- The battery goes flat overnight or after a few days parked, with a healthy battery and charging system already confirmed.
- A new battery keeps dying with no lights or accessories visibly left on.
- A module or aftermarket accessory is suspected of staying awake.

## Safety

- Never crank the engine or switch on high-current loads while the multimeter is in series on its milliamp range: the surge will blow the meter fuse or damage the meter.
- Disconnect the negative battery terminal first and reconnect it last.
- Keep the keys away from the vehicle so keyless entry does not wake modules during the wait.

## Steps

1. Confirm the battery holds a charge and the alternator charges (charging system test first): a draw test on a bad battery proves nothing.
2. Close every door, the trunk, and the hood latch (latch it manually if the hood switch would keep a light on), and remove the key from range.
3. Disconnect the negative battery cable and connect a multimeter in series between the cable and the terminal, on the 10 A range first.
4. Wait 20 to 30 minutes for all modules to sleep, then read the draw. Switch to the milliamp range only once the reading is safely below that range.
5. A healthy key-off draw is typically under 50 mA. If the draw is higher, pull fuses one at a time and watch the reading: the circuit whose fuse drops the draw to normal is the suspect circuit.
6. Reinstall each fuse after its check so the final state matches the starting state.

## Pass criteria

- Key-off draw settles under 50 mA after modules sleep (or under the manual's specified value for this vehicle where it differs).
- No single fuse pull is needed to reach a normal draw.

## Record

Log a `test_result` ledger entry with the measured draw, the unit (mA), the sleep wait time in the notes, and pass, fail, or inconclusive. A fail names the suspect circuit only when a fuse pull isolated it.
