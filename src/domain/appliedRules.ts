import type { AbilityScores, CharacterDraft } from "./character";
import type { ConversionMode, RulesMode } from "./content";

export type AbilityKey = keyof AbilityScores;
export type AppliedDataStatus = "complete" | "partial" | "pending" | "manual";

export interface AppliedEntityRef {
  id?: string;
  key?: string;
  name?: string;
  contentVersion?: "2014" | "2024" | "legacy" | "unknown";
  conversionMode?: ConversionMode;
  notes: string[];
}

export interface AbilityScoreChoiceRequirement {
  source: "species" | "background" | "feat" | "class";
  amount: number;
  count: number;
  allowedAbilities: AbilityKey[];
  reason: string;
}

export interface IgnoredAbilityScoreAdjustment {
  source: "species" | "background" | "feat" | "class";
  reason: string;
  details?: string;
}

export interface AppliedAbilityScoreAdjustments {
  fixed: Partial<Record<AbilityKey, number>>;
  pendingChoices: AbilityScoreChoiceRequirement[];
  ignored: IgnoredAbilityScoreAdjustment[];
}

export interface AppliedSpeciesResult {
  entity?: AppliedEntityRef;
  traits: string[];
  abilityAdjustments: AppliedAbilityScoreAdjustments;
  dataStatus: AppliedDataStatus;
}

export interface OriginFeatRequirement {
  kind: "origin-feat";
  required: boolean;
  satisfied: boolean;
  reason: string;
}

export interface AppliedBackgroundResult {
  entity?: AppliedEntityRef;
  abilityScoreRule: "native" | "background-2024";
  skillProficiencies: string[];
  toolProficiencies: string[];
  languagesGranted: string[];
  grantedFeatIds: string[];
  grantedFeatNames: string[];
  unresolvedGrantedFeatNames: string[];
  originFeatRequirement?: OriginFeatRequirement;
  notes: string[];
  dataStatus: AppliedDataStatus;
}

export interface AppliedClassResult {
  class?: AppliedEntityRef;
  subclass?: AppliedEntityRef;
  level: number;
  proficiencyBonus: number;
  savingThrowProficiencies: AbilityKey[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  skillChoices: {
    count: number;
    options: string[];
    source: "class";
  };
  notes: string[];
  dataStatus: AppliedDataStatus;
}

export interface AppliedProficienciesResult {
  savingThrows: AbilityKey[];
  skills: string[];
  tools: string[];
  languages: string[];
  pendingSkillChoices: Array<{
    source: "class";
    count: number;
    options: string[];
  }>;
}

export interface AppliedSpellcastingResult {
  available: boolean;
  basis: "none" | "declarative";
  source: "none" | "class" | "subclass" | "class+subclass";
  notes: string[];
  dataStatus: AppliedDataStatus;
}

export interface AppliedChoiceRequirement {
  id: string;
  kind: "origin-feat" | "ability-score-choice" | "skill-choice";
  description: string;
  source: string;
  status: "required" | "pending" | "satisfied";
}

export interface AppliedFeatResult {
  selectedFeatIds: string[];
  selectedFeatNames: string[];
  grantedFeatIds: string[];
  grantedFeatNames: string[];
  unresolvedGrantedFeatNames: string[];
}

export interface AppliedCharacterRules {
  draftRef: Pick<CharacterDraft, "id" | "name" | "provider" | "rulesMode">;
  provider: "open5e" | "mpmb";
  rulesMode: RulesMode;
  level: number;
  abilityScoreAdjustments: AppliedAbilityScoreAdjustments;
  classResult: AppliedClassResult;
  speciesResult: AppliedSpeciesResult;
  backgroundResult: AppliedBackgroundResult;
  featResult: AppliedFeatResult;
  proficiencies: AppliedProficienciesResult;
  spellcasting: AppliedSpellcastingResult;
  pendingChoices: AppliedChoiceRequirement[];
  conversionSummary: {
    speciesConverted: boolean;
    backgroundConverted: boolean;
    legacySubclassIn2024: boolean;
    notes: string[];
  };
  dataStatus: AppliedDataStatus;
  notes: string[];
}
