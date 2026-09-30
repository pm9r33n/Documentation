# Seasonal SportsIntel Readiness Assessment (read-only)

**Date:** 2026-09-29
**Method:** Read-only inspection — live entity states/attributes (via Home Assistant's core REST API), live automation configs, and the file-level findings already established this session (the original 4-agent dashboard assessment, the Phase 1 planning docs, and the just-completed Knicks activation's live verification). No file was edited, no domain reloaded, no service called beyond read-only GETs, no automation/script/notification triggered, no game simulated, no external provider contacted directly (all data read was already cached in Home Assistant's own entity states), and no Git action taken.

---

## At-a-glance readiness

| # | Team | Rating | Next event | One-line reason |
|---|---|---|---|---|
| 1 | WVU Football | **Ready** | Oct 3, vs Iowa State (~3 days) | Most mature pipeline in the system; live data healthiest of all teams checked (no cache flag); real moments already generating correctly against live data. |
| 2 | WVU Men's Soccer | **Ready with observation** | Oct 3, vs #1 South Carolina (~4 days) | Backend and fallback both healthy right now, but the fallback package has a documented fragility history — worth a watchful eye during the actual live match. |
| 3 | WVU Women's Soccer | **Ready with observation** | Oct 3, vs Houston (~3 days) | Same as men's soccer, plus already has a live, correct ranking_current moment (#10) as concrete positive evidence. |
| 4 | WVU Men's Basketball | **Ready** | Nov 2, vs Niagara (~1 month) | Data healthy; the prior NOT_FOUND concern is not reproducing (confirmed twice this session); this exact matchup was the real-world case behind a 2026-09-16 bug fix, now resolved. |
| 5 | WVU Women's Basketball | **Conditional** | Nov 4, vs Rhode Island (~1 month) | Backend fully healthy, but confirmed absent from the Game Day card's team list — a real, user-visible UI gap despite correct data underneath. |
| 6 | WVU Baseball | **Unverified** | None scheduled (off-season) | Last game was 3 months ago (a real NCAA World Series appearance); the next-season schedule-detection path can't be verified until a new game actually gets scheduled. |
| 7 | NY Knicks | **Ready with observation** | Oct 5, vs 76ers (~6 days) | Just activated this session; wiring confirmed correct by direct config inspection, but zero real-world moments/observations exist yet, and one judgment call (interest tier) awaits your confirmation. |

---

## Shared architecture (applies to all 7 unless noted otherwise)

To avoid repeating identical mechanics seven times, here's what's common across every team, verified once:

**Detector pattern** (layer 2): one `sportsintel_detector_*` blueprint instantiation per team in `packages/sportsintel_detectors.yaml`, each producing `sportsintel.engine.event.v1` events on PRE→IN, IN→IN score changes, halftime, IN→POST, and POST/NOT_FOUND→PRE (schedule_change) transitions, plus a `/15`-minute pregame-lead-time check. No per-sport tuning exists in this file (its own header says so) — verified true for every team including Knicks.

**State model** (layer 3): PRE/IN/POST are TeamTracker's real states, read directly. **There is no native postponed/canceled state anywhere in TeamTracker's schema** (confirmed by reading its attribute set) — this is a real, structural gap that applies identically to all 7 teams, not a per-team issue. It's mitigated, not solved, by `sensor.sportsintel_team_status_moments`'s heuristic: an unexplained state change away from a near-term PRE (without an API-error signature) surfaces as a hedged `possible_disruption` NOTABLE moment. **Stale/error detection is a string-match** (`'API_LIMIT'`/`'error'` in `api_message`) applying equally to all teams — a team whose sensor simply stops updating with no error string produces no signal at all. This is a known, already-documented gap (not new to this assessment) and applies to every team on this list equally.

**Moment/significance logic** (layer 4): fully generic, driven by score-margin/state transitions, not sport type — confirmed by reading the full template this session (no per-sport branch exists anywhere). One real, if minor, unverified assumption worth flagging: the close/blowout margin thresholds (`input_number.sportsintel_halftime_close_margin` default 8, `..._blowout_margin` default 21) are described in football terms ("a one-score game") but are shared globally, including by basketball (WVU M/W, Knicks). Eight points is a reasonable "close" threshold in basketball too, but this hasn't been documented as deliberately validated for that sport — it appears to work by fortunate overlap, not by design.

**Notification policy, dedup, quiet hours** (layer 4): uniform across all teams by source/tier (`sportsintel_moment_notify.yaml` / `sportsintel_notify.yaml`), not per-team — a team only needs its detector wired for this layer to apply to it correctly, which is true for all 7 as of this session's Knicks activation.

**Game Day Mode** (layer 4): `input_boolean.game_day_mode` triggers on any tracked team going live while someone's home — generic across teams, verified via `automation.sports_game_day_mode_enter`/`_exit`, both `state: on`. Not team-specific.

**AI briefing** (layer 4/6): Ollama-first routing for score-bearing events, deterministic-text-only for factual notifications, three independent hallucination guardrails — all sport-agnostic, confirmed in the original assessment. Applies identically once a team has detector coverage.

---

## Per-team findings

### 1. WVU Football

- **Source**: `sensor.wvu_football`, TeamTracker/ESPN (NCAAF, team_id 277, `college-football`). State `PRE`, next event Oct 3 16:00Z @ Iowa State (record 3-1 vs 2-2, ISU -3, O/U 52.5). `api_message: null` — genuinely fresh, not the "Cached data" flag most other teams currently show. `last_update` 13:49:21, the most recent of any team checked.
- **SportsIntel**: detector `automation.sportsintel_detector_wvu_football` — `on`. Interest tier `277:college-football → CORE`. In both moments-engine trigger lists and the live-game sensor loop. Additionally the only team (with Jets) getting direct-ESPN box-score/leaders/injury enrichment (`sportsintel_espn_football.yaml`, football-only by design).
- **State model / policy**: shared architecture above, no exceptions.
- **UI**: present in the Game Day card's `TEAMS` array and the auto-entities Team Board.
- **Evidence**: `sensor.sportsintel_moments`'s live `active` list right now contains a real, correct `schedule_change` moment for this exact game ("West Virginia vs Iowa State — new game scheduled for October 3, 2026"), independently matching the live sensor data pulled this session — concrete, current proof the full pipeline works end-to-end for this team today. History includes multiple real, fixed incidents (jersey-retirement false positive, schedule_change headline bug, 256KB render cap, notify race condition).
- **Rating: Ready.** No action needed.

### 2. WVU Men's Soccer

- **Source**: `sensor.wvu_soccer_men` (TeamTracker, `usa.ncaa.m.1`, team_id 5658) + `sensor.wvu_soccer_men_fallback` (custom `espn_schedule` package). Both `PRE`, next event Oct 3 23:00Z @ home vs South Carolina — currently the #1-ranked team in the country (WVU is #21). `api_message: "Cached data"` on the main sensor; fallback shows `stale: false, error: null`, fetched 13:30. Minor cosmetic quirk: `team_url`/`opponent_url` are ESPN app deep-links (`sportscenter://...`), not web URLs — harmless, just not clickable outside the ESPN app.
- **SportsIntel**: detector `automation.sportsintel_detector_wvu_men_s_soccer` — `on` (added 2026-09-14, one of the three original coverage gaps). Interest tier `5658:usa.ncaa.m.1 → CORE`.
- **State model / policy**: shared architecture. No native conference/group ID for this league in ESPN's data is the documented, confirmed root cause behind why the fallback package exists at all.
- **UI**: present in the Game Day card's `TEAMS` array.
- **Evidence**: fallback package has needed two real, documented in-production bugfixes (a `dict.items` shadowing bug, an HA `variables:` int-coercion surprise) — proof of real fragility, even though it's currently healthy and defensively written.
- **Rating: Ready with observation.** Nothing broken; the specific thing worth watching is whether the main TeamTracker sensor's known scoreboard date-range issue reappears once the game goes `IN`, requiring the fallback to carry data mid-game — this hasn't been observed live yet this season. **Smallest action**: none required now; watch this specific handoff during the Oct 3 match.

### 3. WVU Women's Soccer

- **Source**: `sensor.wvu_soccer` (TeamTracker, `usa.ncaa.w.1`, team_id 20382) + `sensor.wvu_soccer_fallback`. Both `PRE`, next event Oct 3 00:00Z @ Houston, ranked #10. Same cosmetic app-deep-link quirk as men's soccer. Fallback `stale: false, error: null`, fetched 13:30.
- **SportsIntel**: detector `automation.sportsintel_detector_wvu_women_s_soccer` — `on` (also added 2026-09-14). Interest tier `20382:usa.ncaa.w.1 → CORE`.
- **State model / policy**: identical situation to men's soccer (same upstream gap, same fallback design).
- **UI**: present in the Game Day card's `TEAMS` array.
- **Evidence**: strongest current proof-of-life in the whole system — `sensor.sportsintel_moments`'s live `active` list right now contains both a correct `schedule_change` moment for the Houston game *and* a correct `ranking_current` moment ("WVU Women's Soccer is #10 in United Soccer Coaches/IWSOC Women's Top 25 Poll"), matching the live sensor's `team_rank: 10` exactly. One thing to note, not necessarily a bug: men's soccer's rank (#21, also present on its own sensor) does **not** currently have a corresponding `ranking_current` moment — unconfirmed whether that's a timing gap in the rankings poller or simply this poll cycle not having reached #21 yet; not investigated further, flagged only.
- **Rating: Ready with observation.** Same fallback-fragility caveat as men's soccer. **Smallest action**: none required now; same live-match watch-point as men's soccer, plus optionally confirming whether men's soccer's ranking is expected to surface the same way.

### 4. WVU Men's Basketball

- **Source**: `sensor.wvu_basketball_men` (TeamTracker, NCAAM, team_id 277, `mens-college-basketball`). State `PRE`, `api_message: null` (healthy, not cached), next event Nov 2 05:00Z @ home vs Niagara — genuinely far out ("in a month"), consistent with real preseason timing.
- **SportsIntel**: detector `automation.sportsintel_detector_wvu_men_s_basketball` — `on`, one of the original (pre-2026-09-14) instances. Interest tier `277:mens-college-basketball → CORE`.
- **State model / policy**: shared architecture; see the basketball-margin-threshold caveat above.
- **UI**: present in the Game Day card's `TEAMS` array.
- **Evidence, and a direct answer to a standing open question**: prior project notes claimed this sensor persistently returns `NOT_FOUND`. **Checked live twice this session** (once during the Knicks work, once now) — both times it reported a healthy `PRE` state with a fresh `last_reported` timestamp. This doesn't retroactively prove the old claim was wrong (a live-game-specific recurrence can't be ruled out from an off-season check), but it is not currently reproducing. Separately: this exact Niagara matchup (`event_id 401921766`) is the literal real-world case cited in the 2026-09-16 `schedule_change` headline bug fix — a good natural verification point when this game's data is next observed to update.
- **Rating: Ready.** **Smallest action**: none blocking; optionally re-confirm the schedule_change headline renders correctly for this specific game next time its data changes (low urgency, months away).

### 5. WVU Women's Basketball

- **Source**: `sensor.wvu_basketball_women` (TeamTracker, NCAAW, team_id 277, `womens-college-basketball`). State `PRE`, `api_message: "Cached data"`, next event Nov 4 00:00Z @ home vs Rhode Island.
- **SportsIntel**: detector `automation.sportsintel_detector_wvu_women_s_basketball` — `on`, original instance. Interest tier `277:womens-college-basketball → CORE`. Fully wired into both trigger lists and the live-game sensor loop.
- **State model / policy**: shared architecture, no exceptions found. One real, pre-existing gap: no official RSS news feed exists for this team, so it never produces 'news'-sourced moments (game-state moments are unaffected).
- **UI — the actual gap**: **confirmed absent from the Game Day card's `TEAMS` array**, read directly from `www/gd/gd-core.js` this session (and again in the Phase 1 planning work). The backend has never had a problem here — this is purely a front-end omission. It likely still appears in the newer dashboard's generic auto-entities Team Board (not confirmed this session, since that view queries broadly rather than off a hardcoded list), so this is specifically a Game Day card gap, not total invisibility.
- **Evidence**: no incident history found specific to this team beyond the shared RSS gap.
- **Rating: Conditional.** Data readiness is genuinely fine; the primary intended per-team UI surface for a CORE-interest WVU team has a confirmed hole. **Smallest action**: add one entry to `gd-core.js`'s `TEAMS` array (`sensor.wvu_basketball_women`, mirroring the men's entry) — this is exactly the P2 item already assessed as low-risk in `docs/implementation/phase-1-stabilization/05-open-question-verification-plan.md`, not yet approved or implemented.

