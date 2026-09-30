# October 2–3 WVU Observation Runbook (read-only)

**Status:** Observation runbook only. Nothing in this document authorizes any
change to the live system. Change freeze is in effect for the entire
observation period — see `docs/assessment/october_3_wvu_observation_runbook.md`'s
parent request for the exact freeze terms; summarized again at the end of
this file.

**Authoritative timeline:** local time (America/New_York, EDT) is the
operational reference for this runbook. UTC is included alongside every
local time for correlating with Home Assistant/API logs and entity
`last_updated`/`last_reported` timestamps, which are UTC. **These are two
separate observation windows, a day apart — not one simultaneous test.**

---

## Window 1 — Thursday, October 2, 2026 (evening)

**WVU Women's Soccer at Houston**
**Scheduled local start: 8:00 PM EDT, Thu Oct 2** · **Scheduled UTC start: 2026-10-03 00:00Z**

**Purpose:** validate the women's-soccer fallback/source path and its full
PRE → IN → POST lifecycle in isolation, with no other WVU sport active
concurrently.

## Window 2 — Saturday, October 3, 2026 (midday into evening)

**WVU Football at Iowa State**
**Scheduled local start: 12:00 PM EDT, Sat Oct 3** · **Scheduled UTC start: 2026-10-03 16:00Z**

**WVU Men's Soccer vs. South Carolina**
**Scheduled local start: 7:00 PM EDT, Sat Oct 3** · **Scheduled UTC start: 2026-10-03 23:00Z**

**Purpose:** validate same-day multi-sport behavior — state cleanup between
events, dashboard prioritization, notification deduplication, and any
late-football/postgame overlap with men's-soccer pregame or live handling.
Football (noon) should be fully resolved to `POST` roughly 3–4 hours before
men's soccer's 7:00 PM kickoff under normal game length, but this is not
guaranteed (delays, overtime) — see the explicit overlap checks below.

---

## 1. Event inventory

