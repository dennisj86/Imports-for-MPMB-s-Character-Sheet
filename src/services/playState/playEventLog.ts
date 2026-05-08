import type { CharacterPlayEvent, CharacterPlayEventType } from "../../domain/playState";

const MAX_PLAY_EVENTS = 200;

function generateEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `play-event-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export interface PlayEventInput {
  id?: string;
  timestamp?: string;
  type: CharacterPlayEventType;
  shortLabel: string;
  payload?: Record<string, unknown>;
}

export function createPlayEvent(input: PlayEventInput): CharacterPlayEvent {
  return {
    id: input.id ?? generateEventId(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    type: input.type,
    shortLabel: input.shortLabel,
    payload: input.payload ?? {},
  };
}

export function appendPlayEvent(
  existing: CharacterPlayEvent[],
  event: CharacterPlayEvent,
): CharacterPlayEvent[] {
  const next = [...existing, event];
  if (next.length <= MAX_PLAY_EVENTS) {
    return next;
  }
  return next.slice(next.length - MAX_PLAY_EVENTS);
}
