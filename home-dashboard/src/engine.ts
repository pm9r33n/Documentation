import type { ActivityEntry, ActivityType, EngineState, RevertEntry } from "./activity";
import { emptyState } from "./activity";
import type { ExecutableAction, HomeAdapter } from "./adapter";
import { autoGuard } from "./autoActions";
import type { HomeConfig } from "./config";
import { DEFAULT_THRESHOLDS, FAILURE_COOLDOWN_MS, FIXED, POST_REVERT_AUTO_PAUSE_MS, type Thresholds } from "./constants";
import { buildContext, type EngineContext } from "./context";
import { detectIssues } from "./issues";
import { rankIssues, selectIssues, type PriorityHistory, type Selection } from "./priority";
import type { HomeSnapshot, Issue } from "./types";

const ACTION_VERB: Record<string, string> = {
  close_garage: "Closed the garage",
  turn_off_lights: "Turned off lights",
  turn_off_fan: "Turned off fan",
};

export interface Evaluation {
  ctx: EngineContext;
  ranked: Issue[];
  selection: Selection;
}

export class HomeEngine {
  thresholds: Thresholds = DEFAULT_THRESHOLDS;
  private inFlight = new Set<string>();

  constructor(
    private config: HomeConfig,
    private adapter: HomeAdapter,
    public state: EngineState = emptyState(),
  ) {}

  get history(): PriorityHistory {
    return { dismissals: this.state.dismissals, reverts: this.state.revertedKinds };
  }

  /** Persistent user preference; overrides everything, including learning. */
  setAutoActionsEnabled(on: boolean): void {
    this.state.autoActionsEnabled = on;
  }

  /** Pure read: build context, detect, score, select. No side effects. */
  evaluate(snap: HomeSnapshot): Evaluation {
    const ctx = buildContext(snap, this.config, {
      autoActionsEnabled: this.state.autoActionsEnabled,
      recentEvents: this.state.activity.slice(-5).map((a) => a.message),
    });
    const detected = detectIssues(snap, this.config, ctx, this.thresholds);
    const ranked = rankIssues(detected, snap.now, ctx.state.time_of_day, this.history);
    ctx.state.open_issues = ranked.map((i) => i.id);
    return { ctx, ranked, selection: selectIssues(ranked, snap.now) };
  }

  /** Evaluate, then run eligible automatic actions and one-time notifications. Call on every relevant state change. */
  async tick(snap: HomeSnapshot): Promise<Evaluation> {
    const ev = this.evaluate(snap);
    const now = snap.now;
    const open = new Set(ev.ranked.map((i) => i.id));
    this.state.notified = this.state.notified.filter((id) => open.has(id));
    for (const id of Object.keys(this.state.failures)) if (!open.has(id)) delete this.state.failures[id];

    for (const issue of ev.ranked) {
      if (issue.dismissed_until) continue;
      if (issue.suggested_action === "notify") {
        await this.notifyOnce(issue, now);
      } else if (this.autoEligible(issue, now)) {
        const g = autoGuard(issue, ev.ctx, snap, this.config, this.thresholds);
        if (g.ok) await this.runAuto(issue, now);
      }
    }
    return ev;
  }

  private autoEligible(issue: Issue, now: number): boolean {
    if (!issue.can_auto || !issue.auto_conditions_met || this.inFlight.has(issue.id)) return false;
    if (this.state.reverts.some((r) => r.issueId === issue.id && r.status === "active" && r.expiresAt > now)) return false;
    if ((this.state.autoPausedUntil[issue.id] ?? 0) > now) return false;
    const failedAt = this.state.failures[issue.id];
    return failedAt === undefined || now - failedAt >= FAILURE_COOLDOWN_MS;
  }

