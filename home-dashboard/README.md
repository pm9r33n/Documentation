# home-dashboard

Framework-agnostic TypeScript core for the context-aware home screen (see `TECHNICAL_DESIGN.md` in the handoff).
Home Assistant sits behind `HomeAdapter` (`src/adapter.ts`); only a `StubAdapter` exists so far.
Entities/rooms live in `src/config.placeholder.ts` (placeholder; replace with the real config of the same shape).

    npm install && npm run typecheck && npm test

| Module | Design step |
|---|---|
| `signals.ts`, `presence.ts`, `occupancy.ts`, `context.ts` | 1 Context State, presence, occupancy |
| `issues.ts` | 2 v1 issue catalog (6 detectors, closed `IssueKind` union) |
| `priority.ts` | 3 scoring, selection, dismissal/revert modifiers |
| `homeScreen.ts` | 4 view model for the home screen |
| `autoActions.ts`, `engine.ts` | 5-6 Tier 1/2 auto-actions, live guards |
| `engine.ts`, `activity.ts` | 7-8 revert window, activity feed, notifications |
| `learning.ts` | 9 bounded, resettable learning |

## Home screen components and state (UI spec; not built as HA cards)

`buildHomeScreen(evaluation, snapshot, config, opts)` returns one `HomeScreenViewModel`; a UI only renders it and calls the engine.

| Component (top to bottom) | Reads | Interactions |
|---|---|---|
| `ContextBar` | `contextBar.text` ("Evening · Home · 2 issues") | none |
| `HeroBriefing` | `hero` (issue or calm), `undo[]` chips | primary -> `engine.accept(issue, now)`; "Not now" -> `engine.dismiss`; `status: auto_failed` shows failure with the manual action as primary; undo chip -> `engine.revert(revertId, now)` |
| `SecondaryIssues` (0-2) | `secondary[]` (priority >= 55) | same primary action |
| `CalmStatus` | `calmStatus` (weather, presence, house state) | none |
| `QuickAccess` | `quickAccess` (Lights, Climate, Security, Areas) | navigation only; visually subordinate to the hero |

State owned by the app: latest `HomeSnapshot`, `HomeEngine` (`engine.state` is JSON-safe, persist it), the Auto-Actions toggle (`engine.setAutoActionsEnabled`). Call `await engine.tick(snapshot)` on every relevant state change and on a ~1 min timer (thresholds are time-based).
