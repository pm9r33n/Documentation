# Notification Dispatcher — Plan & Reference

**Read this at the start of every future session touching notifications, automations, or
`packages/notify_dispatch.yaml`.** It is the single source of truth for how notifications work
on this system, what's been decided and why, and what's still pending.

Last updated: 2026-09-25 (Phase 2 close-out).

---

## 1. Why this exists

Before Phase 1, every notifying automation called `notify.mobile_app_*` directly, each with its
own ad hoc quiet-hours logic (or none), no dedup, no digest, and no consistent tagging. That made
it impossible to reason about notification volume/timing/priority as a system. `script.notify_dispatch`
centralizes all of that behind one call site.

## 2. Tiers

`script.notify_dispatch` takes a `tier` (1–4) that decides how a notification is handled during
quiet hours, and (implicitly) how urgent it is:

| Tier | Quiet-hours behavior | Delivery | Notes |
|---|---|---|---|
| **P1** | Always sends immediately, even during quiet hours | Push, `channel: "P1 Critical"` + TTS during quiet hours | Bypasses everything — reserved for things urgent enough to wake someone up for |
| **P2** | Held for the morning digest during quiet hours | Push (normal channel) | If the digest store is unavailable, fails open and sends immediately rather than silently dropping |
| **P3** | Dropped entirely during quiet hours | Push (normal channel) | Not held, not sent later — just skipped |
| **P4** | Never pushes, any time | `persistent_notification` + logbook entry only | Log-only tier — useful for "happened, but nobody needs a phone buzz" |

`car_ui: true` is hardcoded by the dispatcher on P1/P2 pushes only. It is **not** a
caller-settable field — Paul's explicit decision was that individual automations should not be
able to override tier-level push behavior.

## 3. Quiet hours

Quiet hours are day-type aware, computed by `binary_sensor.quiet_hours`
(`packages/quiet_hours.yaml`), not a static window:

| Day type | Quiet hours start | Quiet hours end |
|---|---|---|
| School day | 22:00 | 07:00 |
| Weekend | 22:00 | 09:30 |
| No-school (holiday/break) | 22:00 | 09:30 |

`quiet_start` is always 22:00 regardless of day type; only the morning end time varies.

The P2 digest is flushed by `notify_dispatch_digest_flush`, triggered on
`binary_sensor.quiet_hours` going `from: "on" to: "off" for: 60s`.

## 4. Dispatcher fields (`script.notify_dispatch` data)

| Field | Required | Notes |
|---|---|---|
| `tier` | yes | 1–4, see above |
| `title` | yes | |
| `message` | yes | |
| `tag` | yes | dedup/cooldown key — see tag convention below |
| `recipients` | no | defaults to `[paul]`; see recipient rules below |
| `image` / `video` / `click_action` | no | added in Phase 2 for camera-snapshot-carrying automations (ambient security) |
| `actions` | no | notification action buttons, when needed |

Dedup/cooldown is per-tag via `sensor.notify_dispatch_last_sent`, pruned on every write (entries
older than 900s are dropped):

| Tier | Cooldown |
|---|---|
| P1 | 60s |
| P2 | 300s |
| P3 | 900s |
| P4 | none |

## 5. Tag convention

`<category>_<person>` or `<category>_<person>_<event>`, lowercase, underscore-separated.
Examples in active use:

- `arrival_carrie`, `departure_trevar` — family home arrival/departure
- `school_trevar_arrive`, `school_shaughn_leave` — school zone
- `tracker_stale_<person>` — tracker health check
- `diagnostics_stale_<person>` — diagnostics stale check
- `leaving_work_paul` — Paul leaves work
- `garage_auto_close_night`, `garage_auto_close_storm`, `garage_open_storm_arrival` — garage/weather
- `garage_paul_approach`, `garage_carrie_approach` — garage open-on-approach
- `ambient_known_<camera>`, `ambient_unknown_<camera>` — ambient identity resolution

## 6. Recipient rules

`recipient_map` in `packages/notify_dispatch.yaml` is **Paul-only** right now
(`paul: notify.mobile_app_pm9r33n`). Any automation that needs to reach a different phone
(Carrie, Shaughn, Trevar) cannot yet route through the dispatcher to that person — this is
deliberately deferred to **Phase 5**.

Two ways this shows up today:

- **Exempt automations** (see §7) keep calling `notify.mobile_app_*` directly because their
  real recipient isn't Paul.
- **Explicit `recipients: [paul]` override** — e.g. `garage_carrie_approach` genuinely concerns
  Carrie's arrival but is routed to Paul on purpose (documented decision, not a bug — see
  `automation_audit.md` Finding 5 status).

