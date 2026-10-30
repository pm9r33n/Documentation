import type { HomeConfig } from "./config";
import { computeOccupancy, type RoomOccupancy } from "./occupancy";
import { computePresence, presentZones, type PresenceByZone } from "./presence";
import { dayType, iso, timeOfDay } from "./time";
import type { ContextState, HomeSnapshot } from "./types";

export interface EngineContext {
  state: ContextState;
  presence: PresenceByZone;
  rooms: Record<string, RoomOccupancy>;
}

export interface ContextInputs {
  autoActionsEnabled: boolean;
  recentEvents?: string[];
}

/** Recomputed from scratch on every relevant state change; sensors' lastChanged carry the timers. */
export function buildContext(snap: HomeSnapshot, config: HomeConfig, inputs: ContextInputs): EngineContext {
  const presence = computePresence(snap, config);
  const rooms = computeOccupancy(snap, config);
  const zones = presentZones(presence);

  const waste_items: string[] = [];
  for (const r of config.rooms) {
    if (rooms[r.id]?.occupied) continue;
    for (const e of [...r.lights, ...r.fans]) if (snap.entities[e]?.state === "on") waste_items.push(e);
  }

  return {
    presence,
    rooms,
    state: {
      time_of_day: timeOfDay(snap.now),
      day_type: dayType(snap.now),
      human_presence: zones.length > 0,
      presence_zones: zones,
      occupancy: Object.fromEntries(Object.entries(rooms).map(([id, o]) => [id, o.occupied])),
      open_issues: [],
      waste_items,
      recent_events: inputs.recentEvents ?? [],
      auto_actions_enabled: inputs.autoActionsEnabled,
      last_updated: iso(snap.now),
    },
  };
}
