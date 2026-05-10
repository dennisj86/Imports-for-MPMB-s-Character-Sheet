import type { CharacterActionActivationType } from "./actionResources";
import type { AbilityKey, SkillKey } from "./derivedStats";
import type { ActiveEffectState, RuleModifier } from "./rules";

export type RollType =
  | "ability-check"
  | "skill-check"
  | "saving-throw"
  | "attack-roll"
  | "spell-attack"
  | "damage-roll"
  | "death-save"
  | "custom";

export type RollMode = "normal" | "advantage" | "disadvantage";

export type RollSourceType = "weapon" | "spell" | "feature" | "item" | "custom";

export type RollOutcomeLabel = "natural-20" | "natural-1" | "critical-possible" | "normal";

export interface RollRequest {
  id: string;
  type: RollType;
  label: string;
  ability?: AbilityKey;
  skill?: SkillKey;
  sourceType?: RollSourceType;
  sourceId?: string;
  modifier: number;
  baseModifier?: number;
  permanentModifiers?: RuleModifier[];
  temporaryModifiers?: RuleModifier[];
  selectedActiveEffectIds?: string[];
  bonusDiceExpressions?: string[];
  proficiencyApplied?: boolean;
  diceExpression: string;
  rollMode: RollMode;
  metadata?: Record<string, unknown>;
}

export interface RollDiceBreakdown {
  rawRolls: number[];
  keptRoll?: number;
  droppedRolls?: number[];
  terms?: Array<{
    kind: "dice" | "constant";
    sign: 1 | -1;
    count?: number;
    sides?: number;
    value?: number;
    rolls: number[];
    subtotal: number;
  }>;
}

export interface RollResult {
  id: string;
  requestId: string;
  timestamp: string;
  type: RollType;
  label: string;
  diceExpression: string;
  rollMode: RollMode;
  dice: RollDiceBreakdown;
  modifier: number;
  baseModifier?: number;
  permanentModifierBreakdown?: Array<{
    id: string;
    sourceName: string;
    value: number | string | boolean;
    valueType: string;
    applied: boolean;
  }>;
  temporaryModifierBreakdown?: Array<{
    id: string;
    sourceName: string;
    value: number | string | boolean;
    valueType: string;
    applied: boolean;
  }>;
  bonusDice?: Array<{
    expression: string;
    rolls: number[];
    total: number;
    sourceName?: string;
  }>;
  total: number;
  naturalRoll?: number;
  outcomeLabel?: RollOutcomeLabel;
  sourceSummary?: string;
  metadata?: Record<string, unknown>;
}

export interface RollActionDescriptor {
  id: string;
  label: string;
  activationType?: CharacterActionActivationType;
  sourceType?: RollSourceType;
  sourceId?: string;
  sourceSummary?: string;
  rollRequest?: RollRequest;
  damageRequest?: RollRequest;
  spellSaveDc?: number;
  spellSaveAbility?: AbilityKey;
  resourceIds: string[];
  notes: string[];
  dataStatus?: string;
}

export interface CharacterRollView {
  abilityChecks: RollRequest[];
  savingThrows: RollRequest[];
  skillChecks: RollRequest[];
  actionRolls: RollActionDescriptor[];
  spellRolls: RollActionDescriptor[];
  activeEffects?: ActiveEffectState[];
}
