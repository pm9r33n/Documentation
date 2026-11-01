import type { RevertEntry } from "./activity";
import type { Evaluation } from "./engine";
import type { HomeConfig } from "./config";
import type { HomeSnapshot, Issue, IssueCategory, IssueKind, SuggestedAction } from "./types";

const ACTION_LABEL: Record<SuggestedAction, string> = {
  close_garage: "Close garage",
  turn_off_lights: "Turn off lights",
  turn_off_fan: "Turn off fan",
  notify: "Got it",
};

export interface WeatherInfo {
  summary: string;
  tempF?: number;
}

/** Fields the UI needs to color-code and date an issue. */
export interface IssueMeta {
  issueKind: IssueKind;
  issueType: IssueCategory;
  priority: number;
  /** ISO time the underlying condition began. */
  createdAt: string;
}

export interface HeroIssueView extends IssueMeta {
  kind: "issue";
  issueId: string;
  title: string;
  reason: string;
  primary: { action: SuggestedAction; label: string };
  secondary: { action: "dismiss"; label: string };
  /** "auto_failed" shows the failure with the manual alternative as the primary button. */
  status: "open" | "auto_failed";
}
export interface HeroCalmView {
  kind: "calm";
  title: string;
  reason: string;
}

export interface HomeScreenViewModel {
  contextBar: { timeOfDay: string; presence: string; issueCount: number; text: string };
  hero: HeroIssueView | HeroCalmView;
  secondary: (IssueMeta & { issueId: string; title: string; reason: string; primary: { action: SuggestedAction; label: string } })[];
  /** Revert chips for automatic actions inside their 30-minute window. Rendered with the hero. */
  undo: { revertId: string; label: string; expiresAt: number }[];
  calmStatus: { weather: WeatherInfo | null; presenceSummary: string; houseState: string };
  quickAccess: { id: "lights" | "climate" | "security" | "areas"; label: string; summary: string }[];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function presenceText(ev: Evaluation): string {
  const z = ev.ctx.state.presence_zones;
  if (z.length === 0) return "Nobody around";
  if (z.length === 1 && z[0] === "house") return "Home";
  return `Activity: ${z.join(", ")}`;
}

const meta = (i: Issue): IssueMeta => ({ issueKind: i.kind, issueType: i.type, priority: i.priority, createdAt: i.created_at });
const issueView = (i: Issue) => ({ action: i.suggested_action, label: ACTION_LABEL[i.suggested_action] });

export function buildHomeScreen(
  ev: Evaluation,
  snap: HomeSnapshot,
  config: HomeConfig,
  opts: { reverts?: RevertEntry[]; failedIssueIds?: string[]; weather?: WeatherInfo | null } = {},
): HomeScreenViewModel {
  const { hero, secondary } = ev.selection;
  const issueCount = (hero ? 1 : 0) + secondary.length;
  const presence = presenceText(ev);
  const lightsOn = config.rooms.flatMap((r) => r.lights).filter((e) => snap.entities[e]?.state === "on").length;
  const garage = snap.entities[config.garage.doorEntity]?.state ?? "unknown";
  const doorsOpen = config.exteriorDoors.filter((d) => ["on", "open"].includes(snap.entities[d.entity]?.state ?? "")).length;
  const occupiedRooms = Object.values(ev.ctx.state.occupancy).filter(Boolean).length;

  return {
    contextBar: {
      timeOfDay: cap(ev.ctx.state.time_of_day),
      presence,
      issueCount,
      text: `${cap(ev.ctx.state.time_of_day)} · ${presence} · ${issueCount} issue${issueCount === 1 ? "" : "s"}`,
    },
    hero: hero
      ? {
          kind: "issue",
          ...meta(hero),
          issueId: hero.id,
          title: hero.title,
          reason: hero.reason,
          primary: issueView(hero),
          secondary: { action: "dismiss", label: "Not now" },
          status: opts.failedIssueIds?.includes(hero.id) ? "auto_failed" : "open",
        }
      : { kind: "calm", title: "All calm", reason: "Nothing needs your attention." },
    secondary: secondary.map((i) => ({ ...meta(i), issueId: i.id, title: i.title, reason: i.reason, primary: issueView(i) })),
    undo: (opts.reverts ?? []).map((r) => ({ revertId: r.id, label: r.label, expiresAt: r.expiresAt })),
    calmStatus: {
      weather: opts.weather ?? null,
      presenceSummary: presence,
      houseState: garage === "open" ? "Garage open" : doorsOpen > 0 ? `${doorsOpen} door(s) open` : "Secure",
    },
    quickAccess: [
      { id: "lights", label: "Lights", summary: `${lightsOn} on` },
      { id: "climate", label: "Climate", summary: "—" },
      { id: "security", label: "Security", summary: garage === "open" ? "Garage open" : "Secure" },
      { id: "areas", label: "Areas", summary: `${occupiedRooms} occupied` },
    ],
  };
}
