# Phase 1 Stabilization — Scope and Guardrails

**Status:** Planning only. No implementation has occurred. Nothing in this
directory authorizes any change to the live system.

## Reprioritization (2026-09-29)

Baseball is ending and is now lower priority. The tiering below supersedes
any earlier priority numbering in these documents (originally labeled
"Priority 1/2/3" — those numbers now map onto the tiers here, plus two new
items). This update touched **only** the planning documents in this
directory; no runtime, production, or card file was edited, and one
read-only live-state check was performed (see below) that altered nothing.

**P1:**
- Knicks SportsIntel backend coverage and validation (`02`).
- Timestamp-based freshness/source-health model (`04`) — elevated from
  its original "Priority 3" slot.
- AI provider routing, deterministic fallbacks, and circuit-breaker policy
  (`03`).
- Read-only verification of the WVU men's basketball NOT_FOUND condition
  (`05`) — **now executed**, not just planned: `sensor.wvu_basketball_men`
  currently reports `PRE` with a `last_reported` timestamp from within the
  last hour (2026-09-29T17:09:21Z), not `NOT_FOUND`/`unavailable`. The
  persistent-NOT_FOUND behavior described in prior project notes is not
  reproducing right now. This does not prove the old note was wrong in
  general (it may have been a live-game-specific or since-fixed issue) —
  only that, as of this check, the sensor is healthy. See `05` for full
  detail and its limits.

**P2:**
- WVU women's basketball Game Day card coverage — evaluated in `05`,
  found low-risk and a close fit to the existing model, but **not
  implemented** (card files remain out of scope for editing in this
  phase) and gated on separate approval.
- Archive plan (`06`) — execution gated on separate approval, unchanged
  from its original "proposed only" framing.

**Defer:**
- Mets Game Day card parity — unless it blocks existing Mets tracking or
  postseason use (neither is currently the case; Mets already has working
  TeamTracker + SportsIntel-engine coverage independent of the card).
- WVU baseball Game Day card parity — deferred until closer to next
  baseball season.
- Broad baseball-specific enrichment, automation, or UI work — no plan in
  this phase proposed any; this just makes the non-proposal explicit.
- Lighting/Game Mode consolidation (`07`) — **design retained, no
  implementation scheduled.** This was already the document's framing
  ("design only... not implemented"); the reprioritization confirms that
  stays true rather than becoming a near-term item.

## What this phase is

A set of concrete, reviewable implementation plans addressing findings
from `docs/assessment/sports_dashboard_assessment.md`, now organized into
the P1/P2/Defer tiers above rather than a flat numbered list:

1. Knicks have no SportsIntel engine coverage (detector/moments/AI
   brief/notification), despite a working TeamTracker sensor. **(P1)**
2. Stale/error detection is a brittle string-match, not timestamp-based.
   **(P1)**
3. Sage is the default AI provider despite a documented ~96% failure rate
   on score-bearing events. **(P1)**
4. The assessment's open questions needed direct verification — one is now
   resolved with a live read, one was already resolved last session, one
   (WVU Basketball Women/Mets/Baseball card-scope gap) is newly assessed
   at P2/Defer. **(P1 for the verification action itself)**
5. Archive candidates and lighting-automation duplication were identified
   but not acted on. **(P2 and Defer, respectively)**

Each plan describes the smallest change that closes the gap, the exact
files/symbols it touches, how it would be tested without disrupting
production, and how to roll it back. **None of these plans have been
executed.**

## Hard boundary for this phase (verbatim from the task)

Do not modify, create, move, archive, rename, or delete any production
configuration, dashboard file, Home Assistant package, automation, script,
custom component, JavaScript card file, data file, Docker file, secret,
database, or `.storage` artifact. Do not start/stop/restart/deploy/pull/
build/recreate any service or container. Do not restart Home Assistant,
Supervisor, add-ons, or the host. Do not trigger any automation, script,
notification, webhook, or device action. Do not call external APIs, AI
providers, RSS feeds, or sports providers. Do not install or upgrade any
dependency. Do not commit, push, branch, merge, create a PR, or alter Git
history. Do not archive or delete any artifact. Do not change the live
system in any way.

