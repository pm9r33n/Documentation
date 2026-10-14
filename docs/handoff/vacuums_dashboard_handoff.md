# Vacuums dashboard: handoff to Claude (chat) for visual design

Written 2026-10-14. Status: a first-pass dashboard is live and works functionally. Its visual design was graded B- by Paul
because it does not follow the intended design. This file is everything needed to take over the visual work.

Division of labour (per CLAUDE.md): Claude Code owns entities, helpers, scripts and automations. Claude (chat) owns the look.
Paul's hard rules still apply: do not touch the `let-s-go` dashboard or TeamTracker sensors; reload only the affected domain;
never restart HA without asking Paul.

## 1. Where things are

| Item | Location |
|---|---|
| Live dashboard | HA storage dashboard, url `/vacuum-ambient`, title "Vacuums", id `vacuum_ambient` (sidebar) |
| Current config (copy) | `docs/handoff/vacuums_dashboard_current.json` (same JSON HA holds; one `masonry` view, path `vacuums`) |
| Theme | `/config/themes/vacuum_bright.yaml`, theme name "Vacuum Bright" (light only; colors from the design package) |
| Original design package | `88f6cfb6-roborock-ambient-dashboard-bright.zip` (README, docs/01-04, mockups/visual-description.md, sample dashboard YAML) |
| Old read-only package (to be removed) | `/config/packages/roborock_command.yaml` (+ `.bak-20261014-pre-sam3-removal`); Paul chose "replace it", removal is pending sign-off |

Cards already installed (HACS): mushroom, button-card, card-mod, auto-entities, layout-card is NOT confirmed. NOT installed:
RoborockCustomMap, xiaomi-vacuum-map-card (the package's map design needs these). Only `/local` and HACS resources listed in
`.storage/lovelace_resources` are loaded.

## 2. Design intent (from the package; the mockups themselves were text-only, no images reached Claude Code)

- Target user: Carrie. Feel: bright, cheerful, colorful, modern, glanceable ("status is the hero"). No dark mode.
- Palette: background `#FFF9F5`, cards `#FFFFFF`, text `#2D3436` / `#636E72`; coral `#FF6B6B`, teal `#4ECDC4`,
  sunny yellow `#FFE66D`, lavender `#A78BFA`, mint `#6BCB77`, soft pink `#FF8E8E`, soft blue `#74B9FF`.
- State colors: cleaning teal, docked lavender, returning yellow, paused/error coral. Buttons: Start teal, Pause coral,
  Dock mint/teal, Locate yellow.
- Desktop layout: header; two colorful status cards side by side (accent bar that changes with state, large friendly status
  text like "Cleaning · Kitchen", colorful battery bar, rounded pill buttons); two large side-by-side live maps with pastel room
  fills and a vibrant path; colorful room chips (selected = saturated + star); a four-column intelligence strip
  (Presence, Mode, Next clean, Consumables).
- Mobile: vertical stack, full-width status cards, single large map, wrapping chips, compact strip.

## 3. What the current build does and where it falls short

Does: header with docked/people counts; one status card per robot (state, area, battery %) with a state-colored left edge and a
battery bar (markdown HTML); Start (with confirm), Pause, Dock, Locate as 4-up mushroom cards; Rosie's four parts (hours
left, red when overdue); Rosie's map as a plain `picture-entity`; four-tile info strip (at home, quiet hours, Rosie last cleaned,
Rosie total cleans).

Falls short of the design (the reasons for the B-): no side-by-side layout (plain masonry), no live map overlays or path, no
room chips or selection state, no per-state accent treatment beyond a left border, the battery bar and card polish were built
without being able to see the render, and the intelligence strip is just 4 flat tiles. Nobody has verified how it looks on a phone.

## 4. Real entities (verified 2026-10-14)

Two robots only. Sam3 (`vacuum.sam3`) is being retired: its device is disabled (26 stale `restored` states vanish on HA restart).

