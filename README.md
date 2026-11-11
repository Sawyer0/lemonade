# Lemonade

AI vehicle diagnostics: a driver or technician describes a problem in chat (or shows it on a phone camera) and
Lemonade answers like a master mechanic, grounded in the vehicle's NHTSA recalls, past sessions and web sources.

Car problems are expensive to misread and some are dangerous to touch. Lemonade's design rule is _safety first,
accuracy second, speed third_: every message passes a deterministic hazard check before any model sees it, then a
model-based safety check, and only then reaches the diagnostic assistant.

## Architecture

```
src/            Next.js 16 web app (App Router): pages, API routes, application services, DI wiring
packages/core   Domain types (Zod), service interfaces, prompts and the XState diagnostic state machine
packages/infrastructure
                Adapters: Vertex AI / Gemini, Groq, Firestore, NHTSA, Google Search, Supermemory, usage billing,
                edge auth + rate limiting, LangSmith tracing
functions/      Firebase Cloud Functions: video analysis on upload, Stripe checkout and webhook
mobile/         Expo / React Native app: camera, VIN scanner, live mechanic over LiveKit, on-device llama.rn
                triage, Ray-Ban Meta glasses
agent/          LiveKit voice agent (the live Master Tech) and its room token server
```

Dependencies point inward: apps depend on `core` interfaces, and only `infrastructure` talks to vendors.

```
 web (src/)   functions/   agent/   mobile/          entry points: routes, triggers, worker, screens
      \           |          /         |
       +---- packages/infrastructure    |            adapters + Inversify bindings (bindAiProviders)
       |     Vertex | Groq | offline    |            LLM_PROVIDER picks the model adapters
       |     Firestore, NHTSA, search   |
       v                                v
            packages/core                            domain types, ports (I*Service), XState machine
```

Request flow for chat (`POST /api/chat`, streamed as NDJSON):

1. **Middleware** (`src/middleware.ts`) verifies the Firebase ID token, applies Upstash rate limits and Pro-tier gates,
   and seals the user identity into HMAC-signed headers. Route rules live in `src/infrastructure/security/routeAccess.ts`.
   The HMAC key is `SECURITY_INTERNAL_SECRET`: production requires 32+ random characters and the server refuses to
   start without it (`src/instrumentation.ts`); development falls back to a fixed dev-only key, and
   `DEV_BYPASS_SECRET` is ignored in production.
2. **System 0, reactive safety** (`ReactiveSafetyService`): regex rules for fuel leaks, battery fires, high-voltage
   parts and working under an unsupported car. Hand-written rules run first, then 35 generated rules; observation
   verbs ("I see orange cables") are allowed through. A match returns a fixed safety message and no model is called.
3. **System 1, semantic safety** (`SafetyMonitor`): an LLM rates the message and fails closed if the check errors.
4. **Chat** (`ChatService`): prunes history to a token budget (summarising older turns), streams the assistant reply
   and stores both turns on the session.

Deeper diagnosis runs through `mechanicMachine` (XState): gather recalls, history and similar cases → form a
hypothesis → search and fact-check it in parallel → check uploaded video → synthesise.

Services are bound in an Inversify container (`src/infrastructure/di/container.ts`) against interfaces from
`packages/core`. The chat and safety models sit behind `IChatAssistantAI` / `ISafetyAI`: Vertex AI (Gemini) by
default, Groq's OpenAI-compatible API with `LLM_PROVIDER=groq`, or scripted replies with `LLM_PROVIDER=offline`
(no network, used by the demo and the smoke test). The web app, Cloud Functions and the agent all bind models
through the same `bindAiProviders`, so the upload trigger and the live agent use the same media port as the web app.

## Quick start

Requires Node.js 22 and npm 10.

```bash
npm ci
npm run demo
```

`npm run demo` needs no accounts or keys. It runs the real `ChatService`, both safety gates and the chat adapter
against in-memory storage with scripted model replies:

```text
$ npm run demo
Lemonade chat demo (offline model)

> My 2015 Civic squeals when I brake, mostly in the morning. What should I check?
Morning-only squeal that fades after a few stops is usually surface rust on the rotors or glazed pads. Check pad thickness through the wheel spokes (replace under 3 mm) and look for a lip on the rotor edge.

> I smell gas leaking under the hood, can I keep driving to work?
CRITICAL SAFETY STOP: Fuel leak detected. Extinguish all smoking materials, do not use electronic devices near the vehicle, and evacuate the area immediately.

Session now holds 4 messages.
```

