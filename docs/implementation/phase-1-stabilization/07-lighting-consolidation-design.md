# Lighting Automation Consolidation — Design (not implemented)

**Tier: Defer.** The 2026-09-29 reprioritization explicitly confirms:
retain this design document, do not schedule implementation. Nothing below
changes as a result — this was already framed as design-only, and stays
that way with no near-term implementation date implied.
**Status:** Design only. No automation or script has been modified.

## The problem

24 sports-related automations exist in `automations.yaml`: 21 near-duplicate
per-team lighting-cue automations (Kickoff/Tipoff/First-Pitch, Score Flash,
Final Result, across WVU Football/Basketball-M/Basketball-W/Baseball/
Soccer, Jets, Knicks, Mets) plus the WVU Game Day Assistant blueprint
automation and the two Game Day Mode enter/exit automations. This directly
contradicts the project's own planning document
("Sports Tracker Mast Project"), which states a "no automation sprawl"
principle — one reusable event schema instead of per-team automations —
that SportsIntel's own event bus already demonstrates is achievable.

A concrete symptom of the duplication's cost: the Jets/Knicks/Mets loss
automations call `script.wvu_loss_fade` — a WVU-named script being reused
for non-WVU teams, functional but a sign the copy-paste pattern has already
started drifting from its own naming.

## What already supports consolidation

Two scripts are already generic and parameterized:
`script.team_score_flash` and `script.team_win_celebration` — these are
reused today by the non-WVU automations already. Only the WVU-specific trio
(`wvu_score_flash`, `wvu_win_celebration`, `wvu_loss_fade`) remain
unparameterized, and the naming-drift symptom above shows even that
boundary is already blurring in practice.

## Two design options

### Option A — Single generic automation, template-driven team lookup

One automation triggers on state changes across all 9 team sensors (a
`trigger: state` list, not 9 separate automations), and a single template
determines: which team fired, whether it's a kickoff/score-change/final
event (from the state transition, e.g. PRE→IN, or an attribute change like
`team_score`), and what light/color parameters to use — sourced from a
small lookup dict (team → light target + brand color), similar in spirit
to the existing `NEWS_TAGS`/`TEAM_COLOR`-style maps already used elsewhere
in this system (e.g. the Game Day card's own `STATUS_COLOR`/`TIER_COLOR`
maps in `gd-core.js`).

- **Pro**: one automation instead of 21; adding a team (e.g. Knicks, per
  `02-knicks-coverage-plan.md`) means adding one lookup-dict entry, not
  three new automations.
- **Con**: more complex template logic concentrated in one place; a bug
  there affects every team's lighting at once, rather than being isolated
  to one team's automation (a real trade-off, not just a stylistic one —
  this is a genuine increase in blast radius per change, balanced against
  a genuine decrease in the number of places to make that change).

### Option B — Blueprint-based, one instance per team (mirrors SportsIntel's own pattern)

A reusable automation blueprint (inputs: team sensor entity, light target,
brand color, event-type mapping) instantiated once per team — structurally
identical to how `sportsintel_detectors.yaml` already handles the
"one team, one instance of a shared template" problem for the SportsIntel
engine itself.

- **Pro**: keeps per-team isolation (a bug in one instance doesn't affect
  others), consistent with how the rest of this system already solved the
  same "same logic, many teams" problem — reusing an established, working
  pattern rather than inventing a new one.
- **Con**: still 9 separate automation instances (down from 21, since each
  instance would cover kickoff+score+final for its team in one blueprint
  rather than three), not a single automation — less consolidation than
  Option A, but lower risk per change.

## Recommendation

**Option B**, on consistency grounds: this system has already established
"shared blueprint, one instance per team" as its working pattern for
exactly this class of problem (SportsIntel detectors), and the Knicks
coverage plan in this same phase already proposes extending that same
pattern. Introducing a second, differently-shaped consolidation mechanism
(Option A) for lighting specifically would add a second pattern to
remember rather than reinforcing the one that already exists and is
already being extended. Option A remains documented above as a considered
alternative, not silently discarded, in case a future review weighs the
trade-offs differently.

## What this design does NOT do

- It does not touch `script.team_score_flash`/`team_win_celebration` (they
  already work and are already shared) — only the WVU-specific trio and
  the 21 automation definitions are in scope for consolidation.
- It does not propose changing the Game Day Mode enter/exit automations —
  out of scope, and the task instructions explicitly asked for these to be
  left alone elsewhere in this project.
- It does not implement the blueprint — this document is the design to be
  reviewed before any blueprint file is written.

## Rough migration shape (for the eventual implementation, not this phase)

1. Write the blueprint, test it against one team (a natural candidate: the
   newest addition, Knicks, once `02-knicks-coverage-plan.md` lands, so the
   new team gets the new pattern from day one instead of yet another
   copy-pasted automation).
2. Migrate the other 8 teams one at a time, each independently testable and
   independently revertible (delete the new instance, the old automation
   is untouched until its replacement is confirmed working).
3. Only remove the old per-team automations after their blueprint
   replacement has been observed working through at least one real game
   per team — not on a schedule, on evidence.
