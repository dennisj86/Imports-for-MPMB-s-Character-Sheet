import type { CharacterDraft } from "./character";
import type { RulesMode } from "./content";
import type { DerivedDataStatus } from "./derivedStats";

export type ProgressionChoiceKind = "subclass-selection" | "asi-or-feat" | "spell-selection" | "feature-choice";
export type SpellcastingProgressionMode = "none" | "known" | "prepared" | "mixed" | "pact" | "table-pending";

export interface ProgressionFeatureEntry {
  id: string;
  key: string;
  name: string;
  minLevel: number;
  description?: string;
  source: "class" | "subclass";
}

export interface SubclassSelectionRequirement {
  required: boolean;
  unlockLevel: number;
  selectedSubclassId?: string;
  selectedSubclassName?: string;
  satisfied: boolean;
  notes: string[];
}

export interface AsiOrFeatChoice {
  id: string;
  level: number;
  source: "class";
  options: Array<"ability-score-improvement" | "feat">;
  selectedOption?: "ability-score-improvement" | "feat";
  satisfied: boolean;
  notes: string[];
}

export interface PendingLevelChoice {
  id: string;
  kind: ProgressionChoiceKind;
  level: number;
  description: string;
  required: boolean;
  satisfied: boolean;
  options?: string[];
  selectedOptionId?: string;
  source: "class" | "subclass" | "spellcasting" | "background" | "species";
  notes: string[];
}

export interface SpellSlotProgression {
  1?: number;
  2?: number;
  3?: number;
  4?: number;
  5?: number;
  6?: number;
  7?: number;
  8?: number;
  9?: number;
}

export interface SpellProgressionState {
  available: boolean;
  mode: SpellcastingProgressionMode;
  spellcastingAbility?: "str" | "dex" | "con" | "int" | "wis" | "cha";
  spellSlots: SpellSlotProgression;
  cantripsKnown?: number;
  spellsKnownLimit?: number;
  preparedSpellsLimit?: number;
  pendingChoices: PendingLevelChoice[];
  notes: string[];
  dataStatus: DerivedDataStatus;
}

export interface LevelProgressionResult {
  provider: CharacterDraft["provider"];
  rulesMode: RulesMode;
  classId?: string;
  className?: string;
  subclassId?: string;
  subclassName?: string;
  currentLevel: number;
  targetLevel: number;
  unlockedClassFeatures: ProgressionFeatureEntry[];
  unlockedSubclassFeatures: ProgressionFeatureEntry[];
  unlockedFeatures: ProgressionFeatureEntry[];
  subclassRequirement?: SubclassSelectionRequirement;
  asiOrFeatChoices: AsiOrFeatChoice[];
  spellProgression: SpellProgressionState;
  pendingChoices: PendingLevelChoice[];
  notes: string[];
  dataStatus: DerivedDataStatus;
}
