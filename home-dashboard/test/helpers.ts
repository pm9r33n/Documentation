import { placeholderConfig } from "../src/config.placeholder";
import { MS } from "../src/constants";
import { buildContext } from "../src/context";
import { detectIssues } from "../src/issues";
import type { HomeSnapshot } from "../src/types";

export const config = placeholderConfig;
/** Fri 2026-10-30 19:00 local (evening, weekday). */
export const NOW = new Date(2026, 9, 30, 19, 0, 0).getTime();
export const min = (n: number) => n * MS.MIN;

const SENSORS = [
  "binary_sensor.tv_room_motion",
  "binary_sensor.kitchen_motion",
  "binary_sensor.garage_motion",
  "binary_sensor.house_person_detected",
  "binary_sensor.front_yard_person_detected",
  "binary_sensor.backyard_person_detected",
];

type Spec = string | [state: string, agoMs: number];

/** Everyone away for 3 h, garage closed, nothing on. Override entities with [state, msAgo]. */
export function snap(over: Record<string, Spec> = {}, now = NOW): HomeSnapshot {
  const entities: HomeSnapshot["entities"] = {};
  const set = (id: string, s: Spec) => {
    const [state, ago] = typeof s === "string" ? [s, min(180)] : s;
    entities[id] = { state, lastChanged: now - ago };
  };
  for (const s of SENSORS) set(s, "off");
  set("cover.garage_door", "closed");
  set("binary_sensor.front_door", "off");
  set("binary_sensor.back_door", "off");
  for (const r of config.rooms) for (const e of [...r.lights, ...r.fans]) set(e, "off");
  for (const [id, s] of Object.entries(over)) set(id, s);
  return { now, entities };
}

export function run(s: HomeSnapshot, auto = true) {
  const ctx = buildContext(s, config, { autoActionsEnabled: auto });
  return { ctx, issues: detectIssues(s, config, ctx) };
}