The first answer is the scripted offline reply; the second comes from the System 0 regex gate, which stops the
request before any model is called. For live model answers, get a free key at
[console.groq.com/keys](https://console.groq.com/keys), put it in `.env.local` and run `npm run demo -- --groq`:

```bash
cp .env.example .env.local   # then set GROQ_API_KEY
npm run demo -- --groq
```

### Running the full app

The web app needs a Firebase project (Authentication with Google sign-in, Firestore, Storage) and, for the default
provider, Vertex AI on the same Google Cloud project. Fill in `.env.local` from `.env.example`, then:

```bash
npm run dev                          # http://localhost:3000
firebase deploy --only firestore:rules,storage,functions
```

Set `LLM_PROVIDER=groq` with `GROQ_API_KEY` to run chat and safety checks on Groq instead of Vertex AI.

The mobile app is in `mobile/`. It uses native modules (LiveKit, VisionCamera, llama.rn), so it runs as a
development build, not in Expo Go.

#### iOS development build on your own iPhone (free Apple ID)

Needs a Mac with Xcode, an iPhone on a cable and an Apple ID; no paid developer account.

1. In Xcode, open **Settings → Accounts** and add your Apple ID. Xcode creates a free "Personal Team".
2. Generate the native project and build to the phone:

    ```bash
    cd mobile
    npx expo prebuild --platform ios     # writes mobile/ios (git-ignored)
    npx expo run:ios --device            # pick your iPhone from the list
    ```

3. If signing fails, open `mobile/ios/*.xcworkspace`, select the app target → **Signing & Capabilities**, choose
   your Personal Team and, if Xcode says the identifier is taken, change the bundle identifier (for example
   `com.<you>.lemonade`) here and in `mobile/app.json`.
4. On the phone, trust the certificate under **Settings → General → VPN & Device Management**, and turn on
   **Developer Mode** (Settings → Privacy & Security) when iOS asks.

Free-account builds expire after 7 days: run `npx expo run:ios --device` again to re-sign and reinstall. Free teams
also cannot use paid-only capabilities such as push notifications.

For Android, `npx expo run:android` from `mobile/` builds and installs on a connected device or emulator.

#### Ray-Ban Meta glasses

`mobile/modules/meta-wearables` wraps Meta's
[Wearables Device Access Toolkit](https://github.com/facebook/meta-wearables-dat-android) (Maven Central,
`com.meta.wearable:mwdat-*`) for Android: registration through the Meta AI app, the camera permission, a stream
from the glasses and in-stream photo capture. Developer Mode in the Meta AI app works with the default `0`
attestation values; for release builds set `META_WEARABLES_APPLICATION_ID` and `META_WEARABLES_CLIENT_TOKEN`
from the Wearables Developer Center before `expo prebuild`. There is no iOS implementation yet, so on iOS the
glasses screen reports the module as unavailable.

### Live voice agent

`agent/` runs the live Master Tech that the mobile app calls during a camera session. It is a
[LiveKit Agents](https://docs.livekit.io/agents/) 1.0 worker built on `AgentSession`:

- **Voice port** (`agent/src/voice/voice.ts`): Gemini Live (`gemini-2.5-flash-native-audio-preview`) listens and
  answers in its own native audio voice by default. Set `RESEMBLE_API_KEY` (and optionally `RESEMBLE_VOICE_UUID`)
  to have Gemini reply in text and Resemble speak it instead.
- **Data channel** (`LiveChannelTopic` in `packages/core`): the phone sends typed messages, proactive pings from
  on-device triage and camera frames; `LiveChannelRouter` validates each packet with Zod and routes it.
  `BurstAnalyzer` sends complex systems (ABS, hybrid, transmission, ECU, airbags) through the full reasoning
  service and everything else through fast live-frame analysis.
- **Token server** (`agent/src/index.ts`): `POST /livekit-agent/get-livekit-token` verifies the Firebase ID token
  and issues a room token whose identity is the user's uid.

```bash
npm --workspace agent run dev       # token server on :3001 + agent worker (LiveKit dev mode)
npm --workspace agent run worker    # agent worker only
```

It needs `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and `GOOGLE_API_KEY`. Outside production the
LiveKit settings fall back to the `livekit-server --dev` defaults; in production the agent refuses to start without
them. Frame analysis additionally uses the Vertex AI and Firestore settings of the web app.

## Testing

```bash
npm run lint           # ESLint, zero warnings allowed
npm run format:check   # Prettier
npm run typecheck      # tsc, strict mode (web + packages)
npm run typecheck:mobile
npm run typecheck:agent
npm run typecheck:functions
npm test               # Vitest: web app, packages, Cloud Functions and agent
npm run test:coverage  # the same, with a v8 coverage report in coverage/
npm run test:mobile    # Jest: mobile app
npm --workspace mobile run test:plugins   # Expo config plugins
npm run build          # Next.js production build
```

Unit tests use fakes for every model and cloud service. Notable suites: the Cloud Functions video pipeline and
Stripe webhook (`functions/src/__tests__`), and the agent worker entry started against a fake LiveKit room and
voice providers (`agent/test/worker.test.ts`). Tests that call Vertex AI or write to a real Firestore project run
only with `RUN_LIVE_CLOUD_TESTS=true` and credentials in `.env.local`.

### Smoke test

`npm run test:smoke` boots the production build (`next start`) against the Firebase Auth and Firestore emulators,
the offline model provider and a local NHTSA fixture server, then exercises pages, auth rejections, the garage,
VIN scan, recalls, sessions, streamed chat and the safety gate over HTTP:

```bash
npm run build
npx firebase-tools@14 emulators:exec --only auth,firestore --project demo-lemonade "npm run test:smoke"
```

The emulators need Java 21.

### Browser e2e against the emulators

Building with `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` points the web Firebase SDK (Auth, Firestore, Storage) at the
local emulators on `127.0.0.1` (override the host with `NEXT_PUBLIC_FIREBASE_EMULATOR_HOST`). Never set it for a
deployed build. `playwright.emulators.config.ts` then signs in through the real login form and walks the garage,
service history and diagnosis screens with seeded fake data:

```bash
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-lemonade npm run build
npx firebase-tools@14 emulators:exec --only auth,firestore --project demo-lemonade \
  "npx playwright test -c playwright.emulators.config.ts"
```

### Live voice agent test

`agent/test/live/voiceAgent.live.test.ts` starts the agent worker, joins a fresh LiveKit room as a test participant,
speaks a question (synthesised with Gemini TTS) and asserts that the agent answers with audio and a transcript. It
is skipped unless the LiveKit and Google keys are set:

```bash
LIVEKIT_URL=wss://... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... GOOGLE_API_KEY=... \
  npm --workspace agent run test:live    # sets RUN_LIVE_AGENT_TESTS=true
```

In GitHub it runs only on demand: add those four as repository secrets and start **Live agent e2e**
(`.github/workflows/live-agent.yml`) from the Actions tab.

### CI

`.github/workflows/ci.yml` runs on every pull request:

- **checks**: lint, format, all four typechecks, Vitest with coverage (summary on the run page), mobile Jest and
  config-plugin tests, the Cloud Functions build plus a load of the compiled entry, and the Next.js build
- **smoke**: the smoke test above
- **mobile bundle (ios, android)**: `npx expo export` for each platform
- **android module**: `expo prebuild` and a Gradle compile of the Meta Wearables module

## API routes

| Route                                       | Method     | Purpose                                               |
| ------------------------------------------- | ---------- | ----------------------------------------------------- |
| `/api/chat`                                 | POST       | Streamed chat reply behind both safety gates          |
| `/api/chat/message`                         | POST       | Non-streamed chat reply                               |
| `/api/session`                              | GET, POST  | List or start diagnostic sessions                     |
| `/api/session/[sessionId]`                  | GET        | Read a session                                        |
| `/api/session/[sessionId]/summarize`        | POST       | Summarise a session                                   |
| `/api/session/token`                        | GET        | LiveKit room token (Pro)                              |
| `/api/vehicles`                             | GET        | List the user's vehicles                              |
| `/api/vehicles/scan`                        | POST       | Decode a VIN via NHTSA and add the vehicle            |
| `/api/nhtsa/recalls`                        | GET        | NHTSA recalls by year, make and model                 |
| `/api/upload/sign`                          | POST       | Signed URL for direct upload to Cloud Storage         |
| `/api/analysis/trigger`                     | POST       | Start video analysis (Pro)                            |
| `/api/stripe/portal`                        | POST       | Stripe billing portal                                 |
| `/api/profile`                              | GET, PATCH | Read or update the user profile                       |
| `/api/search`, `/api/memory`, `/api/vector` | POST       | Web search, long-term memory and similar-case lookups |

## License

Copyright 2026 Dawan Sawyer. Licensed under the [Apache License 2.0](LICENSE).
