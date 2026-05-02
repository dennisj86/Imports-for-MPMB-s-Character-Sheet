import type { RulesMode } from "./content";

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

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  equipped?: boolean;
}

export interface InventoryState {
  items: InventoryItem[];
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
}
