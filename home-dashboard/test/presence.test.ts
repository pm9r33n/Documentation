import { describe, expect, it } from "vitest";
import { computePresence, nobodyAnywhere } from "../src/presence";
import { classifySignals } from "../src/signals";
import { validateConfig } from "../src/config";
import { buildContext } from "../src/context";
import { config, min, snap } from "./helpers";

const P = (over = {}) => computePresence(snap(over), config);

describe("presence", () => {
  it("all clear for 3h: nobody anywhere", () => {
    expect(nobodyAnywhere(P())).toBe(true);
  });

  it.each([
    ["house", "binary_sensor.house_person_detected"],
    ["yard", "binary_sensor.front_yard_person_detected"],
    ["backyard", "binary_sensor.backyard_person_detected"],
  ])("detection in %s blocks", (zone, entity) => {
    const p = P({ [entity]: ["on", min(1)] });
    expect(p[zone as "house"].present).toBe(true);
    expect(nobodyAnywhere(p)).toBe(false);
  });

  it("room motion counts as house presence", () => {
    expect(P({ "binary_sensor.kitchen_motion": "on" }).house.present).toBe(true);
  });

  it("presence is instant; absence needs 60 s", () => {
    expect(P({ "binary_sensor.backyard_person_detected": ["off", 30_000] }).backyard.present).toBe(true);
    expect(P({ "binary_sensor.backyard_person_detected": ["off", 60_000] }).backyard.present).toBe(false);
  });

  it("unavailable / missing sensor is presence", () => {
    expect(P({ "binary_sensor.front_yard_person_detected": "unavailable" }).yard.status).toBe("unknown");
    expect(nobodyAnywhere(P({ "binary_sensor.front_yard_person_detected": "unavailable" }))).toBe(false);
    expect(classifySignals([], snap()).present).toBe(true);
  });

  it("conflicting sensors are presence", () => {
    const s = snap({ "binary_sensor.house_person_detected": "on" });
    expect(classifySignals(["binary_sensor.house_person_detected", "binary_sensor.kitchen_motion"], s).status).toBe(
      "conflicting",
    );
  });

  it("flapping resets the stability window", () => {
    expect(P({ "binary_sensor.house_person_detected": ["off", 5_000] }).house.present).toBe(true);
  });

  it("validateConfig rejects a zone with no sensors", () => {
    expect(() => validateConfig({ ...config, zones: { ...config.zones, backyard: [] } })).toThrow(/backyard/);
    expect(() => validateConfig(config)).not.toThrow();
  });
});

describe("context", () => {
  it("builds the spec shape", () => {
    const c = buildContext(snap({ "binary_sensor.kitchen_motion": "on", "light.tv_room_lamp": "on" }), config, {
      autoActionsEnabled: true,
    }).state;
    expect(c.time_of_day).toBe("evening");
    expect(c.day_type).toBe("weekday");
    expect(c.human_presence).toBe(true);
    expect(c.presence_zones).toEqual(["house"]);
    expect(c.occupancy).toEqual({ tv_room: false, kitchen: true, garage: false });
    expect(c.waste_items).toEqual(["light.tv_room_lamp"]);
    expect(c.auto_actions_enabled).toBe(true);
  });
});