## 7. Exempt list (deliberately not migrated)

**Morning Digest (Phase 5 — non-Paul recipients):**
1. `1755691200001` "Morning Digest – Paul and Carrie" (`automations.yaml`)
2. `1755691200002` "Morning Digest – Shaughn"
3. `1755691200003` "Morning Digest – Trevar"

Each carries an inline comment: *"Exempt from the notify_dispatch migration (Phase 2 close-out,
2026-09-25): [Person] is a non-Paul recipient and the dispatcher's recipient_map is Paul-only
until Phase 5. Left calling notify.mobile_app_<x> directly. Revisit at Phase 5."*

**Sports (Phase 3 — not yet started):**
4. `sportsintel_notification_dispatcher` (`packages/sportsintel_notify.yaml`)
5. `wvu_game_day_assistant` (`automations.yaml` id `1785189936797`)

A final sweep on 2026-09-25 confirmed these 5 are the *only* remaining direct
`notify.mobile_app_*` call sites in the entire config.

## 8. Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Secrets/orphans/retirement cleanup | **Done** |
| 1 | Build the dispatcher (quiet hours, tiers, dedupe, digest) | **Done** |
| 2 | Migrate existing notifying automations to the dispatcher | **Done** (2026-09-25) |
| 3 | Sports notifications (SportsIntel, WVU Game Day Assistant) | Pending |
| 4 | *(not yet defined/named)* | — |
| 5 | Extend `recipient_map` to non-Paul recipients; retire the exempt list | Pending |

## 9. Key decisions, for the record

- Quiet hours moved from several ad hoc per-file implementations (e.g. ambient identity
  consumer's own `input_datetime` pair) to one shared, day-type-aware sensor
  (`binary_sensor.quiet_hours`). Automations no longer own their own quiet-hours gate; they pick
  a tier and let the dispatcher enforce it.
- `car_ui: true` is dispatcher-controlled, not caller-settable, specifically to prevent an
  automation from overriding tier-level push behavior.
- Ambient identity resolution's old single suppress/send decision became a 3-way tier choice:
  unknown person during quiet hours → P1 (urgent enough to bypass), unknown person outside quiet
  hours → P2, known family match → P4 (log only — the family arrival/departure automations
  already push for that same event under `arrival_<person>`/`departure_<person>`, so a second
  real push would be noise). **Superseded by the TEMPORARY override below as of 2026-09-25.**
- **TEMPORARY 2026-09-25 (field test fix, `packages/ambient_identity_consumer.yaml`):** the
  P1-at-night branch above is disabled. Unknown person now always dispatches at tier 2,
  regardless of quiet hours; known still dispatches at P4. Reason: a field test the same day
  showed ~1/3 of family visits resolving as "Unknown person" due to Identity Resolution
  vote-logic bugs (same-event frames counted as independent observations, "unknown" itself
  counted as a vote, no multi-face handling, no late-observation hold) — P1 was paging Paul
  overnight for known family members misclassified as unknown.
  **Revert condition:** restore the P1-at-night branch (unknown during quiet hours → P1) once
  the vote-logic fixes are in (same-event frames = 1 observation, "unknown" not a vote,
  multi-face handling, late-observation hold) **and** there's a clean week with no false
  "unknown person" resolutions. Tested 2026-09-25: forced `input_boolean.quiet_hours_force` on,
  called `script.notify_dispatch` with a fake `ambient_unknown_*` tier-2 tag, confirmed logbook
  entry `tier 2 | ... | held | quiet hours active, added to digest`, then cleared the test entry
  from `sensor.notify_dispatch_digest` before releasing the override.
- Garage "Open on Approach" — Paul's branch is P4 (log only; opening the garage is itself the
  useful signal, a push isn't necessary), Carrie's branch is P2 routed to Paul (per §6).
- Digest (P2-during-quiet-hours) fails open and sends immediately if the digest store itself is
  unavailable, rather than silently dropping the notification.
- Recipient expansion beyond Paul is explicitly deferred (Phase 5), not designed in now, to avoid
  building against unknowns about how Carrie/Shaughn/Trevar should receive non-personal alerts.

## 10. Where to look next

- Dispatcher implementation: `packages/notify_dispatch.yaml`
- Migrated automations: `automations.yaml`, `packages/family_arrival_notify.yaml`,
  `packages/family_diagnostics_check.yaml`, `packages/family_leaving_work_notify.yaml`,
  `packages/ambient_identity_consumer.yaml`
- Full pre-migration inventory and findings: `docs/automation_audit.md` (see its Phase 2
  close-out addendum at the top for the corrected post-migration counts)
