# Priority 1 — Knicks SportsIntel Coverage Plan

**Tier: P1** (unchanged by the 2026-09-29 reprioritization).
**Status:** Planning only. No files listed below have been modified.

## Why the Knicks are absent (root cause, not just symptom)

The Knicks are **not** missing from Home Assistant's data layer. They are
missing from one specific registry: `packages/sportsintel_detectors.yaml`
instantiates the "SportsIntel Engine Detector" blueprint once per team, as
an explicit, enumerated list — not a dynamic loop over whatever TeamTracker
sensors happen to exist. That file's own header comments (confirmed this
session's earlier research, lines 9-24) document that WVU soccer (both) and
the Mets were in exactly this same state until 2026-09-14, when they were
added the same way this plan proposes adding the Knicks: a new blueprint
instantiation block, following the existing pattern.

Everything downstream of that registry (moments aggregation, AI briefing,
guardrails, notification classification) is event-type-driven and generic
across teams — it does not need to "know about" a team in advance. It only
ever sees a team once that team has a detector instance publishing events.
**This means the fix is registration, not new capability.**

## Existing Knicks resources (confirmed live, not TeamTracker-side gaps)

- TeamTracker config entry: NBA, `team_id: 18` (confirmed in
  `.storage/core.config_entries`).
- Live sensors (confirmed via a read-only entity lookup this session):
  `sensor.ny_knicks` and `sensor.ny_knicks_display`.
- The Game Day card's `TEAMS` array in `www/gd/gd-core.js` **already**
  contains a Knicks entry:
  ```js
  { e: "sensor.ny_knicks", label: "New York Knicks", short: "Knicks", league: "NBA" },
  ```
  confirmed by reading the file directly (not just its header comment).

**Per the task's own instruction: no duplicate TeamTracker sensor is
proposed.** `sensor.ny_knicks` / `sensor.ny_knicks_display` are the sensors
to wire in.

## Every registry/mapping the Knicks need to join

| # | File | What it is | Current state for Knicks | Action needed |
|---|---|---|---|---|
| 1 | `packages/sportsintel_detectors.yaml` | Blueprint instantiation per team (the actual gate) | Absent | **Add** a new blueprint instance, mirroring the Mets or soccer additions from 2026-09-14 as the template, not an older/different pattern |
| 2 | `packages/sportsintel_moments.yaml` — interest-tier map | Hand-maintained map keyed by `team_id:league_path`, used to weight "What's Worth Knowing" significance | Absent (map is manual, not derived from the detector list) | **Add** a `18:nba` (exact league_path string to be confirmed against what TeamTracker actually reports for this entry — see Verification, below) entry |
| 3 | `packages/sportsintel_context.yaml` | Live-data enrichment (score, records, situational fields) | Generic — reads whatever `sensor.sportsintel_latest_event_by_team` contains | No change expected; verify no hardcoded team allowlist during implementation |
| 4 | `packages/sportsintel_store.yaml` | `by_team` compound-key state store | Generic, compound-keyed to avoid ESPN ID collisions | No change expected |
| 5 | `packages/sportsintel_notify.yaml` / `sportsintel_moment_notify.yaml` | Classification + dispatch | Driven by event_type/moment tier, not team | No change expected; verify no hidden team filter during implementation |
| 6 | `packages/sportsintel_prompts.yaml`, `response_guard.yaml`, `response_qa.yaml`, `response_scoring.yaml` | AI prompt templates + guardrails | Templated by event_type, sport-agnostic | No change expected |
| 7 | `packages/sportsintel_espn_football.yaml` | Direct-ESPN box-score enrichment | Explicitly `sport_path == 'football'` only | **Correctly excludes Knicks** — not a gap, don't touch |
| 8 | `packages/sports_score_display.yaml` | Dashboard score tile | Not confirmed present or absent for Knicks in prior research | **Verify** during implementation before assuming either way |
| 9 | `www/gd/gd-core.js` `TEAMS` array | Game Day card | Already present | No change needed |

## Pipeline-stage-by-stage status

| Stage | Currently covers Knicks? | Why / why not |
|---|---|---|
| Pre-game | No | Gated entirely on item #1 above — no detector, no `game_imminent` event ever fires |
| Live game | No | Same gate |
| Final | No | Same gate |
| Moment/high-leverage detection | No | `sportsintel_moments.yaml`'s aggregator loops over teams that have detector-published events; Knicks never appears in that set. Its separate interest-tier map (#2) also lacks an entry, which would still under-weight Knicks moments even after #1 is fixed |
| Briefing (AI text) | No | Never invoked — briefing is triggered by upstream events that don't exist for this team yet |
| AI handoff (provider routing) | N/A | Nothing to hand off — this stage is sport-agnostic and requires no Knicks-specific change once upstream events exist |
| Notification policy | No | Same — no events to classify |
| Dashboard payload | Partial | The Game Day card already has a Knicks slot (`TEAMS` array) reading raw TeamTracker state directly — basic score display likely already works today independent of SportsIntel; what's missing is the *moments/AI* layer on top, e.g. any Knicks row in the Team Board or "What's Worth Knowing" feed |
| Health/freshness logic | N/A today | Once Priority 3's freshness model (see `04-source-freshness-plan.md`) lands, it should apply uniformly — Knicks coverage should be additive to that model, not a special case |