| Field | WVU Women's Soccer (Thu) | WVU Football (Sat) | WVU Men's Soccer (Sat) |
|---|---|---|---|
| Team/sport | WVU Women's Soccer | WVU Football | WVU Men's Soccer |
| Primary sensor | `sensor.wvu_soccer` | `sensor.wvu_football` | `sensor.wvu_soccer_men` |
| Fallback sensor | `sensor.wvu_soccer_fallback` | — (none; football has no fallback package) | `sensor.wvu_soccer_men_fallback` |
| Data source path | TeamTracker (ESPN, `usa.ncaa.w.1`) + custom `espn_schedule` fallback | TeamTracker (ESPN, `college-football`) only | TeamTracker (ESPN, `usa.ncaa.m.1`) + custom `espn_schedule` fallback |
| Team/league key | `20382:usa.ncaa.w.1` | `277:college-football` | `5658:usa.ncaa.m.1` |
| Scheduled start (local) | **Thu Oct 2, 8:00 PM EDT** | **Sat Oct 3, 12:00 PM EDT** | **Sat Oct 3, 7:00 PM EDT** |
| Scheduled start (UTC) | **2026-10-03 00:00Z** | **2026-10-03 16:00Z** | **2026-10-03 23:00Z** |
| Detector automation | `automation.sportsintel_detector_wvu_women_s_soccer` | `automation.sportsintel_detector_wvu_football` | `automation.sportsintel_detector_wvu_men_s_soccer` |
| Moment/status consumers | `sensor.sportsintel_team_status_moments`, `sensor.sportsintel_moments`, `sensor.sportsintel_latest_event_by_team`, `sensor.sportsintel_rankings` (currently ranked #10) | `sensor.sportsintel_team_status_moments`, `sensor.sportsintel_moments`, `sensor.sportsintel_latest_event_by_team`, `sensor.sportsintel_espn_football` (direct-ESPN enrichment, football-only) | `sensor.sportsintel_team_status_moments`, `sensor.sportsintel_moments`, `sensor.sportsintel_latest_event_by_team`, `sensor.sportsintel_rankings` (currently ranked #21) |
| Dashboard/card location | `sportsintel_dashboard.yaml` (Team Board + main brief); Game Day card `TEAMS` entry confirmed present | Same dashboard; Game Day card `TEAMS` entry confirmed present | Same dashboard; Game Day card `TEAMS` entry confirmed present |
| Current notification posture | To be recorded read-only before kickoff (existing tiered/quiet-hours policy, unchanged) | Same | Same |
| Current Game Mode posture | To be recorded read-only before kickoff (`input_boolean.game_day_mode`) | Same | Same |
| Primary failure risks | Fallback fragility (2 prior in-production bugfixes); ranking-moment repetition; cross-contamination with men's soccer's near-identical key shape | No fallback exists — a TeamTracker outage has no safety net for this sport specifically | Same fallback fragility as women's soccer; ranked-#1-opponent schedule_change already observed correctly as MAJOR; postgame-football overlap risk given adjacency to football same day |

---

## 2. Before-game checklist (read-only for all three events)

For each event, before its scheduled start:

- [ ] Sensor state is `PRE` (confirm via `/api/states/<entity>`).
- [ ] Opponent, date, and time in the sensor's attributes are plausible and match the inventory table above (catches an upstream schedule change before it surprises the pipeline).
- [ ] `last_update`/`last_reported` is recent relative to the sport's normal polling cadence (not stale).
- [ ] Detector automation (`automation.sportsintel_detector_*`) state is `on`.
- [ ] Detector's resolved config (`team_sensor` input) matches the correct entity — verify via the automation config API, not assumed.
- [ ] SportsIntel template sensors (`sensor.sportsintel_moments`, `sensor.sportsintel_team_status_moments`, `sensor.sportsintel_latest_event_by_team`) are not `unavailable` and show no template-error state.
- [ ] For soccer only: fallback sensor (`_fallback`) attributes — `stale: false`, `error: null`, `fetched_at` recent — and that it agrees with the primary sensor on date/opponent (see Thursday-specific check below).
- [ ] Dashboard visibility: entity appears in the Game Day card and/or Team Board as expected.
- [ ] No unresolved relevant warning/error in the config check or entity `api_message` beyond the already-known, unrelated `_diag_frigate_snapshot` slug warning.
- [ ] Current notification profile and quiet-hours policy **recorded** (what tier this event's moments would classify as, whether quiet hours are active at kickoff time) — **not changed**.
- [ ] Current `input_boolean.game_day_mode` state **recorded** — **not changed**.

---

## 3. In-game observation checklist

For each event, capture (read-only; do not trigger or simulate anything):

- [ ] Actual `PRE` → `IN` transition time (local + UTC), vs. scheduled start.
- [ ] Detector behavior fires once and only once per real transition (check `last_triggered` / automation trace, not a manual re-run).
- [ ] `sensor.sportsintel_moments` / `sensor.sportsintel_team_status_moments` outputs include the correct team/sport key (`20382:usa.ncaa.w.1`, `277:college-football`, or `5658:usa.ncaa.m.1` respectively) — not a different team's key, not missing.
- [ ] Score/status updates remain internally coherent (score only moves forward, clock/quarter progress make sense).
- [ ] Data freshness: `last_update` continues advancing at a reasonable cadence during live play, not frozen.
- [ ] **Men's/women's soccer signal isolation** (applies whenever both are relevant — see Thursday and Saturday sections below for the specific cross-contamination checks).
- [ ] Any `ranking_current` moment behavior — does it still show correctly, does it repeat/duplicate unnecessarily.
- [ ] Any notification actually received — timestamp, content category (tier), and whether it matches the expected classification recorded pregame.
- [ ] Any duplicate or missing alert for the same real event.
- [ ] Any dashboard/state anomaly (wrong tile, frozen live indicator, wrong score shown).
- [ ] Any automation trace error associated with the detector or moments sensors for this event.

### Saturday-specific in-game checks (football → men's soccer transition)

- [ ] **Football's final/postgame state fully resolves to `POST` before men's soccer's `PRE`→`IN` transition** — record both timestamps explicitly; note any overlap.
- [ ] **No football moment, `data_quality`, `possible_disruption`, Game Mode state, or notification context leaks into men's soccer's key (`5658:usa.ncaa.m.1`)** — check that men's soccer's own `status`/`active` entries are attributed only to its own key, never football's `277:college-football`.
- [ ] Men's soccer's fallback state and its `ranking_current`/context behavior remain independent of football's data (no shared fields accidentally overwritten).
- [ ] Dashboard priority transitions correctly from football (while `IN`) to men's soccer (once it goes `IN`) — confirm the "calm when quiet, loud when live" header logic shows the right team at the right time, not a stale football banner during men's soccer's game.
- [ ] If football runs long (delay, overtime) and its `IN` window overlaps men's soccer's pregame (`PRE`, within the 2-hour `game_imminent` window) or even its `IN` window: record whether both teams' moments coexist correctly in `sensor.sportsintel_moments.active` without either being dropped, mislabeled, or merged.

### Thursday-specific in-game checks (women's soccer isolation)

- [ ] **Primary (`sensor.wvu_soccer`) and fallback (`sensor.wvu_soccer_fallback`) entities agree** on opponent, date, and (once available) score — record any disagreement with both entities' exact values and timestamps.
- [ ] A single, correct team/opponent/event identity is maintained throughout (`event_id`, `team_id: 20382`, `league_path: usa.ncaa.w.1` consistently, no drift to a different game).
- [ ] `ranking_current` moment (#10 as of pre-game) remains accurate and does not repeat/duplicate unnecessarily across recomputes.
- [ ] **No cross-contamination with the men's soccer entity/fallback** (`sensor.wvu_soccer_men` / `_fallback`, key `5658:...`) — since men's soccer isn't playing Thursday, its own state should remain completely unchanged by women's soccer's live activity; any shared field bleeding between the two would be a real defect.

---

## 4. Final-state checklist

For each event, after it ends:

- [ ] Actual `IN` → `POST`/final transition time (local + UTC).
- [ ] Final score/result in the sensor matches the real-world result (cross-check against ESPN or another public source if convenient — not required, but strengthens the evidence).
- [ ] `game_final` moment / summary text is present, coherent, and (per existing design) deterministic-fact-first with AI elaboration only if it passed the existing guard.
- [ ] Final notification count for this event — how many were actually received, and do they match the expected tiering (start/final/high-leverage only, per existing policy).
- [ ] Dashboard exits live state cleanly (no lingering "LIVE" indicator once `POST`).
- [ ] If Game Mode was active for this event, confirm it restores (`input_boolean.game_day_mode` turns off) once nothing else is live — **observe only, do not toggle it yourself**.
- [ ] Source freshness/stale behavior after final: does the sensor correctly stop updating frequently now that the game is over, without being flagged as an error.
- [ ] Any error/warning in logs or automation traces associated with the final transition.

---

## 5. Cross-event stress checks (Saturday window primarily; Thursday is single-event by design)

- [ ] Multiple games in `PRE` simultaneously (e.g., men's soccer sitting in `PRE` while football is `IN` earlier Saturday) — confirm both are tracked correctly without one crowding out the other in `sensor.sportsintel_moments.active`.
- [ ] One game `IN` while another is `PRE` — confirm significance/interest tiering still applies correctly to each independently.
- [ ] Near-simultaneous transitions (if football's final and men's soccer's pregame-imminent window happen to overlap) — see the Saturday-specific overlap checks in Section 3.
- [ ] Notification deduplication across different sports — confirm the shared `input_text.sportsintel_notified_moment_hashes` dedup mechanism doesn't cross-suppress two genuinely different events' notifications, and doesn't fail to suppress true duplicates within one event.
- [ ] Correct dashboard prioritization when more than one team could plausibly be "the" live banner — confirm the header shows the most relevant/live event, not an arbitrary or stale one.
- [ ] Soccer fallback independence — confirm men's and women's soccer fallback sensors never read or write each other's state (they are separate entities, but worth confirming no shared helper/variable causes accidental coupling).
- [ ] No cross-team entity/league mismatch anywhere in the moments output (a moment attributed to `277:college-football` should never carry data belonging to `5658:usa.ncaa.m.1` or `20382:usa.ncaa.w.1`, and vice versa).
- [ ] No stale "live" state persists for one team after a *different* team's event changes state (e.g., football going `POST` should not, by itself, cause any staleness flag or state change on men's soccer's still-`PRE`/`IN` entity).

---

## 6. Evidence-capture template

Copy this table per event (or per window) and fill in as observations happen. Both local and UTC timestamps in every row.

| Timestamp (local EDT) | Timestamp (UTC) | Team/sport | Expected state | Actual state | Sensor update (last_updated) | Detector/moment result | Dashboard result | Notification | Error/anomaly | Evidence reference |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |
| | | | | | | | | | | |
| | | | | | | | | | | |

---

## 7. Escalation policy

Every observation falls into exactly one of these four categories. **No automatic remediation is prescribed for any category** — categorization only determines who acts and how urgently, not what the fix is.

- **Observe only** — behavior matches expectations, or a known/already-documented limitation reproducing exactly as previously described (e.g., the string-match stale-detection gap, the missing native postponed/canceled state). Log in the evidence table; no further action.
- **Log for backlog** — a minor issue with no immediate risk (e.g., a cosmetic label glitch, a slightly delayed but eventually-correct update, a ranking moment repeating once without consequence). Record in the report's backlog section; do not act during the observation window.
- **Ask user before action** — a correctness or reliability issue that appears real and may need a config change (e.g., a moment consistently misattributed, a fallback not engaging when it should have). Stop, document precisely, and bring it to you before any change is proposed or made.
- **Immediate incident report** — false notifications, wrong-team attribution reaching an actual push notification, a repeated automation loop, any unsafe home-device behavior, or persistent stale data being presented as live. Report immediately, with full evidence, regardless of what else is in progress. Still no automatic fix — this tier is about urgency of reporting, not permission to act unilaterally.

---

## Interpretation Rules

- **Use local time (America/New_York) as the operational timeline** — this is what determines "before/during/after" for checklist purposes and what a human following along would expect.
- **Use UTC for correlation** with Home Assistant entity timestamps, automation traces, and any API/log evidence, all of which are UTC-native.
- **Mark any event-time change, postponement, or source discrepancy with both timestamps** — never record a revised time in only one zone.
- **Treat missing evidence as unverified, not failed.** If a checklist item couldn't be observed (missed window, ambiguous log, tool unavailable at the time), record it as `Unverified` with a note on why — do not mark it as a failure, and do not infer a result that wasn't actually observed.
