import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { emptyState, type EngineState } from "../activity";
import { sanitizeLearning } from "../learning";
import type { StateStore } from "./runner";

/** Fill missing fields from defaults; anything unusable falls back to a fresh state rather than crashing. */
export function reviveState(raw: unknown): EngineState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyState();
  const base = emptyState();
  const r = raw as Partial<EngineState>;
  const arr = <T>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d);
  const obj = <T extends object>(v: unknown, d: T): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : d);
  return {
    autoActionsEnabled: typeof r.autoActionsEnabled === "boolean" ? r.autoActionsEnabled : base.autoActionsEnabled,
    seq: typeof r.seq === "number" && Number.isFinite(r.seq) ? r.seq : 0,
    activity: arr(r.activity, base.activity),
    reverts: arr(r.reverts, base.reverts),
    failures: obj(r.failures, base.failures),
    autoPausedUntil: obj(r.autoPausedUntil, base.autoPausedUntil),
    notified: arr(r.notified, base.notified),
    dismissals: arr(r.dismissals, base.dismissals),
    revertedKinds: arr(r.revertedKinds, base.revertedKinds),
    accepts: arr(r.accepts, base.accepts),
    learning: sanitizeLearning(r.learning),
  };
}

/** JSON file persistence. Writes are atomic (temp file + rename) so a crash can't leave a torn file. */
export class FileStateStore implements StateStore {
  constructor(private path: string) {}

  async load(): Promise<EngineState> {
    try {
      return reviveState(JSON.parse(await readFile(this.path, "utf8")));
    } catch {
      return emptyState(); // missing or corrupt: start clean (pure rules)
    }
  }

  async save(state: EngineState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(state), "utf8");
    await rename(tmp, this.path);
  }
}
