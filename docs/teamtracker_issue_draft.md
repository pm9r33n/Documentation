# TeamTracker: NCAA soccer sensors go NOT_FOUND on busy national game days

**Not filed yet — draft for Paul to review and submit himself.**

## Symptom

`sensor.<team>` for a TeamTracker-configured NCAA soccer team (e.g.
`usa.ncaa.w.1` / `usa.ncaa.m.1`) intermittently reports `NOT_FOUND` even
though the team has a game that day, with an `api_message` like:

```
API_LIMIT hit.  No competition found for '20382' between 2026-09-24T16:00Z and 2026-09-24T23:00Z
```

## Root cause

1. TeamTracker's scoreboard fetch (`provide_espn.py`) requests a wide
   `dates=<start>-<end>` **range** from ESPN's soccer scoreboard endpoint
   (`site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard`).
2. For NCAA soccer leagues, ESPN's scoreboard endpoint rejects **any**
   `dates=` range syntax with HTTP 400 ("Failed to get events endpoint") —
   confirmed live against `usa.ncaa.w.1` with a 90-day range, a 14-day
   range, a 7-day range, and even a same-day range
   (`dates=20260924-20260924`). Only a single bare date with no hyphen
   (`dates=20260924`) succeeds and returns 200. This isn't a "too wide a
   range" problem — the endpoint doesn't accept range syntax at all for
   this league.
3. On that 400, TeamTracker's fallback logic drops the `dates` parameter
   entirely rather than narrowing it, so ESPN silently defaults to
   "today only."
4. `limit=50` (`API_LIMIT` in `const.py`) caps how many of today's
   national events come back. On a busy day, other schools' games fill
   that cap before the requested team's own match is reached, and the
   team is reported not found even though it's playing that day.

## Why `conference_id` / `groups=` filtering can't fix this

TeamTracker already supports narrowing the scoreboard query with
`groups=<conference_id>` (`provide_espn.py`,
`_async_fetch_scoreboard_data`), but this has no effect for NCAA soccer:

- ESPN's NCAA soccer data has no conference/group id anywhere we could
  find: absent from team-detail (`teams/{id}`) for both a men's and a
  women's team, absent from league standings (`usa.ncaa.w.1/standings`
  returned `"seasons": []`), and absent from the core API's team object
  (`sports.core.api.espn.com/.../teams/{id}`).
- Even if that data existed, `config_flow.py` only attempts to
  auto-populate `conference_id` when the literal substring `"college"`
  appears in `league_path` (i.e. college-football and
  mens/womens-college-basketball paths). `usa.ncaa.w.1` / `usa.ncaa.m.1`
  never match that check.
- `_get_path_schema()`, which defines an editable `conference_id` field,
  is never actually invoked by any config flow step in this version — so
  there's no UI path to type a conference id in by hand even if one were
  known.

In short: this can't be worked around by any existing config option.

## Suggested fixes

Two independent options, either of which would resolve the symptom above:

1. **Narrow the query instead of dropping it.** On a 400 from the
   scoreboard endpoint, retry with a **narrower query** instead of
   dropping `dates` outright — ideally a single bare date
   (`dates=YYYYMMDD`, no range) for the day(s) actually needed, rather
   than silently falling back to "whatever ESPN's default is today." A
   single-date query is the one format confirmed to succeed for this
   league. If multiple days need to be checked, issue one single-date
   request per day rather than a range.
2. **Raise the event limit.** Confirmed live: ESPN honors a much larger
   `limit=` value on this scoreboard endpoint than the `API_LIMIT = 50`
   TeamTracker currently sends — a `limit=500` request against
   `usa.ncaa.w.1` on 2026-09-24 returned 86 events (comfortably above the
   default cap) with no sign of truncation or a smaller effective server
   cap. Simply raising `API_LIMIT` (or making it configurable) would stop
   a busy national day from filling the cap before the requested team's
   own match is reached, without needing to touch the `dates=` handling
   at all. This is a smaller, more isolated change than option 1 and
   could be applied independently of it.

## Environment

- TeamTracker version: v0.18.3
- Leagues affected: `usa.ncaa.w.1`, `usa.ncaa.m.1` (soccer); other sports
  using range-style scoreboard queries may be affected too but were not
  tested here.
