# Browser use: Muse, Grok Bot, Hermes (read 2026-11-11) -> Lemonade LM-32 (proposed)

## Meta Muse
Sources: mouse.dev "Inside Muse's browser stack" (Peter James, 2026-09-28, from the filesystem export; inferred from strings and runtime files); Meta "How We Built Safety Into Muse" (2026-09-08).
- Near-stock Chromium. An 18 MB Rust `browser-broker` with hand-rolled CDP leases a browser VM from a pre-warmed pool, separate from the agent's VM. If the lease fails, it falls back to a local browser.
- Egress profiles (default/residential) via Oxylabs, picked by user location; bot-detection outcomes measured.
- Accessibility-tree control (AxSnapshot/AxResolve/AxRead, "click ref 42"), with vision as fallback. Pipeline: resolve the element, check actionability (visible/enabled/stable), action_boundary_consent gate, dispatch, InputDispatchVerifier, click-and-watch the frame tree, mutation watermarks (with an "ambiguous" outcome).
- Persistent profiles in a slot pool. Three brokers: interactive, cron, proactivity.
- Credentials sit outside the agent cell (Sentinel), are injected at the point of need, and the agent never sees them. Approval gates for purchases. Handoff to the user fences downloads.
- Lightweight path: browser-service with Firecrawl, Perplexity, a page cache, and direct HTTP.

## xAI Grok Bot
Sources: docs.x.ai/grok-bot/computer-and-apps (updated 2026-11-09); Grok Bot security docs; Parker Rex teardown of v0.47 (2026-09-11).
- One persistent Firecracker microVM per user, shared by all of that user's Bots (browser sessions, files, credentials). Each Bot gets its own screen with one computer-use task at a time. Screens are not security boundaries.
- Apps/connectors are preferred ("more reliable than clicking"); the browser is for everything else.
- Sign-in order: Vault, then 1Password, then a Secure Form. Values are filled without the Bot seeing them. One-time codes come from connected mail or the Bot's own inbox. Handoff to the human for SSO, passkeys, CAPTCHAs, QR codes, and bank verification.
- Auto Review: an independent review model checks shell, app, computer-use, and delegation actions before they run, and can allow, require approval, or deny. Approvals from unattended work expire after about 10 minutes.
- Local Mac helper: each screenshot carries a coordinate token, and a click is refused if the window frame changed by more than 1pt ("Coordinate token is stale").
- Users can watch live and take control.

## Hermes Agent (code at cfe09695)
- One core tool, `browser_exec`, drives the Browser Use CLI harness over CDP. The backend is pluggable: local packaged Chromium, the real user profile (with consent), Lightpanda, a sandbox Chromium, or cloud (Browser Use, then Browserbase).
- `browser_url_policy.py`: cloud metadata always blocked, private IPs blocked unless the browser is local, plus a site allow/deny list (SSRF floors).
- Real-profile logins: passwords are resolved by Chrome's own autofill on the exact origin and registered with a redaction boundary, so the agent never sees them.
- Session lifecycle and supervisor modules handle dialogs and frames. Human takeover uses a lease fence.

## Lemonade takeaways
1. Cheap first: APIs and connectors, then fetch, then the browser (all three).
2. Accessibility-tree refs plus actionability checks plus verify-after-click (Muse), and stale-screenshot refusal (Grok).
3. An independent review model before any write action (Grok Auto Review), on top of our deterministic safety policy.
4. Secrets filled at the point of need, never in model context, with a redaction boundary (all three).
5. Persistent signed-in profile per shop, warm pool (Muse); separate brokers for live-case and nightly/background work.
6. Pluggable backend (Hermes): local for dev, cloud for prod.
7. SSRF/URL policy (Hermes); allowlist of the shop's portals.
8. Human takeover for SSO, CAPTCHA, or 2FA goes to the service advisor's phone, never the tech in the bay. Approvals expire.
9. Skip residential-proxy evasion; use sanctioned access and check provider terms.
