import { FIXED, MS } from "./constants";
import type { DetectedIssue, Issue, IssueKind, TimeOfDay } from "./types";

/** Base score per kind, placed inside the section 4 bands. */
export const BASE_SCORES: Record<IssueKind, number> = {
  garage_open_long: 90, // safety 90-100
  door_open_late: 90, // safety 90-100
  fan_left_on: 70, // waste 70-89, low-stakes end
  critical_battery: 70, // device health 60-79
  device_offline_long: 62, // device health 60-79
  lights_left_on: 45, // comfort 40-59
};

export const DURATION_BONUS_CAP = 10;
export const HERO_MIN = 40;
export const SECONDARY_MIN = 55;
export const MAX_SHOWN = 3;
const DISMISSAL_PENALTY = 10;
const REVERT_PENALTY = 15;

export interface DismissalRecord {
  id: string;
  kind: IssueKind;
  at: number;
}
export interface RevertRecord {
  kind: IssueKind;
  at: number;
}
export interface PriorityHistory {
  dismissals: DismissalRecord[];
  reverts: RevertRecord[];
}
export const EMPTY_HISTORY: PriorityHistory = { dismissals: [], reverts: [] };

/** 1 for just now, falling linearly to 0 after 7 days. */
const decay = (ageMs: number): number => Math.max(0, 1 - ageMs / FIXED.dismissalDecayMs);

export function scoreIssue(
  d: Pick<DetectedIssue, "kind" | "type" | "created_at">,
  now: number,
  tod: TimeOfDay,
  history: PriorityHistory,
): number {
  let score = BASE_SCORES[d.kind];
  const ageMin = (now - Date.parse(d.created_at)) / MS.MIN;
  score += Math.min(DURATION_BONUS_CAP, Math.max(0, Math.floor(ageMin / 10)));
  if ((d.type === "safety" || d.type === "waste") && (tod === "evening" || tod === "night")) score += 5;
  for (const x of history.dismissals) if (x.kind === d.kind) score -= DISMISSAL_PENALTY * decay(now - x.at);
  for (const x of history.reverts) if (x.kind === d.kind) score -= REVERT_PENALTY * decay(now - x.at);
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** 24 h suppression after the latest dismissal of this exact issue; null once expired. */
export function dismissedUntil(id: string, now: number, history: PriorityHistory): number | null {
  const last = Math.max(0, ...history.dismissals.filter((x) => x.id === id).map((x) => x.at));
  const until = last + FIXED.dismissSuppressionMs;
  return last > 0 && until > now ? until : null;
}

/** Scored issues, best first. Suppressed issues stay in the list with `dismissed_until` set. */
export function rankIssues(
  detected: DetectedIssue[],
  now: number,
  tod: TimeOfDay,
  history: PriorityHistory = EMPTY_HISTORY,
): Issue[] {
  return detected
    .map((d): Issue => {
      const until = dismissedUntil(d.id, now, history);
      return {
        ...d,
        priority: scoreIssue(d, now, tod, history),
        dismissed_until: until === null ? null : new Date(until).toISOString(),
      };
    })
    .sort((a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export interface Selection {
  hero: Issue | null;
  secondary: Issue[];
  /** True when nothing scores >= 40: show the calm ambient state. */
  calm: boolean;
}

export function selectIssues(ranked: Issue[], now: number): Selection {
  const live = ranked.filter((i) => i.dismissed_until === null || Date.parse(i.dismissed_until) <= now);
  const top = live[0];
  if (!top || top.priority < HERO_MIN) return { hero: null, secondary: [], calm: true };
  const secondary = live.slice(1).filter((i) => i.priority >= SECONDARY_MIN).slice(0, MAX_SHOWN - 1);
  return { hero: top, secondary, calm: false };
}
