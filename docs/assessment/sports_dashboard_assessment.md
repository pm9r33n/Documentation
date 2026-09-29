# Sports Intelligence Hub — Assessment (read-only)

**Date:** 2026-09-29
**Scope:** WVU Mountaineers, NY Jets, NY Mets, NY Knicks, WVU alumni-in-pro-sports.
**Method:** Read-only inspection of the live Home Assistant config tree (via Homeway MCP), the `custom_components/teamtracker` integration source, and live config-entry data in `.storage/core.config_entries`. No files were modified, no service/automation/script was triggered, no external API was contacted, nothing was staged/committed/pushed, and no container/service was started, stopped, or restarted. Four parallel read-only research passes covered, respectively: (A) the SportsIntel data/detection/notification packages, (B) the SportsIntel AI/engine packages, (C) the dashboard, cards, and operational surface, and (D) WVU alumni tracking, the soccer fallback, and TeamTracker itself. This document synthesizes their findings; file:line citations below trace back to those passes.

**Note on scope:** the task instructions this assessment was commissioned under were truncated after the Phase 1 file-discovery list — no explicit "Phase 2/3" or enumerated list of required output documents was received. This single document was produced as the sensible default deliverable, organized around the "Desired outcome" table in the original request. If a specific document split was intended, say so and it can be reorganized.

---

## 1. Executive summary

The system is considerably more built-out than a first glance at the dashboard suggests. Underneath the visible Lovelace dashboard sits a genuinely engineered event/notification pipeline (SportsIntel) with real incident history, real fixes, and real guardrails against AI hallucination — this is not a thin wrapper around an LLM. At the same time, it grew by iteration under real production incidents rather than upfront design, and that shows: there are two largely independent "sports automation" generations running side by side (a 24-automation, per-team lighting-cue generation, and the newer SportsIntel AI-brief/moments/notification engine), several sport/team combinations have partial or recently-patched coverage, and there's a meaningful amount of unreferenced clutter (stray backup files, raw API-probe dumps) at the config root.

**Bottom line by desired-outcome area:**

| Area | State |
|---|---|
| Team coverage | All 4 franchises + WVU's 6 sports have real TeamTracker sensor entries. WVU soccer needed a large custom fallback due to an upstream integration gap. Knicks has sensors + basic lighting automations but **no SportsIntel engine coverage** (no AI brief, no moment detection, no smart notification). |
| Score state | Next/pre/live/final exist and work; postponed is a best-effort heuristic (`possible_disruption`), not a real signal; stale/error is a brittle string-match, not a timeout/TTL check. |
| Dashboard | Meaningfully mature, "calm when quiet" UX is actually implemented. Version history is flat-file backups, not git — fragile change management. |
| Notifications | Real anti-spam/dedup/quiet-hours logic exists, evidence of at least two real fixed incidents (a fabrication bug, a race condition). One dead code branch acknowledged and left in place. |
| WVU alumni | Hand-curated by design (not auto-discovered), which is a defensible choice, but derived data depends on unverified-for-some-sports ESPN schema assumptions. |
| Sources | Multi-source (ESPN via TeamTracker + a second direct-ESPN layer for football + RSS/feedparser for news), with provenance in comments but no unified freshness/health surface. |
| AI | Two working providers (local Ollama + free-tier Sage) with real quota-awareness and three independent hallucination guardrails; ChatGPT/Gemini are stubbed, not implemented. |
| Home controls | Game Day Mode exists and is scoped correctly (home-presence + live-game gated); 21 near-duplicate lighting automations across teams. |
| Operations | No secrets found hardcoded for sports specifically; unrelated plaintext TURN credential noted in `configuration.yaml`. Meaningful root-level clutter (raw probe JSON, a mislabeled 8x-oversized JS backup). |

---

## 2. Team & sport coverage matrix

Verified directly against `.storage/core.config_entries` (live TeamTracker config, not just YAML) — every one of the 9 team/sport combinations below has a genuine TeamTracker config entry; none are "unconfigured."

