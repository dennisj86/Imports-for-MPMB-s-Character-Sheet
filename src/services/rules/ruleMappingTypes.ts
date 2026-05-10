import type { CharacterDraft } from "../../domain/character";
import type { RulesMode } from "../../domain/content";
import type { RuleChoiceType, RuleModifier, RuleModifierCondition, RuleModifierTarget, RuleModifierValueType, RuleSourceType } from "../../domain/rules";
import type { RollType } from "../../domain/rolls";

export type RuleMappingConfidence = "exact" | "structured" | "declarative" | "fallback";

export type RuleMappingOptionSource =
  | "skills"
  | "tools"
  | "languages"
  | "weapon-catalog"
  | "spell-cantrips"
  | "spells";

export interface RuleMappingAppliesTo {
  sourceType?: RuleSourceType | RuleSourceType[];
  sourceId?: string;
  normalizedName?: string;
  tags?: string[];
  rulesMode?: RulesMode;
  provider?: CharacterDraft["provider"];
}

export interface RuleModifierTemplate {
  id: string;
  target: RuleModifierTarget;
  valueType: RuleModifierValueType;
  value: number | string | boolean;
  condition?: RuleModifierCondition;
  damageType?: string;
  ability?: RuleModifier["ability"];
  skill?: RuleModifier["skill"];
  stackingKey?: string;
  priority?: number;
  diagnostics?: string[];
}

export interface RuleChoiceSelectionModifierTemplate {
  id: string;
  target: RuleModifierTarget;
  valueType?: RuleModifierValueType;
  value?: number | string | boolean;
  condition?: RuleModifierCondition;
  skillFromOption?: boolean;
  abilityFromOption?: boolean;
  diagnostics?: string[];
}

export interface RuleActiveEffectTemplate {
  id: string;
  durationType: "concentration" | "until-rest" | "timed" | "manual" | "one-roll";
  targets?: Array<"self" | "ally" | "selected" | "global" | "unknown">;
  applicableRollTypes: RollType[];
  modifiers: RuleModifierTemplate[];
  requiresPrompt?: boolean;
  concentrationLinked?: boolean;
  remainingUses?: number;
  diagnostics?: string[];
}

export interface RuleChoiceOptionTemplate {
  id: string;
  label: string;
  value?: string;
  diagnostics?: string[];
  modifiers?: RuleModifierTemplate[];
  activeEffectDefinitions?: RuleActiveEffectTemplate[];
  choices?: RuleChoiceTemplate[];
}

export interface RuleChoiceTemplate {
  id: string;
  choiceType: RuleChoiceType;
  requiredCount: number;
  minCount?: number;
  maxCount?: number;
  options?: RuleChoiceOptionTemplate[];
  optionSource?: RuleMappingOptionSource;
  applySelectionAs?: RuleChoiceSelectionModifierTemplate;
  unsupportedWhenEmpty?: boolean;
  diagnostics?: string[];
}

export interface RuleMapping {
  id: string;
  appliesTo: RuleMappingAppliesTo;
  emits: {
    choices?: RuleChoiceTemplate[];
    modifiers?: RuleModifierTemplate[];
    activeEffectDefinitions?: RuleActiveEffectTemplate[];
    diagnostics?: string[];
  };
  confidence: RuleMappingConfidence;
  notes?: string[];
}
