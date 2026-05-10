import type { CharacterDraft } from "./character";
import type { RulesMode } from "./content";
import type { AbilityKey, DerivedDataStatus, SkillKey } from "./derivedStats";
import type { RollType } from "./rolls";

export type RuleSourceType =
  | "class-feature"
  | "subclass-feature"
  | "species-feature"
  | "background-feature"
  | "feat"
  | "item"
  | "spell"
  | "condition"
  | "custom";

export type RuleChoiceType =
  | "feature-option"
  | "feat"
  | "ability-score"
  | "weapon"
  | "weapon-mastery"
  | "fighting-style"
  | "spell"
  | "cantrip"
  | "skill"
  | "tool"
  | "language"
  | "proficiency"
  | "resistance"
  | "resource"
  | "other";

export type RuleChoiceStatus = "pending" | "complete" | "unsupported" | "needs-builder";

export interface RuleChoiceOption {
  id: string;
  label: string;
  value?: string;
  diagnostics?: string[];
}

export interface RuleChoice {
  id: string;
  sourceDescriptorId: string;
  sourceType: RuleSourceType;
  choiceType: RuleChoiceType;
  requiredCount: number;
  minCount: number;
  maxCount: number;
  options: RuleChoiceOption[];
  selectedOptionIds: string[];
  status: RuleChoiceStatus;
  appliesAtLevel?: number;
  diagnostics: string[];
}

export type RuleModifierTarget =
  | "armor-class"
  | "initiative"
  | "speed"
  | "hit-point-max"
  | "ability-score"
  | "ability-check"
  | "skill-check"
  | "saving-throw"
  | "weapon-attack"
  | "weapon-damage"
  | "spell-attack"
  | "spell-save-dc"
  | "resource-max"
  | "passive-score"
  | "proficiency"
  | "other";

export type RuleModifierValueType = "flat" | "dice" | "set" | "advantage" | "disadvantage" | "note";

export type RuleModifierCondition =
  | "always"
  | "wearing-armor"
  | "shield-equipped"
  | "weapon-equipped"
  | "weapon-is-melee"
  | "weapon-is-ranged"
  | "weapon-is-finesse"
  | "weapon-is-two-handed"
  | "weapon-is-one-handed"
  | "weapon-is-melee-one-handed-no-offhand"
  | "no-offhand-weapon"
  | "spellcasting"
  | "concentration-active"
  | "manual";

export interface RuleModifier {
  id: string;
  sourceDescriptorId: string;
  sourceName: string;
  sourceType: RuleSourceType;
  target: RuleModifierTarget;
  valueType: RuleModifierValueType;
  value: number | string | boolean;
  damageType?: string;
  ability?: AbilityKey;
  skill?: SkillKey;
  condition: RuleModifierCondition;
  stackingKey?: string;
  priority?: number;
  diagnostics: string[];
}

export interface RuleSourceDescriptor {
  id: string;
  sourceType: RuleSourceType;
  sourceId?: string;
  sourceName: string;
  rulesMode: RulesMode;
  provider: CharacterDraft["provider"];
  level?: number;
  tags: string[];
  choices: RuleChoice[];
  modifiers: RuleModifier[];
  effects: ActiveEffectDefinition[];
  diagnostics: string[];
  sourceText?: string;
  mappingRefs?: string[];
}

export type ActiveEffectDurationType = "concentration" | "until-rest" | "timed" | "manual" | "one-roll";
export type ActiveEffectTarget = "self" | "ally" | "selected" | "global" | "unknown";
export type ActiveEffectStatus = "active" | "expired" | "dismissed";

export interface ActiveEffectDefinition {
  id: string;
  sourceDescriptorId: string;
  sourceName: string;
  sourceType: RuleSourceType;
  durationType: ActiveEffectDurationType;
  targets: ActiveEffectTarget[];
  applicableRollTypes: RollType[];
  modifiers: RuleModifier[];
  requiresPrompt: boolean;
  remainingUses?: number;
  concentrationLinked: boolean;
  diagnostics: string[];
}

export interface ActiveEffectState extends ActiveEffectDefinition {
  startedAt: string;
  status: ActiveEffectStatus;
}

export interface RuleModifierApplication {
  modifier: RuleModifier;
  applied: boolean;
  reason?: string;
}

export interface CharacterRuleEngineState {
  sources: RuleSourceDescriptor[];
  choices: RuleChoice[];
  modifiers: RuleModifier[];
  effects: ActiveEffectDefinition[];
  diagnostics: string[];
  dataStatus: DerivedDataStatus;
}
