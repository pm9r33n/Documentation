# Priority 3 — Source Freshness Plan

**Tier: P1** (elevated from its original "Priority 3" label by the
2026-09-29 reprioritization, now ranked alongside Knicks coverage and AI
provider routing rather than after them — see
`00-scope-and-guardrails.md` for the live tier list).
**Status:** Planning only. No files listed below have been modified.

**Note on scope**: the task instructions for this document were truncated
mid-specification (the field list cut off immediately after
`last_error_category:`, with no closing of the code block and no further
prose). The fields given verbatim are preserved exactly as specified below;
everything after that point is this plan's own completion of the model,
clearly marked as such, so it's obvious which parts were dictated and which
were inferred to make the model usable.

## The problem, precisely

Today, `data_quality: degraded` in `sportsintel_moments.yaml` is detected by
string-matching `'API_LIMIT'` or `'error'` (case-insensitive) inside the
API response message. This catches a source that *errors loudly*. It does
not catch a source that *stops updating silently* — a TeamTracker sensor
that simply never polls again produces no error string at all, and nothing
currently notices. This plan replaces the string-match with a
timestamp/TTL model that catches both failure modes.

## Field model

Fields given verbatim in the task instructions:

```yaml
observed_at:               # when THIS evaluation ran (wall-clock "now" at check time)
source_updated_at:         # the timestamp the source itself claims for its data
last_successful_refresh_at: # the last time a refresh actually succeeded
freshness_seconds:          # observed_at - last_successful_refresh_at, in seconds
source_status: healthy | degraded | stale | failed | unknown
failure_count:              # consecutive failed refresh attempts
last_error_category:        # sanitized category, not a raw message
```

Fields proposed to complete the model (not specified in the truncated
instructions — added because the model above can't function as a real
state machine without them, and each is justified below):

```yaml
source_name:                 # which source this record describes (teamtracker/espn_direct/rss/ai_provider) — needed because this model is meant to be reused across every data source in the assessment (TeamTracker, direct-ESPN, RSS, AI providers), not just one
staleness_threshold_seconds: # per-source-type threshold above which freshness_seconds alone means "stale" even with source_status otherwise healthy — needed because a 4-hour rankings poll and a 15-minute news poll can't share one hardcoded number
consecutive_successes:       # mirror of failure_count, needed to define the failed -> degraded -> healthy recovery path, not just the forward failure path
```

## `source_status` state machine

| State | Condition | Meaning |
|---|---|---|
| `unknown` | `last_successful_refresh_at` has never been set | Never successfully observed — e.g. a newly-registered source (this is the exact state a new Knicks detector would start in before its first successful poll, per `02-knicks-coverage-plan.md`) |
| `healthy` | `freshness_seconds < staleness_threshold_seconds` AND `failure_count == 0` | Normal |
| `degraded` | A refresh attempt returned an error (matches today's existing string-based signal) but `freshness_seconds` is still within threshold — data is stale-tolerant for now | Equivalent to today's `data_quality: degraded`, but now also timestamp-aware |
| `stale` | `freshness_seconds >= staleness_threshold_seconds`, regardless of whether the last attempt errored or just silently didn't happen | **The gap this plan closes** — catches silent non-updates, which today's string-match cannot |
| `failed` | `failure_count >= a configurable consecutive-failure threshold` (proposed default 3, matching the circuit-breaker threshold in `03-ai-provider-routing-plan.md` for consistency across the two new mechanisms) | Persistent, not transient — worth surfacing more visibly than `degraded` |

Recovery path: `failed`/`stale` → `degraded` (first success after failure,
but not yet enough consecutive successes to call it fully healthy) →
`healthy` (after `consecutive_successes` clears a small threshold, proposed
default 2, to avoid flapping on a single lucky poll).

## Where this replaces existing logic

- `sportsintel_moments.yaml`'s `data_quality_degraded` moment generation
  (~line 320 per this session's earlier research) — the string-match
  condition is replaced by a `source_status in ('stale', 'failed')` check
  against the new per-source record, with `degraded` still producing the
  existing ROUTINE-tier moment and `stale`/`failed` newly able to produce a
  distinct, more visible signal (exact tier TBD during implementation —
  not decided here to avoid pre-committing a UX choice this document isn't
  scoped to make).
- `sportsintel_last_seen.yaml` — this file already exists specifically to
  track "when did we last see this," per its own documented history (a
  real 13-day-stale bug from a wrong dashboard-path assumption). This plan
  treats that file as the natural home for `last_successful_refresh_at`
  tracking rather than inventing a parallel mechanism — the freshness model
  should extend what already exists there, not duplicate it.
- **Front-end staleness constants already exist and should be reconciled,
  not duplicated**: `www/gd/gd-core.js` defines `TT_STALE_MIN = 45` and
  `SI_STALE_H = 6` (confirmed by reading the file directly this session) —
  hardcoded thresholds the Game Day card already uses to decide when to
  show its own staleness indicator. Once this backend model exists, these
  two constants are natural candidates for `staleness_threshold_seconds`
  values, read from the backend rather than hardcoded twice in two places
  that could silently drift apart. This is a genuine architectural
  improvement this plan surfaces, not just a coincidental overlap.

## What this does NOT propose

- A new source is not proposed for detecting freshness — this reuses each
  existing poller's own attempt/response cycle to populate the record; it
  does not add a new polling job.
- No change to actual polling cadences (4h rankings, 15m news, daily
  alumni, etc.) — this plan only formalizes how staleness relative to
  those existing cadences is *detected and reported*, not how often
  sources are checked.
- No UI/dashboard change is designed here — surfacing `source_status` in
  the dashboard (beyond the existing amber-header behavior already in the
  card) is a follow-on design question, not part of this plan.

## Open implementation question

Whether `staleness_threshold_seconds` should be a single per-source-type
constant (simplest) or configurable per team/source instance (more
flexible, more moving parts) is left open — the assessment identified the
*detection mechanism* as the gap, not a need for per-team tuning, so the
simpler per-source-type constant is the recommended starting point, with
per-instance overrides deferred unless real usage shows a need.
