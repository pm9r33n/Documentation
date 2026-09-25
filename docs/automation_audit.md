# Home Assistant Automation & Notification Audit

**Read-only inventory. Nothing on the live system was changed to produce this document.**
Snapshot date: 2026-09-25. Sources: `automations.yaml`, every `packages/*.yaml` (excluding
`.yaml.bak*` files, which HA's `!include_dir_named` glob does not load), the two blueprints
in use (`blueprints/automation/paul/*.yaml`), and the live `/api/states` automation list
(81 entities) for enabled/disabled/orphaned status and `last_triggered`.

**Methodology note on "7-day firing frequency":** this instance has no long-running trace
history readily queryable per-automation, so frequency is estimated from each automation's
trigger type + `last_triggered` timestamp rather than an exhaustive logbook mine of all 81
entities. Timer-driven automations (`time_pattern`) have a known theoretical max; actual
notification volume is almost always far lower because most either don't notify at all or
gate the notification behind a latch/dedup check. This is called out per-row below.

---

## (a) Summary

| | |
|---|---|
| Live automation entities | **81** |
| Defined in `automations.yaml` | 42 |
| Defined in `packages/*.yaml` (active, non-`.bak`) | ~31, across 18 files |
| Instantiated from blueprints | 9 (`wvu_game_day_assistant.yaml` ×1, `sportsintel_engine_detector.yaml` ×8) |
| Enabled, with a current backing definition | 70 |
| Explicitly off (1 documented in YAML, 2 toggled off in the UI, 1 of those documented elsewhere) | 3 |
| Orphaned (`unavailable`, no backing file found anywhere in current config) | 8 |
| Distinct notification-sending automations/scripts | 19 (18 automations + `script.goodnight_check`) |
| Distinct destinations ever notified | Paul's phone, Carrie's phone, Shaughn's phone, Trevar's phone, persistent_notification (test-mode only) |
| Alexa/TTS/media notifications anywhere in the install | **0** (two Echo devices are configured per the ha-ops skill; nothing calls `alexa_devices.send_text_command` or any media/TTS service) |
| Email notifications anywhere | **0** |
| Actionable notification buttons anywhere | **0** |
| Hardcoded credentials found | 2 locations (5 distinct secrets) — see Finding 6 |

### Domain breakdown

| Domain | Automations | Notes |
|---|---|---|
| Security / Cameras / Face recognition | 12 | 1 real notifier (`ambient_identity_resolution_consumer`), 1 disabled, 5 orphaned, rest MQTT/counter plumbing |
| Presence / Family | 18 | 4 real notifiers to Paul only, 4 to individual family phones (arrival/departure), 5 Dawarich location pushers, 1 orphaned, rest support |
| Garage / Goodnight | 5 | 3 active notifiers, 1 superseded (off), 1 goodnight orchestrator |
| Climate | 2 | No notifications |
| Lights / Scenes | 5 | No notifications (lights/scenes only) |
| Sports | 34 | 1 confirmed duplicate notifier, 1 real notification hub (SportsIntel dispatcher), rest are lights-only "trios" or silent detectors/refreshers |
| Vehicle | 0 distinct | Folded into Security (`car_arrival_visitor_check`) and Presence (Dawarich); no standalone vehicle group exists |
| System / Maintenance | 1 | `family_diagnostic_reporting_stale_check` |
| Other | 4 | TV remote, 3× Morning Digest |

---

## (b) Notification matrix

Rows = the real-world event that triggers a notification. Columns = where it goes.
"Freq" is the practical firing rate, not the trigger's polling rate.

| Event | Paul's phone | Carrie's phone | Shaughn's phone | Trevar's phone | Persistent / Alexa / Email | Automation id(s) | Freq |
|---|---|---|---|---|---|---|---|
| Car arrives + person at door, ID unconfirmed | image attached | – | – | – | – | `car_arrival_visitor_check` (**disabled**, superseded) | n/a |
| WVU Football pregame / final (AI text) | ✅ | – | – | – | – | `wvu_game_day_assistant` | ~2×/game — **duplicate, see Finding 1** |
| Family tracker gone stale (per person) | ✅ (car_ui) | – | – | – | – | `family_tracker_health_check` | rare, latched (evaluates every 30 min, notifies only on new outage) |
| Trevar/Shaughn arrive at school | ✅ | – | – | – | – | `family_notify_school_arrivals` | 2×/school day |
| Trevar/Shaughn leave school | ✅ | – | – | – | – | `family_notify_school_departures` | 2×/school day |
| Morning digest (weekday) | ✅ | ✅ | ✅ (own automation) | ✅ (own automation) | – | `morning_digest_paul_and_carrie`, `_shaughn`, `_trevar` | 3×/weekday |
| Garage left open at 10:30pm | ✅ | – | – | – | – | `garage_door_auto_close_at_night` (**off**, superseded by Goodnight Check) | 0 (disabled) |
| Garage auto-closed for storm | ✅ | – | – | – | – | `garage_door_auto_close_on_storm` | storm-dependent |
| Garage auto-opened, storm + arrival | ✅ | – | – | – | – | `garage_door_open_on_storm_arrival` | storm-dependent |
| Garage auto-opened on approach (Paul) | ✅ | – | – | – | – | `garage_door_open_on_approach_paul` | ~1×/day |
| Garage auto-opened on approach (**Carrie**) | ✅ ⚠️ | **should be Carrie's, isn't** | – | – | – | `garage_door_open_on_approach_paul` | ~few×/week — **see Finding 5** |
| Goodnight check found a problem | ✅ | – | – | – | – | `script.goodnight_check` via `goodnight_check_10_30_pm` | nightly, conditional |
| Ambient security identity resolution (real person/unknown at camera) | ✅ image+video, high-priority channel | – | – | – | – | `ambient_identity_resolution_consumer` | several/day, dedup'd |
| Carrie/Shaughn/Trevar arrive home | ✅ (Family Alerts) | – | – | – | – | `family_notify_when_<person>_arrives_home` | 1–3×/day/person |
| Carrie/Shaughn/Trevar leave home | ✅ (Family Alerts) | – | – | – | – | `family_notify_when_<person>_leaves_home` | 1–3×/day/person |
| Family diagnostics stale (daily 18:00 check) | ✅ (Family Alerts) | – | – | – | – | `family_diagnostic_reporting_stale_check` | ≤1×/day |
| Paul leaves work | ✅ (Family Alerts) | – | – | – | – | `family_notify_when_paul_leaves_work` | ~1×/workday |
| WVU FB/MBB/WBB/Baseball, Jets, Mets, WVU Soccer (W/M): pregame/live/score/halftime/final/schedule/ranking/news-moment | ✅ | – | – | – | persistent_notification only if `input_boolean.sportsintel_notification_test_mode` is on | `sportsintel_notification_dispatcher` (fed by 7 detectors + `sportsintel_ai_brief_generator` + `sportsintel_moment_notifier` + `sportsintel_ranking_check`) | several/live game; quiet-hours aware |
| WVU Alumni stat/news updates | **none** | **none** | **none** | **none** | **none** | — | **Gap, see Findings** |

No automation anywhere notifies Carrie, Shaughn, or Trevar's own phone about anything *other*
than their own school/home arrival-departure and their own Morning Digest — ambient security,
family diagnostics, and "Paul leaves work" all go to Paul only, by design (all tagged
`channel: "Family Alerts"` but Paul is the sole recipient).

---

## (c) Per-domain tables

### Security / Cameras / Face recognition

| id | Alias | Status | File | Trigger/condition | Notifies | Last triggered |
|---|---|---|---|---|---|---|
| `ambient_identity_resolution_consumer` | Ambient Identity Resolution Consumer | on | `packages/ambient_identity_consumer.yaml` | MQTT identity/context events from Frigate→Double Take→InsightFace pipeline; gated by 2 input_booleans, quiet hours (22:00–08:00, full suppression), and a recent-confirmed dedup check | `notify.mobile_app_pm9r33n`, image+video+clickAction, `priority: high`, `channel: alarm_stream_max` | 2026-09-24 23:12 |
| `ambient_occupancy_clear_front_door` | Ambient – Occupancy Clear (Front Door) | on | `packages/ambient_occupancy_clear.yaml` | Porch person-occupancy clears | MQTT publish only | 2026-09-24 23:12 |
| `ambient_presence_significance_evaluator` | (same) | on | `packages/ambient_presence_significance.yaml` | MQTT trigger | fires internal event only, never notifies | 2026-09-24 23:12 |
| `ambient_recognition_counter_increment` | Ambient – Recognition Counter Increment | on | `packages/ambient_recognition_counter.yaml` | confirmed recognition | no notify | 2026-09-24 23:12 |
| `ambient_recognition_counter_daily_reset` | Ambient – Recognition Counter Daily Reset | on | `packages/ambient_recognition_counter.yaml` | daily 04:00 | no notify | 2026-09-24 04:00 |
| `car_arrival_visitor_check` | Car Arrival – Visitor Check | **disabled** (`enabled: false`, documented: superseded by the ambient pipeline's margin-aware confirmation) | `automations.yaml` | car occupancy + porch person, 45s wait | would notify `notify.mobile_app_pm9r33n` w/ doorbell image | never |
| `frigate_person_alert_doorbell` | Frigate Person Alert – Doorbell | **orphaned** | none found | — | unknown (no backing file) | never |
| `frigate_person_alert_dog_room` | Frigate Person Alert – Dog Room | **orphaned** | none found | — | unknown (no backing file) | never |
| `ambient_person_detection_trigger_doorbell_test_mode` | (same) | **orphaned** | `.bak_20260815_consensus_fix` (inert, not loaded) | gated by `input_boolean.ambient_notification_test_mode` (default off) | would notify with Frigate media | never |
| `ambient_person_detection_trigger_dogz_test_mode` | (same) | **orphaned** | same `.bak` file | same | same | never |
| `doorbell_notification_phone_and_android_auto` | Doorbell Notification – Phone and Android Auto | **orphaned** | none found | — | unknown (no backing file) | never |
| `ambient_identity_challenge_evaluator` | (same) | **orphaned** | none found (superseded; `ambient_context_adjudicator.yaml`'s own header confirms this is retired, "zero consumers") | — | unknown | never |

Supporting, non-automation files consumed by the above: `ambient_context_adjudicator.yaml`
(pure computation script), `ambient_security_notify.yaml` (builds AI text, **does not** itself
notify — its header comments describing n8n as the live "Action" layer are **stale**, see
Finding 4), `ambient_media.yaml`, `ambient_store.yaml`, `ambient_train_status.yaml`.

### Presence / Family

| id | Alias | Status | File | Trigger/condition | Notifies | Last triggered |
|---|---|---|---|---|---|---|
| `family_tracker_health_check` | Family Tracker Health Check | on | `automations.yaml` | every 30 min, per-person GPS-vs-battery staleness, school-zone exempt for Shaughn/Trevar, quiet-hours exempt | `notify.mobile_app_pm9r33n`, latched (once per outage) | 2026-09-25 00:00 |
| `family_notify_school_arrivals` | Family Notify – School Arrivals | on | `automations.yaml` | Trevar/Shaughn enter their school zone | `notify.mobile_app_pm9r33n` | 2026-09-24 12:45 |
| `family_notify_school_departures` | Family Notify – School Departures | on | `automations.yaml` | Trevar/Shaughn leave their school zone | `notify.mobile_app_pm9r33n` | 2026-09-24 20:17 |
| `family_notify_when_carrie_arrives_home` | Family – Notify when Carrie arrives home | on | `packages/family_arrival_notify.yaml` | `person.carrie` → home | `notify.mobile_app_pm9r33n`, channel Family Alerts, **no quiet hours** | 2026-09-24 21:55 |
| `family_notify_when_shaughn_arrives_home` | (same pattern) | on | same | `person.shaughn` → home | same, **no quiet hours** | 2026-09-24 22:28 |
| `family_notify_when_trevar_arrives_home` | (same pattern) | on | same | `person.trevar` → home | same, **no quiet hours** | 2026-09-24 19:34 |
| `family_notify_when_carrie_leaves_home` | (same pattern) | on | same | `person.carrie` leaves home | same, **no quiet hours** | 2026-09-24 12:04 |
| `family_notify_when_shaughn_leaves_home` | (same pattern) | on | same | `person.shaughn` leaves home | same, **no quiet hours** | 2026-09-24 21:08 |
| `family_notify_when_trevar_leaves_home` | (same pattern) | on | same | `person.trevar` leaves home | same, **no quiet hours** | 2026-09-24 12:04 |
| `family_diagnostic_reporting_stale_check` | Family – Diagnostic Reporting Stale Check | on | `packages/family_diagnostics_check.yaml` | daily 18:00 | `notify.mobile_app_pm9r33n`, Family Alerts | 2026-09-24 22:00 |
| `family_notify_when_paul_leaves_work` | Family – Notify when Paul leaves work | on | `packages/family_leaving_work_notify.yaml` | Paul leaves work zone | `notify.mobile_app_pm9r33n`, Family Alerts | 2026-09-24 20:18 |
| `dawarich_push_paul_s_location` | Dawarich – Push Paul's location | on | `packages/dawarich_push.yaml` | `device_tracker.pm` state change | no notify (location push) | 2026-09-25 00:18 |
| `dawarich_push_shaughn_s_location` | (same pattern) | on | same | tracker state change | no notify | 2026-09-25 00:12 |
| `dawarich_push_trevar_s_location` | (same pattern) | on | same | tracker state change | no notify | 2026-09-24 21:45 |
| `dawarich_push_carrie_s_location` | (same pattern) | on | same | tracker state change | no notify | 2026-09-24 21:55 |
| `dawarich_push_carissa_s_location` | (same pattern) | **orphaned** | none (retired w/ carissa→carrie merge) | — | — | never |
| `push_paul_s25_ultra_location_to_traccar` | (same) | **orphaned** | none (superseded by Dawarich) | — | — | never |
| `sportsintel_last_seen_tracker` | SportsIntel: Last Seen Tracker | on | `packages/sportsintel_last_seen.yaml` | browser_mod path/visibility on the `let-s-go` dashboard | no notify | 2026-09-23 18:38 |

### Garage / Goodnight

| id | Alias | Status | File | Trigger/condition | Notifies | Last triggered |
|---|---|---|---|---|---|---|
| `garage_door_auto_close_at_night` | Garage Door – Auto-Close at Night | **off** (UI-toggled; documented reason exists elsewhere: `goodnight_check_10_30_pm`'s own description says it "replaces the old garage-only auto-close at night") | `automations.yaml` | 22:30 if door open | `notify.mobile_app_pm9r33n` | 2026-09-11 (stale, consistent with being retired) |
| `garage_door_auto_close_on_storm` | Garage Door – Auto-Close on Storm | on | `automations.yaml` | weather → lightning/pouring, door open | `notify.mobile_app_pm9r33n` | never (no storm since deploy) |
| `garage_door_open_on_storm_arrival` | Garage Door – Open on Storm Arrival | on | `automations.yaml` | family arrives during storm, door closed | `notify.mobile_app_pm9r33n` | never |
| `garage_door_open_on_approach_paul` | Garage Door – Open on Approach | on | `automations.yaml` | Paul or Carrie enters Almost Home zone, 30s dwell, location-confidence gated | `notify.mobile_app_pm9r33n` for **both** branches (Carrie's own branch still targets Paul's phone — see Finding 5) | 2026-09-24 20:29 |
| `goodnight_check_10_30_pm` | Goodnight Check (10:30 PM) | on | `automations.yaml` | 22:30 daily | via `script.goodnight_check` → `notify.mobile_app_pm9r33n`, conditional on a detected problem | 2026-09-24 02:30 |

### Climate

| id | Alias | Status | File | Trigger/condition | Notifies |
|---|---|---|---|---|---|
| `last_one_out_away_mode` | Last One Out – Away Mode | on | `automations.yaml` | `zone.home` count → 0 | none |
| `first_one_home_welcome_back_mode` | First One Home – Welcome Back Mode | on | `automations.yaml` | `zone.home` count 0 → 1 | none |

### Lights / Scenes

| id | Alias | Status | File | Trigger/condition | Notifies |
|---|---|---|---|---|---|
| `storm_or_dark_arrival_lights` | Storm or Dark Arrival Lights | on | `automations.yaml` | first arrival while dark/storming | none |
| `turn_on_lights_when_storming_and_no_one_home` | (Storm Lights – no one home) | on | `packages/storm_lights.yaml` | lightning + nobody home + someone in Neighborhood zone | none |
| `turn_off_storm_lights_when_someone_arrives_home` | (Storm Lights – arrival) | on | `packages/storm_lights.yaml` | anyone arrives home | none |
| `ambient_publish_occupancy_clear_porch` | Ambient – Publish Occupancy Clear (Porch) | on | `automations.yaml` | porch occupancy clears | MQTT publish only |
| `sports_wvu_soccer_goal_win_celebration` | Sports: WVU Soccer Goal & Win Celebration | **off** (UI-toggled, **no comment anywhere explains why** — see Finding 3) | `automations.yaml` | goal/win templates on `sensor.wvu_soccer[_men]` | none (lights only) |

### Sports

34 automations total. Grouped by pattern rather than listed individually where they're
structurally identical:

| Pattern | ids | Status | File | Notifies |
|---|---|---|---|---|
| "Game Day" lights trios (Kickoff/Tipoff/First-Pitch, Score Flash, Final Result) — WVU Football, WVU Basketball (M/W), WVU Baseball, Jets, Knicks, Mets | 21 ids, `1755691200006`–`1755691200026` | on | `automations.yaml` | **none** — lights/scene only, never `notify.*` |
| `wvu_game_day_assistant` | `1785189936797` | on | `automations.yaml` (blueprint `paul/wvu_game_day_assistant.yaml`) | `notify.mobile_app_pm9r33n`, AI-generated pregame/final text — **duplicates SportsIntel, Finding 1** |
| `sports_wvu_soccer_goal_win_celebration` | — | off | `automations.yaml` | none (see Lights/Scenes table) |
| `sports_game_day_mode_enter` / `_exit` | — | on | `automations.yaml` | none — flag only (`input_boolean.game_day_mode`) |
| SportsIntel detectors (WVU FB/MBB/WBB/Baseball, Jets, WVU Soccer W/M, Mets) | 8 ids | on | `packages/sportsintel_detectors.yaml` (blueprint `paul/sportsintel_engine_detector.yaml`) | none directly — fire `sportsintel.engine.event.v1` |
| `sportsintel_ai_brief_generator` | — | on | `packages/sportsintel_ai_brief.yaml` | none directly — fires `sportsintel.engine.ai_brief.v1` |
| `sportsintel_moment_notifier` | — | on | `packages/sportsintel_moment_notify.yaml` | none directly — fires `sportsintel.engine.moment.v1` |
| `sportsintel_ranking_check` | — | on | `packages/sportsintel_rankings.yaml` | none directly — fires `sportsintel.engine.event.v1` (ranking_change) every 4h for WVU FB/MBB/WBB/Soccer(W) |
| `sportsintel_notification_dispatcher` | — | on | `packages/sportsintel_notify.yaml` | **the actual notifier** for all of the above: `notify.mobile_app_pm9r33n`, quiet-hours aware (critical bypasses), test-mode → persistent_notification |
| `wvu_alumni_daily_refresh`, `wvu_alumni_post_game_refresh_check` | — | on | `packages/wvu_alumni_fetch.yaml` | **none — Gap, see Findings** |
| `wvu_soccer_fallback_refresh` | — | on | `packages/wvu_soccer_fallback.yaml` | none |

### System / Maintenance, Other

| id | Alias | Status | File | Notifies |
|---|---|---|---|---|
| `cube_tv_remote` | Cube TV Remote | on | `automations.yaml` | none |
| `morning_digest_paul_and_carrie` | Morning Digest – Paul and Carrie | on | `automations.yaml` | `notify.mobile_app_pm9r33n` **and** `notify.mobile_app_carries_iphone` |
| `morning_digest_shaughn` | Morning Digest – Shaughn | on | `automations.yaml` | `notify.mobile_app_shaughn` |
| `morning_digest_trevar` | Morning Digest – Trevar | on | `automations.yaml` | `notify.mobile_app_trevars_iphone` |

(`family_diagnostic_reporting_stale_check` is listed once, under Presence/Family, though it
is arguably System/Maintenance in nature.)

---

## (d) Findings

### 1. Duplicate — WVU Football pregame/final notified by two independent pipelines

`automation.wvu_game_day_assistant` (blueprint `paul/wvu_game_day_assistant.yaml`,
`enable_ai_notifications` defaults `true` and is not overridden) independently calls
`conversation.process` (Homeway Sage) and `notify.mobile_app_pm9r33n` for WVU football's
pregame briefing and postgame recap — completely separate from, and overlapping with,
`sportsintel_detector_wvu_football` → `sportsintel_ai_brief_generator` →
`sportsintel_notification_dispatcher`, which independently notifies the same phone for the
same pregame and final events (plus live_update/score_change/halftime, which the blueprint
doesn't cover). This is a real, already-documented problem, not a hypothetical: the
SportsIntel engine's own header comment in `sportsintel_ai_brief.yaml` records a real incident
where this exact legacy automation "called a conversational AI agent during a multi-hour
TeamTracker/ESPN outage... repeating every 15 minutes for hours with no way to answer it."
The blueprint also fires a legacy `sportsintel_event` (not `sportsintel.engine.*`) whose only
documented consumer was "a future n8n workflow" — n8n is retired, so that event now goes
nowhere. **Recommend retiring `wvu_game_day_assistant`** (or setting
`enable_ai_notifications: false` on it) now that SportsIntel covers WVU football end-to-end.

The task's illustrative example (a Jets final notified by both "the Jets trio" and the
SportsIntel notifier) does **not** occur: the Jets/Knicks/Mets/WVU-basketball/baseball "Game
Day" trios in `automations.yaml` are lights-only and never call `notify.*` — SportsIntel is
their sole notifier. WVU Football is the one team with a real second pipeline.

### 2. Noise — no quiet-hours check on family arrival/departure/diagnostics notifications

All 6 automations in `family_arrival_notify.yaml`, `family_diagnostics_check.yaml`, and
`family_leaving_work_notify.yaml` have no quiet-hours condition — an arrival at 2am notifies
Paul just as loudly as one at 2pm. Contrast with `ambient_identity_resolution_consumer`
(full suppression 22:00–08:00) and `sportsintel_notification_dispatcher` (quiet hours for
informational/important, critical bypasses) — both of which already implement the pattern
from `sportsintel_helpers.yaml`'s quiet-hours sensor that these family automations could reuse.
No automation was found firing >10×/day; the two 30-minute-cadence automations that check
frequently either don't notify at all (`wvu_soccer_fallback_refresh`,
`wvu_alumni_post_game_refresh_check`) or gate notification behind a per-person latch
(`family_tracker_health_check`).

### 3. Broken/dead

- **8 orphaned automation entities** (`unavailable`, no backing file in current config):
  `frigate_person_alert_doorbell`, `frigate_person_alert_dog_room`,
  `push_paul_s25_ultra_location_to_traccar`,
  `ambient_person_detection_trigger_doorbell_test_mode`,
  `ambient_person_detection_trigger_dogz_test_mode`, `dawarich_push_carissa_s_location`,
  `doorbell_notification_phone_and_android_auto`, `ambient_identity_challenge_evaluator`.
  Root cause is confirmed for 5 of 8 (test-mode pair → inert `.bak` file gated permanently
  off; `ambient_identity_challenge_evaluator` → superseded per `ambient_context_adjudicator.yaml`'s
  own header; `dawarich_push_carissa_s_location`/Traccar → superseded by the carissa→carrie
  merge and Dawarich respectively). `frigate_person_alert_doorbell`/`_dog_room` and
  `doorbell_notification_phone_and_android_auto` have no current file and no documentary trail
  — most likely pre-ambient-pipeline direct Frigate alerts, but unconfirmed.
- **`sports_wvu_soccer_goal_win_celebration`** is toggled off live with no `enabled: false` in
  YAML and no comment anywhere explaining why — worth asking Paul whether that's intentional.
- **`car_arrival_visitor_check`** is `enabled: false` in YAML with a clear documented reason
  (superseded by the ambient pipeline), but its live state is `unavailable` rather than the
  `off` you'd expect for an explicitly-disabled automation — a minor registry-state oddity,
  not a config problem.
- `packages/_diag_frigate_snapshot.yaml` and `packages/zzdiag_frigate_snapshot.yaml` are both
  comment-only/dead — already known per CLAUDE.md (`_`-prefixed slug never loads); no new
  issue, noted for completeness.

### 4. Leftovers

- `packages/ambient_security_notify.yaml`'s header comments still describe n8n's "Ambient V2 –
  Person Detection Alerts" workflow as the live "Action" layer. n8n was fully retired
  2026-09-19; the real notify call has lived in `ambient_identity_consumer.yaml` since before
  that. Comments only, not live code, but likely to mislead a future reader.
- `wvu_game_day_assistant.yaml`'s blueprint description also references "a future n8n
  workflow" as a consumer of its legacy event — same staleness.
- 18 `.yaml.bak*` files sit in `packages/` (5 for `ambient_identity_consumer` alone, plus
  `ambient_detection_trigger`, `ambient_security_notify`, `dawarich_push`,
  `sportsintel_ai_brief`, `sportsintel_debug`, `sportsintel_helpers` ×2, `sportsintel_moments`,
  `sportsintel_notify`, `thehousekows_sensors` ×2). None load (confirmed by naming + glob
  mechanics) — harmless, but a lot of accumulated snapshots if disk/clutter ever matters.
- `packages/cc_merge_probe.yaml` — already flagged in CLAUDE.md as a known leftover from the
  completed carissa→carrie merge; still present, ask Paul before deleting per project rules.
- `thehousekows_sensors.yaml.bak-*` (2 revisions) — a retired "Home Command Gen 2" dashboard
  support-sensor package; its own filename says "orphaned-zero-consumers-removed," and the
  dashboard file it fed (`thehousekows_dashboard.yaml`) no longer exists either.
- No trace of a "Hakanban" board or SmartThings-era entities was found in any file read for
  this audit (unlike n8n, which left comment traces, nothing pointed to either of these) —
  appears to already be fully gone.

### 5. Gaps

- **WVU Alumni has zero notifications**, confirmed: `wvu_alumni_daily_refresh` and
  `wvu_alumni_post_game_refresh_check` (`packages/wvu_alumni_fetch.yaml`) only ever fire an
  internal `wvu_alumni_player_updated` event; nothing consumes it for a notification.
- **WVU Soccer's SportsIntel coverage inherits TeamTracker's own bug.**
  `sportsintel_detector_wvu_women_s_soccer`/`_men_s_soccer` exist and are enabled, but they
  read the raw TeamTracker sensors (`sensor.wvu_soccer` / `sensor.wvu_soccer_men`) directly,
  not the `wvu_soccer_fallback`/`wvu_soccer_men_fallback` sensors built this session to work
  around ESPN's NCAA-soccer `NOT_FOUND` bug. On any day TeamTracker itself can't find the game,
  SportsIntel's own pregame/kickoff/score/final AI notifications for WVU soccer likely still
  silently never fire — the earlier fix only wired the fallback into the dashboard card and
  Game Day Mode, not into this detector.
- **Alexa is configured but entirely unused.** The ha-ops skill lists two known Echo device
  IDs, but zero automations anywhere call `alexa_devices.send_text_command` or any TTS/media
  service — the whole channel is dormant infrastructure.
- **Garage "Open on Approach," Carrie's branch, notifies Paul's phone, not Carrie's** — the
  message correctly says "Carrie is almost home," but the action target is
  `notify.mobile_app_pm9r33n` in both the Paul and Carrie choose-branches. Likely a
  copy/paste artifact from the 2026-09-19 extension.
- No actionable notification buttons exist anywhere (e.g., no quick "not me" / "confirm"
  response on ambient security alerts) — a capability gap, not a bug.
- Only Paul ever receives ambient security, family-diagnostics, or "leaving work" alerts;
  Carrie/Shaughn/Trevar only ever get notified about their own arrival/departure/morning
  digest, never about each other or about security events.

### 6. Hardcoded secrets (location only, values withheld)

- **`configuration.yaml`** — a WebRTC TURN relay `username`/`credential` pair is hardcoded in
  the `web_rtc: ice_servers:` block (second list entry, added by Homeway).
  **Status (Phase 0, 2026-09-25): accepted risk, not an open task.** Confirmed via the file's
  own header comment that Homeway issues and auto-manages this block
  (`homeway_auto_update` defaults on; the comment only shows how to *disable* auto-update, so
  it is currently active). The credential is unchanged between the current file and a much
  older `configuration.yaml.bak-pre-sportsintel` snapshot, consistent with a static
  per-installation Homeway relay credential rather than something that self-rotates.
  Deliberately left in place and out of `secrets.yaml`: moving it risks Homeway's next
  auto-update silently clobbering the reference, and rotation (if wanted) is a Homeway support
  question, not something fixable from this config. Exposure is scoped to Homeway's own WebRTC
  relay, not to this HA instance's credentials.
- **`packages/dawarich_push.yaml`** and **`packages/dawarich_stats.yaml`** — four distinct
  Dawarich API keys (one per Paul/Shaughn/Trevar/Carrie) are hardcoded directly in
  `rest_command`/`resource` URLs as `?api_key=...` query parameters — 9 occurrences total
  across the two files (5 in `dawarich_push.yaml`, including a `dawarich_stats_pm_test`
  diagnostic reusing Paul's key; 4 in `dawarich_stats.yaml`), live and in active use. The same
  four keys also persisted in `dawarich_push.yaml.bak-20260823-carrie-carissa-fix`, moved to
  `/config/backups/` during Phase 0 cleanup (2026-09-25) pending rotation. This is a more
  material exposure than the TURN credential since these are active service credentials
  sitting in plain-text YAML. **Status (Phase 0): remediation in progress** — Paul rotates the
  4 keys in Dawarich directly (no API access from this session) and adds them to
  `secrets.yaml` himself (write-restricted to this session by design); the package files then
  switch to `!secret` references.

---

*No files were edited, no service was called, and nothing was reloaded or restarted to
produce this document.*
