# diaglib — typed diagnostic library for the Lemonade reasoner (LM-16)

Pure standard-library Python. The reasoner writes scripts against this
library inside the sandbox instead of asking the model for one-shot JSON
(CodeAct): real computation over the car's own scan data, not guesses.

## Functions

- `lookup_dtc(code)` — SAE J2012 DTC lookup. Generic (SAE) codes get a
  description from the table; manufacturer-specific codes get
  `description=None`, exactly as in `packages/core/src/dtc`. Never invents a
  meaning.
- `decode_pid(pid, raw)` — SAE J1979 mode 01 PID decoding. Unknown PIDs and
  short payloads raise `ValueError`; the decoder never guesses a value.
- `compute_fuel_trims(samples)` — per-bank short/long-term trim means and a
  verdict (`normal`, `lean_watch`, `rich_watch`, `lean_fault`, `rich_fault`).
  Samples are mappings with `pid` (int, or a `"0x06"` hex string) and `value`
  (percent).
- `count_misfires(events)` — per-cylinder misfire counts, worst cylinder, and
  rate per minute. Events are mappings with `cylinder` (1-based) and
  `timestamp` (seconds).
- `waveform_stats(values)` — mean/min/max/sample-stdev/span of one signal
  series (an RPM trace, a throttle sweep, a fuel-trim series).

## Tests

```sh
python3 -m unittest discover -s tests
```

## Use in the sandbox

The sandbox binds this package read-only at `/diaglib` and runs reasoner
scripts with `PYTHONPATH=/diaglib` and `PYTHONDONTWRITEBYTECODE=1`, so a
script starts with `from diaglib import compute_fuel_trims` and reads its
inputs from the case workdir at `/work`.
