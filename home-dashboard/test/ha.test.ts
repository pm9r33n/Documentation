import { describe, expect, it, vi } from "vitest";
import { StubAdapter } from "../src/adapter";
import { haConfig } from "../src/config.ha";
import { unmonitoredZones, validateConfig } from "../src/config";
import { HomeEngine } from "../src/engine";
import { HaAdapter, snapshotFromStates, watchedEntities } from "../src/ha/haAdapter";
import { HomeRunner } from "../src/ha/runner";
import type { HaEvent, HaState, HaTransport } from "../src/ha/transport";
import { HaWebSocketClient, type WebSocketLike } from "../src/ha/wsClient";
import { computePresence } from "../src/presence";
import statesJson from "./fixtures/states.json";

const states = statesJson as HaState[];
const NOW = Date.parse("2026-10-30T19:41:00+00:00");
const GARAGE = "cover.ratgdov2_5i_e45c0a_door";

class FakeTransport implements HaTransport {
  calls: { domain: string; service: string; data: Record<string, unknown> }[] = [];
  handlers = new Map<string, (e: HaEvent) => void>();
  closeCb: () => void = () => undefined;
  fail: Error | null = null;
  states = states;
  async getStates() { return this.states; }
  async callService(domain: string, service: string, data: Record<string, unknown>) {
    if (this.fail) throw this.fail;
    this.calls.push({ domain, service, data });
  }
  async subscribeEvents(t: string, cb: (e: HaEvent) => void) { this.handlers.set(t, cb); return () => this.handlers.delete(t); }
  onClose(cb: () => void) { this.closeCb = cb; }
  emit(t: string, data: Record<string, unknown>) { this.handlers.get(t)?.({ event_type: t, data }); }
}

describe("real config", () => {
  it("validates; backyard unmonitored; door_open_late inactive; no Tier 3 entities watched", () => {
    expect(() => validateConfig(haConfig)).not.toThrow();
    expect(unmonitoredZones(haConfig)).toEqual(["backyard"]);
    expect(haConfig.exteriorDoors).toEqual([]);
    const w = watchedEntities(haConfig);
    expect(w.has(GARAGE)).toBe(true);
    expect([...w].filter((e) => e.startsWith("lock.") || e.startsWith("alarm_control_panel."))).toEqual([]);
  });
  it("fixture: everyone away -> garage_open_long; backyard doesn't block; a person home does", () => {
    const watched = watchedEntities(haConfig);
    const e = new HomeEngine(haConfig, new StubAdapter());
    const snap = snapshotFromStates(NOW, states, watched);
    expect(e.evaluate(snap).ranked.map((i) => i.id)).toContain("garage_open_long");
    expect(computePresence(snap, haConfig).backyard.status).toBe("unmonitored");
    const home = states.map((s) => (s.entity_id === "person.carrie" ? { ...s, state: "home" } : s));
    const ids = e.evaluate(snapshotFromStates(NOW, home, watched)).ranked.map((i) => i.id);
    expect(ids).not.toContain("garage_open_long");
    expect(ids).not.toContain("garage_open_uncertain");
  });
  it("fixture: lights in an empty room are found; unwatched entities ignored", () => {
    const snap = snapshotFromStates(NOW, states, watchedEntities(haConfig));
    expect(snap.entities["fan.tv_room_fan"]).toBeUndefined();
    expect(new HomeEngine(haConfig, new StubAdapter()).evaluate(snap).ranked.map((i) => i.id)).toContain("lights_left_on:loveshack");
  });
});

