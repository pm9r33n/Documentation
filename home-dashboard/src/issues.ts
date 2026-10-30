import type { HomeConfig } from "./config";
import type { EngineContext } from "./context";
import { DEFAULT_THRESHOLDS, FIXED, MS, type Thresholds } from "./constants";
import { nobodyAnywhere } from "./presence";
import { formatDuration, iso, lastNightStart } from "./time";
import type { DetectedIssue, HomeSnapshot } from "./types";

type Detector = (snap: HomeSnapshot, config: HomeConfig, ctx: EngineContext, t: Thresholds) => DetectedIssue[];

const NO_PRESENCE = "No presence detected in house, yard or backyard";

const garageOpenLong: Detector = (snap, config, ctx, t) => {
  const door = snap.entities[config.garage.doorEntity];
  if (!door || door.state !== "open") return [];
  const openMs = snap.now - door.lastChanged;
  if (openMs < t.garageOpenMin * MS.MIN) return [];
  // Any presence in house, yard or backyard (incl. the 60 s settle window) means no issue at all.
  if (!nobodyAnywhere(ctx.presence)) return [];
  return [
    {
      id: "garage_open_long",
      kind: "garage_open_long",
      type: "safety",
      title: `Garage has been open ${formatDuration(openMs)}`,
      reason: NO_PRESENCE,
      suggested_action: "close_garage",
      can_auto: true,
      auto_conditions_met: ctx.state.auto_actions_enabled,
      revert_action: "open_garage",
      created_at: iso(door.lastChanged),
      subject: "garage",
      targets: [config.garage.doorEntity],
    },
  ];
};

function leftOn(
  kind: "lights_left_on" | "fan_left_on",
  thresholdMin: (t: Thresholds) => number,
): Detector {
  const isLights = kind === "lights_left_on";
  return (snap, config, ctx, t) => {
    const out: DetectedIssue[] = [];
    for (const room of config.rooms) {
      const occ = ctx.rooms[room.id];
      if (!occ || occ.occupied || occ.emptySince === null) continue;
      const on = (isLights ? room.lights : room.fans).filter((e) => snap.entities[e]?.state === "on");
      if (on.length === 0) continue;
      // Waiting starts when the room emptied or the device was last switched on, whichever is later.
      const since = Math.max(occ.emptySince, ...on.map((e) => snap.entities[e]!.lastChanged));
      const ms = snap.now - since;
      if (ms < thresholdMin(t) * MS.MIN) continue;
      out.push({
        id: `${kind}:${room.id}`,
        kind,
        type: isLights ? "comfort" : "waste",
        title: `${isLights ? "Lights" : "Fan"} on in empty ${room.name}`,
        reason: `${room.name} empty for ${formatDuration(snap.now - occ.emptySince)}`,
        suggested_action: isLights ? "turn_off_lights" : "turn_off_fan",
        can_auto: true,
        auto_conditions_met: ctx.state.auto_actions_enabled,
        revert_action: isLights ? "turn_on_lights" : "turn_on_fan",
        created_at: iso(since),
        subject: room.id,
        targets: on,
      });
    }
    return out;
  };
}

const criticalBattery: Detector = (snap, config) =>
  config.importantDevices.flatMap((d) => {
    const b = d.batteryEntity ? snap.entities[d.batteryEntity] : undefined;
    if (!b || b.state.trim() === "") return [];
    const pct = Number(b.state);
    if (!Number.isFinite(pct) || pct > FIXED.batteryCriticalPct) return [];
    return [
      {
        id: `critical_battery:${d.entity}`,
        kind: "critical_battery" as const,
        type: "device_health" as const,
        title: `${d.name} battery at ${pct}%`,
        reason: "Battery is at or below 5%",
        suggested_action: "notify" as const,
        can_auto: false,
        auto_conditions_met: false,
        revert_action: null,
        created_at: iso(b.lastChanged),
        subject: d.entity,
        targets: [d.batteryEntity!],
      },
    ];
  });

const deviceOfflineLong: Detector = (snap, config) =>
  config.importantDevices.flatMap((d) => {
    const e = snap.entities[d.entity];
    if (!e || e.state !== "unavailable") return [];
    const ms = snap.now - e.lastChanged;
    if (ms < FIXED.offlineMs) return [];
    return [
      {
        id: `device_offline_long:${d.entity}`,
        kind: "device_offline_long" as const,
        type: "device_health" as const,
        title: `${d.name} offline ${formatDuration(ms)}`,
        reason: "Important device unavailable for 12 hours or more",
        suggested_action: "notify" as const,
        can_auto: false,
        auto_conditions_met: false,
        revert_action: null,
        created_at: iso(e.lastChanged),
        subject: d.entity,
        targets: [d.entity],
      },
    ];
  });

const doorOpenLate: Detector = (snap, config, ctx) => {
  const hour = new Date(snap.now).getHours();
  if (hour < FIXED.nightStartHour && hour >= FIXED.nightEndHour) return [];
  if (!nobodyAnywhere(ctx.presence)) return [];
  const nightStart = lastNightStart(snap.now);
  return config.exteriorDoors.flatMap((d) => {
    const e = snap.entities[d.entity];
    if (!e || (e.state !== "on" && e.state !== "open")) return [];
    // "Open >= 15 min after 22:00": time before 22:00 doesn't count.
    const ms = snap.now - Math.max(e.lastChanged, nightStart);
    if (ms < FIXED.doorOpenLateMs) return [];
    return [
      {
        id: `door_open_late:${d.entity}`,
        kind: "door_open_late" as const,
        type: "safety" as const,
        title: `${d.name} open ${formatDuration(snap.now - e.lastChanged)}`,
        reason: `Open after 22:00 with ${NO_PRESENCE.toLowerCase()}`,
        suggested_action: "notify" as const,
        can_auto: false,
        auto_conditions_met: false,
        revert_action: null,
        created_at: iso(e.lastChanged),
        subject: d.entity,
        targets: [d.entity],
      },
    ];
  });
};

const DETECTORS: Detector[] = [
  garageOpenLong,
  leftOn("lights_left_on", (t) => t.lightsEmptyMin),
  leftOn("fan_left_on", (t) => t.fanEmptyMin),
  criticalBattery,
  deviceOfflineLong,
  doorOpenLate,
];

export function detectIssues(
  snap: HomeSnapshot,
  config: HomeConfig,
  ctx: EngineContext,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): DetectedIssue[] {
  return DETECTORS.flatMap((d) => d(snap, config, ctx, thresholds));
}
