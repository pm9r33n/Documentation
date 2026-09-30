# Cross-Cutting Validation and Rollback Plan

**Status:** Planning only — describes how each initiative *would* be
validated and rolled back if and when implementation is authorized. No
validation or implementation step below has been run against the live
system beyond the read-only reconnaissance already noted in
`00-scope-and-guardrails.md`.

**Reprioritization note (2026-09-29)**: the table below is now ordered by
current tier (P1 first) rather than the original file-numbering order.
Deferred initiatives (lighting consolidation, Mets/WVU Baseball card
parity) have no near-term validation plan — they're listed for
completeness with their current status noted, not scheduled.

## Standing rule this plan follows

Per this project's own operating rules (CLAUDE.md): run a config check
before any reload; reload only the affected domain; never restart Home
Assistant without asking first. Every procedure below assumes that rule
applies at execution time, not just as a suggestion.

## Pre-flight checklist (applies to every initiative below)

1. Config check (`homeassistant.check_config` or equivalent) passes with
   no new errors — comparing before/after, since this system already has a
   known, accepted pre-existing warning (`_diag_frigate_snapshot` invalid
   slug) that should not be mistaken for a regression.
2. The specific file(s) changed are confirmed by re-reading them back after
   the write — a standing gotcha on this system (`home_assistant_write_file`
   can silently fail to land on large files) documented in this project's
   own `ha-ops` skill.
3. A backup of each file being modified is taken first, following this
   system's own existing convention (dated folder under `archive/` or
   `dashboard_backups/`, per `06-archive-plan.md`'s research into what
   convention already exists) — not a new backup scheme invented for this
   phase.
4. Only the automation/template domain relevant to the change is reloaded
   — not a full HA restart — consistent with the standing rule above.

## Per-initiative validation summary

| Tier | Initiative | Validation approach | Full detail in |
|---|---|---|---|
| P1 | Knicks coverage | Static config check → domain reload → read-only state check for a new Knicks key appearing → optional dry-run via test-mode boolean → one real-game observation before declaring done | `02-knicks-coverage-plan.md`, "Non-invasive test strategy" |
| P1 | Source freshness | New `source_status` values verified against at least one already-known-degraded case (e.g. a deliberately stopped poller in a test window) and one already-known-healthy case, before trusting the state machine on live data | `04-source-freshness-plan.md` |
| P1 | AI provider routing | Circuit-breaker state transitions tested against synthetic failure counts (not real provider outages) before relying on a real outage to prove it works; routing-table decisions verified per event class against the decision table | `03-ai-provider-routing-plan.md` |
| P1 | WVU basketball men NOT_FOUND verification | **Already executed** (read-only) — resolved for the current off-season window; a live-game recheck remains optional future work, not blocking | `05-open-question-verification-plan.md` |
| P2 | WVU Women's Basketball card coverage | Would be validated by confirming the new `TEAMS` entry renders correctly against real `sensor.wvu_basketball_women` state through one game, mirroring the men's entry's known-good behavior | `05-open-question-verification-plan.md` |
| P2 | Archive candidates | Re-verify each candidate is still unreferenced immediately before moving (configs can change between planning and execution) | `06-archive-plan.md` |
| Defer | Lighting consolidation | New blueprint instance run in parallel with (not replacing) the old per-team automation for one team through one real game, compared side by side, before any old automation is removed — **not scheduled** | `07-lighting-consolidation-design.md` |
| Defer | Mets / WVU Baseball card parity | No validation plan yet — revisit if/when these move out of Defer | `05-open-question-verification-plan.md` |

## Rollback principles common to all five initiatives

Every plan in this phase was deliberately scoped to be **additive**, not
transformative, specifically so rollback is simple:

- Knicks coverage: two new pieces of config (one blueprint instance, one
  map entry) — remove them, nothing else changes.
- AI provider routing: a new routing layer sitting in front of the
  existing `script.sportsintel_ai_generate` call — reverting means routing
  falls back to today's single-default-plus-hardcoded-overrides behavior,
  which continues to exist underneath and isn't deleted by this work.
- Source freshness: a new field set and state machine that *extends*
  `sportsintel_last_seen.yaml` and replaces one condition inside
  `sportsintel_moments.yaml` — reverting means restoring the one changed
  condition to its current string-match form.
- Lighting consolidation: explicitly designed to run new-alongside-old
  before any old automation is deleted — rollback during the transition
  period is just "don't delete the old one yet," which is already the
  planned default state until proven otherwise.
- Archiving: a file move, trivially reversible by moving the file back.
- WVU Women's Basketball card coverage (P2, once authorized): a single
  array-literal addition to `gd-core.js`'s `TEAMS` — reverting is deleting
  that one entry.

**No initiative in this phase proposes a change that can't be undone by
reverting a small, specific, previously-identified set of edits.** This was
a deliberate design constraint across all plans, not an incidental
property.

## What "done" looks like for Phase 1 as a whole

All five initiatives implemented, validated per their own section above,
and observed correct through at least one real occurrence of the condition
they're meant to handle (a real Knicks game, a real provider failure, a
real stale source, one full lighting-automation migration, and confirmation
the archived files are genuinely unmissed) — not merely "the config check
passed." This mirrors the observation-mode discipline already used
elsewhere in this project for validating a production safety change against
real traffic before calling it done, rather than trusting a synthetic test
alone.
