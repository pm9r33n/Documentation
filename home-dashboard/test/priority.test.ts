import { describe, expect, it } from "vitest";
import { MS } from "../src/constants";
import { BASE_SCORES, dismissedUntil, rankIssues, scoreIssue, selectIssues, type PriorityHistory } from "../src/priority";
import { ISSUE_KINDS, type DetectedIssue } from "../src/types";
import { NOW, min } from "./helpers";

const iso = (ago: number) => new Date(NOW - ago).toISOString();
const det = (kind: DetectedIssue["kind"], type: DetectedIssue["type"], ago = 0, id: string = kind): DetectedIssue => ({
  id, kind, type, title: "", reason: "", suggested_action: "notify", can_auto: false, auto_conditions_met: false,
  revert_action: null, created_at: iso(ago), subject: "", targets: [],
});
const H = (p: Partial<PriorityHistory> = {}): PriorityHistory => ({ dismissals: [], reverts: [], ...p });
const score = (d: DetectedIssue, tod: "morning" | "evening" = "morning", h = H()) => scoreIssue(d, NOW, tod, h);

describe("scoring", () => {
  it("base scores sit inside their bands and cover exactly the v1 catalog", () => {
    expect(Object.keys(BASE_SCORES).sort()).toEqual([...ISSUE_KINDS].sort());
    expect(BASE_SCORES.garage_open_long).toBeGreaterThanOrEqual(90);
    expect(BASE_SCORES.fan_left_on).toBeGreaterThanOrEqual(70);
    expect(BASE_SCORES.fan_left_on).toBeLessThan(90);
    expect(BASE_SCORES.critical_battery).toBeGreaterThanOrEqual(60);
    expect(BASE_SCORES.critical_battery).toBeLessThan(80);
    expect(BASE_SCORES.lights_left_on).toBeGreaterThanOrEqual(40);
    expect(BASE_SCORES.lights_left_on).toBeLessThan(60);
  });
  it("+1 per 10 minutes, capped at +10", () => {
    expect(score(det("fan_left_on", "waste", min(29)))).toBe(72);
    expect(score(det("fan_left_on", "waste", min(30)))).toBe(73);
    expect(score(det("fan_left_on", "waste", min(1000)))).toBe(80);
  });
  it("+5 for safety/waste in the evening only", () => {
    expect(score(det("fan_left_on", "waste"), "evening")).toBe(75);
    expect(score(det("critical_battery", "device_health"), "evening")).toBe(70);
    expect(score(det("lights_left_on", "comfort"), "evening")).toBe(45);
  });
  it("clamps to 100", () => {
    expect(score(det("garage_open_long", "safety", min(600)), "evening")).toBe(100);
  });
  it("dismissals: -10 each, linear decay over 7 days", () => {
    const d = det("fan_left_on", "waste");
    const h = (ago: number[]) => H({ dismissals: ago.map((a) => ({ id: "x", kind: "fan_left_on" as const, at: NOW - a })) });
    expect(score(d, "morning", h([0]))).toBe(60);
    expect(score(d, "morning", h([0, 0]))).toBe(50);
    expect(score(d, "morning", h([3.5 * MS.DAY]))).toBe(65);
    expect(score(d, "morning", h([7 * MS.DAY]))).toBe(70);
    expect(score(d, "morning", H({ dismissals: [{ id: "x", kind: "critical_battery", at: NOW }] }))).toBe(70);
  });
  it("recent revert: -15, decays", () => {
    const d = det("lights_left_on", "comfort");
    expect(score(d, "morning", H({ reverts: [{ kind: "lights_left_on", at: NOW }] }))).toBe(30);
    expect(score(d, "morning", H({ reverts: [{ kind: "lights_left_on", at: NOW - 7 * MS.DAY }] }))).toBe(45);
  });
  it("24 h suppression per exact issue id", () => {
    const h = H({ dismissals: [{ id: "a", kind: "fan_left_on", at: NOW - 23 * MS.HOUR }] });
    expect(dismissedUntil("a", NOW, h)).toBe(NOW + MS.HOUR);
    expect(dismissedUntil("b", NOW, h)).toBeNull();
    expect(dismissedUntil("a", NOW + 2 * MS.HOUR, h)).toBeNull();
  });
});

describe("selection", () => {
  const sel = (ds: DetectedIssue[], h = H()) => selectIssues(rankIssues(ds, NOW, "morning", h), NOW);
  it("calm when nothing is empty or top < 40", () => {
    expect(sel([]).calm).toBe(true);
    const r = sel([det("lights_left_on", "comfort")], H({ reverts: [{ kind: "lights_left_on", at: NOW }] }));
    expect(r).toEqual({ hero: null, secondary: [], calm: true });
  });
  it("hero is highest score; secondary only >= 55; max 3 shown", () => {
    const r = sel([
      det("lights_left_on", "comfort", 0, "l1"),
      det("fan_left_on", "waste", 0, "f1"),
      det("critical_battery", "device_health", 0, "b1"),
      det("device_offline_long", "device_health", 0, "o1"),
      det("garage_open_long", "safety"),
    ]);
    expect(r.hero?.id).toBe("garage_open_long");
    expect(r.secondary.map((i) => i.id)).toEqual(["b1", "f1"]);
  });
  it("hero shown alone when the rest are < 55", () => {
    const r = sel([det("fan_left_on", "waste"), det("lights_left_on", "comfort")]);
    expect(r.hero?.id).toBe("fan_left_on");
    expect(r.secondary.map((i) => i.id)).toEqual([]);
  });
  it("dismissed issues are skipped", () => {
    const r = sel(
      [det("garage_open_long", "safety"), det("fan_left_on", "waste")],
      H({ dismissals: [{ id: "garage_open_long", kind: "garage_open_long", at: NOW - MS.HOUR }] }),
    );
    expect(r.hero?.id).toBe("fan_left_on");
  });
  it("ties break by age then id", () => {
    const r = rankIssues([det("fan_left_on", "waste", 0, "b"), det("fan_left_on", "waste", 0, "a")], NOW, "morning");
    expect(r.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
