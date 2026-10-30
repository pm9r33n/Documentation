import type { HomeSnapshot } from "./types";

export type SignalStatus = "clear" | "present" | "conflicting" | "unknown";

export interface SignalResult {
  status: SignalStatus;
  /** Conservative: anything other than a clean "clear" counts as presence. */
  present: boolean;
  /** When the last of the sensors went clear, if all are clear now. */
  clearSince: number | null;
}

const isTracker = (id: string): boolean => id.startsWith("person.") || id.startsWith("device_tracker.");
const DETECTED = new Set(["on", "home", "detected", "occupied"]);
const CLEAR = new Set(["off", "not_home", "clear"]);

/**
 * Collapse sensors into one verdict. Confidence is deliberately ignored:
 * a weak detection is still a detection, conflicting sensors mean presence,
 * and missing/unavailable sensors mean presence (design doc section 2/10).
 * No sensors at all is "unknown", so a mis-wired zone can only ever block.
 */
export function classifySignals(entityIds: string[], snap: HomeSnapshot): SignalResult {
  let detected = 0;
  let clear = 0;
  let unknown = 0;
  let clearSince = 0;
  for (const id of entityIds) {
    const e = snap.entities[id];
    if (!e) unknown++;
    else if (isTracker(id) && e.state !== "unknown" && e.state !== "unavailable") {
      // person.* / device_tracker.*: "home" is presence; any other known state (not_home, a zone name like "Work") is away.
      if (e.state === "home") detected++;
      else {
        clear++;
        clearSince = Math.max(clearSince, e.lastChanged);
      }
    } else if (DETECTED.has(e.state)) detected++;
    else if (CLEAR.has(e.state)) {
      clear++;
      clearSince = Math.max(clearSince, e.lastChanged);
    } else unknown++;
  }
  if (detected > 0 && clear > 0) return { status: "conflicting", present: true, clearSince: null };
  if (detected > 0) return { status: "present", present: true, clearSince: null };
  if (unknown > 0 || clear === 0) return { status: "unknown", present: true, clearSince: null };
  return { status: "clear", present: false, clearSince };
}