| Team/sport | TeamTracker entry | SportsIntel detector (AI brief/moments) | Lighting automations | Notes |
|---|---|---|---|---|
| WVU Football | ✅ NCAAF, team_id 277 | ✅ | ✅ Kickoff/Score Flash/Final | Primary/most mature coverage; only sport with direct-ESPN box-score enrichment layer |
| WVU Basketball (M) | ✅ NCAAM, team_id 277 | ✅ | ✅ Tipoff/Score Flash/Final | Prior session notes (outside this assessment's files) claim a persistent NOT_FOUND bug for this sensor; **could not be corroborated or refuted** in any file read this pass — flagged as unverified, not confirmed either way |
| WVU Basketball (W) | ✅ NCAAW, team_id 277 | ✅ | ✅ | No official RSS feed exists for this team's news (acknowledged gap) |
| WVU Baseball | ✅ team_id 136 | ✅ | ✅ First Pitch/Score Flash/Final | Deliberately excluded from the rankings poller (no AP/coaches poll relevance) |
| WVU Soccer (W) | ✅ but **no ESPN conference/group id** | ✅ (added 2026-09-14) | n/a | Required a 652-line/44KB standalone fallback package — see §6 |
| WVU Soccer (M) | ✅ same gap | ✅ (added 2026-09-14) | n/a | Same fallback covers both |
| NY Jets | ✅ NFL, team_id 20 | ✅ | ✅ Kickoff/Score Flash/Final | Second team with direct-ESPN enrichment (shares the football-only enrichment package) |
| NY Mets | ✅ MLB, team_id 21 | ✅ (added 2026-09-14) | ✅ First Pitch/Score Flash/Final | Not named in the Game Day **card's** `Scope v1` header comment (`www/gd-command-card.js:8-9`) despite having a score tile (`sports_score_display.yaml:85-97`) and a working detector — likely a stale comment, not confirmed |
| NY Knicks | ✅ NBA, team_id 18 | ❌ **no detector anywhere in the 7 SportsIntel data-layer packages** | ✅ Tipoff/Score Flash/Final | Gets the old-generation lighting automations but none of the AI-brief/moment/smart-notification pipeline the other 8 have |

**Read this table carefully before assuming "coverage" means the same thing for every row.** A TeamTracker sensor existing means Home Assistant can see the score. It does not mean SportsIntel's AI brief, moment detection, or intelligent (anti-spam, quiet-hours-aware) notification pipeline covers that team — Knicks is the clear example where the two diverge.

---

## 3. Score-state coverage

- **Next / pre-game**: `game_imminent` fires within a 2-hour pre-kickoff window (`sportsintel_moments.yaml` ~527-542).
- **Live**: `live_game`/`live_presence` states, with deterministic (non-AI) significance tiering — first score/lead change and margin-tightening = MAJOR, other margin moves = NOTABLE, heartbeat = ROUTINE (`sportsintel_moments.yaml` 254-280, 483-497).
- **Final**: promoted from the by-team event store (~641-663).
- **Postponed**: there is no real postponed/canceled signal from TeamTracker at all (`sportsintel_moments.yaml` 68-84). It's approximated by `possible_disruption`, explicitly hedged as "unconfirmed" (~623-640) and capped at NOTABLE severity rather than treated as certain — a reasonable mitigation for a real gap, not a fix for it.
- **Stale/error**: represented as `data_quality: degraded`, detected via string-matching `'API_LIMIT'`/`'error'` in the API message (~line 320 per Agent A). **This is not a timeout or TTL check** — if a sensor simply stops updating without producing an error string, nothing detects that as "stale." This is a real gap relative to the desired "stale/error" state.

**Recommendation category: Fix.** The stale-detection gap is the one score-state item that's genuinely incomplete relative to the desired outcome, and it's a bounded, well-scoped fix (a last-updated timestamp + TTL comparison), not a redesign.

---

## 4. Dashboard

`sportsintel_dashboard.yaml` (root, 483 lines) has three views: the main SportsIntel brief, a newer "Team Board" (`custom:auto-entities` grid across all 8 tracked teams, sorted IN > recent POST > PRE > other), and a "SportsIntel Debug" view now correctly hidden from the sidebar (`visible: false`). The header card genuinely implements "calm when quiet, loud when live" — BREAKING/LIVE banners only render when active moments exist; otherwise a plain "Nothing live" state.

Compared to the oldest retained backup (`sportsintel_dashboard.yaml.bak-20260827-pre-mobilefix`, 223 lines, single flat view built around a third-party scoreboard card, 6 teams), the current version has more than doubled in size, added 2 teams, and added a tunable significance/interest-weighting system for the "What's Worth Knowing" feed. This is real, substantive progress, not just churn.

**The Game Day card** (`www/gd-command-card.js` + `www/gd/{gd-core,gd-data,gd-styles,gd-views}.js`) is a clean, hand-written custom element with a genuine data/view/style/constant separation — no build step, four ES modules joined via `Object.assign(...prototype, DataMixin, ViewMixin)`. Its own header warns that all four files must share the same `?v=N` cache-bust suffix or "modules load twice" — a manual step with no tooling enforcement (see Risk register). Per project rules, this card was assessed but not touched.

**Change management is a real weakness.** Six same-day dated backup filenames (`pre-mobilefix → scoreboard-redesign → v2 → v3 → v4-pre-revert → v5-pre-autoentities → v5-pre-singlecol`, all 2026-08-27) show disciplined "snapshot before a risky change" habits, but with no git history behind any of this — it's flat-file copies in the HA config directory itself, plus a separate `dashboard_backups/` folder that wasn't inventoried in this pass.

**Recommendation category: Preserve** the current dashboard and card architecture as-is; **consider** (not now, per operating rules) moving version control of dashboard/card files into this git repository rather than in-place `.bak` files, given how much iteration already happened this way.

---

## 5. Notifications

Two files split responsibility cleanly: `sportsintel_moment_notify.yaml` decides *whether* something is notification-worthy (news MAJOR/BREAKING, team-status NOTABLE disruptions — explicitly excluding game_final/ranking_change to avoid duplicating other paths, comment lines 13-27), and `sportsintel_notify.yaml` decides *how* (tiering via `sportsintel_classify_importance`, quiet-hours suppression of informational/important tiers while never suppressing critical, dispatch via `sportsintel_suppressed`).

Real production hardening is evident:
- Notification text for live_update/score_change/halftime/final/pregame/schedule_change/ranking_change/moment is **deterministic-only, never AI-generated** — an explicit regression fix after a documented fabrication incident (`sportsintel_notify.yaml` 44-64).
- Dedup uses a synchronous MD5-hash write to `input_text.sportsintel_notified_moment_hashes` performed *before* the notification fires, replacing an earlier design that had a documented race condition (57-75).
- The ranking-change notification path is a deliberate dry-run — it computes and logs but never actually sends a push notification yet (`sportsintel_moment_notify.yaml` 178-208). This reads as "intentionally inert," not broken, but is worth confirming that's still the intended state.
- One acknowledged dead branch: the `ai_summary` path inside `sportsintel_message_text` is unreachable and was deliberately left in place rather than removed (129-135) — low risk, but worth a cleanup pass eventually.

**Risk**: the dedup hash list is capped at the last 20 entries — a burst of >20 distinct moments in a short window could theoretically evict an old hash and allow a stale duplicate to re-fire. Low probability, worth knowing.

**Recommendation category: Preserve**, with a **Defer**-priority cleanup of the dead `ai_summary` branch and a decision on whether ranking-change notifications should go live.

---

## 6. WVU alumni

The roster is **hand-curated by design**, not auto-discovered — `sports_game_day.yaml:112-135` hardcodes the roster as the explicit single source of truth, with a comment explaining this choice keeps updates as simple in-file edits plus a template reload. `sports/wvu_alumni_espn_id_candidates.yaml` is a manual staging file for matching names to ESPN IDs before promotion into the live roster (explicitly "NOT written into the live roster yet" at its own header) — at least one batch of candidates has already been promoted (e.g., Colton McKivitz's ID appears in both files), and unresolved names are left `null` rather than guessed. This is a defensible, low-risk design for a curated list of a few dozen people.

Derived fields (team/status/injury/last_game/next_game) refresh via a daily 06:00 job plus a 30-minute post-game polling window — not real-time, which is consistent with "next game" style data rather than live play-by-play. The Game Day card's `players[].name/sport/league/team/status` contract is genuinely populated (not a stub) — confirmed against real event payloads.

**The real risk here isn't the curation model, it's data-source assumptions**: `wvu_alumni_fetch.yaml` explicitly documents that NBA/WNBA/MLB athlete-profile schema and several gamelog stat-key names are "assumed, NOT live-verified" (lines 14-17, 53-57). It degrades safely (shows nothing rather than wrong data) rather than failing loudly, which is the right failure mode, but it means some of these sports' alumni stats may simply never populate without anyone noticing, since there's no error — just silence.

**Recommendation category: Extend** (verify the unverified NBA/WNBA/MLB schema assumptions against live data at least once) — **Preserve** the curation model itself.

---

## 7. Sources, provenance, freshness

Three source layers exist side by side:
1. **TeamTracker** (`custom_components/teamtracker`) — the base score/schedule layer for all 9 team/sport entries, ESPN-backed (plus MLBStats/CFL/HockeyTech providers for other sports the integration supports but this deployment doesn't currently use for these 4 teams).
2. **Direct-ESPN enrichment** (`sportsintel_espn_football.yaml`) — box score, player stats, leaders, drives, win-probability, NFL injuries, scoped to football only (WVU + Jets). This is a deliberate complement to TeamTracker, not a duplicate — it reads identity fields off the TeamTracker sensor and adds a data layer TeamTracker doesn't expose.
3. **RSS/feedparser** — five WVU-sport-specific feeds plus Google News merge/dedup, for the news-moments classifier. Explicitly missing official feeds for WVU women's basketball and women's soccer (acknowledged gap).

**Provenance** exists as code comments, not as a queryable "what source, how fresh" surface a user could check. **Freshness** is inconsistent by design: live-game data refreshes on TeamTracker's own polling cadence, rankings poll every 4 hours, alumni data refreshes daily at 06:00 + a post-game window, news polls on a 15-minute cycle. None of this is wrong, but there's no single place that surfaces "this data is N minutes old" across all three layers — the desired "freshness, graceful failure" outcome is partially met (graceful failure: yes, mostly — `continue_on_error: true` is used consistently; freshness surfacing: no unified view).

**The custom TeamTracker overrides mechanism carries low risk**: `custom_components/teamtracker/overrides/default.json` is confirmed to be untouched upstream stock content (team metadata for non-ESPN providers), deep-merged with an optional local override file that doesn't exist on this instance. All of the actual WVU-specific workarounds were built as fully separate packages specifically so a HACS update to TeamTracker wouldn't silently wipe out a patch — a sound decision, confirmed in practice.

**Recommendation category: Extend** (a simple unified freshness/health view would directly serve the "Operations: health, recovery" desired outcome) — **Preserve** the multi-source architecture and the separate-package-not-integration-patch discipline.

---

## 8. AI

Two real, working providers behind a single abstraction (`script.sportsintel_ai_generate`, documented as the *only* permitted place to name a provider):
- **Ollama** (local `qwen2.5:3b`, LAN-only, unauthenticated, 90s timeout) — used for score-bearing event types by hard routing, because Sage's measured first-attempt failure rate on those event types is ~96%, which had been driving Sage's monthly quota exhaustion through doubled regeneration calls.
- **Sage** (a free/limited conversational agent, not a raw LLM API) — the *default* provider despite that documented failure pattern; quota exhaustion is detected via string-matching the reply text.
- **ChatGPT/Gemini** are listed as selectable options but have zero implementation — explicitly documented, not a hidden gap.

**Grounding is real, not cosmetic.** Prompts are built strictly from present/non-null fields in a live-data context dict; there's an explicit anti-fabrication instruction set (no invented history/records/quality-adjectives/player-injury mentions/rivalry language unless the data actually supplies it), and — more importantly — **three independent, mostly non-AI guardrail layers**: a regex-based deterministic validator (score repetition, rivalry-leak, record-causality-leak, player-leak) that triggers one regeneration then a deterministic-text fallback; a length-only retry gate (misleadingly adjacent-named to suggest content QA, but it isn't); and a post-hoc, observe-only quality scorer that doesn't feed back into behavior yet (by design, Phase A of a two-phase plan). Deterministic, code-computed sentences (score direction, rank direction) are prepended ahead of any AI text specifically so correctness never depends on the model.

**The one design choice worth revisiting**: Sage remains the *default* provider despite its own documented near-total failure rate on the highest-value event types, with the system routing around its own default via hard-coded overrides rather than changing the default itself. This isn't broken — it works — but it's an odd steady state to leave in place indefinitely.

**A latent, unconfirmed risk**: full ESPN box-score/notable-facts payloads flow through several template layers (context → prompts → the by-team store's dict-merge templates) with comments referencing a *previously fixed* 256KB Jinja render-cap incident in a different file, and no visible size cap or pruning on the growing per-team store dicts beyond TTL-based display. Not confirmed failing — flagged as architecturally plausible if ESPN payload sizes grow or more teams are added.

**Recommendation category: Preserve** the provider/guardrail architecture — **Fix** (low urgency) the Sage-as-default choice — **Extend** (add an explicit size guard) on the store/template payload risk before it becomes a real incident rather than a plausible one.

---

## 9. Home controls (Game Day Mode)

`input_boolean.game_day_mode` is entered when any tracked team goes live *and* a family member is home (fallback-sensor aware), and exited when nothing is live — a correctly scoped trigger, not "always on during a game regardless of anyone being present." This matches the desired "optional Game Mode, never uncontrolled automation" outcome.

Underneath it: 21 near-duplicate per-team lighting automations (Kickoff/Score Flash/Final-Result × football/basketball-M/basketball-W/baseball/Jets/Knicks/Mets), backed by a smaller, genuinely reused set of parameterized scripts (`team_score_flash`, `team_win_celebration` for the shared cases; WVU-specific named scripts for WVU). One naming-drift oddity: Jets/Knicks/Mets loss automations call the WVU-named `script.wvu_loss_fade` — functional, just confusingly named. The project's own planning document explicitly warns against exactly this kind of per-team automation sprawl (see §11), which makes this the clearest concrete gap between stated intent and current implementation.

**Recommendation category: Extend/Defer** — consolidating the 21 lighting automations into the same kind of generic, parameterized pattern SportsIntel already uses for its event layer is a real but non-urgent improvement; renaming `wvu_loss_fade` for clarity is a trivial cleanup.

---

## 10. Operations

- **Secrets**: no hardcoded sports-provider API keys were found; Ollama is unauthenticated LAN-only by design, with a comment noting future cloud keys must go through `!secret`. `secrets.yaml` exists and is (correctly) access-denied to this read-only pass. One **unrelated** hygiene note: `configuration.yaml`'s `web_rtc:` block has a plaintext TURN username/credential pair rather than a `!secret` reference — not a sports-system issue, but worth fixing opportunistically.
- **Logs/health**: `sportsintel_debug.yaml` is live, wired-in observability (four trigger-based sensors consuming the real event bus) built specifically to diagnose a real 2026-09-05 incident (19/20 live briefs rejected) — a genuine operational asset, not dead weight. `sportsintel_write_test.yaml` is explicitly self-documented as temporary/safe-to-delete scratch code.
- **Clutter at the config root** (outside `packages/`/`www/`, i.e., harder to reason about at a glance):
  - `gd-command-card.v6.bak.js` — 52,977 bytes vs. the live card's 6,989 bytes (~7.6x larger), a pre-refactor monolith whose *internal* header says "v4" while its *filename* says "v6" — mislabeled, orphaned, referenced by nothing.
  - Three `sportsintel_probe_*.json` files (525-597 KB each) — confirmed by content inspection to be raw one-off ESPN API captures used to validate AI summarization against real payloads, not fixtures anything still reads.
  - `configuration.yaml.bak-pre-sportsintel`, six `sportsintel_dashboard.yaml.bak-*` files, and a separate `dashboard_backups/` folder (not inventoried in this pass) — all flat-file version history with no pruning policy evident.
- **`input_boolean.sportsintel_notification_test_mode`** is marked temporary in its own source comment — worth confirming it's currently off, since if left on it would silently suppress real push notifications.

**Recommendation category: Fix (low effort, real value)** — archive or delete the root-level clutter (`v6.bak.js`, the three probe JSONs) since none of it is referenced by anything; this is pure operational hygiene with no functional risk. **Defer** the TURN-credential secret fix (unrelated to sports, but cheap once someone's in that file anyway).

---

## 11. Planning-document alignment

A file at the config root named `Sports Tracker Mast Project ` (trailing space in the filename, dated 2026-07-27) is a living-doc-style spec: a "Sports Intelligence Center" vision, an explicit "avoid automation sprawl" principle (one reusable event schema instead of per-team automations), and a 6-phase roadmap. Reality has both delivered on and diverged from it:

- **Delivered beyond the doc**: the debug view, an Ask-Agent chat surface, alumni tracking, and September 2026 notification-dispatch migration work all postdate the document and aren't reflected in it.
- **Diverged from its own stated principle**: the 21 per-team lighting automations (§9) are close to the exact anti-pattern the document's Section 2 warns against, even though the SportsIntel engine layer built alongside them *is* the reusable architecture the document envisioned.

**This document is stale and should not be treated as current ground truth** by a future maintainer — it accurately describes the original intent and stack choice (TeamTracker + a Homeway conversational agent, later joined by local Ollama) but misses roughly two months of real development.

**Recommendation category: Fix** — either update this planning doc to reflect current state, or clearly mark it as historical/superseded so nobody re-derives already-solved problems from it.

---

## 12. Consolidated risk register

Ordered roughly by a mix of likelihood and blast radius, not strictly one or the other:

1. **Stale/error detection is string-matching, not timeout-based** (§3) — a sensor that silently stops updating produces no signal at all.
2. **Sage is the default AI provider despite a ~96% documented failure rate on score-bearing events** (§8) — currently mitigated by hard overrides, but an odd steady state.
3. **Unbounded-looking ESPN payload growth through template layers** with a known-precedent 256KB render-cap failure elsewhere in the system (§8) — not confirmed failing, architecturally plausible.
4. **WVU soccer's fallback package is fragile by its own admission** — already needed two in-production bugfixes (a `dict.items` shadowing bug, an HA `variables:` int-coercion surprise) in a 44KB, 652-line standalone package built specifically because the upstream integration's own retry logic (`EspnAllLeaguesProvider`) never activates for this league path (§6, confirmed root cause).
5. **`postponed`/`canceled` has no real signal**, only a hedged heuristic (§3).
6. **21 near-duplicate lighting automations** contradict the project's own stated anti-sprawl principle and already show naming drift (`wvu_loss_fade` used for non-WVU teams) (§9, §11).
7. **No git-based version control for dashboard/card files** — six same-day flat-file backups on one occasion is a real signal that iteration outpaces the change-management approach (§4).
8. **Manual `?v=N` cache-bust synchronization across 4 JS module files**, unenforced by tooling — a missed bump silently double-loads modules (§4).
9. **Dedup hash list capped at 20 entries** — low-probability stale-duplicate re-fire risk (§5).
10. **Root-level clutter** (mislabeled 8x-oversized JS backup, three large raw API-probe JSON dumps) — no functional risk, real maintainer-confusion risk (§10).
11. **Unverified NBA/WNBA/MLB alumni-stat schema assumptions** — degrades silently rather than erroring, so a schema break could go unnoticed indefinitely (§6).
12. **Stale planning document** could mislead a future maintainer into re-solving already-solved problems or missing what already exists (§11).

---

## 13. Recommendations by disposition

**Preserve as-is:**
- The SportsIntel AI-provider abstraction, its three-layer hallucination guardrail system, and the deterministic-text-only policy for factual notification content.
- The dashboard's "calm when quiet, loud when live" header logic and the Team Board view.
- The decision to build WVU-specific ESPN workarounds as standalone packages rather than patching `custom_components/teamtracker` directly.
- The hand-curated WVU alumni roster model.
- Game Day Mode's home-presence + live-game gating.

**Fix (bounded, low-to-moderate effort):**
- Add a real timestamp/TTL-based staleness check alongside the existing string-match `data_quality: degraded` detection.
- Archive/delete `gd-command-card.v6.bak.js` and the three `sportsintel_probe_*.json` files (confirmed unreferenced).
- Update or clearly mark "Sports Tracker Mast Project" as superseded/historical.
- Confirm `input_boolean.sportsintel_notification_test_mode` is currently off.
- Rename `script.wvu_loss_fade` (or generalize it) given it's called for non-WVU teams.

**Extend:**
- Give Knicks the same SportsIntel engine coverage (detector, moments, smart notification) the other 8 team/sport combinations have — currently the one team with real score data but none of the intelligence layer.
- Verify the "assumed, not live-verified" NBA/WNBA/MLB alumni schema fields against real data at least once.
- Add an explicit size guard on the by-team store's accumulated ESPN payload before it becomes a confirmed (not just plausible) 256KB-cap incident.
- Build a real "postponed/canceled" signal if TeamTracker or a supplementary source can provide one, to replace the `possible_disruption` heuristic.
- A lightweight unified freshness/health view across the three data-source layers.

**Defer:**
- Consolidating the 21 per-team lighting automations into a generic, parameterized pattern (real improvement, not urgent — nothing is broken today).
- Removing the acknowledged dead `ai_summary` branch in `sportsintel_notify.yaml`.
- Deciding whether the ranking-change notification dry-run should go live.
- Migrating dashboard/card version history into git instead of flat-file `.bak` copies.
- Fixing the unrelated plaintext TURN credential in `configuration.yaml`.

**Replace:** nothing identified in this pass warrants replacement — even the fragile WVU-soccer fallback is a justified, working response to a confirmed upstream gap, not a design mistake.

---

## 14. Open questions (explicitly unresolved by this pass)

- Does `sensor.wvu_basketball_men` (NCAAM) actually return `NOT_FOUND` today, as prior session notes claim? The TeamTracker config entry for it is confirmed to exist; whether it resolves correctly at runtime would require reading live entity state, which this pass avoided to stay strictly within read-only file/config inspection.
- Does the Game Day card's `gd-core.js` `TEAMS` array actually include the Mets? Its sibling file's header comment (`gd-command-card.js:8-9`) omits Mets from the stated "Scope v1," but Mets has a working detector and a dashboard score tile elsewhere. A transient tool error blocked a direct read of `gd-core.js` this session; this should be confirmed directly before treating either the comment or the score tile as authoritative.
- The `dashboard_backups/` folder and its contents were not inventoried in this pass and may contain additional relevant history or additional clutter.

---

*No files outside this document were created or modified. No git operations were performed.*
