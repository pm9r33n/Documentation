# Priority 2 — AI Provider Routing Plan

**Tier: P1** (elevated from its original "Priority 2" label by the
2026-09-29 reprioritization — the numbering in this file's title is
historical, not current; see `00-scope-and-guardrails.md` for the live
tier list).
**Status:** Planning only. No files listed below have been modified.

## The problem, precisely

`input_select.sportsintel_ai_provider` defaults to `"sage"` (`sportsintel_
helpers.yaml`), yet Sage's measured first-attempt failure rate on
score-bearing event types (`live_update`/`score_change`/`halftime`/`final`)
is ~96% — documented directly in `sportsintel_response_guard.yaml`'s own
header comment. The system already works around this by hard-routing those
four event types to Ollama at specific call sites (`response_qa.yaml`,
`ai_brief.yaml`) rather than by changing the default. That's a real,
working mitigation — but it means the *general* default remains wrong for
the majority of the highest-value traffic, and every future event type
added to the system inherits a bad default unless someone remembers to add
another hard-route.

**This plan replaces "one global default provider" with an explicit,
per-event-class routing table**, so correctness doesn't depend on
remembering to special-case new event types.

## What is preserved

- Both providers stay exactly as they are: Ollama (`qwen2.5:3b`, local,
  90s timeout) and Sage (`conversation.homeway_sage_free_chatgpt_gemini`,
  free/quota-limited). Nothing here proposes adding a new provider or
  removing either existing one.
- The existing `script.sportsintel_ai_generate` abstraction remains the
  single place any code calls into an AI provider — the documented rule
  that it's the *only* place allowed to name a provider is preserved and
  reinforced, not bypassed.
- Structured data (scores, records, schedule state) is already treated as
  authoritative and never AI-generated — this plan does not change that;
  it only changes which provider (if any) handles the *optional* AI
  enrichment layer (briefs, narrative color, conversational answers).
- The existing deterministic-text-only policy for notification content
  (`sportsintel_notify.yaml`) is untouched — AI is already never used for
  the actual push-notification text of factual events, and that stays true
  under this plan.

## Event-class routing decision table