### 6. WVU Baseball

- **Source**: `sensor.wvu_baseball` (TeamTracker, `college-baseball`, team_id 136). State `POST`, last real event **June 17, 2026** — a College World Series game at Charles Schwab Field in Omaha, WVU 7 – UNC 12 (loss, opponent then ranked #5). No next-game date populated (genuine off-season; the sport isn't dormant due to a bug, it's dormant because the season ended).
- **SportsIntel**: detector `automation.sportsintel_detector_wvu_baseball` — `on`, original instance. Interest tier `136:college-baseball → CORE`. Deliberately excluded from the rankings poller by design (no relevant baseball poll).
- **State model / policy**: shared architecture. The one path genuinely untested since the season ended is the `NOT_FOUND`/`POST` → `PRE` `schedule_change` transition that would fire when next season's first game gets scheduled — this exact path is proven to work correctly for football/both soccer teams *this month*, so there's no specific reason to expect it to fail for baseball, but it hasn't happened for this team recently and can't be forced without waiting for a real schedule announcement.
- **UI**: not present in the Game Day card's `TEAMS` array (like women's basketball) — currently low-stakes since there's nothing to show.
- **Evidence**: no baseball-specific incident history found.
- **Rating: Unverified**, specifically and only for "does the new-season detection path still work" — everything else about this team's plumbing is present and unchanged. **Smallest action**: none now. Re-check (a five-minute read-only state check, nothing more) the first time WVU baseball's sensor shows a `schedule_change`-triggering transition for next season.

