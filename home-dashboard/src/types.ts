export const ZONES = ["house", "yard", "backyard"] as const;
export type Zone = (typeof ZONES)[number];

/** Closed set: the v1 Issue Catalog (design doc section 5). No other issue kinds exist. */
export const ISSUE_KINDS = [
  "garage_open_long",
  "lights_left_on",
  "fan_left_on",
  "critical_battery",
  "device_offline_long",
  "door_open_late",
] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export type IssueCategory = "safety" | "waste" | "device_health" | "comfort" | "informational";

export type SuggestedAction = "close_garage" | "turn_off_lights" | "turn_off_fan" | "notify";
export type RevertAction = "open_garage" | "turn_on_lights" | "turn_on_fan";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";
export type DayType = "weekday" | "weekend";

/** Issue Object Contract (section 3) plus `kind`, `subject` and `targets` so actions know what to touch. */
export interface Issue {
  id: string;
  kind: IssueKind;
  type: IssueCategory;
  priority: number;
  title: string;
  reason: string;
  suggested_action: SuggestedAction;
  can_auto: boolean;
  auto_conditions_met: boolean;
  revert_action: RevertAction | null;
  /** When the underlying condition began (door opened, room went empty), not when the threshold was crossed. */
  created_at: string;
  dismissed_until: string | null;
  /** Room id, door/device entity, or "garage". */
  subject: string;
  /** Entities a suggested action would act on. */
  targets: string[];
}

/** Detector output: everything except what the priority engine owns. */
export type DetectedIssue = Omit<Issue, "priority" | "dismissed_until">;

export interface ContextState {
  time_of_day: TimeOfDay;
  day_type: DayType;
  human_presence: boolean;
  presence_zones: Zone[];
  occupancy: Record<string, boolean>;
  open_issues: string[];
  waste_items: string[];
  recent_events: string[];
  auto_actions_enabled: boolean;
  last_updated: string;
}

export interface EntityState {
  state: string;
  /** epoch ms of the last state change */
  lastChanged: number;
}

export interface HomeSnapshot {
  /** epoch ms; local-time fields (hour, weekday) are derived from the host timezone */
  now: number;
  entities: Record<string, EntityState>;
}
