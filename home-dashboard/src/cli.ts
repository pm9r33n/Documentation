import type { HomeAdapter, ExecutableAction, Notification } from "./adapter";
import { HomeEngine } from "./engine";
import { haConfig } from "./config.ha";
import { FileStateStore } from "./ha/fileStore";
import { HaAdapter } from "./ha/haAdapter";
import { HomeRunner, type StateStore } from "./ha/runner";
import type { HaTransport } from "./ha/transport";
import { HaWebSocketClient } from "./ha/wsClient";
import type { HomeConfig } from "./config";

export interface CliConfig {
  wsUrl: string;
  token: string;
  notifyService?: string;
  stateFile: string;
  /** Only true when HOME_DASHBOARD_LIVE=1. Otherwise actions/notifications are logged, never sent. */
  live: boolean;
}

/** http(s)://host:8123[/] -> ws(s)://host:8123/api/websocket. */
export function toWsUrl(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("HA_URL must start with http:// or https://");
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/api/websocket";
  u.search = "";
  return u.toString();
}

/** Errors name the variable only, never its value. */
export function parseEnv(env: Record<string, string | undefined>): CliConfig {
  const need = (k: string): string => {
    const v = env[k]?.trim();
    if (!v) throw new Error(`missing environment variable ${k}`);
    return v;
  };
  const live = env.HOME_DASHBOARD_LIVE === "1";
  const notifyService = env.HA_NOTIFY_SERVICE?.trim() || undefined;
  if (live && !notifyService) throw new Error("HA_NOTIFY_SERVICE is required when HOME_DASHBOARD_LIVE=1");
  return {
    wsUrl: toWsUrl(need("HA_URL")),
    token: need("HA_TOKEN"),
    notifyService,
    stateFile: env.HOME_DASHBOARD_STATE_FILE?.trim() || "data/engine-state.json",
    live,
  };
}

/** Observe-only adapter: logs what would have happened, calls nothing. */
export class DryRunAdapter implements HomeAdapter {
  constructor(private log: (m: string) => void) {}
  async execute(action: ExecutableAction, targets: string[]): Promise<void> {
    this.log(`[dry-run] would ${action} ${targets.join(",")}`);
  }
  async notify(n: Notification): Promise<void> {
    this.log(`[dry-run] would notify: ${n.title}`);
  }
}

export interface CliDeps {
  connect: (wsUrl: string, token: string) => Promise<HaTransport & { close(): void }>;
  log?: (m: string) => void;
  config?: HomeConfig;
  /** Overridden in tests; defaults to a FileStateStore in live mode and nothing in dry-run. */
  store?: (cfg: CliConfig) => (StateStore & { load?: () => Promise<import("./activity").EngineState> }) | undefined;
  /** Tick cadence for time-based thresholds. */
  intervalMs?: number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  exit?: (code: number) => void;
}

export async function main(env: Record<string, string | undefined>, deps: Partial<CliDeps> = {}): Promise<HomeRunner> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const cfg = parseEnv(env);
  const client =
    (await (deps.connect ?? defaultConnect)(cfg.wsUrl, cfg.token));
  log(cfg.live ? "mode: LIVE (actions and notifications enabled)" : "mode: observe-only (no actions or notifications sent; state not persisted)");

  const store = deps.store ? deps.store(cfg) : cfg.live ? new FileStateStore(cfg.stateFile) : undefined;
  const state = store?.load ? await store.load() : undefined;
  const adapter: HomeAdapter = cfg.live ? new HaAdapter(client, { notifyService: cfg.notifyService }) : new DryRunAdapter(log);
  const engine = new HomeEngine(deps.config ?? haConfig, adapter, state);
  const runner = new HomeRunner({
    engine,
    transport: client,
    config: deps.config ?? haConfig,
    store,
    onEvaluation: (ev) => {
      const h = ev.selection.hero;
      log(h ? `hero: ${h.id} (${h.priority})` : "calm");
    },
  });
  // Stale data is never acted on, so on disconnect we exit and let the process manager restart us with a fresh sync.
  client.onClose(() => {
    log("connection to Home Assistant lost; exiting for restart");
    (deps.exit ?? ((c: number) => process.exit(c)))(1);
  });
  await runner.start();
  (deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms)))(() => void runner.tick().catch((e) => log(`tick failed: ${String(e)}`)), deps.intervalMs ?? 60_000);
  return runner;
}

async function defaultConnect(wsUrl: string, token: string): Promise<HaTransport & { close(): void }> {
  const c = new HaWebSocketClient({ url: wsUrl, token });
  await c.connect();
  return c;
}
