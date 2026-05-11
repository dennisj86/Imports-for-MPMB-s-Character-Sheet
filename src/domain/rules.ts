import type { CharacterDraft } from "./character";
import type { RulesMode } from "./content";
import type { AbilityKey, DerivedDataStatus, SkillKey } from "./derivedStats";
import type { CharacterActionActivationType, RechargeRule } from "./actionResources";
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
  optionType?: RuleChoiceType;
  sourceId?: string;
  sourceType?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
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
  parentChoiceId?: string;
  dependsOn?: RuleChoiceDependency;
  selectedPath?: string[];
  optionScope?: string;
  generatedByOptionId?: string;
  choiceStage?: "parent" | "child" | "subchoice";
  isAvailable?: boolean;
  blockedReason?: string;
}

export interface RuleChoiceDependency {
  parentChoiceId: string;
  requiredSelectedOptionId: string;
  childChoiceId: string;
  dependencyType:
    | "selected-option"
    | "selected-source"
    | "selected-spell-list"
    | "selected-ability"
    | "selected-feat"
    | "selected-feature-option";
}

export type CanonicalChoiceStatus = "complete" | "pending" | "unsupported" | "needs-builder" | "blocked" | "informational";

export type CanonicalChoiceOrigin =
  | "structured-progression"
  | "rule-mapping"
  | "level-up-state"
  | "legacy-detection"
  | "diagnostic";

export interface HiddenRuleChoiceDuplicate {
  id: string;
  canonicalKey: string;
  label: string;
  choiceType: RuleChoiceType;
  sourceDescriptorId: string;
  sourceType: RuleSourceType;
  sourceName: string;
  origin: CanonicalChoiceOrigin;
  status: CanonicalChoiceStatus;
  hiddenBy: string;
  reason: string;
  diagnostics: string[];
}

export interface CanonicalRuleChoice {
  id: string;
  canonicalKey: string;
  label: string;
  sourceType: RuleSourceType;
  sourceId?: string;
  sourceName: string;
  sourceLevel?: number;
  choiceType: RuleChoiceType;
  requiredCount: number;
  selectedCount: number;
  options: RuleChoiceOption[];
  selectedOptionIds: string[];
  status: CanonicalChoiceStatus;
  priority: number;
  origin: CanonicalChoiceOrigin;
  mergedFrom: string[];
  diagnostics: string[];
  playerVisible: boolean;
  builderEditable: boolean;
  choice: RuleChoice;
  parentChoiceId?: string;
  dependsOn?: RuleChoiceDependency;
  selectedPath?: string[];
  optionScope?: string;
  generatedByOptionId?: string;
  choiceStage?: "parent" | "child" | "subchoice";
}

export interface RuleChoiceSurfaceState {
  rawChoiceCount: number;
  choices: CanonicalRuleChoice[];
  hiddenDuplicates: HiddenRuleChoiceDuplicate[];
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
  | "wearing-medium-or-heavy-armor"
  | "not-wearing-armor"
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
  structuredData?: unknown;
}

export type ActiveEffectDurationType = "concentration" | "until-used" | "until-rest" | "timed" | "manual" | "one-roll";
export type ActiveEffectTarget = "self" | "ally" | "selected" | "global" | "unknown";
export type ActiveEffectStatus = "active" | "expired" | "dismissed";
export type ActiveEffectType = "roll-bonus" | "ac-bonus" | "advantage" | "disadvantage" | "note";
export type ActiveEffectConfigField = "die-size";
export type FutureActiveEffectType = ActiveEffectType | "reroll" | "mixed";

export interface ActiveEffectModifierSummary {
  dice?: string;
  flat?: number;
}

export interface ActiveEffectDefinition {
  id: string;
  sourceDescriptorId: string;
  label: string;
  sourceName: string;
  sourceType: RuleSourceType;
  effectType: ActiveEffectType;
  durationType: ActiveEffectDurationType;
  targets: ActiveEffectTarget[];
  applicableRollTypes: RollType[];
  modifiers: RuleModifier[];
  requiresPrompt: boolean;
  remainingUses?: number;
  modifierSummary?: ActiveEffectModifierSummary;
  configurableFields?: ActiveEffectConfigField[];
  concentrationLinked: boolean;
  diagnostics: string[];
}

export interface ActiveEffectState extends ActiveEffectDefinition {
  startedAt: string;
  status: ActiveEffectStatus;
  sourceCasterName?: string;
  note?: string;
}