| | Roborock Q10 S5+ | Rosie |
|---|---|---|
| vacuum | `vacuum.roborock_q10_s5` (Kitchen) | `vacuum.rosie` (Loveshack) |
| battery | `sensor.roborock_q10_s5_battery` | `sensor.rosie_battery` |
| status | `sensor.roborock_q10_s5_status` | `sensor.rosie_status`, `sensor.rosie_vacuum_error` |
| map image | `image.roborock_q10_s5_map` (state `unknown`, not usable) | `image.loveshack_rosie_map_0` (works) |
| last clean | none exposed | `sensor.rosie_last_clean_begin` / `_end` (UTC timestamps) |
| parts | `*_main_brush_time_used`, `side_brush`, `filter`, `sensor` (hours USED: 1,2,2,2) | `*_main_brush_time_left`, `side_brush`, `filter`, `sensor` (hours LEFT; `sensor_time_left` is negative = overdue) |
| other | `cleaning_mode`, `volume`, `do_not_disturb`, `child_lock`, `dust_collection` switches, `button.roborock_q10_s5_empty_dustbin` | `select.rosie_mop_intensity`, `select.rosie_selected_map`, `binary_sensor.rosie_water_shortage`, `rosie_cleaning`, `rosie_charging`, DND switch + begin/end times |
| counters | `total_cleaning_count/area/time`, `cleaning_progress` | same family, plus `cleaning_time`, `cleaning_area` |

Also: `binary_sensor.quiet_hours`, `sensor.day_type`, `person.*` (paul_green, carrie, shaughn, trevar), `group.family`.
Vacuum services available: `vacuum.start/pause/return_to_base/locate/stop/clean_spot/clean_area(cleaning_area_id)/set_fan_speed/send_command`;
`roborock.get_maps/get_vacuum_current_position/set_vacuum_goto_position/set_vacuum_zoned_cleaning`.

## 5. Hard data limits (design must not promise these yet)

- Room chips / cleaning queue: `roborock.get_maps` returns one map with NO named rooms for Rosie, and the Q10 exposes no rooms or
  map. Room cleaning needs rooms mapped first (HA "clean area" mapping on the vacuum entity, `vacuum.clean_area`). Until then show
  chips as a disabled/"set up rooms" state or leave them out. Claude Code can build the helpers/scripts once rooms exist.
- The Q10 has no last-clean time and no error sensor; do not show a "last cleaned" for it.
- No presence/auto-start automations exist by Paul's choice (manual controls only for now).
- The package's `vacuum.roborock_living` / `_upstairs` names do not exist; use the real entities above.
- Template render cap: 262,144 chars; keep per-card templates small.

## 6. Decisions already made by Paul

Use Q10 S5+ and Rosie (the package's "Living" and "Upstairs" slots map to these). Replace the old read-only package after
sign-off. Dashboard plus manual controls only; auto-start/pause-on-return/quiet-hours automations come later. Build one view,
get sign-off, then extend. Keep the confirmation prompt on Start.

## 7. How to apply changes

Edit in the HA UI raw configuration editor for dashboard `/vacuum-ambient`, or send `lovelace/config/save` over the websocket
with `url_path: "vacuum-ambient"` (Claude Code can do this on request). Theme edits: change `themes/vacuum_bright.yaml`, then
reload themes. If new helpers or scripts are needed, ask Claude Code to add them in a package (filename must not start with `_`).

## 8. Backend work still open for Claude Code

1. After design sign-off: delete `packages/roborock_command.yaml`, reload templates, remove its leftover registry entries.
2. When rooms are mapped: room-selection helpers, a `start selected rooms` script (via `vacuum.clean_area`), and a queue.
3. Later, only if Paul asks: presence-based start, pause when someone comes home, quiet hours, consumable and stuck alerts.
4. Optional: a Q10 map once the integration exposes one.
