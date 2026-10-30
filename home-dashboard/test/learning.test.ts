import { describe, expect, it } from "vitest";
import { StubAdapter } from "../src/adapter";
import { HomeEngine } from "../src/engine";
import { FACTOR_MAX, FACTOR_MIN, recordLearning, resolveThresholds, sanitizeLearning, emptyLearning } from "../src/learning";
import { dismissedUntil } from "../src/priority";
import { MS } from "../src/constants";
import { config, min, NOW, snap } from "./helpers";

describe("learning", () => {
  it("is gradual and bounded: lights/fan +/-20%", () => {
    let s = emptyLearning();
    s = recordLearning(s, "lights_left_on", "reverted");
    expect(resolveThresholds(s).lightsEmptyMin).toBe(21);
    for (let i = 0; i < 50; i++) s = recordLearning(s, "lights_left_on", "reverted");
    expect(s.factors.lights_left_on).toBe(FACTOR_MAX);
    expect(resolveThresholds(s).lightsEmptyMin).toBe(24);
    for (let i = 0; i < 100; i++) s = recordLearning(s, "lights_left_on", "accepted");
    expect(s.factors.lights_left_on).toBe(FACTOR_MIN);
    expect(resolveThresholds(s).lightsEmptyMin).toBe(16);
  });
  it("garage threshold can only rise, never below 45", () => {
    let s = emptyLearning();
    for (let i = 0; i < 100; i++) s = recordLearning(s, "garage_open_long", "accepted");
    expect(resolveThresholds(s).garageOpenMin).toBe(45);
    s = recordLearning(s, "garage_open_long", "reverted");
    expect(resolveThresholds(s).garageOpenMin).toBeGreaterThan(45);
    expect(resolveThresholds({ factors: { garage_open_long: 0.5 } }).garageOpenMin).toBe(45);
  });
  it("non-tunable kinds are untouched; bad data falls back to pure rules", () => {
    expect(recordLearning(emptyLearning(), "door_open_late", "reverted")).toEqual(emptyLearning());
    for (const bad of [null, 7, { factors: { lights_left_on: NaN } }, { factors: { fan_left_on: 9 } }, { factors: "x" }])
      expect(resolveThresholds(bad)).toEqual({ lightsEmptyMin: 20, fanEmptyMin: 25, garageOpenMin: 45 });
    expect(sanitizeLearning({ factors: { fan_left_on: 1.1 } }).factors.fan_left_on).toBe(1.1);
  });
  it("repeatedly dismissed issues are suppressed for 72 h", () => {
    const d = (ago: number) => ({ id: "x", kind: "fan_left_on" as const, at: NOW - ago });
    const h = { dismissals: [d(MS.DAY * 2), d(MS.DAY), d(0)], reverts: [] };
    expect(dismissedUntil("x", NOW, h)).toBe(NOW + 3 * MS.DAY);
    expect(dismissedUntil("x", NOW, { dismissals: [d(0)], reverts: [] })).toBe(NOW + MS.DAY);
  });
});

describe("engine learning integration", () => {
  const lights = (now: number) =>
    snap({ "light.kitchen_main": ["on", min(60)], "binary_sensor.kitchen_motion": ["off", min(22)] }, now);

  it("revert raises that kind's timing; tuned threshold delays the next detection; toggle still wins", async () => {
    const a = new StubAdapter();
    const e = new HomeEngine(config, a);
    await e.tick(lights(NOW));
    await e.revert(e.activeReverts(NOW)[0]!.id, NOW + min(1));
    expect(e.thresholds.lightsEmptyMin).toBe(21);
    e.state.autoPausedUntil = {};
    e.state.learning = { factors: { lights_left_on: 1.2 } }; // 24 min
    expect(e.evaluate(lights(NOW + min(2))).ranked).toEqual([]);
    e.setAutoActionsEnabled(false);
    e.state.learning = emptyLearning();
    a.calls.length = 0;
    await e.tick(lights(NOW + min(3)));
    expect(a.calls).toEqual([]);
  });
  it("corrupt learning state degrades to default rules, not a crash", () => {
    const e = new HomeEngine(config, new StubAdapter());
    e.state.learning = { factors: { lights_left_on: Infinity } };
    expect(e.evaluate(lights(NOW)).ranked[0]?.id).toBe("lights_left_on:kitchen");
  });
  it("resetLearning clears tuning and penalties but keeps active suppression", () => {
    const e = new HomeEngine(config, new StubAdapter());
    const issue = e.evaluate(lights(NOW)).ranked[0]!;
    e.dismiss(issue, NOW);
    e.state.learning = { factors: { lights_left_on: 1.2 } };
    e.resetLearning(NOW + min(5));
    expect(e.thresholds.lightsEmptyMin).toBe(20);
    expect(e.evaluate(lights(NOW + min(5))).selection.calm).toBe(true);
    expect(e.evaluate(lights(NOW + min(5))).ranked[0]?.priority).toBe(issue.priority);
  });
  it("sensor flapping restarts the empty-room timer", () => {
    const e = new HomeEngine(config, new StubAdapter());
    const s = snap({ "light.kitchen_main": ["on", min(90)], "binary_sensor.kitchen_motion": ["off", 10_000] });
    expect(e.evaluate(s).ranked).toEqual([]);
  });
});
