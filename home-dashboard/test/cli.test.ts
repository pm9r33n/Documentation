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
  it("exits for restart when the connection drops", async () => {
    const { fake, exits } = await run(base);
    fake.closeCb();
    expect(exits).toEqual([1]);
  });
});
