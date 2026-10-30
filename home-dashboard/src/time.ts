import { FIXED, MS } from "./constants";
import type { DayType, TimeOfDay } from "./types";

export function timeOfDay(nowMs: number): TimeOfDay {
  const h = new Date(nowMs).getHours();
  if (h >= FIXED.nightStartHour || h < FIXED.nightEndHour) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export function dayType(nowMs: number): DayType {
  const d = new Date(nowMs).getDay();
  return d === 0 || d === 6 ? "weekend" : "weekday";
}

/** Most recent 22:00 local at or before `nowMs`. */
export function lastNightStart(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(FIXED.nightStartHour, 0, 0, 0);
  if (d.getTime() > nowMs) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MS.MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const iso = (ms: number): string => new Date(ms).toISOString();
