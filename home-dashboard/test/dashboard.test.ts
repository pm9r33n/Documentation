import { describe, expect, it } from "vitest";
import { buildDashboard, regionTemplate } from "../ha-dashboard/build";
import { StubAdapter } from "../src/adapter";
import { haConfig } from "../src/config.ha";
import { HomeEngine } from "../src/engine";
import { snapshotFromStates, watchedEntities } from "../src/ha/haAdapter";
import { toPublished } from "../src/ha/publisher";
import type { HaState } from "../src/ha/transport";
import { buildHomeScreen } from "../src/homeScreen";
import statesJson from "./fixtures/states.json";

const NOW = Date.parse("2026-10-30T19:41:00+00:00");
const base = statesJson as HaState[];

function published(over: Record<string, string> = {}, now = NOW) {
  const states = base.map((s) => (s.entity_id in over ? { ...s, state: over[s.entity_id]! } : s));
  const snap = snapshotFromStates(now, states, watchedEntities(haConfig));
  const e = new HomeEngine(haConfig, new StubAdapter());
  e.setAutoActionsEnabled(false);
  const ev = e.evaluate(snap);
  const vm = buildHomeScreen(ev, snap, haConfig);
  return toPublished(vm, { observeOnly: true, recent: ["Closed the garage (…)", "Dismissed: x"], evaluatedAt: new Date(now).toISOString() });
}

/** Evaluate a button-card `[[[ ... ]]]` template exactly like the card would, with a mocked hass. */
function render(js: string, sensor: ReturnType<typeof published> | null, now = NOW, state = "ok"): string {
  const body = js.trim().replace(/^\[\[\[/, "").replace(/\]\]\]$/, "");
  const states: Record<string, unknown> = {
    "sensor.forecast_days": { attributes: { days: [{ cond: "partlycloudy", hi: 68, lo: 42 }] } },
  };
  if (sensor) states["sensor.home_dashboard_state"] = { state: state === "ok" ? sensor.state : state, attributes: sensor.attributes };
  const doc = { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } };
  const realNow = Date.now;
  Date.now = () => now;
  try {
    return new Function("states", "document", body)(states, doc) as string;
  } finally {
    Date.now = realNow;
  }
}

const cards = () => (buildDashboard().views[0] as any).sections[0].cards as { custom_fields: { c: string } }[];
const [CTX, HERO, SEC, CALM, QUICK, TEST] = ["ctx", "hero", "sec", "calm", "quick", "test"] as const;
const tpl = (n: Parameters<typeof regionTemplate>[0]) => regionTemplate(n);

describe("dashboard structure", () => {
  it("is a single sections view in the spec order, display-only, fully self-contained", () => {
    const d = buildDashboard();
    expect(d.views).toHaveLength(1);
    expect(cards()).toHaveLength(1);
    for (const c of cards() as any[]) {
      expect(c.type).toBe("custom:button-card");
      expect(c.entity).toBe("sensor.home_dashboard_state");
      expect(c.tap_action).toEqual({ action: "none" });
    }
    expect(JSON.stringify(d).length).toBeLessThan(16_000);
    expect(JSON.stringify(d)).not.toMatch(/let-s-go|call-service|service:/);
  });
});

describe("combined card", () => {
  it("region classes never collide inside the single shadow root", () => {
    const out = render(cards()[0]!.custom_fields.c, published({ "sensor.backyard_battery": "3" }));
    const defined = [...out.matchAll(/(?:^|[}\s,>])\.([a-z][\w-]*)(?=[{\s,.:>])/g)].map((m) => m[1]!);
    const rules = [...out.matchAll(/<style>(.*?)<\/style>/g)].map((m) => [...m[1]!.matchAll(/(?:^|\})\.([a-z][\w-]*)\{/g)].map((x) => x[1]!));
    const seen = new Map<string, number>();
    rules.forEach((r, i) => new Set(r).forEach((c) => { if (seen.has(c) && seen.get(c) !== i) throw new Error("class collision: " + c); seen.set(c, i); }));
    expect(defined.length).toBeGreaterThan(10);
  });
  it("renders all regions in spec order with one template", () => {
    const out = render(cards()[0]!.custom_fields.c, published({ "sensor.backyard_battery": "3" }));
    const at = ["class='bar'", "class='hero'", "class='g'", "class='kr'", "class='qg'", "<details"].map((m) => out.indexOf(m));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(render(cards()[0]!.custom_fields.c, null)).toContain("NOT PUBLISHING");
  });
});

describe("templates against live-shaped data", () => {
  const issue = published({ }); // fixture: garage open, everyone away
  it("hero: issue state is color-coded, dated, display-only", () => {
    const h = render(tpl(HERO), issue);
    expect(h).toContain("Garage has been open");
    expect(h).toContain("SAFETY &middot;");
    expect(h).toContain("#ff5a36");
    expect(h).toContain("Suggested &middot; Close garage");
    expect(h).toContain("Not now");
    expect(h).toContain("PRIORITY");
    expect(h).toContain("@keyframes");
    expect(h).not.toMatch(/@@\w+@@/);
  });
  it("hero: calm state is teal with house + weather", () => {
    const calm = published({ "cover.ratgdov2_5i_e45c0a_door": "closed", "light.carrie": "off" });
    const h = render(tpl(HERO), calm);
    expect(h).toContain("All calm");
    expect(h).toContain("#3dd6c6");
    expect(h).toContain("partlycloudy");
    expect(h).not.toContain("Suggested");
  });
  it("every region renders without throwing and leaves no placeholders", () => {
    for (const i of [CTX, HERO, SEC, CALM, QUICK, TEST]) {
      const out = render(tpl(i), issue);
      expect(typeof out).toBe("string");
      expect(out).not.toMatch(/@@\w+@@/);
    }
    expect(render(tpl(CTX), issue)).toContain("OBSERVE-ONLY");
    expect(render(tpl(QUICK), issue)).toContain("Lights");
    expect(render(tpl(CALM), issue)).toContain("House");
    expect(render(tpl(TEST), issue)).toContain("(dry-run)");
  });
  it("secondary renders tiles for secondary issues and nothing when empty", () => {
    const out = render(tpl(SEC), published({ "sensor.backyard_battery": "3" }));
    expect(out).toContain("<div class='t'");
    expect(out).toContain("Lights on in empty Loveshack");
    expect(out).toContain("#9b7bff");
    expect(render(tpl(SEC), published({ "light.carrie": "off" }))).toBe("");
  });
  it("shows the not-publishing notice when the sensor is missing or unavailable", () => {
    expect(render(tpl(HERO), null)).toContain("NOT PUBLISHING");
    expect(render(tpl(CTX), issue, NOW, "unavailable")).toContain("NOT PUBLISHING");
    expect(render(tpl(SEC), null)).toBe("");
  });
  it("flags stale data after 10 minutes", () => {
    expect(render(tpl(CTX), issue, NOW + 11 * 60_000)).toContain("STALE");
    expect(render(tpl(CTX), issue, NOW + 2 * 60_000)).not.toContain("STALE");
  });
  it("escapes HTML coming from titles/reasons", () => {
    const evil = published();
    (evil.attributes.hero as any).title = "<img src=x onerror=alert(1)>";
    const h = render(tpl(HERO), evil);
    expect(h).not.toContain("<img");
    expect(h).toContain("&lt;img");
  });
});
