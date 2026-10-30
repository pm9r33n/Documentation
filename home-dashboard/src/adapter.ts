import type { RevertAction, SuggestedAction } from "./types";

/** Everything the engine can ask Home Assistant to do. `notify` is separate; locks/alarm/cameras are absent on purpose. */
export type ExecutableAction = Exclude<SuggestedAction, "notify"> | RevertAction;

export interface Notification {
  title: string;
  message: string;
  /** Quiet = no sound/alert; used for every automatic action. */
  quiet: boolean;
  /** Present when the notification offers a one-tap revert. */
  revertEntryId?: string;
}

/** The only seam to Home Assistant. Real implementation comes later; execute() must reject on failure. */
export interface HomeAdapter {
  execute(action: ExecutableAction, targets: string[]): Promise<void>;
  notify(n: Notification): Promise<void>;
}

/** In-memory stub for tests and local development. */
export class StubAdapter implements HomeAdapter {
  calls: { action: ExecutableAction; targets: string[] }[] = [];
  notifications: Notification[] = [];
  failNext: Error | null = null;
  async execute(action: ExecutableAction, targets: string[]): Promise<void> {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    this.calls.push({ action, targets });
  }
  async notify(n: Notification): Promise<void> {
    this.notifications.push(n);
  }
}
