const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Section 9 values that learning may never change. */
export const FIXED = {
  presenceStableMs: 60_000,
  revertWindowMs: 30 * MIN,
  dismissSuppressionMs: 24 * HOUR,
  dismissalDecayMs: 7 * DAY,
  batteryCriticalPct: 5,
  offlineMs: 12 * HOUR,
  doorOpenLateMs: 15 * MIN,
  nightStartHour: 22,
  nightEndHour: 5,
} as const;

/** The only timing values learning may tune (section 8). Garage is clamped, never lowered. */
export interface Thresholds {
  lightsEmptyMin: number;
  fanEmptyMin: number;
  garageOpenMin: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  lightsEmptyMin: 20,
  fanEmptyMin: 25,
  garageOpenMin: 45,
};

export const MS = { MIN, HOUR, DAY };

/** Hard floor: learning may raise the garage threshold, never lower it. */
export const GARAGE_OPEN_FLOOR_MIN = 45;
/** After a failed auto-action, leave the issue alone this long (manual alternative stays available). */
export const FAILURE_COOLDOWN_MS = 30 * MIN;
/** After the user reverts an auto-action, don't auto-act on that same issue again for this long. */
export const POST_REVERT_AUTO_PAUSE_MS = 24 * HOUR;