| Event class | Data authority | Is AI required? | Provider priority | Timeout budget | Fallback |
|---|---|---|---|---|---|
| Score/state changes (pre/live/final) | TeamTracker — authoritative | No (deterministic text only, unchanged) | N/A — no AI call for the notification text itself | N/A | Existing deterministic template |
| High-leverage moment notification text | SportsIntel moments engine | No (deterministic text only, unchanged) | N/A | N/A | Existing deterministic template |
| Pregame/postgame AI narrative brief | AI-generated, informational/enrichment only | Optional | 1. Ollama 2. Sage (only if Ollama's circuit is open) 3. none | Ollama 90s (existing) / Sage 20s (new, see below) | Existing deterministic lead sentence (score/rank direction), already prepended ahead of AI text per `ai_brief.yaml` |
| News/moment color commentary (BREAKING/MAJOR narrative embellishment) | AI-generated, informational only | Optional | 1. Ollama 2. Sage | same | Plain factual sentence, no embellishment |
| Ask-Agent conversational query (dashboard chat) | AI-generated — this is inherently a conversation, not a data lookup | Yes | 1. Sage (purpose-built for conversation) 2. Ollama | Sage 20s (new) / Ollama 90s | Existing "AI summary unavailable" message (already used today for the unimplemented ChatGPT/Gemini options — reused here as the generic unavailable state, not a new UX pattern) |
| Ranking-change commentary | AI-generated, informational | Optional | 1. Ollama 2. Sage | same | Deterministic factual sentence |

**Why Ollama is prioritized over Sage for most classes**: it's the only
provider with a measured, documented reliability number for score-bearing
work, and nothing in the assessment or the source shows Sage performing
*better* than Ollama for any class except pure conversation (which Sage is
purpose-built for and Ollama is not tuned for). Sage is not removed from
the table — it remains first choice specifically where its strength
(conversational, free-tier, low-latency chat) applies, and remains
available everywhere else as the failover option once Ollama's circuit is
open, rather than being taken out of rotation entirely.

## Circuit breaker design

Per-provider, not global — a failing Sage shouldn't take Ollama out of
rotation and vice versa.

- **State**: `closed` (normal) → `open` (provider skipped) →
  `half_open` (one trial call allowed) → back to `closed` on success or
  `open` on failure.
- **Failure threshold (configurable)**: default 3 consecutive failures, OR
  failure rate > 50% over the last 10 calls for that provider — whichever
  triggers first.
- **Cooldown (configurable)**: default 15 minutes before `half_open`;
  doubles on each repeated trip, capped at 60 minutes, to avoid hammering a
  genuinely down provider while still recovering promptly once it's back.
- **Storage**: a small set of `input_number`/`input_text` helpers per
  provider (failure count, circuit state, cooldown-until timestamp) — the
  same style of lightweight state already used elsewhere in this system
  (e.g. the notification dedup hash list), not a new storage mechanism.
- **Effect of an open circuit**: the routing table's priority list simply
  skips that provider for the duration, falling through to the next
  priority or to the deterministic fallback if none remain healthy. This
  is a *routing* decision, not a retry — see below for the distinction.

## Bounded retry behavior

- **Within a provider**: at most one retry, matching the existing
  regeneration pattern already implemented in `ai_brief.yaml` — this plan
  does not add a second layer of retries on top of that; it clarifies that
  the retry budget is spent on the *currently selected* provider only.
- **Across providers**: if the selected provider's circuit is already
  open, no retry is spent on it at all — routing moves directly to the
  next priority. This avoids wasting the bounded retry budget on a
  provider already known to be failing.
- **Total worst case for one event**: one call to the top-priority
  provider (with its one existing retry) → circuit-breaker failure
  recorded → immediate fallover to the next priority (no retry spent
  re-testing a closed-but-struggling provider a second time) → its own one
  retry → deterministic fallback. This is bounded by construction, not by
  a counter that could be misconfigured to loop.

## Timeout budget

| Provider | Existing/proposed timeout | Rationale |
|---|---|---|
| Ollama | 90s (existing, unchanged) | Already tuned for CPU-only local inference; not a bottleneck to change here |
| Sage | 20s (new — currently appears undefined, relying on `conversation.process`'s own default) | Sage is a free-tier conversational agent, not expected to need anywhere near Ollama's budget; an explicit, short timeout prevents a hung Sage call from blocking a time-sensitive score-bearing notification path if it's ever selected as fallback |

## Notification behavior

Unaffected for factual/score content — that path was already, and remains,
deterministic-text-only regardless of provider health. Only the
*optional* AI-enrichment classes (brief narrative, color commentary,
conversational answers) can be affected by provider routing, and their
existing fallback (deterministic sentence, or "AI summary unavailable")
already handles total AI unavailability gracefully today — this plan
formalizes *when* that fallback triggers, it doesn't invent the fallback
itself.

## Logging

Extends the existing failure-reason telemetry already present in
`sportsintel_ai_provider.yaml` (`quota_exhausted` vs. `provider_error`,
added 2026-09-18) rather than replacing it. One structured log line per AI
call attempt:

```json
{
  "event": "sportsintel_provider_routing",
  "event_class": "pregame_brief",
  "provider_attempted": "ollama",
  "circuit_state": "closed",
  "duration_ms": 4210,
  "outcome": "success",
  "fallback_used": false,
  "error_category": null
}
```

`error_category` is a small closed enum (`timeout`, `quota_exhausted`,
`provider_error`, `validation_failed`, `circuit_open`) — never a raw
exception message. **No prompt text, no AI response text, and no secrets
are ever logged** — consistent with the existing system's own documented
position that cloud provider keys, when they eventually exist, must go
through `!secret`, and with this session's established practice elsewhere
(the shadow-mode instrumentation work) of designing logging to be
measurement-only and free of anything sensitive by construction, not by
after-the-fact scrubbing.

## What is explicitly NOT proposed

- Changing `input_select.sportsintel_ai_provider`'s default away from
  `"sage"` as a blunt fix. The routing table replaces the *need* for a
  single global default for AI-enrichment classes; the input_select can
  remain as a manual override/debugging tool without being the thing that
  decides real routing.
- Adding ChatGPT/Gemini support — out of scope; they remain documented
  stubs.
- Any change to how structured/factual data is sourced or validated —
  untouched, and correctly so per the assessment's own recommendation to
  preserve it.
