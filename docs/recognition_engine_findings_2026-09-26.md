# Recognition Engine Findings — 2026-09-26

Investigation trigger: Paul observed several Shaughn→Trevar misidentifications (2 of 3 events
today) and a delivery-person misclassification of himself, plus a correctly-distinguished
Carrie/Carissa same-frame event, all reported directly from what he saw in Double Take. This
session pulled the corresponding HA-side telemetry to check candidate scores/margins.

**No production changes were made. This is a findings record only.**

## Evidence retrieved

From `sensor.ambient_presence_significance_debug` and `sensor.ambient_latest_event`
(`packages/ambient_identity_consumer.yaml`, `packages/ambient_store.yaml`), front-door
(`reolink_doorbell`) camera only — this is the only camera with any history in either sensor
for the periods checked:

| Time (EDT) | resolved_identity | resolution_class | margin_class | single_observation_name | confidence | Outcome |
|---|---|---|---|---|---|---|
| 2026-09-25 15:40:59 | trevar | resolved | normal | — | — | suppressed (someone home) |
| **2026-09-25 16:34:20** | unknown (top-level) | **single_observation** | normal | **trevar** | **99.99%** | hedged → "Possibly Trevar"; suppressed, not confirmed |
| 2026-09-25 18:06:42 | carissa | resolved | normal | — | null | suppressed (someone home), single-person only |

Today (2026-09-26), full day: zero Shaughn/Trevar-named records and zero delivery-person
records in either sensor. The only front-door activity after 09:00 was one unrelated `unknown`
observation at 10:59 AM (52.62% confidence, no match).

## Conclusions (recorded per Paul's instruction, 2026-09-26)

1. We have evidence of a confident raw Shaughn → Trevar embedding error: the 16:34:20 (9/25)
   single-observation record shows the raw top candidate was "trevar" at 99.99% confidence.
2. The downstream hedge logic can contain that error when it receives the event: this record
   was correctly left at `resolution_class: single_observation` (not promoted to
   `resolved`/`confirmed`), and surfaced only as a hedge ("Possibly Trevar"), not a hard
   assertion.
3. The current safety mechanism does not make the underlying recognition correct — it only
   prevents a wrong single observation from being confidently asserted. The embedding/matching
   layer itself put (presumptively) Shaughn in Trevar's identity space at near-maximum
   confidence.
4. Today's three Shaughn events and Paul's delivery-person misclassification cannot be fully
   analyzed from available HA telemetry: no camera other than `reolink_doorbell` has any
   history in `sensor.ambient_latest_event` or `sensor.ambient_presence_significance_debug`,
   and today has zero matching records on that camera either. Whatever Paul saw directly in
   Double Take is not confirmed to be flowing into `ambient_identity_consumer`'s
   resolution/dispatch pipeline — that data path (Double Take's own API/storage) is not
   reachable from this environment (no HTTP egress to the LAN, no `home-assistant.log` file on
   disk). Not pursued further per instruction to stop.
5. No production changes made this session as a result of this investigation.

## Practical takeaway

The problem is deeper than the downstream resolver: the recognition layer itself can put
Shaughn confidently in Trevar's identity space (99.99% on a single observation). Tuning or
tweaking the adjudication/hedge logic further would not address this — the fix, if any, belongs
upstream at the embedding/matching layer (consistent with the enrollment-quality direction
already recorded in the `ha-ops` skill's 2026-09-18 note). No such upstream change has been
scoped or made.

## Open item for a future session

Confirm whether the events Paul observed directly in Double Take reach `ambient_identity_consumer`
at all (camera coverage, MQTT topic subscription) before concluding the pipeline itself is blind
to them versus the telemetry just being unavailable from this environment.
