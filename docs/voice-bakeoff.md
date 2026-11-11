# LM-40: Noisy-shop voice bake-off

We pick the production voice before the Nov 17, 2026 cutoff based on
shop-floor evidence, not vendor benchmarks. The fixture set doubles as the
regression gate for every future model swap: re-run the bake-off, compare
the new table with the last one.

## Providers

The three LM-39 providers, same LiveKit setup and same prompts for all
three. The default is **gemini** until Dawan signs off a change — no repo
change to production config until the results are reviewed (issue #42).

| Provider | Model | Video |
| --- | --- | --- |
| `gemini` | Gemini 3.8 Live | Native video track |
| `grok` | Grok Voice 3.0 | Snapshots |
| `cascade` | Deepgram STT + Gemini Flash + Cartesia TTS | Snapshots |

## Test set

`agent/test/bakeoff/` holds 30 scripted turns (`turns.json`): codes read
aloud, VINs, part numbers, readings, the same turns mixed with recorded
shop noise, interruptions mid-answer, a guided-test exchange that calls
tools, and three vision turns. `fixtures.ts` validates the set with zod;
`noise-beds.json` defines the four beds; `cost-rates.json` holds the vendor
rates used to price a run.

### Recording the assets (not committed)

Noise beds and video clips are recorded in a real shop, not committed:

- Noise: 10–30 second loops, 16 kHz mono WAV, in
  `agent/test/bakeoff/noise/<bed-id>.wav` — `impact-gun`, `compressor`,
  `engine-idle`, `radio`. Stand a phone or field recorder where the tech
  stands, 1–2 m from the noise source, no talking. Convert with
  `ffmpeg -i in.m4a -ac 1 -ar 16000 noise/<id>.wav`. `bedGainDb` is the
  bed's level relative to the prompt speech; calibrate by ear once, in the
  shop, and record the value in `noise-beds.json`.
- Vision: three short clips, with a still from each in
  `agent/test/bakeoff/clips/<still>` — `oil-leak.jpg`, `coolant-leak.jpg`,
  `belt-wear.jpg`. The runner sends the still over the data channel; the
  `.mp4` files are for a human to check what the still shows.

A turn whose bed or clip file is missing is skipped with status
`missing-asset` — never scored on silence.

## How to run (one command)

```sh
# From the repo root. Needs LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
# GOOGLE_API_KEY (to synthesise the prompts), plus the provider's keys:
#   gemini:   GOOGLE_API_KEY
#   grok:     XAI_API_KEY
#   cascade:  GOOGLE_API_KEY, DEEPGRAM_API_KEY, CARTESIA_API_KEY
npm --workspace agent run bakeoff -- --provider gemini
npm --workspace agent run bakeoff -- --provider grok --turns T01,T09,T15
npm --workspace agent run bakeoff -- --provider cascade --dry-run
```

`--dry-run` validates fixtures, environment, and assets without joining a
room. A full run speaks all 30 turns in real time (roughly 15–30 minutes)
and writes `agent/test/bakeoff/results/<provider>-<timestamp>.{json,md}`.
The bake-off is an on-demand live suite, not part of CI, and costs about
$11 of API spend for all three providers (see `cost-rates.json` — verify
the rates against the vendor pricing pages before a scored run; Gemini
Live re-bills the whole session context on every turn, so the meter
understates a long session and the table reports session length with it).

## Scoring

`scorer.ts` scores recorded observations; it has unit tests on known
transcripts (`scorer.test.ts`) and never needs a live room.

1. **Hears it right (weighted highest):** exact-match accuracy on codes,
   VINs, and numbers. Spoken digits count — "P zero one seven one"
   matches `P0171` — but a shorter number inside a longer one does not
   ("45" is not a hearing of "0.45"). Reported overall, clean vs noisy,
   and per category. A misheard code poisons the ledger, so this is the
   deciding metric.
2. **Speed:** time to first audio (p50/p95) and how fast it stops after an
   interruption (p50). Interrupt stop is measured from the end of the
   interrupt phrase to the last audible agent audio; a fresh reply to the
   interrupt counts against it.
3. **Tool calls:** correct name and arguments (observed on the room's
   `capture_visual_burst` data channel), and whether the agent kept
   talking while the tool ran.
4. **Audio quality:** crackles (clipped or spiking frames) and dropouts
   (silent gaps over 150 ms mid-utterance). Both are heuristics for a
   human to confirm from the recording, not a calibrated measurement.
5. **Cost** per 10-minute session, from measured usage and
   `cost-rates.json`.

## Results

No scored run yet — the tables below are filled in when the first run
lands. Do not pick a production provider from vendor benchmarks.

| Provider | Hears it right | Hears it right (noisy) | TTFA p50 | TTFA p95 | Stops after interrupt p50 | Tool calls | Crackles | Dropouts | Cost / 10 min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gemini | — | — | — | — | — | — | — | — | — |
| grok | — | — | — | — | — | — | — | — | — |
| cascade | — | — | — | — | — | — | — | — | — |

**Default provider:** gemini (unchanged). Chosen with Dawan's sign-off
after the results above are reviewed — not yet.
