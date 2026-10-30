import { emptyLearning, type LearningState } from "./learning";
import type { IssueKind, RevertAction } from "./types";

export type ActivityType =
  | "auto_action"
  | "auto_failed"
  | "manual_action"
  | "manual_failed"
  | "reverted"
  | "revert_failed"
  | "dismissed"
  | "notified";

export interface ActivityEntry {
  id: string;
  at: number;
  type: ActivityType;
  issueId: string;
  kind: IssueKind;
  message: string;
}

export interface RevertEntry {
  id: string;
  issueId: string;
  kind: IssueKind;
  label: string;
  revertAction: RevertAction;
  targets: string[];
  createdAt: number;
  expiresAt: number;
  status: "active" | "reverted";
}

/** Everything the engine needs persisted (JSON-safe). */
export interface EngineState {
  autoActionsEnabled: boolean;
  seq: number;
  activity: ActivityEntry[];
  reverts: RevertEntry[];
  /** issueId -> time of failed auto attempt */
  failures: Record<string, number>;
  /** issueId -> auto-action paused until (after user revert) */
  autoPausedUntil: Record<string, number>;
  /** issueIds already notified while still open */
  notified: string[];
  dismissals: { id: string; kind: IssueKind; at: number; ack?: boolean }[];
  revertedKinds: { kind: IssueKind; at: number }[];
  accepts: { kind: IssueKind; at: number }[];
  learning: LearningState;
}

export const emptyState = (autoActionsEnabled = true): EngineState => ({
  autoActionsEnabled,
  seq: 0,
  activity: [],
  reverts: [],
  failures: {},
  autoPausedUntil: {},
  notified: [],
  dismissals: [],
  revertedKinds: [],
  accepts: [],
  learning: emptyLearning(),
});
