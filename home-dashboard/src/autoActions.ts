import type { HomeConfig } from "./config";
import { DEFAULT_THRESHOLDS, GARAGE_OPEN_FLOOR_MIN, MS, type Thresholds } from "./constants";
import type { EngineContext } from "./context";
import { nobodyAnywhere } from "./presence";
import type { HomeSnapshot, Issue } from "./types";

/**
 * Allowlist of automatic actions. Anything not here (locks, alarm / security
 * mode, cameras, or any future action) is Tier 3 and can never run
 * automatically, no matter what the issue, toggle or learning says.
 */
export const AUTO_ACTION_TIERS = {
  turn_off_lights: 1,
  turn_off_fan: 1,
  close_garage: 2,
} as const;

export function autoTier(action: string): 1 | 2 | null {
  return Object.prototype.hasOwnProperty.call(AUTO_ACTION_TIERS, action)
    ? AUTO_ACTION_TIERS[action as keyof typeof AUTO_ACTION_TIERS]
    : null;
}

export type GuardResult = { ok: true } | { ok: false; reason: string };
const no = (reason: string): GuardResult => ({ ok: false, reason });

/**
 * Last line of defence, evaluated against live state right before execution
 * and independent of the detector's `auto_conditions_met` flag.
 */
export function autoGuard(
  issue: Issue,
  ctx: EngineContext,
  snap: HomeSnapshot,
  config: HomeConfig,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): GuardResult {
  if (!ctx.state.auto_actions_enabled) return no("auto-actions are off");
  const tier = autoTier(issue.suggested_action);
  if (tier === null || !issue.can_auto) return no("action is not eligible for automation");

  if (issue.suggested_action === "close_garage") {
    const door = snap.entities[config.garage.doorEntity];
    if (!door || door.state !== "open") return no("garage is not open");
    const minMin = Math.max(GARAGE_OPEN_FLOOR_MIN, thresholds.garageOpenMin);
    if (snap.now - door.lastChanged < minMin * MS.MIN) return no("garage has not been open long enough");
    if (!nobodyAnywhere(ctx.presence)) return no("presence in house, yard or backyard");
    return { ok: true };
  }

  const occ = ctx.rooms[issue.subject];
  if (!occ || occ.occupied || occ.emptySince === null) return no("room is not confirmed empty");
  const stillOn = issue.targets.filter((e) => snap.entities[e]?.state === "on");
  if (stillOn.length === 0) return no("nothing left on");
  return { ok: true };
}
