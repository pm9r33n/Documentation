import { describe, expect, it } from "vitest";
import { config, min, run, snap } from "./helpers";

const kinds = (s: ReturnType<typeof snap>, auto = true) => run(s, auto).issues.map((i) => i.id);
const HOUR = min(60);

describe("garage_open_long", () => {
  const G = "cover.garage_door";
  it("fires at 45 min with nobody around", () => {
    expect(kinds(snap({ [G]: ["open", min(44)] }))).toEqual([]);
    const [i] = run(snap({ [G]: ["open", min(161)] })).issues;
    expect(i).toMatchObject({
      id: "garage_open_long",
      type: "safety",
      title: "Garage has been open 2h 41m",
      suggested_action: "close_garage",
      can_auto: true,
      auto_conditions_met: true,
      revert_action: "open_garage",
    });
  });
  it.each([
    "binary_sensor.house_person_detected",
    "binary_sensor.front_yard_person_detected",
    "binary_sensor.backyard_person_detected",
  ])("no issue while %s is on", (e) => {
    expect(kinds(snap({ [G]: ["open", HOUR], [e]: "on" }))).toEqual([]);
  });
  it("no garage_open_long while a zone is unavailable, or within 60 s of clearing", () => {
    expect(kinds(snap({ [G]: ["open", HOUR], "binary_sensor.backyard_person_detected": "unavailable" }))).not.toContain("garage_open_long");
    expect(kinds(snap({ [G]: ["open", HOUR], "binary_sensor.backyard_person_detected": ["off", 59_000] }))).toEqual([]);
  });
  it("auto_conditions_met is false when the toggle is off", () => {
    expect(run(snap({ [G]: ["open", HOUR] }), false).issues[0]?.auto_conditions_met).toBe(false);
  });
});

describe("garage_open_uncertain", () => {
  const G = "cover.garage_door";
  const BACK = "binary_sensor.backyard_person_detected";
  it("fires when presence can't be confirmed (unavailable) and is notify-only", () => {
    const { issues } = run(snap({ [G]: ["open", HOUR], [BACK]: "unavailable" }));
    expect(issues.map((i) => i.id)).toEqual(["garage_open_uncertain"]);
    expect(issues[0]).toMatchObject({
      type: "safety", suggested_action: "notify", can_auto: false, auto_conditions_met: false, revert_action: null,
    });
    expect(issues[0]?.reason).toContain("backyard sensor unavailable");
  });
  it("respects the 45 min threshold", () => {
    expect(kinds(snap({ [G]: ["open", min(44)], [BACK]: "unavailable" }))).toEqual([]);
    expect(kinds(snap({ [G]: ["open", min(45)], [BACK]: "unavailable" }))).toEqual(["garage_open_uncertain"]);
  });
  it("a missing entity counts the same as unavailable", () => {
    const s = snap({ [G]: ["open", HOUR] });
    delete s.entities[BACK];
    expect(run(s).issues.map((i) => i.id)).toEqual(["garage_open_uncertain"]);
  });
  it("not when anyone is detected, including a zone with disagreeing sensors (someone home, other rooms idle)", () => {
    expect(kinds(snap({ [G]: ["open", HOUR], [BACK]: "unavailable", "binary_sensor.kitchen_motion": "on" }))).toEqual([]);
    expect(kinds(snap({ [G]: ["open", HOUR], [BACK]: "unavailable", "binary_sensor.house_person_detected": "on" }))).toEqual([]);
    expect(kinds(snap({ [G]: ["open", HOUR], "binary_sensor.house_person_detected": "on" }))).toEqual([]);
  });
  it("never when the garage is closed, when someone is confirmed present, or when all is clear", () => {
    expect(kinds(snap({ [BACK]: "unavailable" }))).toEqual([]);
    expect(kinds(snap({ [G]: ["open", HOUR] }))).toEqual(["garage_open_long"]);
  });
  it("is mutually exclusive with garage_open_long, even toggle on/off", () => {
    for (const auto of [true, false])
      expect(kinds(snap({ [G]: ["open", HOUR], [BACK]: "unavailable" }), auto)).toEqual(["garage_open_uncertain"]);
  });
});

