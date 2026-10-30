import { DEFAULT_THRESHOLDS, GARAGE_OPEN_FLOOR_MIN, type Thresholds } from "./constants";
import { ISSUE_KINDS, type IssueKind } from "./types";

/**
 * Timing multipliers per issue kind. Gradual (small steps), bounded, resettable.
 * Learning only ever touches these multipliers and priority nudges; it has no
 * access to presence rules, Tier 3, or the Auto-Actions toggle.
 */
export interface LearningState {
  factors: Partial<Record<IssueKind, number>>;
}

export type LearningEvent = "accepted" | "dismissed" | "reverted";

export const FACTOR_MIN = 0.8;
export const FACTOR_MAX = 1.2;
const STEP: Record<LearningEvent, number> = { reverted: 0.05, dismissed: 0.025, accepted: -0.025 };
/** Only kinds with a tunable timing threshold. */
const TUNABLE: IssueKind[] = ["lights_left_on", "fan_left_on", "garage_open_long"];

export const emptyLearning = (): LearningState => ({ factors: {} });

/** Garage may only get slower (>= 1.0); lights/fan may move +/-20%. */
function bounds(kind: IssueKind): [number, number] {
  return kind === "garage_open_long" ? [1, FACTOR_MAX] : [FACTOR_MIN, FACTOR_MAX];
}

export function recordLearning(s: LearningState, kind: IssueKind, ev: LearningEvent): LearningState {
  if (!TUNABLE.includes(kind)) return s;
  const [lo, hi] = bounds(kind);
  const cur = s.factors[kind] ?? 1;
  const next = Math.min(hi, Math.max(lo, Math.round((cur + STEP[ev]) * 1000) / 1000));
  return { factors: { ...s.factors, [kind]: next } };
}

/** Anything malformed falls back to pure rules (no tuning). */
export function sanitizeLearning(raw: unknown): LearningState {
  try {
    const f = (raw as LearningState | null)?.factors;
    if (!f || typeof f !== "object") return emptyLearning();
    const out: LearningState["factors"] = {};
    for (const k of ISSUE_KINDS) {
      const v = (f as Record<string, unknown>)[k];
      if (v === undefined) continue;
      const [lo, hi] = bounds(k);
      if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) return emptyLearning();
      out[k] = v;
    }
    return { factors: out };
  } catch {
    return emptyLearning();
  }
}

export function resolveThresholds(raw: unknown): Thresholds {
  const f = sanitizeLearning(raw).factors;
  const t = DEFAULT_THRESHOLDS;
  return {
    lightsEmptyMin: Math.round(t.lightsEmptyMin * (f.lights_left_on ?? 1)),
    fanEmptyMin: Math.round(t.fanEmptyMin * (f.fan_left_on ?? 1)),
    garageOpenMin: Math.max(GARAGE_OPEN_FLOOR_MIN, Math.round(t.garageOpenMin * (f.garage_open_long ?? 1))),
  };
}