### 7. NY Knicks

- **Source**: `sensor.ny_knicks` / `sensor.ny_knicks_display` (TeamTracker, NBA, team_id 18, `nba`). State `PRE`, next event Oct 5 23:00Z @ Philadelphia vs 76ers — confirmed live, real ESPN data (not a stub).
- **SportsIntel**: detector `automation.sportsintel_detector_ny_knicks` — `on`, activated this session; resolved config directly verified (`team_sensor: sensor.ny_knicks`, `pregame_lead_time: "02:00:00"` — the shared default, matching every other team). Interest tier `18:nba → HIGH` — **this is my own judgment call from the activation work, mirroring the Jets rather than the Mets tier, still awaiting your confirmation.** In both moments-engine trigger lists and the live-game sensor loop (all verified by direct file/config inspection, not assumed).
- **State model / policy**: shared architecture; no NBA-specific logic exists or was needed, per the earlier Phase 1 research (WVU Basketball already proves the generic basketball-appropriate behavior works).
- **UI**: present in the Game Day card's `TEAMS` array — notably, this slot existed in the front-end *before* the backend was wired this session, so nothing UI-side needs to change.
- **Evidence**: `sensor.sportsintel_team_status_moments` has **not yet** created an `18:nba` entry (expected — that sensor only populates on an actual state-change event, and `sensor.ny_knicks` hasn't transitioned since being added). `sensor.sportsintel_moments` recomputed cleanly post-activation with Knicks included in its loop (no template error), correctly producing no moment yet since the game is 6 days out (outside the 2-hour `game_imminent` window) — this is correct behavior, not a gap. **No real Knicks moment, notification, or live-game event has been observed yet** — zero production mileage.
- **Rating: Ready with observation** — matching exactly how you framed this team in your own request. **Smallest action**: confirm (or override) the `HIGH` interest-tier choice, and treat the first real Knicks moment/notification as the actual proof point, not the config inspection alone.

---

## Before next game — prioritized checklist

Ordered by actual calendar proximity, not by the priority list above. Notably, **three WVU games land within roughly 24 hours of each other around October 3** — a real, near-term stress test of dedup/notification volume across simultaneous PRE→IN transitions, not a hypothetical:

1. **Oct 3, ~00:00Z — WVU Women's Soccer vs Houston.** No blocking action. Optional: confirm fallback handoff behavior once `IN`.
2. **Oct 3, ~16:00Z — WVU Football vs Iowa State.** No action needed; this is the most-proven path in the system.
3. **Oct 3, ~23:00Z — WVU Men's Soccer vs South Carolina (#1).** No blocking action. Optional: same fallback watch-point as women's soccer.
4. **Oct 5, ~23:00Z — NY Knicks vs 76ers.** Confirm the `HIGH` interest-tier choice before this game if you want a different weighting; not required for the pipeline to function correctly either way.
5. **Nothing time-critical for WVU Basketball (M/W)** — both a month out.
6. **WVU Women's Basketball card gap** (`gd-core.js`) — not urgent for Oct 3–5, but worth deciding on before her season opener in November if you want Game Day card visibility for that game.

## Monitor during real game — checklist

- **Oct 3 cluster (3 simultaneous WVU games)**: watch for notification volume/quiet-hours interaction across three teams' PRE→IN transitions in a short window — this combination hasn't happened yet this season under the current SportsIntel engine.
- **Both soccer fallbacks**: confirm the main TeamTracker sensor doesn't need the fallback to take over mid-game (i.e., the known scoreboard date-range issue doesn't resurface once `IN`).
- **Knicks' first real moment**: confirm it appears with the expected interest tier, correct emoji/label ("🏀 NY Knicks"), and that `sensor.sportsintel_team_status_moments` picks up an `18:nba` entry on its first real state change.
- **WVU Men's Basketball vs Niagara (Nov 2)**: spot-check that the schedule_change headline (and eventually the final-score headline) render correctly — this is the real case behind a real prior bug fix.

## Deferred backlog (not part of this assessment's scope to act on)

- WVU Women's Basketball Game Day card entry (P2, already assessed low-risk, awaiting card-edit approval).
- WVU Baseball / NY Mets Game Day card entries (Deferred per your standing priorities).
- Stale/error detection redesign (timestamp/TTL model) — P1 in the Phase 1 plan, not yet implemented.
- AI provider routing/circuit-breaker work — P1 in the Phase 1 plan, not yet implemented.
- Lighting/Game Mode automation consolidation — design only, no implementation scheduled.
- Archive cleanup (unreferenced probe JSON files, oversized stray JS backup) — P2, gated on separate approval.
- Basketball-appropriate margin-threshold validation (the shared close/blowout defaults were described in football terms; never explicitly confirmed tuned for basketball, including for the newly-active Knicks).

---

**Confirmation:** no configuration file was edited, no domain was reloaded, no runtime state was written to, no notification/automation/script was triggered, no external provider was contacted directly by this assessment (all data came from Home Assistant's own already-cached entity states), and no Git action (stage, commit, push, branch, merge, or PR) was performed.