**The only exception exercised while writing these plans**: a small number
of read-only lookups against the live Home Assistant instance (entity
existence checks via `home_assistant_get_live_context_and_states`, and
file reads via `home_assistant_read_text_file`/`list_files`) were used to
replace assumptions with confirmed facts — consistent with the standing
rule to never guess an entity ID. Specifically confirmed this session:
- `sensor.ny_knicks` / `sensor.ny_knicks_display` exist and are usable —
  no new TeamTracker sensor is needed for Knicks coverage.
- `www/gd/gd-core.js`'s actual `TEAMS` array (not just its header comment)
  already includes an NY Knicks entry (`sensor.ny_knicks`, league `"NBA"`),
  confirming the card's front end already expects Knicks data — this is a
  backend/pipeline gap only.
- The same `TEAMS` array does **not** include NY Mets, WVU Basketball
  Women, or WVU Baseball — resolving the assessment's open question about
  the card's Mets scope (the header comment was accurate, not stale) and
  surfacing a previously-unflagged gap for the other two.
- `dashboard_backups/2026-09-20/` and `archive/carrie_carissa_merge_20260921/`
  are existing, already-used conventions for dated archive folders — the
  archive plan (07) follows this precedent rather than inventing a new one.
- (Added during the 2026-09-29 reprioritization) `sensor.wvu_basketball_men`,
  `sensor.wvu_basketball_men_display`, and `sensor.wvu_basketball_women` live
  states, read via `home_assistant_get_live_context_and_states`: all report
  `PRE`, with `sensor.wvu_basketball_men`'s `last_reported` timestamp within
  the last hour of the check — resolving the open NOT_FOUND question for
  right now (see `05` for the full, appropriately-hedged writeup).
- (Same session) confirmed `sensor.wvu_basketball_women` /
  `sensor.wvu_basketball_women_display` exist and are live, and that
  `www/gd/gd-core.js`'s `NEWS_TAGS` map already contains a
  `wvu_basketball_women: "WVU Basketball"` entry despite that team having no
  slot in the `TEAMS` array — informs the P2 card-coverage assessment in
  `05`.

No live configuration, dashboard, package, script, automation, or card file
was read-modified — only read.

## What this phase explicitly preserves

- TeamTracker's existing coverage of all 4 primary franchises and 6 WVU
  sports — no new integration, no duplicate sensors.
- SportsIntel's existing detection/briefing/notification pipeline
  architecture (trigger-based template sensors, the `sportsintel.engine.*`
  event bus, the `by_team` compound-key store).
- Both Ollama and Sage as providers — Priority 2 changes *routing*, not the
  providers themselves.
- The three existing non-AI hallucination guardrails (response_guard,
  response_qa, response_scoring) — untouched.
- The WVU soccer fallback package — its existence is treated as justified;
  no plan here proposes removing or replacing it.
- The dashboard, Game Day card, and Game Day Mode automations — described
  and referenced, never proposed for modification.

## Document index

| File | Covers |
|---|---|
| `01-file-impact-analysis.md` | Every file expected to be touched, added, or read across all initiatives below, with blast-radius classification |
| `02-knicks-coverage-plan.md` | Priority 1 — closing the Knicks SportsIntel gap |
| `03-ai-provider-routing-plan.md` | Priority 2 — event-class-based provider routing, circuit breaker |
| `04-source-freshness-plan.md` | Priority 3 — timestamp-based freshness model |
| `05-open-question-verification-plan.md` | Resolving/tracking the assessment's remaining open items |
| `06-archive-plan.md` | Proposed (not executed) disposition of safe-to-archive clutter |
| `07-lighting-consolidation-design.md` | Design for collapsing the 21 near-duplicate lighting automations |
| `08-validation-and-rollback-plan.md` | Cross-cutting test/rollback procedure for all of the above |
| `phase-1-manifest.json` | Machine-readable summary of initiatives, files, and status |

## Git handling note

This repository has an active stop hook that prompts to commit and push
whenever untracked files remain at the end of a turn. A prior task in this
conversation treated that hook's prompt as an implicit user instruction and
complied. **This task's own explicit instructions say the opposite** —
"Do not commit, push, branch, merge, create a PR, or alter Git history" is
listed as a hard boundary here, more specific and more recent than the
hook's generic nudge. These plan documents are therefore being left
**uncommitted** on purpose. If the hook fires asking to commit, that
request will not be acted on without checking back first — flagging this
tension now rather than resolving it silently either way.