describe("HaAdapter", () => {
  const mk = (opts = {}) => { const t = new FakeTransport(); return { t, a: new HaAdapter(t, opts) }; };
  it("maps every executable action to exactly one light/fan/cover service", async () => {
    const { t, a } = mk();
    await a.execute("close_garage", [GARAGE]);
    await a.execute("open_garage", [GARAGE]);
    await a.execute("turn_off_lights", ["light.a", "light.b"]);
    await a.execute("turn_on_lights", ["light.a"]);
    await a.execute("turn_off_fan", ["fan.x"]);
    await a.execute("turn_on_fan", ["fan.x"]);
    expect(t.calls.map((c) => `${c.domain}.${c.service}`)).toEqual([
      "cover.close_cover", "cover.open_cover", "light.turn_off", "light.turn_on", "fan.turn_off", "fan.turn_on",
    ]);
    expect(t.calls[2]?.data).toEqual({ entity_id: ["light.a", "light.b"] });
  });
  it("refuses unknown/Tier 3 actions, wrong-domain targets, and empty targets, without calling HA", async () => {
    const { t, a } = mk();
    for (const bad of ["lock", "unlock", "arm_alarm", "camera_off", "toString", "__proto__"])
      await expect(a.execute(bad as never, ["lock.front"])).rejects.toThrow(/not allowed/);
    await expect(a.execute("close_garage", ["lock.front_door"])).rejects.toThrow(/cannot target/);
    await expect(a.execute("turn_off_lights", [])).rejects.toThrow(/no targets/);
    expect(t.calls).toEqual([]);
  });
  it("propagates HA failures", async () => {
    const { t, a } = mk();
    t.fail = new Error("boom");
    await expect(a.execute("close_garage", [GARAGE])).rejects.toThrow("boom");
  });
  it("notify: quiet vs normal, undo action, requires a configured service", async () => {
    const { t, a } = mk({ notifyService: "notify.mobile_app_test" });
    await a.notify({ title: "t", message: "m", quiet: true, revertEntryId: "r7" });
    await a.notify({ title: "t", message: "m", quiet: false });
    expect(t.calls[0]).toMatchObject({ domain: "notify", service: "mobile_app_test" });
    expect(t.calls[0]?.data).toMatchObject({ data: { importance: "low", actions: [{ action: "DASHBOARD_REVERT_r7" }] } });
    expect((t.calls[1]?.data as { data: Record<string, unknown> }).data.actions).toBeUndefined();
    await expect(mk().a.notify({ title: "t", message: "m", quiet: true })).rejects.toThrow(/not configured/);
    await expect(mk({ notifyService: "light.turn_off" }).a.notify({ title: "t", message: "m", quiet: true })).rejects.toThrow(/invalid/);
  });
});

class FakeSocket implements WebSocketLike {
  sent: Record<string, unknown>[] = [];
  onopen = null; onmessage: WebSocketLike["onmessage"] = null; onclose: WebSocketLike["onclose"] = null; onerror = null;
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.onclose?.(); }
  recv(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}
async function connected(token = "SECRET") {
  const sock = new FakeSocket();
  const c = new HaWebSocketClient({ url: "ws://x/api/websocket", token, createSocket: () => sock, commandTimeoutMs: 50 });
  const p = c.connect();
  sock.recv({ type: "auth_required" });
  return { sock, c, p };
}

