import type { HomeConfig } from "./config";
import { classifySignals } from "./signals";
import type { HomeSnapshot } from "./types";

export interface RoomOccupancy {
  occupied: boolean;
  /** When the room became empty; null while occupied/unknown. */
  emptySince: number | null;
}

export function computeOccupancy(snap: HomeSnapshot, config: HomeConfig): Record<string, RoomOccupancy> {
  const out: Record<string, RoomOccupancy> = {};
  for (const r of config.rooms) {
    const s = classifySignals(r.occupancySensors, snap);
    out[r.id] = { occupied: s.present, emptySince: s.clearSince };
  }
  return out;
}
