import { ZONES, type Zone } from "./types";

export interface RoomConfig {
  id: string;
  name: string;
  /** Motion / occupancy sensors. Any "on" or unavailable sensor counts as occupied. */
  occupancySensors: string[];
  lights: string[];
  fans: string[];
}

export interface ImportantDevice {
  entity: string;
  name: string;
  /** Battery percentage sensor, if the device has one. */
  batteryEntity?: string;
}

export interface HomeConfig {
  rooms: RoomConfig[];
  /** Extra presence sensors per zone. House also inherits every room occupancy sensor. */
  zones: Record<Zone, string[]>;
  garage: { doorEntity: string };
  exteriorDoors: { entity: string; name: string }[];
  importantDevices: ImportantDevice[];
}

/** Throws on a config that would silently weaken the presence rules. */
export function validateConfig(c: HomeConfig): void {
  const ids = new Set<string>();
  for (const r of c.rooms) {
    if (ids.has(r.id)) throw new Error(`duplicate room id: ${r.id}`);
    ids.add(r.id);
    if (r.occupancySensors.length === 0) throw new Error(`room ${r.id} has no occupancy sensor`);
  }
  for (const z of ZONES) {
    const n = c.zones[z].length + (z === "house" ? c.rooms.length : 0);
    if (n === 0) throw new Error(`zone ${z} has no presence sensor`);
  }
  if (!c.garage.doorEntity) throw new Error("garage.doorEntity is required");
}
