# Open-Question Verification Plan

**Status:** Two of the three open questions from the assessment were
resolved this session via read-only lookups (no live system change). One
remains genuinely open. This document records how each was/would be
answered, so the method is auditable either way.

## 1. Does `www/gd/gd-core.js` include NY Mets in its `TEAMS` array? — RESOLVED

**Method**: read the live file directly (`home_assistant_read_text_file`,
read-only). **Answer: no.** The actual `TEAMS` array contains exactly six
entries: WVU Football, WVU Women's Soccer, WVU Men's Soccer, NY Jets, WVU
Men's Basketball, and NY Knicks. NY Mets is absent — and so, newly noted,
are **WVU Basketball Women and WVU Baseball**, neither of which the
assessment had flagged. The header comment's "Scope v1" list was accurate,
not stale, on the Mets question specifically. This means Mets, WVU
Basketball Women, and WVU Baseball all have working TeamTracker +
SportsIntel-engine coverage but no slot in the Game Day card itself — a
card-side scope gap, not a data-layer gap. **This is a new finding**,
outside the five priorities this phase was scoped to, and is called out
here rather than folded into the Knicks plan so it isn't lost. No action
proposed in this phase — the card is explicitly out of scope for
modification per the hard boundary above.

## 2. Does `sensor.wvu_basketball_men` actually return NOT_FOUND today? — RESOLVED (2026-09-29, P1)

**This question was elevated to P1 in the 2026-09-29 reprioritization and
executed as a read-only check** (reading live entity state does not alter
runtime state, consistent with every other read-only lookup in this phase).

**Method**:
```
home_assistant_get_live_context_and_states(
  domain_allow_list=["sensor"], include_entity_states=true
)
```
then inspecting the `state` and `last_reported` fields for
`sensor.wvu_basketball_men`, `sensor.wvu_basketball_men_display`, and
(for comparison) `sensor.wvu_basketball_women`.

**Result**:
| Entity | State | `last_reported` |
|---|---|---|
| `sensor.wvu_basketball_men` | `PRE` | 2026-09-29T17:09:21Z (within the hour of the check) |
| `sensor.wvu_basketball_men_display` | `PRE` | 2026-09-29T12:09:19Z |
| `sensor.wvu_basketball_women` | `PRE` | 2026-09-29T17:09:21Z |

**None of these read `NOT_FOUND`, `unavailable`, or `unknown`.** The sensor
is actively polling and reporting a plausible pre-season state during the
current off-season window.

**How to read this result honestly**: this refutes the claim that the
sensor is *currently, persistently* stuck in a NOT_FOUND state. It does
**not** prove the originally-reported bug never happened, or that it can't
recur — a bug that only manifests during live-game polling (as opposed to
the quieter pre-season `PRE` state) wouldn't be caught by a check performed
during the off-season. If this matters for Phase 1 decision-making, the
appropriate follow-up is one more read-only check during an actual live
WVU men's basketball game this season — not assumed here, and not blocking
anything in this phase, since Priority 1 (Knicks) coverage doesn't depend
on this sensor at all.

**Why this matters for Phase 1**: had it been confirmed, this would have
been a TeamTracker-level provider bug independent of anything else in this
phase's scope (alongside the WVU soccer fallback as a second "upstream data
source has a gap" case). As checked today, no such gap is currently
observable — nothing in this phase changes as a result either way.

## 3. What's in `dashboard_backups/`? — RESOLVED

**Method**: `home_assistant_list_files` (read-only). **Answer**: a single
dated subfolder, `dashboard_backups/2026-09-20/`, not a flat pile of files.
This is a cleaner convention than the root-level `.bak-YYYYMMDD-description`
files the assessment flagged — worth noting as the *better* existing
pattern (see `06-archive-plan.md`, which follows this convention rather
than the flat-file one for anything it proposes archiving).

## 4. Card-scope gap follow-up: WVU Women's Basketball (P2), Mets (Defer), WVU Baseball (Defer)

Added 2026-09-29 per the reprioritization instruction, which asked for a
low-risk/fit assessment of WVU Women's Basketball specifically, and
explicit deferral reasoning for Mets and WVU Baseball. This section is the
assessment; **no card file has been edited** — `www/gd/gd-core.js` remains
out of scope for modification in this phase.

### WVU Women's Basketball — P2, assessed as low-risk and a close fit

The men's basketball entry in `TEAMS` is:
```js
{ e: "sensor.wvu_basketball_men", label: "WVU Men's Basketball", short: "West Virginia", league: "NCAAM", logo: WVU_LOGO, news: "wvu_basketball_men" },
```
A directly analogous women's entry would be:
```js
{ e: "sensor.wvu_basketball_women", label: "WVU Women's Basketball", short: "West Virginia", league: "NCAAW", logo: WVU_LOGO, news: "wvu_basketball_women" },
```
Three concrete reasons this is assessed as low-risk:
1. `sensor.wvu_basketball_women` is confirmed live (checked this session,
   §2 above) — no new sensor, no TeamTracker change needed.
2. `gd-core.js`'s own `NEWS_TAGS` map **already contains**
   `wvu_basketball_women: "WVU Basketball"` (confirmed by reading the file)
   — the news-tagging wiring for this team already exists even though its
   `TEAMS` slot doesn't. Adding the `TEAMS` entry completes an
   already-half-built pattern rather than starting a new one.
3. `TEAMS` is a flat array literal with no team-count-dependent logic
   elsewhere in `gd-core.js` observed during this or the prior session's
   reads (`ORDER`, `STATUS_COLOR`, `TIER_COLOR` are all keyed by state/tier
   values, not team identity or array length) — appending one more literal
   is structurally the same kind of change as the Mets/soccer additions
   already made to the SportsIntel backend, not a new class of risk.

**Recommendation**: approve as a P2 follow-up once card-file edits are
separately authorized. **Not implemented here.**

### NY Mets Game Day card parity — Deferred

Mets already has working TeamTracker + SportsIntel-engine coverage
(detector added 2026-09-14, per the original assessment) entirely
independent of the Game Day card. The only gap is the card's `TEAMS` array
omitting a Mets entry — cosmetic/coverage-display only, not a data or
notification gap. Per the reprioritization instruction, this stays
deferred **unless** it blocks existing Mets tracking (it doesn't — tracking
already works without the card) or postseason use becomes relevant. No
action proposed; revisit if the Mets reach a postseason context where
dashboard visibility specifically (not underlying tracking) becomes
important.

### WVU Baseball Game Day card parity — Deferred

Same reasoning: baseball already has full backend coverage, and the sport
is ending for the season (per this reprioritization's own stated reason for
deprioritizing baseball generally) — implementing card parity now would be
building UI for a sport about to go quiet for months. Revisit closer to
next baseball season, alongside a general review of whether the assessment
identified anything baseball-specific worth acting on before opening day.

## Summary

| Question | Status | Method | Live system touched? |
|---|---|---|---|
| Mets in `gd-core.js` `TEAMS`? | Resolved: No (Mets card parity → Deferred) | Direct file read | No — read-only |
| WVU basketball men NOT_FOUND? | Resolved (as of 2026-09-29): sensor reports `PRE`, not NOT_FOUND | Live state read | No — read-only |
| `dashboard_backups/` contents | Resolved: one dated subfolder | Directory listing | No — read-only |
| WVU Women's Basketball card coverage | Assessed: low-risk, P2, not implemented | File read + structural analysis | No — read-only, no edit |
| WVU Baseball card parity | Deferred (season ending) | N/A — deferral decision, no verification needed | No |
