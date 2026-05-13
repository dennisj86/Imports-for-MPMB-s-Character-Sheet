import type { ActiveEffectState } from "./rules";

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
  category?: string;
  clearableOnRest?: "short-rest" | "long-rest";
  notes?: string;
  addedAt: string;
}

export interface ConcentrationState {
  sourceId?: string;
  name: string;
  startedAt: string;
  notes?: string;
}

export type RollBonusesAutomationSetting = "manual" | "suggest" | "autoApply";
export type ActiveEffectsAutomationSetting = "manual" | "suggest" | "autoApply";
export type ResourceSpendingAutomationSetting = "ask" | "autoSpendWhenSafe" | "neverAutoSpend";
export type OnHitRidersAutomationSetting = "ask" | "autoSuggest" | "manualOnly";
export type ConcentrationAutomationSetting = "manual" | "suggestCheck" | "autoPromptOnDamage";
export type DeathSavesAutomationSetting = "autoApplyResult" | "askBeforeApply";

export interface CharacterAutomationSettings {
  rollBonuses: RollBonusesAutomationSetting;
  activeEffects: ActiveEffectsAutomationSetting;
  resourceSpending: ResourceSpendingAutomationSetting;
  onHitRiders: OnHitRidersAutomationSetting;
  concentration: ConcentrationAutomationSetting;
  deathSaves: DeathSavesAutomationSetting;
}

export const DEFAULT_CHARACTER_AUTOMATION_SETTINGS: CharacterAutomationSettings = {
  rollBonuses: "suggest",
  activeEffects: "suggest",
  resourceSpending: "ask",
  onHitRiders: "autoSuggest",
  concentration: "suggestCheck",
  deathSaves: "askBeforeApply",
};

export function normalizeCharacterAutomationSettings(
  value: Partial<CharacterAutomationSettings> | undefined,
): CharacterAutomationSettings {
  const next = value ?? {};
  return {
    rollBonuses: next.rollBonuses === "manual" || next.rollBonuses === "suggest" || next.rollBonuses === "autoApply"
      ? next.rollBonuses
      : DEFAULT_CHARACTER_AUTOMATION_SETTINGS.rollBonuses,
    activeEffects: next.activeEffects === "manual" || next.activeEffects === "suggest" || next.activeEffects === "autoApply"
      ? next.activeEffects
      : DEFAULT_CHARACTER_AUTOMATION_SETTINGS.activeEffects,
    resourceSpending:
      next.resourceSpending === "ask" || next.resourceSpending === "autoSpendWhenSafe" || next.resourceSpending === "neverAutoSpend"
        ? next.resourceSpending
        : DEFAULT_CHARACTER_AUTOMATION_SETTINGS.resourceSpending,
    onHitRiders: next.onHitRiders === "ask" || next.onHitRiders === "autoSuggest" || next.onHitRiders === "manualOnly"
      ? next.onHitRiders
      : DEFAULT_CHARACTER_AUTOMATION_SETTINGS.onHitRiders,
    concentration: next.concentration === "manual" || next.concentration === "suggestCheck" || next.concentration === "autoPromptOnDamage"
      ? next.concentration
      : DEFAULT_CHARACTER_AUTOMATION_SETTINGS.concentration,
    deathSaves: next.deathSaves === "autoApplyResult" || next.deathSaves === "askBeforeApply"
      ? next.deathSaves
      : DEFAULT_CHARACTER_AUTOMATION_SETTINGS.deathSaves,
  };
}

export type HitDieSize = 6 | 8 | 10 | 12;

export interface HitDicePool {
  id: string;
  die: HitDieSize;
  sourceClassId?: string;
  sourceClassName?: string;
  max: number;
  remaining: number;
  spent: number;
  label: string;
}

export interface CharacterHitDiceState {
  pools: HitDicePool[];
  updatedAt?: string;
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
  | "spell-cast-blocked"
  | "roll"
  | "condition-toggle"
  | "concentration-start"
  | "concentration-replace"
  | "concentration-end"
  | "active-effect-start"
  | "active-effect-dismiss"
  | "resource-spend-blocked"
  | "hit-die-spent"
  | "hit-die-spend-blocked"
  | "hit-dice-recovered"
  | "rest-short"
  | "rest-long"
  | "attack-resolution"
  | "automation-settings-update"
  | "concentration-check-prompt";

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
  hitDice: CharacterHitDiceState;
  activeConditions: ActiveConditionState[];
  activeEffects: ActiveEffectState[];
  concentration: ConcentrationState | null;
  automationSettings: CharacterAutomationSettings;
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
    hitDice: {
      pools: [],
      updatedAt: now,
    },
    activeConditions: [],
    activeEffects: [],
    concentration: null,
    automationSettings: normalizeCharacterAutomationSettings(undefined),
    playEvents: [],
    updatedAt: now,
  };
}
