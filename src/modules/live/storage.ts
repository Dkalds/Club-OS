import type { LiveState } from "./types";

export function LIVE_STATE_KEY(eventId: string): string {
  return `clubos:live:${eventId}`;
}

export function saveLiveState(state: LiveState): void {
  try {
    localStorage.setItem(LIVE_STATE_KEY(state.eventId), JSON.stringify(state));
  } catch {
    // localStorage no disponible o lleno: Live sigue en memoria
  }
}

export function loadLiveState(eventId: string): LiveState | null {
  try {
    const raw = localStorage.getItem(LIVE_STATE_KEY(eventId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1
    ) {
      return null;
    }
    return parsed as LiveState;
  } catch {
    return null;
  }
}
