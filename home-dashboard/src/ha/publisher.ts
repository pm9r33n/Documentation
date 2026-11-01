import type { HomeScreenViewModel } from "../homeScreen";

/** The single entity this app is allowed to write. */
export const PUBLISHED_ENTITY = "sensor.home_dashboard_state";

export interface PublishedState {
  state: string;
  attributes: Record<string, unknown>;
}

export interface PublishOptions {
  observeOnly: boolean;
  /** Recent activity-feed messages, newest last. */
  recent: string[];
  evaluatedAt: string;
}

/** Flatten the home screen view model into one HA entity (state = hero issue id or "calm"). */
export function toPublished(vm: HomeScreenViewModel, o: PublishOptions): PublishedState {
  return {
    state: vm.hero.kind === "issue" ? vm.hero.issueId : "calm",
    attributes: {
      friendly_name: "Home Dashboard State",
      icon: "mdi:home-analytics",
      observe_only: o.observeOnly,
      evaluated_at: o.evaluatedAt,
      context_bar: vm.contextBar,
      hero: vm.hero,
      secondary: vm.secondary,
      // In observe-only nothing is really done, so there is nothing to undo.
      undo: o.observeOnly ? [] : vm.undo,
      calm_status: vm.calmStatus,
      quick_access: vm.quickAccess,
      recent_activity: o.recent.slice(-5).map((m) => (o.observeOnly ? `(dry-run) ${m}` : m)),
    },
  };
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

/** Writes only PUBLISHED_ENTITY via POST /api/states/<entity>. Does not call any service. */
export class HaRestPublisher {
  constructor(
    private baseUrl: string,
    private token: string,
    private fetchFn: FetchLike = (u, i) => fetch(u, i),
  ) {}

  async publish(p: PublishedState): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl.replace(/\/+$/, "")}/api/states/${PUBLISHED_ENTITY}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!res.ok) throw new Error(`publish failed: HTTP ${res.status}`);
  }
}