## NBA-specific logic — avoiding football/baseball assumptions

**Key finding: this problem is already solved, just not yet reused.** WVU
Basketball (Men) and WVU Basketball (Women) are both already fully covered
by SportsIntel, and basketball's scoring cadence (frequent small-increment
scoring, quarters, no "drives" or "innings" concept) is exactly the same
shape as NBA scoring. The plan is to **mirror WVU Basketball's existing
significance/interest-tier configuration for the Knicks**, not football's
margin-tightening thresholds (tuned for a low-scoring, possession-heavy
sport) or baseball's inning-based structure. Concretely: whatever
significance thresholds and interest weighting the WVU Basketball Men/Women
detector instances use should be the starting values for the Knicks
instance, adjusted only for league-specific labels (NBA vs. NCAAM), not
scoring-cadence assumptions.

The direct-ESPN football enrichment package (`sportsintel_espn_football.yaml`)
is correctly scoped away from basketball already (`sport_path == 'football'`)
— no equivalent enrichment exists for basketball today for any team,
including WVU's own basketball coverage. This is consistent, not a gap
specific to the Knicks; extending box-score-level enrichment to basketball
generally is out of scope for this plan.

## Exact files and symbols expected to change

- `packages/sportsintel_detectors.yaml` — add one blueprint instantiation
  block (new automation entity, name pattern to match existing entries,
  e.g. `automation.sportsintel_detector_knicks`).
- `packages/sportsintel_moments.yaml` — add one entry to the interest-tier
  map dict (a data change inside an existing template, not new automation
  logic).

No other package file is expected to require an edit. This is deliberately
a two-file, additive-only change.

## Entity IDs, services, events, and automations impacted

- **Entities read**: `sensor.ny_knicks`, `sensor.ny_knicks_display` (no new
  entities created for TeamTracker).
- **Entities created**: one new automation entity from the blueprint
  instantiation (exact `entity_id` determined by the blueprint's naming
  convention, consistent with the other 8 instances — not invented here).
- **Events**: the same `sportsintel.engine.event.v1` / `.moment.v1` /
  `.ai_brief.v1` / `.quality.v1` bus already used by every other team; no
  new event type.
- **Automations/scripts unaffected**: the existing "Knicks Game Day –
  Tipoff/Score Flash/Final Result" lighting automations (a separate,
  older-generation system per the assessment, §9/§11) are untouched by
  this plan — they operate independently of SportsIntel today and will
  continue to.

## Non-invasive test strategy

1. **Static validation only, first**: YAML syntax and blueprint-schema
   validation of the new detector block before any reload, exactly as
   CLAUDE.md's standing rule requires (config check before reload).
2. **Reload the automation domain only** (not a full HA restart), then
   confirm — via read-only state inspection, not by waiting for a real
   game — that `sensor.sportsintel_latest_event_by_team`'s attributes gain
   a Knicks key with `source_status` (see Priority 3) reflecting whatever
   TeamTracker currently reports (PRE/IN/POST), with no notification sent
   yet (this alone proves the registration worked without touching
   anyone's phone).
3. **Dry-run notification behavior**: if `input_boolean.sportsintel_
   notification_test_mode` is confirmed on (see `05-open-question-
   verification-plan.md`) during the test window, a real Knicks event can
   be allowed to flow through the classifier/dispatcher without an actual
   push, mirroring the pattern already used elsewhere in this system.
4. **Real-game observation, last**: the only way to confirm end-to-end
   correctness (moment significance tiering feels right for NBA pacing,
   AI brief text reads sensibly) is watching one real Knicks game and
   comparing behavior against WVU Basketball's known-good behavior for a
   comparable game state — analogous to the "observation mode" pattern
   already used elsewhere in this project for validating a production
   change against real traffic before declaring it done.

## Rollback criteria and procedure

**Trigger rollback if**: the new detector instance produces malformed
events (breaks the moments aggregator for *other* teams, since it's a
shared aggregator), floods notifications beyond the classifier's intended
tiering, or the interest-tier map change causes incorrect weighting for an
unrelated team due to a key collision.

**Procedure**: because the change is additive-only (one new blueprint
instance, one new map entry), rollback is a straight revert of those two
edits — remove the blueprint instantiation block and the map entry. No
other file's logic is touched, so no other team's behavior needs
independent verification after rollback beyond confirming the aggregator
still runs (which it will, since it already tolerates teams coming and
going from the map as a `dict.get()`-style lookup, not a hard-coded list —
to be confirmed against the actual template during implementation, not
assumed here).