describe("lights/fan left on", () => {
  it("lights: 20 min boundary, per room", () => {
    expect(kinds(snap({ "light.kitchen_main": ["on", HOUR], "binary_sensor.kitchen_motion": ["off", min(19)] }))).toEqual([]);
    const [i] = run(snap({ "light.kitchen_main": ["on", HOUR], "binary_sensor.kitchen_motion": ["off", min(20)] })).issues;
    expect(i).toMatchObject({
      id: "lights_left_on:kitchen",
      type: "comfort",
      suggested_action: "turn_off_lights",
      targets: ["light.kitchen_main"],
      revert_action: "turn_on_lights",
    });
  });
  it("lights switched on recently restart the wait", () => {
    expect(kinds(snap({ "light.kitchen_main": ["on", min(5)] }))).toEqual([]);
  });
  it("occupied room never fires", () => {
    expect(kinds(snap({ "light.kitchen_main": ["on", HOUR], "binary_sensor.kitchen_motion": "on" }))).toEqual([]);
  });
  it("fan: 25 min boundary, waste type", () => {
    const s = (m: number) => snap({ "fan.tv_room_ceiling_fan": ["on", HOUR], "binary_sensor.tv_room_motion": ["off", min(m)] });
    expect(kinds(s(24))).toEqual([]);
    expect(run(s(25)).issues[0]).toMatchObject({ id: "fan_left_on:tv_room", type: "waste", suggested_action: "turn_off_fan" });
  });
});

describe("device health", () => {
  it("critical_battery at <= 5, ignores junk, never auto", () => {
    const b = "sensor.front_door_lock_battery";
    expect(kinds(snap({ [b]: "6" }))).toEqual([]);
    expect(kinds(snap({ [b]: "unavailable" }))).toEqual([]);
    const [i] = run(snap({ [b]: "5" })).issues;
    expect(i).toMatchObject({ kind: "critical_battery", type: "device_health", suggested_action: "notify", can_auto: false, auto_conditions_met: false, revert_action: null });
  });
  it("device_offline_long at 12 h", () => {
    expect(kinds(snap({ "camera.driveway": ["unavailable", min(719)] }))).toEqual([]);
    expect(kinds(snap({ "camera.driveway": ["unavailable", min(720)] }))).toEqual(["device_offline_long:camera.driveway"]);
  });
});

describe("door_open_late", () => {
  const at = (h: number, m: number) => new Date(2026, 9, 30, h, m).getTime();
  const door = (nowMs: number, openAgo: number, extra = {}) =>
    snap({ "binary_sensor.back_door": ["on", openAgo], ...extra }, nowMs);
  it("only after 22:00", () => {
    expect(kinds(door(at(21, 59), HOUR * 3))).toEqual([]);
  });
  it("needs 15 min after 22:00, even if opened earlier", () => {
    expect(kinds(door(at(22, 14), HOUR * 3))).toEqual([]);
    expect(kinds(door(at(22, 15), HOUR * 3))).toEqual(["door_open_late:binary_sensor.back_door"]);
  });
  it("is notify-only", () => {
    expect(run(door(at(23, 0), HOUR)).issues[0]).toMatchObject({ can_auto: false, suggested_action: "notify", type: "safety" });
  });
  it("suppressed while anyone is present", () => {
    expect(kinds(door(at(23, 0), HOUR, { "binary_sensor.front_yard_person_detected": "on" }))).toEqual([]);
  });
  it("covers the small hours, ends at 05:00", () => {
    expect(kinds(door(at(3, 0), HOUR * 6)).length).toBe(1);
    expect(kinds(door(at(5, 0), HOUR * 6))).toEqual([]);
  });
});

it("config exposes example rooms", () => {
  expect(config.rooms.map((r) => r.id)).toEqual(["tv_room", "kitchen", "garage"]);
});
