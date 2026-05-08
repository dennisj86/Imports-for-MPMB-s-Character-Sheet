export const PLAY_STATE_SCHEMA_VERSION = 1 as const;

export interface CharacterDeathSaveState {
  successes: number;
  failures: number;
  stable: boolean;
  dead: boolean;
}

export interface ActiveConditionState {
  id: string;
  name: string;
  source?: string;
  notes?: string;
  addedAt: string;
}

export interface ConcentrationState {
  sourceId?: string;
  name: string;
  startedAt: string;
  notes?: string;
}

export type CharacterPlayEventType =
  | "hp-damage"
  | "hp-healing"
  | "hp-set"
  | "temp-hp-set"
  | "temp-hp-replace"
  | "death-save"
  | "resource-spend"
  | "resource-restore"
  | "spell-slot-spend"
  | "spell-slot-restore"
  | "spell-cast"
  | "condition-toggle"
  | "concentration-start"
  | "concentration-end"
  | "rest-short"
  | "rest-long";

export interface CharacterPlayEvent {
  id: string;
  timestamp: string;
  type: CharacterPlayEventType;
  shortLabel: string;
  payload: Record<string, unknown>;
}

export interface CharacterPlayState {
  schemaVersion: typeof PLAY_STATE_SCHEMA_VERSION;
  characterId: string;
  currentHp: number;
  tempHp: number;
  deathSaves: CharacterDeathSaveState;
  spentResources: Record<string, number>;
  spellSlots: Record<string, number>;
  activeConditions: ActiveConditionState[];
  concentration: ConcentrationState | null;
  playEvents: CharacterPlayEvent[];
  lastRestAt?: string;
  updatedAt: string;
}

function clampToNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export function createDefaultCharacterPlayState(
  characterId: string,
  options: {
    maxHp?: number;
    now?: string;
  } = {},
): CharacterPlayState {
  const now = options.now ?? new Date().toISOString();
  const maxHp = Math.max(1, clampToNonNegativeInteger(options.maxHp ?? 1));
  return {
    schemaVersion: PLAY_STATE_SCHEMA_VERSION,
    characterId,
    currentHp: maxHp,
    tempHp: 0,
    deathSaves: {
      successes: 0,
      failures: 0,
      stable: false,
      dead: false,
    },
    spentResources: {},
    spellSlots: {},
    activeConditions: [],
    concentration: null,
    playEvents: [],
    updatedAt: now,
  };
}
