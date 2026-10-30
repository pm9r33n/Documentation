import { FIXED } from "./constants";
import type { HomeConfig } from "./config";
import { classifySignals, type SignalStatus } from "./signals";
import { ZONES, type HomeSnapshot, type Zone } from "./types";

export interface ZonePresence {
  status: SignalStatus;
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
    const r = classifySignals(zoneSensors(config, z), snap);
    const stable = r.clearSince !== null && snap.now - r.clearSince >= FIXED.presenceStableMs;
    out[z] = { status: r.status, rawPresent: r.present, present: r.present || !stable };
  }
  return out;
}

export const presentZones = (p: PresenceByZone): Zone[] => ZONES.filter((z) => p[z].present);

/** Garage auto-close (and the garage / late-door issues) require this: all three zones stably clear. */
export const nobodyAnywhere = (p: PresenceByZone): boolean => presentZones(p).length === 0;
