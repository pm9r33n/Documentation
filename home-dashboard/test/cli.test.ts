import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emptyState } from "../src/activity";
import { main, parseEnv, toWsUrl } from "../src/cli";
import { FileStateStore, reviveState } from "../src/ha/fileStore";
import type { HaEvent, HaState, HaTransport } from "../src/ha/transport";
import statesJson from "./fixtures/states.json";

const dirs: string[] = [];
const tmp = async () => { const d = await mkdtemp(join(tmpdir(), "hd-")); dirs.push(d); return d; };
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

describe("FileStateStore", () => {
  it("round-trips, writes atomically, and starts clean when missing or corrupt", async () => {
    const d = await tmp();
    const s = new FileStateStore(join(d, "sub", "state.json"));
    expect(await s.load()).toEqual(emptyState());
    const st = { ...emptyState(), seq: 7, autoActionsEnabled: false };
    await s.save(st);
    expect(await s.load()).toEqual(st);
    expect(await readdir(join(d, "sub"))).toEqual(["state.json"]);
    await writeFile(join(d, "sub", "state.json"), "{not json");
    expect(await s.load()).toEqual(emptyState());
  });
  it("reviveState fills gaps and drops bad learning data", () => {
    const r = reviveState({ seq: 3, learning: { factors: { fan_left_on: 99 } }, reverts: "nope" });
    expect(r.seq).toBe(3);
    expect(r.reverts).toEqual([]);
    expect(r.learning).toEqual({ factors: {} });
    expect(r.autoActionsEnabled).toBe(true);
    expect(reviveState(null)).toEqual(emptyState());
    expect(reviveState([])).toEqual(emptyState());
  });
});

describe("env parsing", () => {
  const ok = { HA_URL: "http://ha.local:8123/", HA_TOKEN: "tok" };
  it("converts the URL and defaults to observe-only", () => {
    expect(toWsUrl("https://ha.example.com/")).toBe("wss://ha.example.com/api/websocket");
    expect(parseEnv(ok)).toMatchObject({ wsUrl: "ws://ha.local:8123/api/websocket", live: false, stateFile: "data/engine-state.json" });
  });
  it("HA_WS_URL overrides (add-on); HA_URL is then optional", () => {
    expect(parseEnv({ HA_WS_URL: "ws://supervisor/core/websocket", HA_TOKEN: "t" }).wsUrl).toBe("ws://supervisor/core/websocket");
    expect(() => parseEnv({ HA_TOKEN: "t" })).toThrow(/HA_URL/);
  });
  it("live needs an explicit flag plus a notify service; errors never contain the token", () => {
    expect(parseEnv({ ...ok, HOME_DASHBOARD_LIVE: "true" }).live).toBe(false);
    expect(() => parseEnv({ ...ok, HOME_DASHBOARD_LIVE: "1" })).toThrow(/HA_NOTIFY_SERVICE/);
    expect(parseEnv({ ...ok, HOME_DASHBOARD_LIVE: "1", HA_NOTIFY_SERVICE: "notify.mobile_app_x" }).live).toBe(true);
    expect(() => parseEnv({ HA_URL: "http://x" })).toThrow(/HA_TOKEN/);
    expect(() => parseEnv({ HA_URL: "ftp://x", HA_TOKEN: "SECRETTOKEN" })).toThrow(/http/);
    try { parseEnv({ HA_URL: "ftp://x", HA_TOKEN: "SECRETTOKEN" }); } catch (e) { expect(String(e)).not.toContain("SECRETTOKEN"); }
  });
});

class Fake implements HaTransport {
  calls: string[] = [];
  closeCb: () => void = () => undefined;
  closed = false;
  async getStates() { return statesJson as HaState[]; }
  async callService(d: string, s: string) { this.calls.push(`${d}.${s}`); }
  async subscribeEvents(_t: string, _cb: (e: HaEvent) => void) { return () => undefined; }
  onClose(cb: () => void) { this.closeCb = cb; }
  close() { this.closed = true; }
}

