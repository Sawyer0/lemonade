# Memory scopes (LM-31)

Memory fills itself from the work. Users configure nothing: no skills, soul
files, or slash commands. There are four scopes, each with an explicit owner.

## Scopes

| Scope | Owner | Key | Injected at session start |
| --- | --- | --- | --- |
| Tech profile | Shop account | shop + tech | About 1.5k chars: skill level, units, tools on hand, detail preference. Frozen for the session. |
| Vehicle record | The shop | shop + VIN | About 2k chars: known mods, prior fixes, quirks. The full ledger is fetched on demand. |
| Shop | The shop | shop | Business settings set once by the owner on the web: labor rate, suppliers. Diagnostic knowledge is learned only through LM-23. |
| Global priors | Later, behind a flag | — | Only anonymized aggregates from shops that opt in. No VINs, no customer data. |

The same VIN at another shop sees nothing: the vehicle record is keyed by
shop + VIN, and Firestore rules enforce it per shop.

## Write rules

- Memory writes come only from ledger events. The ledger event list is
  LM-01's canonical schema (`packages/core/src/types/case.ts`, re-exported
  by `packages/core/src/types/memory.ts`): `vin_decoded`, `dtc_read`,
  `observation`, `frame_captured`, `test_result`, `hypothesis`,
  `safety_stop`, `outcome`, `correction`.
- Profiles update at case close, never mid-case.
- Voice confirmation ("Want me to remember you have a smoke machine?") saves
  a tech-profile fact. "Forget that" / "that's wrong", spoken or in the app,
  deletes or corrects the fact and logs the change.
- A model-sourced claim never becomes a vehicle fact. Vehicle facts are
  claims citing source ledger event ids with a `supersedes_claim_id`, so a
  replaced fact is superseded rather than left standing. At case close, a
  candidate that names the claim it replaces supersedes it.
- An hourly verifier re-checks new vehicle facts against ledger evidence and
  flags orphans (missing or model-sourced evidence). The verifier itself
  ships here; the hourly job that runs it does not yet (see "Not wired yet").
- The shop can export a case report or full history for the customer (LM-06,
  LM-09). An export contains only that vehicle's cases at that shop.

## Nightly case review ("dream")

Runs per tech and per shop over the day's closed cases. Every output is
stamped `authority: reflection_only`; the validator rejects any other value,
and rejects any payload carrying vehicle facts, a diagnosis, or a
probability, at any depth. A reflection output may shape tone and next-test
ordering, never a vehicle fact, a diagnosis, or a probability. Enforcement
is structural: no write path accepts a reflection output, and the validator
is the gate before anything is persisted from one.

- Telemetry first: cases reviewed, overrides, corrections. The
  override/correction rate is recorded as telemetry, never used to gate or
  tune. An "override" here is a tech-sourced `correction` event: LM-01 has
  no distinct override event type, so the rates are the share of reviewed
  cases with at least one override/correction (`overrideRate`,
  `correctionRate`), counted per case, never per event.
- Before writing, the review checks existing vehicle claims against ledger
  evidence and retires orphans (cited event missing, model-sourced, or of
  a type that may never source a fact). It does not detect content
  contradictions: a claim citing a real event whose text disagrees with
  that event is not flagged. That needs a judge and is not implemented.
  Checking tech notes against session transcripts is not implemented yet:
  it needs transcripts as an input, which arrive with the ledger (LM-01).
- Each run writes a new candidate memory version with a diff against the
  last when the caller supplies a version id; the previous version is kept
  for rollback. The ledger is never edited.
- A missed or failed night raises an alert object with a retry count. No job
  executes the retry yet (see "Not wired yet").
- Over-budget input is trimmed with a covered-until marker instead of failing.

## Playbook

- Never capture an unconfirmed fix (no retest/outcome), a negative
  tool/scanner claim, a shop setup problem, a one-off case narrative, or case
  numbers or customer details as content. Capture trusts the caller's
  `confirmedByRepair` and `kind` labels: it cannot verify them against the
  ledger. Verification happens where candidates are accepted: the nightly
  review gates candidates on a confirmed outcome event in the ledger, and
  the outcome must come from a case the candidate cites.
- One rule per lesson with a one-clause why, attached to the diagnostic step
  it affects. The same lesson twice strengthens the entry in place, never
  appends it twice. Strengthening a stale entry returns it to active;
  archived entries still need an explicit restore. A wrong entry gets its
  sentence edited, never an "UPDATE:" underneath.
- Candidates promote only through confirmed repairs (LM-23).
- Lifecycle tracks last-used and hit counts: unused 90 days goes stale (not
  injected), 180 days goes archived, never deleted, always recoverable.
  Shop-owner-pinned entries never transition.
- Model consolidation only with versioning and rollback.

## Shop make/model wiki

One page per vehicle family, built only from confirmed repairs, quoting
ledger entries verbatim and linking back to cases. A size check flags any
page that grows past its sources. Cadence follows change: open concerns and
mileage-dependent items nightly, fixed specs rarely. The page builder
trusts its caller to supply confirmed repairs: it validates shape and
quotes, not ledger truth. Verifying quotes against the ledger belongs to
the LM-01 adapter.

## Code

- `packages/core/src/memory/` — scopes, write policy, session injection,
  verifier, reflection, versions, playbook, wiki, export, scheduler, global
  priors. `packages/core/src/interfaces/IMemoryScopeStore.ts` — the store
  ports; `packages/core/src/memory/memoryStore.ts` is the in-memory
  reference implementation for tests. No Firestore adapter ships in this
  issue.
- `packages/core/src/memory/memoryTags.ts` — Supermemory tags gain a `shop`
  tag; `DiagnosisMemoryWriter` takes an optional shop scope and tags the
  diagnostic log `shop:<id>` / `vin:<vin>`. The log is marked
  `ledger-grounded` only when the caller cites ledger event ids; the writer
  cannot verify the ids until the LM-01 adapter lands, and the
  embedding/vector-store write stays collective: shop scoping applies to
  the memory document, not to the embedding surface. The writer persists
  diagnostic logs, never vehicle facts.
- `firestore.rules` — `shops/{shopId}` with `members/{uid}` (role owner or
  tech), `vehicleRecords/{vin}`, `techProfiles/{techId}`, `settings/{docId}`,
  `playbook/{entryId}`, `wiki/{family}`. Vehicle records, tech profiles,
  playbook entries, and wiki pages are never deleted; claims are superseded
  or retired, entries go stale or archived. Playbook entries carry their
  `entryId` and wiki pages their `family`, both checked against the path.
  The rules enforce shop scoping, not the write policy: they cannot read
  the ledger, so a member writing directly can bypass the core policy. A
  tech writes only their own profile; the owner may write any profile in
  the shop.
- Tunable limits live in `SHARED_CONFIG.MEMORY`
  (`packages/core/src/config/index.ts`).

## Not wired yet (follow-ups)

This issue ships the policy library, the rules, and the tests — not a
working feature end to end. Nothing calls the new policy code outside its
own tests yet. Follow-up work owns: a Firestore adapter for
`IMemoryScopeStore`; the session-injection call site; the case-close hook;
the nightly job and the hourly verifier schedule (including executing
retries, not just raising alert objects); and the transcript/tech-note
check in the nightly review once transcripts exist (LM-01). Global priors
have no per-shop opt-in record yet: the flag is global, and the schema
floor (at least 2 shops, at least 5 cases) is the only guard — the
free-text aggregate fields cannot stop identifying content. An opt-in
store belongs to the follow-up work. Until that lands, the issue's
Done-when list is verified at unit level only.
