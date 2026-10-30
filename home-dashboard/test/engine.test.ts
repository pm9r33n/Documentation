import { describe, expect, it } from "vitest";
import { StubAdapter } from "../src/adapter";
import { autoGuard, autoTier } from "../src/autoActions";
import { FIXED } from "../src/constants";
import { HomeEngine } from "../src/engine";
import { buildHomeScreen } from "../src/homeScreen";
import { config, min, NOW, snap } from "./helpers";

const G = "cover.garage_door";
const garageOpen = (ago = min(60), extra = {}, now = NOW) => snap({ [G]: ["open", ago], ...extra }, now);
const lightsOn = (now = NOW) =>
  snap({ "light.kitchen_main": ["on", min(60)], "binary_sensor.kitchen_motion": ["off", min(30)] }, now);
const mk = () => {
  const a = new StubAdapter();
  return { a, e: new HomeEngine(config, a) };
};

describe("tier rules", () => {
  it("only tiers 1 and 2 are automatic; Tier 3 never is", () => {
    expect(autoTier("turn_off_lights")).toBe(1);
    expect(autoTier("turn_off_fan")).toBe(1);
    expect(autoTier("close_garage")).toBe(2);
    for (const t of ["lock", "unlock", "arm_alarm", "disarm_alarm", "set_security_mode", "camera_off", "notify", "toString"])
      expect(autoTier(t)).toBeNull();
  });
});

describe("Tier 1 auto-actions", () => {
  it("turns lights off, logs, notifies quietly, offers revert for 30 min", async () => {
    const { a, e } = mk();
    await e.tick(lightsOn());
    expect(a.calls).toEqual([{ action: "turn_off_lights", targets: ["light.kitchen_main"] }]);
    expect(a.notifications).toHaveLength(1);
    expect(a.notifications[0]).toMatchObject({ quiet: true, revertEntryId: expect.any(String) });
    expect(e.state.activity.at(-1)?.type).toBe("auto_action");
    const [r] = e.activeReverts(NOW);
    expect(r?.expiresAt).toBe(NOW + FIXED.revertWindowMs);
  });
  it("does nothing when the toggle is off, even though the issue shows", async () => {
    const { a, e } = mk();
    e.setAutoActionsEnabled(false);
    const ev = await e.tick(lightsOn());
    expect(a.calls).toEqual([]);
    expect(ev.ranked[0]?.id).toBe("lights_left_on:kitchen");
  });
  it("does not repeat while a revert is active", async () => {
    const { a, e } = mk();
    await e.tick(lightsOn());
    await e.tick(lightsOn(NOW + min(1)));
    expect(a.calls).toHaveLength(1);
  });
});

describe("Tier 2 garage", () => {
  it("closes when open >= 45 min and nobody is anywhere", async () => {
    const { a, e } = mk();
    await e.tick(garageOpen());
    expect(a.calls).toEqual([{ action: "close_garage", targets: [G] }]);
  });
  it.each([
    "binary_sensor.house_person_detected",
    "binary_sensor.front_yard_person_detected",
    "binary_sensor.backyard_person_detected",
  ])("never closes while %s", async (sensor) => {
    const { a, e } = mk();
    await e.tick(garageOpen(min(300), { [sensor]: "on" }));
    expect(a.calls).toEqual([]);
  });
  it("never closes on weak/unknown signals or inside the 60 s settle window", async () => {
    for (const over of [
      { "binary_sensor.backyard_person_detected": "unavailable" },
      { "binary_sensor.backyard_person_detected": ["off", 30_000] as [string, number] },
    ]) {
      const { a, e } = mk();
      await e.tick(garageOpen(min(300), over));
      expect(a.calls).toEqual([]);
    }
  });
  it("guard rejects a forged issue even when the issue claims eligibility", () => {
    const { e } = mk();
    const s = garageOpen(min(300), { "binary_sensor.backyard_person_detected": "on" });
    const ev = e.evaluate(s);
    const forged = { ...ev.ranked[0] ?? {}, id: "garage_open_long", kind: "garage_open_long", suggested_action: "close_garage",
      can_auto: true, auto_conditions_met: true, subject: "garage", targets: [G] } as never;
    expect(autoGuard(forged, ev.ctx, s, config).ok).toBe(false);
  });
  it("hard 45 min floor holds even if thresholds were tuned lower", () => {
    const { e } = mk();
    const s = garageOpen(min(44));
    const ev = e.evaluate(s);
    const issue = { id: "garage_open_long", kind: "garage_open_long", suggested_action: "close_garage", can_auto: true, auto_conditions_met: true, subject: "garage", targets: [G] } as never;
    expect(autoGuard(issue, ev.ctx, s, config, { lightsEmptyMin: 20, fanEmptyMin: 25, garageOpenMin: 10 }).ok).toBe(false);
  });
});