export interface ActiveEffectCatalogEntry {
  id: string;
  label: string;
  aliases?: string[];
  sourceType: RuleSourceType;
  sourceName: string;
  effectType: ActiveEffectType;
  applicableRollTypes: RollType[];
  modifier: ActiveEffectModifierSummary;
  durationType: ActiveEffectDurationType;
  targetScope: "self" | "selected" | "global";
  requiresPrompt: boolean;
  configurableFields?: Array<ActiveEffectConfigField | "source-caster-name" | "notes">;
  effect: ActiveEffectDefinition;
}

export interface KnownUnmappedActiveEffectEntry {
  id: string;
  label: string;
  aliases?: string[];
  sourceType: RuleSourceType;
  reasonUnsupported: string;
  expectedFutureEffectType: FutureActiveEffectType;
}

export interface RuleModifierApplication {
  modifier: RuleModifier;
  applied: boolean;
  reason?: string;
}

export type OptionScopedApplyField =
  | "scores"
  | "scoresMaximum"
  | "skills"
  | "toolProfs"
  | "languageProfs"
  | "weaponProfs"
  | "armorProfs"
  | "addMod"
  | "extraAC"
  | "action"
  | "usages"
  | "recovery";

export type OptionScopedApplyStatus = "applied" | "unsupported" | "choice-required";

export interface OptionScopedApplyDiagnostic {
  id: string;
  sourceDescriptorId: string;
  sourceName: string;
  sourceType: RuleSourceType;
  optionId?: string;
  optionLabel?: string;
  field: OptionScopedApplyField;
  status: OptionScopedApplyStatus;
  applyPath?: string;
  message: string;
}

export interface OptionScopedAbilityScoreBonus {
  id: string;
  sourceDescriptorId: string;
  sourceName: string;
  sourceType: RuleSourceType;
  optionId?: string;
  ability: AbilityKey;
  amount: number;
  diagnostics: string[];
}

export interface OptionScopedAbilityScoreMaximum {
  id: string;
  sourceDescriptorId: string;
  sourceName: string;
  sourceType: RuleSourceType;
  optionId?: string;
  ability: AbilityKey;
  maximum: number;
  diagnostics: string[];
}

export interface OptionScopedProficiencyGrant {
  id: string;
  sourceDescriptorId: string;
  sourceName: string;
  sourceType: RuleSourceType;
  optionId?: string;
  kind: "skill" | "tool" | "language" | "weapon" | "armor";
  value: string;
  expertise?: boolean;
  diagnostics: string[];
}

export interface OptionScopedActionDelta {
  id: string;
  sourceDescriptorId: string;
  sourceName: string;
  sourceType: RuleSourceType;
  optionId?: string;
  label: string;
  activationType: CharacterActionActivationType;
  description?: string;
  resourceId?: string;
  diagnostics: string[];
  dataStatus: DerivedDataStatus;
}

export interface OptionScopedResourceDelta {
  id: string;
  sourceDescriptorId: string;
  sourceName: string;
  sourceType: RuleSourceType;
  optionId?: string;
  label: string;
  usesMax?: number;
  formula?: string;
  recharge: RechargeRule;
  diagnostics: string[];
  dataStatus: DerivedDataStatus;
}

export interface OptionScopedAppliedEntry {
  id: string;
  sourceDescriptorId: string;
  sourceName: string;
  sourceType: RuleSourceType;
  optionId?: string;
  optionLabel?: string;
  summaries: string[];
  diagnostics: string[];
}

export interface OptionScopedApplyState {
  choices: RuleChoice[];
  diagnostics: OptionScopedApplyDiagnostic[];
  abilityScoreBonuses: OptionScopedAbilityScoreBonus[];
  abilityScoreMaximums: OptionScopedAbilityScoreMaximum[];
  proficiencyGrants: OptionScopedProficiencyGrant[];
  modifiers: RuleModifier[];
  actions: OptionScopedActionDelta[];
  resources: OptionScopedResourceDelta[];
  appliedEntries: OptionScopedAppliedEntry[];
}

export interface CharacterRuleEngineState {
  sources: RuleSourceDescriptor[];
  choices: RuleChoice[];
  choiceSurface: RuleChoiceSurfaceState;
  modifiers: RuleModifier[];
  effects: ActiveEffectDefinition[];
  optionScoped: OptionScopedApplyState;
  diagnostics: string[];
  dataStatus: DerivedDataStatus;
}
