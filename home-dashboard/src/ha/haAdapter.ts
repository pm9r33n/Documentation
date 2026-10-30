import type { ExecutableAction, HomeAdapter, Notification } from "../adapter";
import type { HomeConfig } from "../config";
import { ZONES, type EntityState, type HomeSnapshot } from "../types";
import { zoneSensors } from "../presence";
import type { HaState, HaTransport } from "./transport";

/**
 * The complete list of services the engine can ever call. Locks, alarm and
 * cameras are deliberately absent: there is no code path to them.
 */
const SERVICE_FOR: Record<ExecutableAction, { domain: "light" | "fan" | "cover"; service: string }> = {
  turn_off_lights: { domain: "light", service: "turn_off" },
  turn_on_lights: { domain: "light", service: "turn_on" },
  turn_off_fan: { domain: "fan", service: "turn_off" },
  turn_on_fan: { domain: "fan", service: "turn_on" },
  close_garage: { domain: "cover", service: "close_cover" },
  open_garage: { domain: "cover", service: "open_cover" },
};

export const REVERT_ACTION_PREFIX = "DASHBOARD_REVERT_";

export interface HaAdapterOptions {
  /** Full notify service, e.g. "notify.mobile_app_pauls_phone". Required before notifications can be sent. */
  notifyService?: string;
}

export class HaAdapter implements HomeAdapter {
  constructor(
    private transport: HaTransport,
    private opts: HaAdapterOptions = {},
  ) {}

  async execute(action: ExecutableAction, targets: string[]): Promise<void> {
    const svc = Object.prototype.hasOwnProperty.call(SERVICE_FOR, action) ? SERVICE_FOR[action] : undefined;
    if (!svc) throw new Error(`action not allowed: ${String(action)}`);
    if (targets.length === 0) throw new Error(`no targets for ${action}`);
    const bad = targets.find((t) => !t.startsWith(`${svc.domain}.`));
    if (bad) throw new Error(`${action} cannot target ${bad}`);
    await this.transport.callService(svc.domain, svc.service, { entity_id: targets });
  }

  async notify(n: Notification): Promise<void> {
    if (!this.opts.notifyService) throw new Error("notifyService not configured");
    const [domain, service] = this.opts.notifyService.split(".");
    if (domain !== "notify" || !service) throw new Error(`invalid notify service: ${this.opts.notifyService}`);
    const data: Record<string, unknown> = n.quiet
      ? { push: { "interruption-level": "passive" }, importance: "low", ttl: 0 }
      : { push: { "interruption-level": "time-sensitive" }, importance: "high", ttl: 0 };
    if (n.revertEntryId) data.actions = [{ action: `${REVERT_ACTION_PREFIX}${n.revertEntryId}`, title: "Undo" }];
    await this.transport.callService("notify", service, { title: n.title, message: n.message, data });
  }
}

/** Every entity the engine reads: used to filter state_changed events. */
export function watchedEntities(config: HomeConfig): Set<string> {
  const ids = new Set<string>([config.garage.doorEntity]);
  for (const z of ZONES) for (const e of zoneSensors(config, z)) ids.add(e);
  for (const r of config.rooms) for (const e of [...r.occupancySensors, ...r.lights, ...r.fans]) ids.add(e);
  for (const d of config.exteriorDoors) ids.add(d.entity);
  for (const d of config.importantDevices) {
    ids.add(d.entity);
    if (d.batteryEntity) ids.add(d.batteryEntity);
  }
  return ids;
}

export function toEntityState(s: Pick<HaState, "state" | "last_changed">): EntityState {
  const t = Date.parse(s.last_changed);
  // A bad timestamp would otherwise make a condition look infinitely old; treat it as "just changed" (conservative).
  return { state: s.state, lastChanged: Number.isFinite(t) ? t : Date.now() };
}

export function snapshotFromStates(now: number, states: HaState[], watched: Set<string>): HomeSnapshot {
  const entities: HomeSnapshot["entities"] = {};
  for (const s of states) if (watched.has(s.entity_id)) entities[s.entity_id] = toEntityState(s);
  return { now, entities };
}
