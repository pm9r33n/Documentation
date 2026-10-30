/** Shape of an entry from HA `get_states` / `state_changed` (only the fields we use). */
export interface HaState {
  entity_id: string;
  state: string;
  last_changed: string;
}

export interface HaEvent {
  event_type: string;
  data: Record<string, unknown>;
}

/** Seam under HaAdapter/HomeRunner so everything above it is testable without a network. */
export interface HaTransport {
  getStates(): Promise<HaState[]>;
  /** Rejects if HA reports failure. */
  callService(domain: string, service: string, data: Record<string, unknown>): Promise<void>;
  subscribeEvents(eventType: string, cb: (e: HaEvent) => void): Promise<() => void>;
  onClose(cb: () => void): void;
}