describe("HaWebSocketClient (fake socket, no network)", () => {
  it("authenticates with the token, then runs commands", async () => {
    const { sock, c, p } = await connected();
    expect(sock.sent[0]).toEqual({ type: "auth", access_token: "SECRET" });
    sock.recv({ type: "auth_ok" });
    await p;
    const call = c.callService("light", "turn_off", { entity_id: ["light.a"] });
    expect(sock.sent[1]).toEqual({ id: 1, type: "call_service", domain: "light", service: "turn_off", service_data: { entity_id: ["light.a"] } });
    sock.recv({ id: 1, type: "result", success: true, result: null });
    await expect(call).resolves.toBeUndefined();
    const gs = c.getStates();
    sock.recv({ id: 2, type: "result", success: true, result: [{ entity_id: "a", state: "on", last_changed: "x" }] });
    expect(await gs).toHaveLength(1);
  });
  it("rejects a bad token without echoing it", async () => {
    const { sock, p } = await connected("TOPSECRET");
    sock.recv({ type: "auth_invalid" });
    await expect(p).rejects.toThrow(/rejected the access token/);
    await p.catch((e: Error) => expect(e.message).not.toContain("TOPSECRET"));
  });
  it("surfaces service failure, timeout, and close", async () => {
    const { sock, c, p } = await connected();
    sock.recv({ type: "auth_ok" });
    await p;
    const f = c.callService("cover", "close_cover", {});
    sock.recv({ id: 1, type: "result", success: false, error: { code: "x", message: "not found" } });
    await expect(f).rejects.toThrow("not found");
    await expect(c.callService("cover", "close_cover", {})).rejects.toThrow(/timed out/);
    const pending = c.callService("cover", "close_cover", {});
    const closed = vi.fn();
    c.onClose(closed);
    sock.close();
    await expect(pending).rejects.toThrow(/connection closed/);
    expect(closed).toHaveBeenCalled();
  });
  it("routes subscribed events by subscription id", async () => {
    const { sock, c, p } = await connected();
    sock.recv({ type: "auth_ok" });
    await p;
    const got: HaEvent[] = [];
    const sub = c.subscribeEvents("state_changed", (e) => got.push(e));
    sock.recv({ id: 1, type: "result", success: true, result: null });
    await sub;
    sock.recv({ id: 1, type: "event", event: { event_type: "state_changed", data: { entity_id: "a" } } });
    sock.recv({ id: 99, type: "event", event: { event_type: "other", data: {} } });
    expect(got).toHaveLength(1);
  });
});

describe("HomeRunner", () => {
  const setup = () => {
    const t = new FakeTransport();
    const adapter = new HaAdapter(t, { notifyService: "notify.mobile_app_test" });
    const engine = new HomeEngine(haConfig, adapter);
    const saved: unknown[] = [];
    let now = NOW;
    const r = new HomeRunner({ engine, transport: t, config: haConfig, now: () => now, store: { save: (s) => void saved.push(s) } });
    return { t, engine, r, saved, setNow: (n: number) => (now = n) };
  };
  it("loads fixture states, auto-closes the garage via cover.close_cover, notifies quietly, persists", async () => {
    const { t, r, saved, engine } = setup();
    await r.start();
    expect(t.calls.map((c) => `${c.domain}.${c.service}`)).toContain("cover.close_cover");
    expect(t.calls.find((c) => c.domain === "cover")?.data).toEqual({ entity_id: [GARAGE] });
    expect(t.calls.some((c) => c.domain === "lock")).toBe(false);
    expect(engine.state.reverts.some((x) => x.issueId === "garage_open_long")).toBe(true);
    expect(saved.length).toBeGreaterThan(0);
  });
  it("does not act while disconnected (stale data), and resumes only after a fresh start()", async () => {
    const { t, r } = setup();
    t.states = states.map((s) => (s.entity_id === GARAGE ? { ...s, state: "closed" } : s));
    await r.start();
    t.calls.length = 0;
    t.closeCb();
    t.emit("state_changed", { entity_id: GARAGE, new_state: { state: "open", last_changed: "2026-10-30T10:00:00+00:00" } });
    await r.tick();
    expect(t.calls).toEqual([]);
    t.states = states;
    await r.start();
    expect(t.calls.some((c) => c.service === "close_cover")).toBe(true);
  });
  it("presence appearing via state_changed blocks the close", async () => {
    const { t, r } = setup();
    t.states = states.map((s) => (s.entity_id === "person.carrie" ? { ...s, state: "home" } : s));
    await r.start();
    expect(t.calls.some((c) => c.service === "close_cover")).toBe(false);
  });
  it("undo button on the notification reverts via cover.open_cover", async () => {
    const { t, r, engine, setNow } = setup();
    await r.start();
    const rev = engine.activeReverts(NOW)[0]!;
    setNow(NOW + 60_000);
    t.emit("mobile_app_notification_action", { action: `DASHBOARD_REVERT_${rev.id}` });
    await r.tick();
    expect(t.calls.some((c) => c.service === "open_cover")).toBe(true);
    t.emit("mobile_app_notification_action", { action: "SOMETHING_ELSE" });
  });
});