describe("revert", () => {
  it("restores state, pauses auto for that issue, records for learning", async () => {
    const { a, e } = mk();
    await e.tick(garageOpen());
    const [r] = e.activeReverts(NOW);
    expect(await e.revert(r!.id, NOW + min(10))).toEqual({ ok: true });
    expect(a.calls.at(-1)).toEqual({ action: "open_garage", targets: [G] });
    expect(e.state.revertedKinds).toHaveLength(1);
    // Garage is still open in this snapshot: auto must not fire again right away.
    await e.tick(garageOpen(min(80), {}, NOW + min(20)));
    expect(a.calls).toHaveLength(2);
    expect(e.activeReverts(NOW + min(10))).toEqual([]);
  });
  it("is refused after 30 minutes", async () => {
    const { a, e } = mk();
    await e.tick(lightsOn());
    const [r] = e.activeReverts(NOW);
    const res = await e.revert(r!.id, NOW + FIXED.revertWindowMs);
    expect(res.ok).toBe(false);
    expect(a.calls).toHaveLength(1);
  });
});

describe("failures", () => {
  it("logs, notifies loudly, does not retry immediately, shows manual alternative", async () => {
    const { a, e } = mk();
    a.failNext = new Error("cover unavailable");
    const ev = await e.tick(garageOpen());
    expect(e.state.activity.at(-1)?.type).toBe("auto_failed");
    expect(a.notifications[0]?.quiet).toBe(false);
    expect(e.activeReverts(NOW)).toEqual([]);
    await e.tick(garageOpen(min(65), {}, NOW + min(5)));
    expect(a.calls).toEqual([]);
    const vm = buildHomeScreen(ev, garageOpen(), config, { failedIssueIds: Object.keys(e.state.failures) });
    expect(vm.hero).toMatchObject({ kind: "issue", status: "auto_failed", primary: { action: "close_garage" } });
  });
});

describe("notify-only issues", () => {
  it("never automatic; notified once; acknowledge suppresses without penalty", async () => {
    const { a, e } = mk();
    const s = snap({ "sensor.front_door_lock_battery": "3" });
    const ev = await e.tick(s);
    await e.tick(s);
    expect(a.calls).toEqual([]);
    expect(a.notifications).toHaveLength(1);
    await e.accept(ev.ranked[0]!, NOW);
    expect(e.evaluate(s).selection.calm).toBe(true);
    expect(e.evaluate(s).ranked[0]!.priority).toBeGreaterThanOrEqual(ev.ranked[0]!.priority); // accept nudges up, never a penalty
  });
});

describe("manual + dismiss", () => {
  it("manual accept executes regardless of auto toggle", async () => {
    const { a, e } = mk();
    e.setAutoActionsEnabled(false);
    const ev = e.evaluate(garageOpen());
    expect(await e.accept(ev.ranked[0]!, NOW)).toEqual({ ok: true });
    expect(a.calls).toEqual([{ action: "close_garage", targets: [G] }]);
  });
  it("dismiss hides the issue and lowers its type's score", () => {
    const { e } = mk();
    const s = snap({ "fan.tv_room_ceiling_fan": ["on", min(90)], "binary_sensor.tv_room_motion": ["off", min(60)] });
    e.setAutoActionsEnabled(false);
    const before = e.evaluate(s);
    e.dismiss(before.ranked[0]!, NOW);
    const after = e.evaluate(s);
    expect(after.selection.calm).toBe(true);
    expect(after.ranked[0]!.priority).toBeLessThan(before.ranked[0]!.priority);
  });
});

describe("home screen", () => {
  it("calm hero + context bar when nothing is wrong", () => {
    const { e } = mk();
    const s = snap();
    const vm = buildHomeScreen(e.evaluate(s), s, config);
    expect(vm.hero.kind).toBe("calm");
    expect(vm.secondary).toEqual([]);
    expect(vm.contextBar.text).toBe("Evening · Nobody around · 0 issues");
    expect(vm.quickAccess.map((q) => q.id)).toEqual(["lights", "climate", "security", "areas"]);
  });
  it("hero + secondary ordering and undo chips", async () => {
    const { e } = mk();
    const s = garageOpen(min(60), { "sensor.front_door_lock_battery": "2" });
    e.setAutoActionsEnabled(false);
    const vm = buildHomeScreen(e.evaluate(s), s, config);
    expect(vm.hero).toMatchObject({ kind: "issue", issueId: "garage_open_long" });
    expect(vm.secondary.map((i) => i.issueId)).toEqual(["critical_battery:lock.front_door"]);
    expect(vm.contextBar.issueCount).toBe(2);
    expect(vm.undo).toEqual([]);
  });
});
