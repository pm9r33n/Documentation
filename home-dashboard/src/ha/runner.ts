import type { HomeConfig } from "../config";
import type { Evaluation, HomeEngine } from "../engine";
import type { EngineState } from "../activity";
import type { EntityState, HomeSnapshot } from "../types";
import { REVERT_ACTION_PREFIX, toEntityState, watchedEntities } from "./haAdapter";
import type { HaTransport } from "./transport";

export interface StateStore {
  save(state: EngineState): void | Promise<void>;
}

export interface RunnerDeps {
  engine: HomeEngine;
  transport: HaTransport;
  config: HomeConfig;
  now?: () => number;
  store?: StateStore;
  onEvaluation?: (ev: Evaluation, snap: HomeSnapshot) => void;
}

/**
 * Keeps a live entity map from HA, and ticks the engine on every relevant change.
 * Safety: while disconnected the map is stale, so ticks (and therefore automatic
 * actions) are skipped until a fresh full state load succeeds.
 */
export class HomeRunner {
  private entities: Record<string, EntityState> = {};
  private watched: Set<string>;
  private connected = false;
  private chain: Promise<unknown> = Promise.resolve();
  private unsubs: (() => void)[] = [];

  constructor(private d: RunnerDeps) {
    this.watched = watchedEntities(d.config);
    d.transport.onClose(() => {
      this.connected = false;
    });
  }

  private now(): number {
    return (this.d.now ?? Date.now)();
  }

  /** Initial / post-reconnect sync. Safe to call again after a reconnect. */
  async start(): Promise<void> {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.unsubs.push(
      await this.d.transport.subscribeEvents("state_changed", (e) => this.onStateChanged(e.data)),
      await this.d.transport.subscribeEvents("mobile_app_notification_action", (e) => this.onNotificationAction(e.data)),
    );
    const states = await this.d.transport.getStates();
    this.entities = {};
    for (const s of states) if (this.watched.has(s.entity_id)) this.entities[s.entity_id] = toEntityState(s);
    this.connected = true;
    await this.tick();
  }

  /** Serialized so overlapping events never run two ticks at once. */
  tick(): Promise<Evaluation | null> {
    const run = this.chain.then(async () => {
      if (!this.connected) return null;
      const snap = { now: this.now(), entities: { ...this.entities } };
      const ev = await this.d.engine.tick(snap);
      await this.d.store?.save(this.d.engine.state);
      this.d.onEvaluation?.(ev, snap);
      return ev;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  private onStateChanged(data: Record<string, unknown>): void {
    const id = data.entity_id as string;
    if (!this.watched.has(id)) return;
    const ns = data.new_state as { state: string; last_changed: string } | null;
    if (ns) this.entities[id] = toEntityState(ns);
    else delete this.entities[id];
    void this.tick().catch(() => undefined);
  }

  private onNotificationAction(data: Record<string, unknown>): void {
    const action = String(data.action ?? "");
    if (!action.startsWith(REVERT_ACTION_PREFIX)) return;
    const id = action.slice(REVERT_ACTION_PREFIX.length);
    this.chain = this.chain
      .then(() => this.d.engine.revert(id, this.now()))
      .then(() => this.d.store?.save(this.d.engine.state))
      .catch(() => undefined);
  }
}
