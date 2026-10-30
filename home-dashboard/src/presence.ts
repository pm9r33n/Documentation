import { FIXED } from "./constants";
import type { HomeConfig } from "./config";
import { classifySignals, type SignalStatus } from "./signals";
import { ZONES, type HomeSnapshot, type Zone } from "./types";

/** "unmonitored": the zone is deliberately configured with no sensors (yard/backyard only); it never counts as presence. */
export type ZoneStatus = SignalStatus | "unmonitored";

export interface ZonePresence {
  status: ZoneStatus;
  /** Raw, instantaneous verdict. */
  rawPresent: boolean;
  /**
   * Presence as used by every rule: true immediately on any detection, and
   * stays true until all sensors have been clear for 60 s. Only the
   * "no presence" side is debounced.
   */
  present: boolean;
}

export type PresenceByZone = Record<Zone, ZonePresence>;

export function zoneSensors(config: HomeConfig, zone: Zone): string[] {
  return zone === "house"
    ? [...config.zones.house, ...config.rooms.flatMap((r) => r.occupancySensors)]
    : config.zones[zone];
}

export function computePresence(snap: HomeSnapshot, config: HomeConfig): PresenceByZone {
  const out = {} as PresenceByZone;
  for (const z of ZONES) {
    const sensors = zoneSensors(config, z);
    if (sensors.length === 0) {
      out[z] = { status: "unmonitored", rawPresent: false, present: false };
      continue;
    }
    const r = classifySignals(sensors, snap);
    const stable = r.clearSince !== null && snap.now - r.clearSince >= FIXED.presenceStableMs;
    out[z] = { status: r.status, rawPresent: r.present, present: r.present || !stable };
  }
  return out;
}

export const presentZones = (p: PresenceByZone): Zone[] => ZONES.filter((z) => p[z].present);

/** Garage auto-close (and the garage / late-door issues) require this: all three zones stably clear. */
export const nobodyAnywhere = (p: PresenceByZone): boolean => presentZones(p).length === 0;

/**
 * Nobody is positively detected anywhere, yet at least one zone has a missing /
 * unavailable sensor, so "nobody here" can't be trusted. A zone whose sensors
 * disagree ("conflicting") contains a positive detection, so it counts as
 * confirmed presence here: otherwise any household with one idle room sensor
 * would trip this. Mutually exclusive with `nobodyAnywhere`.
 */
export const presenceUncertain = (p: PresenceByZone): boolean => {
  const s = ZONES.map((z) => p[z].status);
  return !s.includes("present") && !s.includes("conflicting") && s.includes("unknown");
};