  private async runAuto(issue: Issue, now: number): Promise<void> {
    this.inFlight.add(issue.id);
    try {
      await this.adapter.execute(issue.suggested_action as ExecutableAction, issue.targets);
    } catch (e) {
      this.state.failures[issue.id] = now;
      this.log("auto_failed", issue, now, `Couldn't ${issue.suggested_action.replace(/_/g, " ")}: ${errText(e)}`);
      await this.adapter.notify({
        title: "Automatic action failed",
        message: `${issue.title}. Open the app to do it manually.`,
        quiet: false,
      });
      return;
    } finally {
      this.inFlight.delete(issue.id);
    }
    const message = `${ACTION_VERB[issue.suggested_action]} (${issue.reason.toLowerCase()})`;
    const entry = this.log("auto_action", issue, now, message);
    const revert: RevertEntry = {
      id: `r${++this.state.seq}`,
      issueId: issue.id,
      kind: issue.kind,
      label: ACTION_VERB[issue.suggested_action]!,
      revertAction: issue.revert_action!,
      targets: issue.targets,
      createdAt: now,
      expiresAt: now + FIXED.revertWindowMs,
      status: "active",
    };
    this.state.reverts.push(revert);
    await this.adapter.notify({ title: entry.message, message: "Tap to undo within 30 minutes.", quiet: true, revertEntryId: revert.id });
  }

  private async notifyOnce(issue: Issue, now: number): Promise<void> {
    if (this.state.notified.includes(issue.id)) return;
    this.state.notified.push(issue.id);
    this.log("notified", issue, now, issue.title);
    await this.adapter.notify({ title: issue.title, message: issue.reason, quiet: false });
  }

  /** One-tap revert; only inside the 30-minute window. */
  async revert(revertId: string, now: number): Promise<{ ok: boolean; reason?: string }> {
    const r = this.state.reverts.find((x) => x.id === revertId);
    if (!r || r.status !== "active") return { ok: false, reason: "nothing to revert" };
    if (r.expiresAt <= now) return { ok: false, reason: "revert window has closed" };
    const stub = { id: r.issueId, kind: r.kind } as Issue;
    try {
      await this.adapter.execute(r.revertAction, r.targets);
    } catch (e) {
      this.log("revert_failed", stub, now, `Couldn't undo: ${errText(e)}`);
      return { ok: false, reason: errText(e) };
    }
    r.status = "reverted";
    this.state.revertedKinds.push({ kind: r.kind, at: now });
    this.state.autoPausedUntil[r.issueId] = now + POST_REVERT_AUTO_PAUSE_MS;
    this.log("reverted", stub, now, `Undid: ${r.label}`);
    return { ok: true };
  }

  /** Revert chips still inside their window. */
  activeReverts(now: number): RevertEntry[] {
    return this.state.reverts.filter((r) => r.status === "active" && r.expiresAt > now);
  }

  /** Hero primary button. Manual actions skip the auto guards by design (the user decides). */
  async accept(issue: Issue, now: number): Promise<{ ok: boolean }> {
    if (issue.suggested_action === "notify") {
      this.state.dismissals.push({ id: issue.id, kind: issue.kind, at: now, ack: true });
      this.log("manual_action", issue, now, `Acknowledged: ${issue.title}`);
      return { ok: true };
    }
    try {
      await this.adapter.execute(issue.suggested_action as ExecutableAction, issue.targets);
    } catch (e) {
      this.log("manual_failed", issue, now, `Couldn't ${issue.suggested_action.replace(/_/g, " ")}: ${errText(e)}`);
      return { ok: false };
    }
    this.log("manual_action", issue, now, ACTION_VERB[issue.suggested_action]!);
    return { ok: true };
  }

  /** "Not now": 24 h suppression and a priority penalty for this issue type. */
  dismiss(issue: Issue, now: number): void {
    this.state.dismissals.push({ id: issue.id, kind: issue.kind, at: now });
    this.log("dismissed", issue, now, `Dismissed: ${issue.title}`);
  }

  private log(type: ActivityType, issue: Pick<Issue, "id" | "kind">, at: number, message: string): ActivityEntry {
    const e: ActivityEntry = { id: `a${++this.state.seq}`, at, type, issueId: issue.id, kind: issue.kind, message };
    this.state.activity.push(e);
    return e;
  }
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
