# File Impact Analysis — All Phase 1 Initiatives

**Status:** Planning only. Every row below is a proposed future change or a
read-only reference. **Nothing in this table has been touched.**

**Reprioritization note (2026-09-29)**: tiers below (P1/P2/Defer) reflect
the current priority ordering — see `00-scope-and-guardrails.md`. No file
impact changed as a result of reprioritizing; only which work happens first
changed.

## Legend

- **New content, existing file** — a new block/entry added to a file that
  already exists.
- **New file** — a file that doesn't exist today would be created.
- **Read/reference only** — consulted to confirm behavior, not modified.
- **File moved** — relocated, not edited (archive plan only).

## By initiative

### Knicks coverage (`02-knicks-coverage-plan.md`) — P1

| File | Impact | Why |
|---|---|---|
| `packages/sportsintel_detectors.yaml` | New content, existing file | Add one blueprint instantiation for the Knicks |
| `packages/sportsintel_moments.yaml` | New content, existing file | Add one interest-tier map entry |
| `sensor.ny_knicks`, `sensor.ny_knicks_display` | Read/reference only | Already-existing sensors to wire in, not create |
| `packages/sportsintel_context.yaml`, `sportsintel_store.yaml`, `sportsintel_notify.yaml`, `sportsintel_moment_notify.yaml`, `sportsintel_prompts.yaml`, `response_guard.yaml`, `response_qa.yaml`, `response_scoring.yaml` | Read/reference only (to be verified, not assumed, during implementation) | Expected to be generic/event-driven already; no change anticipated |
| `packages/sportsintel_espn_football.yaml` | Read/reference only | Confirmed football-only by design; correctly excludes Knicks |
| `packages/sports_score_display.yaml` | Unconfirmed — flagged for verification | Whether a Knicks tile already exists wasn't confirmed either way |
| `www/gd/gd-core.js` | Read/reference only | Already contains a Knicks entry; no change needed |

### AI provider routing (`03-ai-provider-routing-plan.md`) — P1

| File | Impact | Why |
|---|---|---|
| `packages/sportsintel_ai_provider.yaml` | New content, existing file | New routing-table logic, circuit-breaker state helpers, extended failure-reason logging |
| New `input_number`/`input_text` helpers (exact names TBD at implementation) | New content, likely added to `sportsintel_helpers.yaml` | Per-provider circuit-breaker state (failure count, circuit state, cooldown-until) |
| `script.sportsintel_ai_generate` (inside `sportsintel_ai_provider.yaml`) | New content, existing file | Becomes the enforcement point for the routing table — still the single place a provider is named, per existing documented rule |
| `packages/sportsintel_ai_brief.yaml`, `response_qa.yaml` | Read/reference only | Existing hard-routes for score-bearing events to Ollama are the pattern this plan generalizes; not expected to need edits themselves |
| `input_select.sportsintel_ai_provider` (in `sportsintel_helpers.yaml`) | Read/reference only | Preserved as a manual override, not removed; not the primary routing mechanism after this change |

### Source freshness (`04-source-freshness-plan.md`) — P1

| File | Impact | Why |
|---|---|---|
| `packages/sportsintel_last_seen.yaml` | New content, existing file | Natural home for `last_successful_refresh_at`/`failure_count`/`consecutive_successes` tracking, extending its existing documented purpose |
| `packages/sportsintel_moments.yaml` | New content, existing file (same file as the Knicks map entry, different section) | Replace the `data_quality_degraded` string-match condition with a `source_status`-based check |
| `www/gd/gd-core.js` | Read/reference only now; candidate for a follow-on change later | `TT_STALE_MIN`/`SI_STALE_H` constants are natural future consumers of this model, but changing this file is out of scope for this phase (card files are excluded from modification) |

### Open-question verification & card-scope follow-up (`05-open-question-verification-plan.md`) — P1 (verification) / P2 (WVU Women's Basketball) / Defer (Mets, WVU Baseball)

| File | Impact | Why |
|---|---|---|
| `www/gd/gd-core.js` | Read/reference only (done) | Confirmed `TEAMS` array contents; confirmed `NEWS_TAGS` already has a `wvu_basketball_women` entry |
| `dashboard_backups/` | Read/reference only (done) | Confirmed folder structure |
| `sensor.wvu_basketball_men`, `_display`, `sensor.wvu_basketball_women` (live state) | Read/reference only (done, 2026-09-29) | All report `PRE`, none report NOT_FOUND — resolves the P1 verification item |
| `www/gd/gd-core.js` `TEAMS` array — hypothetical WVU Women's Basketball entry | **Not modified.** Assessed only. | P2, gated on separate card-edit approval; the one-line entry this would require is documented in `05` but not written |
| `www/gd/gd-core.js` — hypothetical Mets/WVU Baseball `TEAMS` entries | **Not modified, not currently planned.** | Deferred per the reprioritization instruction |

### Archive plan (`06-archive-plan.md`) — P2, proposed, not executed, gated on separate approval

| File | Impact | Why |
|---|---|---|
| `gd-command-card.v6.bak.js` | File moved (proposed) | Confirmed unreferenced, oversized, mislabeled |
| `sportsintel_probe_jets_gb_summary.json` | File moved (proposed) | Confirmed unreferenced raw API capture |
| `sportsintel_probe_wvu_va_actual_summary.json` | File moved (proposed) | Same |
| `sportsintel_probe_wvu_va_summary.json` | File moved (proposed) | Same |
| New `archive/sportsintel_dashboard_cleanup_<date>/` | New file(s)/folder (proposed) | Destination, following existing convention |

### Lighting consolidation (`07-lighting-consolidation-design.md`) — Defer, design retained, no implementation scheduled

| File | Impact | Why |
|---|---|---|
| `automations.yaml` | New content + eventual removals, existing file | 21 automations replaced by ~9 blueprint instances, migrated one team at a time |
| New blueprint file (path/name TBD at implementation) | New file | Shared lighting-cue blueprint, mirroring `sportsintel_detectors.yaml`'s existing pattern |
| `scripts.yaml` | Read/reference only | `team_score_flash`/`team_win_celebration` already generic and reused as-is; WVU-specific trio's fate (keep vs. generalize) is an implementation-time decision, not decided here |

## Files this phase's plans do NOT propose touching, anywhere

`configuration.yaml`, `secrets.yaml`, any file under `custom_components/`
(including `teamtracker/`), `sportsintel_espn_football.yaml`,
`sportsintel_rankings.yaml`, `wvu_alumni_fetch.yaml`, `wvu_soccer_fallback.yaml`,
`sports_game_day.yaml`, the Game Day card's four `www/gd/*.js` modules, the
dashboard YAML, or anything in `.storage/`. All of these were read during
research; none are modified by any plan in this phase.
