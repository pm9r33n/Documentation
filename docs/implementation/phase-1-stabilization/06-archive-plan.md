# Archive Plan (proposed only — nothing executed)

**Tier: P2**, execution explicitly gated on separate approval (reaffirmed
by the 2026-09-29 reprioritization instruction — this was already this
document's framing and remains unchanged).
**Status:** This is a proposal for a future, separately-authorized action.
**No file has been moved, renamed, archived, or deleted.** This document
exists purely so that when archiving *is* authorized, there's a reviewed
plan to execute rather than an ad-hoc decision at that time.

## Existing convention to follow

Two precedents already exist on this system for dated archive locations,
confirmed by directory listing this session:
- `archive/carrie_carissa_merge_20260921/` (config root)
- `dashboard_backups/2026-09-20/` (config root)

Both use a `<topic>_<date>` or `<date>` folder-per-event pattern rather than
flat `.bak-*` filenames. **This plan follows that existing pattern** for
consistency, rather than introducing a third convention.

## Candidates, and why each is believed safe (pending final confirmation)

| Item | Size | Evidence it's unreferenced | Proposed destination |
|---|---|---|---|
| `gd-command-card.v6.bak.js` (config root) | 52,977 B | Not in `www/`, not loaded by any Lovelace resource; its own internal header says "v4" while the filename says "v6" (mismatched, itself evidence this is leftover from an abandoned versioning scheme); ~7.6x the size of the live `www/gd-command-card.js` (6,989 B), consistent with being a pre-refactor monolith predating the current 4-module split | `archive/sportsintel_dashboard_cleanup_<date>/gd-command-card.v6.bak.js` |
| `sportsintel_probe_jets_gb_summary.json` | 597,248 B | Confirmed by content inspection to be a raw ESPN boxscore API capture, not a fixture anything reads; not referenced in `configuration.yaml`, `automations.yaml`, or the dashboard | `archive/sportsintel_dashboard_cleanup_<date>/` |
| `sportsintel_probe_wvu_va_actual_summary.json` | 546,246 B | Same batch, same evidence | Same folder |
| `sportsintel_probe_wvu_va_summary.json` | 525,172 B | Same batch, same evidence | Same folder |

**Total footprint being proposed for archival: ~1.72 MB**, none of it
referenced anywhere in configuration, automations, scripts, or the
dashboard, per this and the prior assessment's research.

## Explicitly NOT proposed for archival in this plan

- The six `sportsintel_dashboard.yaml.bak-*` files and
  `configuration.yaml.bak-pre-sportsintel` — these are still meaningful
  version history for files under active iteration; archiving them is a
  separate, lower-confidence judgment call (when is a backup "old enough"
  to archive?) that this plan doesn't attempt to make. Left for a future,
  explicit decision.
- `dashboard_backups/2026-09-20/` itself — already in a sensible location;
  nothing to do here.
- Anything inside `custom_components/`, `packages/`, or any live
  automation/script/dashboard file — none of the candidates above touch
  anything actively read by the running system, which is the entire basis
  for calling them "safe" in the first place. Nothing else was evaluated
  against that same bar in this pass, so nothing else is proposed.

## Verification step before execution (when authorized)

Before actually moving anything, re-confirm each candidate is still
unreferenced (a config search for the filename across `packages/`,
`automations.yaml`, `scripts.yaml`, and the dashboard YAML) — cheap
insurance against this plan going stale between now and whenever archiving
is actually approved.

## Procedure (for future execution, not run now)

1. Create `archive/sportsintel_dashboard_cleanup_<execution-date>/`.
2. Move (not copy-and-delete separately, to avoid a window with two
   copies) the four files listed above into it.
3. Confirm Home Assistant's own file listing shows them gone from the
   config root and present in the new folder.
4. No reload/restart is needed — none of these files are loaded by any
   running process, which is exactly why they're archival candidates.
