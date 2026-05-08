import type { ActiveConditionState, CharacterDeathSaveState, CharacterPlayEvent, CharacterPlayState, ConcentrationState } from "../../domain/playState";
import { appendPlayEvent } from "./playEventLog";

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function clampWithin(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function nextUpdatedAt(
  state: CharacterPlayState,
  timestamp?: string,
): string {
  return timestamp ?? state.updatedAt ?? new Date().toISOString();
}

function withEvent(
  state: CharacterPlayState,
  event: CharacterPlayEvent | undefined,
  timestamp?: string,
): CharacterPlayState {
  return withEvents(state, event ? [event] : [], timestamp);
}

function withEvents(
  state: CharacterPlayState,
  events: CharacterPlayEvent[] | undefined,
  timestamp?: string,
): CharacterPlayState {
  return {
    ...state,
    updatedAt: nextUpdatedAt(state, timestamp),
    playEvents: events?.length
      ? events.reduce((current, event) => appendPlayEvent(current, event), state.playEvents)
      : state.playEvents,
  };
}

function nextDeathSaveState(
  state: CharacterDeathSaveState,
  result: "success" | "failure" | "critical-success" | "critical-failure",
): CharacterDeathSaveState {
  if (result === "critical-success") {
    return {
      successes: 3,
      failures: 0,
      stable: true,
      dead: false,
    };
  }
  const nextSuccesses = result === "success" ? Math.min(3, state.successes + 1) : state.successes;
  const nextFailures = result === "critical-failure" ? Math.min(3, state.failures + 2) : result === "failure" ? Math.min(3, state.failures + 1) : state.failures;
  return {
    successes: nextSuccesses,
    failures: nextFailures,
    stable: nextSuccesses >= 3,
    dead: nextFailures >= 3,
  };
}

function resetDeathSaves(): CharacterDeathSaveState {
  return {
    successes: 0,
    failures: 0,
    stable: false,
    dead: false,
  };
}

function updateCounterMap(
  current: Record<string, number>,
  key: string,
  value: number,
): Record<string, number> {
  if (!key) {
    return current;
  }
  return {
    ...current,
    [key]: clampNonNegative(value),
  };
}

export type PlayStateAction =
  | {
      type: "apply-damage";
      amount: number;
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "apply-healing";
      amount: number;
      maxHp: number;
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "set-current-hp";
      currentHp: number;
      maxHp: number;
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "set-temp-hp";
      tempHp: number;
      forceReplace?: boolean;
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "record-death-save";
      result: "success" | "failure" | "critical-success" | "critical-failure";
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "spend-resource";
      resourceKey: string;
      amount: number;
      resourceMax: number;
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "restore-resource";
      resourceKey: string;
      amount: number;
      resourceMax: number;
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "spend-spell-slot";
      slotKey: string;
      amount: number;
      slotMax: number;
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "restore-spell-slot";
      slotKey: string;
      amount: number;
      slotMax: number;
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "cast-spell";
      spellName: string;
      spellId: string;
      ritualCast: boolean;
      slotKey?: string;
      slotMax?: number;
      startConcentration?: ConcentrationState;
      event?: CharacterPlayEvent;
      extraEvents?: CharacterPlayEvent[];
      timestamp?: string;
    }
  | {
      type: "toggle-condition";
      condition: ActiveConditionState;
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "start-concentration";
      concentration: ConcentrationState;
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "end-concentration";
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "record-event";
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "short-rest";
      resetResourceKeys: string[];
      resetSpellSlotKeys: string[];
      clearConditionIds?: string[];
      event?: CharacterPlayEvent;
      timestamp?: string;
    }
  | {
      type: "long-rest";
      resetResourceKeys: string[];
      resetSpellSlotKeys: string[];
      clearConditionIds?: string[];
      maxHp: number;
      event?: CharacterPlayEvent;
      timestamp?: string;
    };

export function reduceCharacterPlayState(
  state: CharacterPlayState,
  action: PlayStateAction,
): CharacterPlayState {
  if (action.type === "apply-damage") {
    const amount = clampNonNegative(action.amount);
    if (amount <= 0) {
      return withEvent(state, action.event, action.timestamp);
    }
    const tempReduced = Math.min(state.tempHp, amount);
    const remainingDamage = amount - tempReduced;
    const next = {
      ...state,
      tempHp: clampNonNegative(state.tempHp - tempReduced),
      currentHp: clampNonNegative(state.currentHp - remainingDamage),
    };
    return withEvent(next, action.event, action.timestamp);
  }

  if (action.type === "apply-healing") {
    const amount = clampNonNegative(action.amount);
    if (amount <= 0) {
      return withEvent(state, action.event, action.timestamp);
    }
    const maxHp = Math.max(1, clampNonNegative(action.maxHp));
    const currentHp = clampWithin(state.currentHp + amount, 0, maxHp);
    const next = {
      ...state,
      currentHp,
      deathSaves: currentHp > 0 ? resetDeathSaves() : state.deathSaves,
    };
    return withEvent(next, action.event, action.timestamp);
  }

  if (action.type === "set-current-hp") {
    const maxHp = Math.max(1, clampNonNegative(action.maxHp));
    const currentHp = clampWithin(action.currentHp, 0, maxHp);
    const next = {
      ...state,
      currentHp,
      deathSaves: currentHp > 0 ? resetDeathSaves() : state.deathSaves,
    };
    return withEvent(next, action.event, action.timestamp);
  }

  if (action.type === "set-temp-hp") {
    const requested = clampNonNegative(action.tempHp);
    if (!action.forceReplace && requested < state.tempHp) {
      return withEvent(state, action.event, action.timestamp);
    }
    return withEvent(
      {
        ...state,
        tempHp: requested,
      },
      action.event,
      action.timestamp,
    );
  }

  if (action.type === "record-death-save") {
    if (state.currentHp > 0) {
      return withEvent(state, action.event, action.timestamp);
    }
    return withEvent(
      {
        ...state,
        deathSaves: nextDeathSaveState(state.deathSaves, action.result),
      },
      action.event,
      action.timestamp,
    );
  }

  if (action.type === "spend-resource") {
    const resourceMax = Math.max(0, clampNonNegative(action.resourceMax));
    const amount = clampNonNegative(action.amount);
    const currentSpent = clampNonNegative(state.spentResources[action.resourceKey] ?? 0);
    const nextSpent = clampWithin(currentSpent + amount, 0, resourceMax);
    return withEvent(
      {
        ...state,
        spentResources: updateCounterMap(state.spentResources, action.resourceKey, nextSpent),
      },
      action.event,
      action.timestamp,
    );
  }

  if (action.type === "restore-resource") {
    const resourceMax = Math.max(0, clampNonNegative(action.resourceMax));
    const amount = clampNonNegative(action.amount);
    const currentSpent = clampWithin(state.spentResources[action.resourceKey] ?? 0, 0, resourceMax);
    const nextSpent = clampWithin(currentSpent - amount, 0, resourceMax);
    return withEvent(
      {
        ...state,
        spentResources: updateCounterMap(state.spentResources, action.resourceKey, nextSpent),
      },
      action.event,
      action.timestamp,
    );
  }

  if (action.type === "spend-spell-slot") {
    const slotMax = Math.max(0, clampNonNegative(action.slotMax));
    const amount = clampNonNegative(action.amount);
    const currentUsed = clampWithin(state.spellSlots[action.slotKey] ?? 0, 0, slotMax);
    const nextUsed = clampWithin(currentUsed + amount, 0, slotMax);
    return withEvent(
      {
        ...state,
        spellSlots: updateCounterMap(state.spellSlots, action.slotKey, nextUsed),
      },
      action.event,
      action.timestamp,
    );
  }

  if (action.type === "restore-spell-slot") {
    const slotMax = Math.max(0, clampNonNegative(action.slotMax));
    const amount = clampNonNegative(action.amount);
    const currentUsed = clampWithin(state.spellSlots[action.slotKey] ?? 0, 0, slotMax);
    const nextUsed = clampWithin(currentUsed - amount, 0, slotMax);
    return withEvent(
      {
        ...state,
        spellSlots: updateCounterMap(state.spellSlots, action.slotKey, nextUsed),
      },
      action.event,
      action.timestamp,
    );
  }

  if (action.type === "cast-spell") {
    let nextState = state;
    if (!action.ritualCast && action.slotKey && action.slotMax !== undefined) {
      const used = clampWithin(state.spellSlots[action.slotKey] ?? 0, 0, Math.max(0, clampNonNegative(action.slotMax)));
      const nextUsed = clampWithin(used + 1, 0, Math.max(0, clampNonNegative(action.slotMax)));
      nextState = {
        ...nextState,
        spellSlots: updateCounterMap(nextState.spellSlots, action.slotKey, nextUsed),
      };
    }
    if (action.startConcentration) {
      nextState = {
        ...nextState,
        concentration: action.startConcentration,
      };
    }
    return withEvents(nextState, [action.event, ...(action.extraEvents ?? [])].filter((event): event is CharacterPlayEvent => Boolean(event)), action.timestamp);
  }

  if (action.type === "toggle-condition") {
    const existing = state.activeConditions.find((entry) => entry.id === action.condition.id);
    const activeConditions = existing
      ? state.activeConditions.filter((entry) => entry.id !== action.condition.id)
      : [...state.activeConditions, action.condition];
    return withEvent(
      {
        ...state,
        activeConditions,
      },
      action.event,
      action.timestamp,
    );
  }

  if (action.type === "start-concentration") {
    return withEvent(
      {
        ...state,
        concentration: action.concentration,
      },
      action.event,
      action.timestamp,
    );
  }

  if (action.type === "end-concentration") {
    return withEvent(
      {
        ...state,
        concentration: null,
      },
      action.event,
      action.timestamp,
    );
  }

  if (action.type === "record-event") {
    return withEvent(state, action.event, action.timestamp);
  }

  if (action.type === "short-rest") {
    const nextSpentResources = { ...state.spentResources };
    for (const key of action.resetResourceKeys) {
      nextSpentResources[key] = 0;
    }
    const nextSlots = { ...state.spellSlots };
    for (const key of action.resetSpellSlotKeys) {
      nextSlots[key] = 0;
    }
    const clearConditionIds = new Set(action.clearConditionIds ?? []);
    return withEvent(
      {
        ...state,
        spentResources: nextSpentResources,
        spellSlots: nextSlots,
        activeConditions: clearConditionIds.size
          ? state.activeConditions.filter((entry) => !clearConditionIds.has(entry.id))
          : state.activeConditions,
        lastRestAt: action.timestamp ?? new Date().toISOString(),
      },
      action.event,
      action.timestamp,
    );
  }

  if (action.type === "long-rest") {
    const maxHp = Math.max(1, clampNonNegative(action.maxHp));
    const nextSpentResources = { ...state.spentResources };
    for (const key of action.resetResourceKeys) {
      nextSpentResources[key] = 0;
    }
    const nextSlots = { ...state.spellSlots };
    for (const key of action.resetSpellSlotKeys) {
      nextSlots[key] = 0;
    }
    const clearConditionIds = new Set(action.clearConditionIds ?? []);
    return withEvent(
      {
        ...state,
        currentHp: maxHp,
        tempHp: 0,
        deathSaves: resetDeathSaves(),
        concentration: null,
        spentResources: nextSpentResources,
        spellSlots: nextSlots,
        activeConditions: clearConditionIds.size
          ? state.activeConditions.filter((entry) => !clearConditionIds.has(entry.id))
          : state.activeConditions,
        lastRestAt: action.timestamp ?? new Date().toISOString(),
      },
      action.event,
      action.timestamp,
    );
  }

  return state;
}
