# Ambient Intelligence Brief: Den Dashboard (revised)

For Claude Code (CC) to implement. Claude (chat) tests and builds the Den card. Paul reviews on his phone (dark mode).

## Goal
Quiet when everything is normal. One plain sentence when something deviates from this house's normal. Where safe, act first then tell Paul, with undo.

## Ownership
- CC builds the sensor and its attributes.
- Claude (chat) builds the Den card (dark mode) once the sensor is live, and runs the tests.

## Build order (strict)

### Phase 1: Narrator
Create sensor.den_narrator (one template sensor, in packages/den_narrator.yaml).
- State: one plain sentence. Nothing needs attention: "All quiet."
- Several facts apply: lead with the most urgent and end with "+N more". Do not list them all.
- Facts come only from rules/templates. If an LLM (Ollama qwen2.5:3b) is used, it may only rephrase facts. It must never invent entities, times or reasons.
- Input unavailable or unknown: skip that fact. A dead sensor must never cause a false alarm.
- Attributes:
  - on_line: small line under the sentence, e.g. "4 on, all normal"
  - on_items: the on-list with each item's room (Paul wants the on-list kept)
  - facts: every fact behind the sentence, with its source entity
  - tidy: entities script.active_now_tidy would turn off
- Keep script.active_now_tidy working. Existing active_now_raw, active_now_smart, heads_up_raw, heads_up_smart stay in place. The narrator builds on them. A "tuck in" button shows on the Den only when tidy is not empty.
- Replaces the two cards on the Den (home-cute) as the headline. The on-list stays under it.
Phase 1 tests: #1, 4, 5, 8, 9, 10, 11, 13, 14.

### Phase 2: Learned normal (do not start)
Per entity/room, learn how often and how long it is usually on, by hour-of-day and weekday (recorder history/statistics). Flag only clear deviations. Cold start falls back to the current fixed thresholds, no errors. Replaces the hard-coded 90 min / 6h / 12h numbers. Tests: #2, 3, 12.

### Phase 3: Signal fusion (do not start)
Combine garage state, house mode, sun, occupancy (upstairs, Trevar's room, Loveshack), person/phone presence, doorbell/Frigate person detection, thermostat mode. Garage open + dark + nobody home = urgent. Garage open + someone detected in the garage = not urgent. Tests: #6.

### Phase 4: Act, then tell (do not start)
Only after Phases 1-3 are trusted and Paul explicitly approves. When away: turn off stray lights/fans and notify "Turned off X. Undo?" Never touch media. Never lock/unlock. Never open/close the garage. Tests: #7.

## Rules already decided by Paul (do not change)
- Outside lights at night are normal regardless of who is home. Only flag in daylight (>10 min).
- Active Now keeps its on-list. Do not hide what is on.
- Heads-up should usually be empty. Less trigger-happy, better wording.
- Workshop tile counts devices, not entities (currently 18).
- Greeting uses the logged-in user's name.

## Current working rules (all 17 scenarios pass; preserve unless improved)
Active Now flags: outdoor light on in daylight >10 min; anything on while away; media >=300 min; lamp/fan at night >=90 min; lamp in a room empty 30+ min; lamp in daylight >=360 min; light/fan >=720 min. Outdoor check runs before the away check.
Heads Up: garage open shows if >=15 min, or at night, or away; doorbell person; downstairs >4 deg off range; upstairs hot only in cool/heat_cool/auto, cold only in heat/heat_cool/auto; Rosie/Q10 error shows immediately, offline only after 30+ min; max 4 items.

## Constraints
- Back up every file before editing, and the dashboard before any save.
- Do not create unrequested automations. automation.door_alert_smart_phone stays OFF.
- Dark mode on Paul's phone. Check contrast.
- Homeway: lovelace/config/save replaces the whole dashboard; patch_file needs exact hunk counts + expected_sha256; eval_template is the way to ground-truth; template.reload may time out but still apply. Reload the template domain only, never restart HA without asking.
- Keep replies short and plain.

## Acceptance tests (Claude runs these, reports pass/fail)
1. Everything normal, home, evening: quiet sentence, nothing flagged
2. Lamp on at a time it is usually on: not flagged
3. Same lamp on at a time it is never on (3 pm weekday): flagged with plain reason
4. Garage open 3 min, someone home, daytime: not shown
5. Garage open 20 min, nobody home: urgent, one sentence
6. Garage open + person detected in the garage: not urgent
7. Away + light on: acts or offers undo, says what it did
8. Outside light at night, away: normal, not flagged
9. Vacuum error: shown at once with reason
10. Vacuum offline <30 min / >30 min: hidden / shown
11. Upstairs heat mode, 71 deg with 66 deg target: not "running hot"
12. No history yet (cold start): falls back to fixed thresholds, no errors
13. Entity unavailable: not counted as on
14. Phone, dark mode: readable, no overflow

## Process
1. CC builds one phase, writes backups, reports entity and attribute names.
2. Claude forces each relevant scenario via eval_template (and safe real state changes) and returns pass/fail.
3. Claude builds the Den card; Paul checks a phone screenshot.
4. Next phase only after the current one passes.

## Challenge for CC
Make the narrator say something useful Paul did not think to ask for, and never say something wrong. A false alarm counts as a failure.
