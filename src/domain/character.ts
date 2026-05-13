import type { RulesMode } from "./content";
import type { CharacterPlayState } from "./playState";

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface ClassSelection {
  classId?: string;
  level: number;
}

export interface SubclassSelection {
  subclassId?: string;
}

export interface SpeciesSelection {
  speciesId?: string;
}

export interface BackgroundSelection {
  backgroundId?: string;
}

export interface SpellSelection {
  selectedSpellIds: string[];
}

export interface FeatureChoice {
  featureId: string;
  optionId: string;
}

export interface RuleChoiceState {
  choiceId: string;
  selectedOptionIds: string[];
  status: "pending" | "complete" | "unsupported" | "needs-builder";
  updatedAt?: string;
}

export type EquipmentSlot = "armor" | "shield" | "mainHand" | "offHand" | "twoHanded" | "ranged" | "focus" | "other";

export type InventoryItemType =
  | "weapon"
  | "armor"
  | "shield"
  | "gear"
  | "tool"
  | "focus"
  | "consumable"
  | "ammunition"
  | "magic-item"
  | "spell-component"
  | "custom";

export interface InventoryItem {
  instanceId?: string;
  id: string;
  itemDefinitionId?: string;
  name: string;
  quantity: number;
  equipped?: boolean;
  equipmentSlot?: EquipmentSlot;
  category?: string;
  type?: string;
  itemType?: InventoryItemType;
  notes?: string;
}

export interface CurrencyState {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface CurrencyTransaction {
  id: string;
  timestamp: string;
  delta: CurrencyState;
  note?: string;
  mode: "add" | "subtract" | "set";
}

export interface InventoryState {
  items: InventoryItem[];
  currency?: CurrencyState;
  currencyTransactions?: CurrencyTransaction[];
}

export interface DerivedSummary {
  levelTotal: number;
  abilityModifiers: AbilityScores;
  passivePerception: number;
  passiveInvestigation: number;
  passiveInsight: number;
  spellcasting: {
    available: boolean;
    notes: string;
  };
  automationStatus: {
    ac: "manual";
    hp: "manual";
    saves: "manual";
    skills: "manual";
  };
}

export type HpGainMethod = "fixed/default" | "manual" | "rolled" | "max";
export type LevelUpChoiceSource = "class" | "subclass" | "feat" | "species" | "background" | "rule";
export type LevelUpChoiceStatus = "pending" | "complete" | "unsupported" | "needs-builder";
export type AbilityScoreIncreaseMode = "+2" | "+1/+1";
export type CharacterLevelSource = "xp" | "manual";

export interface LevelUpUndoSnapshotState {
  capturedAt: string;
  fromLevel: number;
  toLevel: number;
  snapshotJson: string;
}

export interface CharacterXpTrackingState {
  currentXp: number;
  milestoneMode?: boolean;
  levelSource: CharacterLevelSource;
  lastLevelUpSnapshot?: LevelUpUndoSnapshotState;
}

export interface LevelUpHpGainState {
  level: number;
  method: HpGainMethod;
  value?: number;
}

export interface AbilityScoreIncreaseChoiceState {
  choiceId: string;
  level: number;
  source: LevelUpChoiceSource;
  mode: AbilityScoreIncreaseMode;
  increases: Partial<Record<keyof AbilityScores, number>>;
  status: LevelUpChoiceStatus;
  updatedAt?: string;
}

export interface FeatChoiceState {
  choiceId: string;
  contextId: string;
  level: number;
  source: LevelUpChoiceSource;
  featId?: string;
  status: LevelUpChoiceStatus;
  updatedAt?: string;
}

export interface WeaponMasteryChoiceState {
  choiceId: string;
  level: number;
  source: LevelUpChoiceSource;
  weaponId?: string;
  masteryId?: string;
  status: LevelUpChoiceStatus;
  updatedAt?: string;
}

export interface FightingStyleChoiceState {
  choiceId: string;
  level: number;
  source: LevelUpChoiceSource;
  styleId?: string;
  status: LevelUpChoiceStatus;
  updatedAt?: string;
}

export interface LevelUpState {
  hpGainByLevel?: Record<string, LevelUpHpGainState>;
  abilityScoreIncreases?: Record<string, AbilityScoreIncreaseChoiceState>;
  featChoices?: Record<string, FeatChoiceState>;
  weaponMasteryChoices?: Record<string, WeaponMasteryChoiceState>;
  fightingStyleChoices?: Record<string, FightingStyleChoiceState>;
}

export interface CharacterDraft {
  id: string;
  version: 2;
  name: string;
  provider: "open5e" | "mpmb";
  rulesMode: RulesMode;
  createdAt: string;
  updatedAt: string;
  abilityScores: AbilityScores;
  classSelection: ClassSelection;
  subclassSelection: SubclassSelection;
  speciesSelection: SpeciesSelection;
  backgroundSelection: BackgroundSelection;
  featIds: string[];
  spellSelection: SpellSelection;
  featureChoices: FeatureChoice[];
  inventory: InventoryState;
  xp?: CharacterXpTrackingState;
  levelUp?: LevelUpState;
  ruleChoices?: Record<string, RuleChoiceState>;
  playState: CharacterPlayState;
}
