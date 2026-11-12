# Meta Muse memory + dreaming (read 2026-11-11) -> Lemonade

## Sources
- Liang Gou, "How Muse Remembers" (2026-11-01): https://lianggou.github.io/2026/11/01/how-muse-remembers.html
- Kevin Hermes summarizing the Peter James filesystem export (2026-09-25): https://www.kevinhermes.com/meta-muse-filesystem-export/

## Muse
- Stores are Markdown files: SOUL, USER, MEMORY (curated), dated daily logs, people/group pages, a system-maintained memory bank whose claims cite source lines, and an alignment synthesis.
- Index is Postgres with 384-dim embeddings. Search locates a file and line; the agent then reads the original before relying on it.
- Writes: save before reply, then background consolidation. An hourly job cross-checks new claims against the original messages. `supersedes_claim_id` replaces old beliefs in place.
- Dream: runs 1-3x a day as the "alignment" objective over a bounded window. It writes dreams/YYYY-MM-DD.md (telemetry: rupture turns, correction-free rate, then who the user is, what is alive, where it fell short), ALIGNMENT_STATE.yaml, REPAIR_THREADS.yaml (labels + message ids only), PROGRESSION_HISTORY.yaml (graded on correction-free rate), and ALIGNMENT_SYNTHESIS.md, which is injected into every conversation.
- Gaps (Gou): dream output carries no authority label; nothing structurally stops a dream from being promoted to memory; admission is by prompt, not quote-bound; a missed night is silent.

## Lemonade mapping (proposed)
- Vehicle facts become claims: source ledger event id(s), supersedes id. Admission only from technician-confirmed or measured evidence.
- Hourly verifier: re-check new vehicle facts against ledger evidence and flag orphans.
- Nightly case review ("dream") per tech and per shop: re-read the day's closed cases and write a tech working-style synthesis plus playbook candidates. Stamped reflection_only: it can shape tone and next-test ordering, but it never becomes a vehicle fact or a diagnosis. Graded on tech override/correction rate. Missed runs alert. Playbook entries promote only via confirmed repairs (LM-23).

# Anthropic "dreaming" (read 2026-11-11)
Sources: Anthropic research post "The components of agent memory" (Lance Martin, 2026-11-06), https://www.anthropic.com/research/components-of-agent-memory ; cookbook "Dreaming with a dynamic workflow" (2026-11-02). Dreams have been a Managed Agents research preview since May 2026.
- Memory hierarchy: transcripts -> notes -> representations (wikis) -> injected context. Dreaming runs offline between sessions over the store plus 1-100 transcripts and writes a reorganized NEW store; the input store is untouched.
- What a dream does: corrects notes against transcripts (Pokemon Mt. Moon note fixed -> reached Cerulean); builds wikis (Stainless corpus: 13%->48% with the wiki alone; 54%->61% with search, about 20k fewer tokens per question; best when questions span several documents; one wiki ballooned to 1.77x its corpus); promotes a small top layer (Claude Code loads the first 200 lines / 25KB of MEMORY.md); fills gaps across sessions.
- Steering: say what memory is for, not how; a "record only failures" rule cut Opus 5's memory gain by 0.234. Dream instructions were improved by a reflect-on-failures loop: one agent per contract, quoting terms verbatim, took the brief from 72% to 100%.
- Open questions they list: cadence, focusing on facts likely to change, compute cost.
Lemonade takeaways: the nightly review writes a versioned candidate store (diff plus rollback) and never touches the ledger; verify claims against session transcripts and the ledger; a per-shop make/model wiki built only from confirmed repairs, one page per vehicle family, quoting the ledger verbatim; keep the injected layer tiny; dream more on facts that change (mileage, open concerns) and less on fixed specs.

# Hermes Agent self-improvement (code read at cfe09695, 2026-11-11)
- agent/background_review.py: after a turn, a daemon thread forks the agent onto the conversation snapshot every N turns (memory nudge_interval 10, skills creation_nudge_interval 10). It writes straight to the memory stores (MEMORY.md 2200 chars, USER.md 1375 chars) and the skill library via a tool whitelist. The skill prompt says "Be ACTIVE — most sessions produce at least one skill update". The main session cache is untouched.
- The do-not-capture list is worth stealing: environment failures, negative tool claims, transient errors, one-off narratives, and unresolved failures dressed up as workflows. Fix skills in place, one rule per lesson, procedure first.
- agent/curator.py: runs on inactivity (every 7 days, after 2h idle). Lifecycle: stale at 14d, archive at 30d, never delete, pinned skills exempt. LLM consolidation is opt-in (default off); backups in curator_backup.py.
- Difference vs Claude dreaming and Muse: Hermes learns HOW to do tasks (procedures) in-session and writes directly, with no transcript ground-truth check and no versioned store. Claude dreaming corrects facts against transcripts and writes a new store. Muse's dream models the relationship (alignment synthesis).
- Lemonade: playbook = Hermes skills, but promoted only by confirmed repair. Borrow the do-not-capture list and the curator lifecycle (stale/archive, never delete, pin) for playbook entries.