describe("main (fake connection, never live)", () => {
  const base = { HA_URL: "http://ha.local:8123", HA_TOKEN: "tok" };
  const run = async (env: Record<string, string>, extra = {}) => {
    const fake = new Fake();
    const logs: string[] = [];
    const exits: number[] = [];
    const intervals: number[] = [];
    await main(env, { connect: async () => fake, log: (m) => logs.push(m), exit: (c) => exits.push(c), setInterval: (_f, ms) => intervals.push(ms), ...extra });
    return { fake, logs, exits, intervals };
  };
  // fixture's garage was opened at 17:00Z; real clock is "now", so the garage is long-open: an action is eligible.
  it("observe-only: evaluates and logs, but sends no service call and writes no state", async () => {
    const d = await tmp();
    const { fake, logs, intervals } = await run({ ...base, HOME_DASHBOARD_STATE_FILE: join(d, "s.json") });
    expect(fake.calls).toEqual([]);
    expect(logs.some((l) => l.includes("observe-only"))).toBe(true);
    expect(logs.some((l) => l.startsWith("[dry-run] would"))).toBe(true);
    expect(await readdir(d)).toEqual([]);
    expect(intervals).toEqual([60_000]);
  });
  it("live: acts through HaAdapter and persists state", async () => {
    const d = await tmp();
    const file = join(d, "s.json");
    const { fake } = await run({ ...base, HOME_DASHBOARD_LIVE: "1", HA_NOTIFY_SERVICE: "notify.mobile_app_x", HOME_DASHBOARD_STATE_FILE: file });
    expect(fake.calls).toContain("cover.close_cover");
    expect(fake.calls).toContain("notify.mobile_app_x");
    expect(JSON.parse(await readFile(file, "utf8")).reverts.length).toBeGreaterThan(0);
  });
  it("logs the evaluation only when it changes", async () => {
    const { logs, fake } = await run(base);
    const before = logs.filter((l) => l.startsWith("hero:") || l.startsWith("calm")).length;
    expect(before).toBe(1);
    expect(fake.calls).toEqual([]);
  });
  it("exits for restart when the connection drops", async () => {
    const { fake, exits } = await run(base);
    fake.closeCb();
    expect(exits).toEqual([1]);
  });
});

describe("state publishing (fake fetch)", () => {
  const base = { HA_URL: "http://ha.local:8123", HA_TOKEN: "tok", HOME_DASHBOARD_PUBLISH: "1", HA_REST_URL: "http://supervisor/core" };
  it("posts exactly one entity, with observe-only flag, no undo, and still calls no services", async () => {
    const fake = new Fake();
    const posts: { url: string; body: any }[] = [];
    await main(base, {
      connect: async () => fake, log: () => undefined, exit: () => undefined, setInterval: () => 0,
      fetch: async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; },
    });
    expect(fake.calls).toEqual([]);
    expect(posts.length).toBe(1);
    expect(posts[0]!.url).toBe("http://supervisor/core/api/states/sensor.home_dashboard_state");
    const a = posts[0]!.body.attributes;
    expect(a.observe_only).toBe(true);
    expect(a.undo).toEqual([]);
    expect(Object.keys(a)).toEqual(expect.arrayContaining(["context_bar", "hero", "secondary", "calm_status", "quick_access"]));
    expect(posts[0]!.body.state).toBe("garage_open_long");
  });
  it("does nothing without the flag, and a publish failure never crashes", async () => {
    let n = 0;
    await main({ HA_URL: "http://x", HA_TOKEN: "t" }, { connect: async () => new Fake(), log: () => undefined, exit: () => undefined, setInterval: () => 0, fetch: async () => { n++; return { ok: true, status: 200 }; } });
    expect(n).toBe(0);
    const logs: string[] = [];
    await main(base, { connect: async () => new Fake(), log: (m) => logs.push(m), exit: () => undefined, setInterval: () => 0, fetch: async () => ({ ok: false, status: 401 }) });
    await new Promise((r) => setTimeout(r, 10));
    expect(logs.some((l) => l.includes("publish failed: HTTP 401"))).toBe(true);
  });
});
