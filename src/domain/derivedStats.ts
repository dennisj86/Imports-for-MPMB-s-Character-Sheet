import type { AbilityScores } from "./character";

export type AbilityKey = keyof AbilityScores;
export type DerivedDataStatus = "complete" | "partial" | "pending" | "manual";

export interface DerivedAbilityScore {
  ability: AbilityKey;
  baseScore: number;
  appliedBonus: number;
  finalScore: number;
  modifier: number;
  notes: string[];
}

export interface DerivedSaveResult {
  ability: AbilityKey;
  proficient: boolean;
  abilityModifier: number;
  proficiencyBonus: number;
  total: number;
}

export type SkillKey =
  | "acrobatics"
  | "animal-handling"
  | "arcana"
  | "athletics"
  | "deception"
  | "history"
  | "insight"
  | "intimidation"
  | "investigation"
  | "medicine"
  | "nature"
  | "perception"
  | "performance"
  | "persuasion"
  | "religion"
  | "sleight-of-hand"
  | "stealth"
  | "survival";

export interface DerivedSkillResult {
  key: SkillKey;
  label: string;
  ability: AbilityKey;
  proficient: boolean;
  expertise: boolean;
  abilityModifier: number;
  proficiencyBonus: number;
  total: number;
}

export interface DerivedMovementResult {
  walking?: number;
  swimming?: number;
  flying?: number;
  climbing?: number;
  burrowing?: number;
  notes: string[];
  dataStatus: DerivedDataStatus;
}

export interface DerivedArmorClassResult {
  value: number;
  calculation:
    | "unarmored"
    | "armor"
    | "armor+shield"
    | "unarmored+shield"
    | "manual";
  armorName?: string;
  shieldName?: string;
  dexApplied: number;
  notes: string[];
  dataStatus: DerivedDataStatus;
}

export interface DerivedHitPointsResult {
  max: number;
  formula: string;
  mode: "fixed-average" | "level1-only" | "manual";
  notes: string[];
  dataStatus: DerivedDataStatus;
}

export interface DerivedSpellcastingStatsResult {
  available: boolean;
  ability?: AbilityKey;
  abilityModifier?: number;
  proficiencyBonus?: number;
  spellSaveDC?: number;
  spellAttackModifier?: number;
  preparationBasis: {
    mode: "none" | "prepared" | "known" | "mixed" | "table-pending";
    notes: string[];
  };
  slotBasis: {
    mode: "none" | "table-pending";
    notes: string[];
  };
  notes: string[];
  dataStatus: DerivedDataStatus;
}

export interface DerivedPendingRule {
  id: string;
  kind: "ability-choice" | "skill-choice" | "origin-feat" | "spell-slots" | "manual";
  description: string;
  severity: "info" | "warning";
}

export interface DerivedCharacterStats {
  abilityScores: Record<AbilityKey, DerivedAbilityScore>;
  proficiencyBonus: number;
  savingThrows: Record<AbilityKey, DerivedSaveResult>;
  skills: Record<SkillKey, DerivedSkillResult>;
  passivePerception: number;
  passiveInvestigation: number;
  passiveInsight: number;
  initiative: number;
  speed: DerivedMovementResult;
  armorClass: DerivedArmorClassResult;
  hitPoints: DerivedHitPointsResult;
  spellcasting: DerivedSpellcastingStatsResult;
  notes: string[];
  pending: DerivedPendingRule[];
  dataStatus: DerivedDataStatus;
}
