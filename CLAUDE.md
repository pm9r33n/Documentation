# CLAUDE.md — Paul's Home Assistant (NucBox G5, HAOS)

## Working style (token budget matters)
- Report only: what changed, results, and decisions you need from Paul. No duplicate status notices, no recaps.
- Plan briefly, then act. One direct check beats spawning parallel research agents; use agents only for genuinely broad research, and say so first.
- Never paste raw API responses or whole files into the conversation. Save to a file, extract what you need with jq/grep.
- Read files in targeted slices (grep, line ranges), not whole. Edit with small patches, not full rewrites.
- `/compact` after research before building; `/clear` between unrelated tasks.

## Hard rules
- Do not modify the Let's Go dashboard (`let-s-go`), including its Alumni Tracker tab.
- Do not rename TeamTracker sensors or change their entity IDs.
- Package filenames must not start with `_` (fails slug validation; that's why `_diag_frigate_snapshot` never loads).
- Run a config check before any reload. Reload the affected domain; never restart HA without asking Paul.
- Temporary probe files: name them clearly, delete them when done, reload, confirm config check is clean. Known leftover to ask about: `packages/cc_merge_probe.yaml`.
- Known pre-existing warning: `_diag_frigate_snapshot` invalid slug. Unrelated; ignore.
- Templates: HA caps template renders at 262,144 characters. Never assign a full REST response to a rendered variable; extract fields inline.

## Current sports work
- Spec: Game Day — Alumni Roster & Stats Spec (Paul has the Markdown copy).
- `sensor.wvu_alumni_count` is defined only in `packages/sports_game_day.yaml` (trigger-based). The Game Day card (`www/gd-command-card.js`, dashboard `/game-day`) reads `players[].name/sport/league/team/status`; keep that contract and full team names ("New York Jets").
- Cache persistence: trigger-based template sensor updated by per-player events, excluded from the recorder. Not input_text chunking.
- Mets are out of scope for v1. Game Day Mode automations: `sports_game_day_mode_enter` / `sports_game_day_mode_exit` — leave alone.
- Visual/dashboard work belongs to Claude (chat). If a card change is needed, describe it instead of making it.
