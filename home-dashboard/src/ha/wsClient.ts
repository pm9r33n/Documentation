import type { HaEvent, HaState, HaTransport } from "./transport";

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export interface WsClientOptions {
  /** e.g. ws://homeassistant.local:8123/api/websocket */
  url: string;
  /** Long-lived access token. Never logged or included in errors. */
  token: string;
  createSocket?: (url: string) => WebSocketLike;
  commandTimeoutMs?: number;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Home Assistant WebSocket API client (auth, commands, event subscriptions). */
export class HaWebSocketClient implements HaTransport {
  private ws: WebSocketLike | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private subs = new Map<number, (e: HaEvent) => void>();
  private closeCbs: (() => void)[] = [];

  constructor(private opts: WsClientOptions) {}

  connect(): Promise<void> {
    const make = this.opts.createSocket ?? ((u: string) => new WebSocket(u) as unknown as WebSocketLike);
    return new Promise<void>((resolve, reject) => {
      const ws = make(this.opts.url);
      this.ws = ws;
      let authed = false;
      ws.onmessage = (ev) => {
        const msg = parse(ev.data);
        if (!msg) return;
        if (!authed) {
          if (msg.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: this.opts.token }));
          else if (msg.type === "auth_ok") {
            authed = true;
            resolve();
          } else if (msg.type === "auth_invalid") {
            reject(new Error("Home Assistant rejected the access token"));
            ws.close();
          }
          return;
        }
        this.dispatch(msg);
      };
      ws.onclose = () => {
        this.failAll(new Error("connection closed"));
        if (!authed) reject(new Error("connection closed before auth"));
        this.closeCbs.forEach((cb) => cb());
      };
      ws.onerror = () => {
        if (!authed) reject(new Error("connection error"));
      };
    });
  }

  close(): void {
    this.ws?.close();
  }

  onClose(cb: () => void): void {
    this.closeCbs.push(cb);
  }

  async getStates(): Promise<HaState[]> {
    return (await this.command({ type: "get_states" })) as HaState[];
  }

  async callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
    await this.command({ type: "call_service", domain, service, service_data: data });
  }

  async subscribeEvents(eventType: string, cb: (e: HaEvent) => void): Promise<() => void> {
    const id = this.nextId; // command() allocates this id
    this.subs.set(id, cb);
    try {
      await this.command({ type: "subscribe_events", event_type: eventType });
    } catch (e) {
      this.subs.delete(id);
      throw e;
    }
    return () => {
      this.subs.delete(id);
      void this.command({ type: "unsubscribe_events", subscription: id }).catch(() => undefined);
    };
  }

  private command(payload: Record<string, unknown>): Promise<unknown> {
    const ws = this.ws;
    if (!ws) return Promise.reject(new Error("not connected"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`command ${String(payload.type)} timed out`));
      }, this.opts.commandTimeoutMs ?? 10_000);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, ...payload }));
    });
  }

  private dispatch(msg: Record<string, unknown>): void {
    const id = msg.id as number;
    if (msg.type === "result") {
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      clearTimeout(p.timer);
      if (msg.success) p.resolve(msg.result);
      else p.reject(new Error(String((msg.error as { message?: string } | undefined)?.message ?? "command failed")));
    } else if (msg.type === "event") {
      this.subs.get(id)?.(msg.event as HaEvent);
    }
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}

function parse(data: unknown): Record<string, unknown> | null {
  try {
    const v = JSON.parse(String(data));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
