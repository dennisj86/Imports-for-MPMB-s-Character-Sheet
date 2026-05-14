import { toSlug } from "../../lib/slug";
import type { CharacterActionResourceState } from "../../domain/actionResources";
import type { AppliedCharacterRules } from "../../domain/appliedRules";
import type { CharacterDraft } from "../../domain/character";
import type {
  BackgroundDefinition,
  ClassDefinition,
  EquipmentDefinition,
  FeatDefinition,
  MpmContentSnapshot,
  RulesMode,
  SpeciesDefinition,
  SpellDefinition,
  SubclassDefinition,
} from "../../domain/content";
import type { DerivedCharacterStats } from "../../domain/derivedStats";
import type { WizardCompletionState, WizardStepId, WizardStepValidation } from "../../domain/builderWizard";
import type { LevelProgressionResult } from "../../domain/progression";
import type { CharacterRuleEngineState } from "../../domain/rules";
import { resolveCharacterActionResources } from "../data/actionResourceResolver";
import { resolveAppliedCharacterRules } from "../data/appliedRulesResolver";
import {
  getClassSkillChoiceState,
  getRequiredBuilderChoices,
  getSkillChoiceStates,
  isCharacterCreationComplete,
  resolveFeatEligibility,
  resolveSpellEligibility,
  resolveStartingEquipmentChoices,
  validateBuilderStep,
} from "../data/builderWizardResolver";
import { resolveDerivedStats } from "../data/derivedStatsResolver";
import { resolveLevelProgression } from "../data/progressionResolver";
import { applyEffectiveLevelToDraft, normalizeLevelUpTargetContext, type LevelUpTargetContext } from "../levelUp/levelUpTargetContext";
import { resolveCharacterRuleEngine } from "../rules";
import {
  resolveBackgrounds,
  resolveClasses,
  resolveEquipment,
  resolveFeats,
  resolveSpecies,
  resolveSpells,
  resolveSubclasses,
} from "../data/rulesModeResolver";

export type CharacterEngineProvider = "mpmb" | "open5e" | "all";

export interface CharacterEngineQueryContext {
  provider?: CharacterEngineProvider;
  rulesMode?: RulesMode;
  levelUpTargetContext?: LevelUpTargetContext;
}

export interface CharacterEngineResolvedContext {
  provider: CharacterEngineProvider;
  rulesMode: RulesMode;
  levelUpTargetContext?: LevelUpTargetContext;
}

export interface CharacterEngineState {
  draft: CharacterDraft;
  resolutionDraft: CharacterDraft;
  context: CharacterEngineResolvedContext;
  persistedLevel: number;
  effectiveLevel: number;
  levelUpTargetContext?: LevelUpTargetContext;
  classDef?: ClassDefinition;
  subclassDef?: SubclassDefinition;
  availableSubclasses: SubclassDefinition[];
  speciesDef?: SpeciesDefinition;
  backgroundDef?: BackgroundDefinition;
  featCatalog: FeatDefinition[];
  spellCatalog: SpellDefinition[];
  equipmentCatalog: EquipmentDefinition[];
  selectedFeats: FeatDefinition[];
  selectedSpells: SpellDefinition[];
  ruleEngine: CharacterRuleEngineState;
  appliedRules: AppliedCharacterRules;
  derivedStats: DerivedCharacterStats;
  progression: LevelProgressionResult;
  actionResources: CharacterActionResourceState;
}

export interface CharacterWizardState {
  input: {
    draft: CharacterDraft;
    rulesMode: RulesMode;
    classDef?: ClassDefinition;
    subclassDef?: SubclassDefinition;
    backgroundDef?: BackgroundDefinition;
    feats: FeatDefinition[];
    spells: SpellDefinition[];
    appliedRules: AppliedCharacterRules;
    progression: LevelProgressionResult;
    derivedStats: DerivedCharacterStats;
    ruleEngine: CharacterRuleEngineState;
  };
  featContexts: ReturnType<typeof resolveFeatEligibility>;
  spellContexts: ReturnType<typeof resolveSpellEligibility>;
  classSkillChoiceState: ReturnType<typeof getClassSkillChoiceState>;
  skillChoiceStates: ReturnType<typeof getSkillChoiceStates>;
  equipmentChoices: ReturnType<typeof resolveStartingEquipmentChoices>;
  requiredChoices: ReturnType<typeof getRequiredBuilderChoices>;
  validations: Record<WizardStepId, WizardStepValidation>;
  completion: WizardCompletionState;
}

const DEFAULT_RULES_MODE: RulesMode = "2024";

const WIZARD_STEP_IDS: WizardStepId[] = ["class", "species", "background", "abilities", "feats", "skills", "spells", "equipment", "review"];

function normalizeClassToken(value: string | undefined): string {
  return toSlug(value ?? "")
    .replace(/^srd-2024-/, "")
    .replace(/^srd-2014-/, "")
    .replace(/^srd-/, "")
    .replace(/^open5e-2024-/, "")
    .replace(/^open5e-2014-/, "")
    .replace(/^open5e-/, "")
    .replace(/-legacy$/, "");
}

function resolveContext(draft: CharacterDraft, context: CharacterEngineQueryContext = {}): CharacterEngineResolvedContext {
  const levelUpTargetContext = normalizeLevelUpTargetContext(draft, context.levelUpTargetContext);
  return {
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode ?? DEFAULT_RULES_MODE,
    levelUpTargetContext,
  };
}

function resolveSubclassesForClass(
  snapshot: MpmContentSnapshot,
  classDef: ClassDefinition | undefined,
  context: CharacterEngineResolvedContext,
  classLevel: number,
): SubclassDefinition[] {
  if (!classDef) {
    return [];
  }
  const classes = resolveClasses(snapshot.classes, context);
  const classesForResolution = classes.some((entry) => entry.id === classDef.id) ? classes : [...classes, classDef];
  const parentCanonical = normalizeClassToken(classDef.compatibility?.canonicalKey ?? classDef.canonicalClassKey ?? classDef.key);
  const resolved = resolveSubclasses(snapshot.subclasses, classesForResolution, {
    ...context,
    selectedClassId: classDef.id,
    classLevel,
  });
  return resolved.filter((entry) => {
    if (entry.classId === classDef.id) {
      return true;
    }
    const subclassCanonical = normalizeClassToken(entry.canonicalClassKey ?? entry.classKey);
    return subclassCanonical === parentCanonical;
  });
}

export function resolveSubclassesForClassFromSnapshot(
  snapshot: MpmContentSnapshot,
  classId: string,
  context: CharacterEngineResolvedContext,
  classLevel: number,
): SubclassDefinition[] {
  const classes = resolveClasses(snapshot.classes, context);
  const classDef = classes.find((entry) => entry.id === classId) ?? snapshot.classes.find((entry) => entry.id === classId);
  if (!classDef) {
    return [];
  }
  return resolveSubclassesForClass(snapshot, classDef, context, classLevel);
}

export function resolveCharacterEngineState(
  snapshot: MpmContentSnapshot,
  draft: CharacterDraft,
  context: CharacterEngineQueryContext = {},
): CharacterEngineState {
  const resolvedContext = resolveContext(draft, context);
  const resolutionDraft = applyEffectiveLevelToDraft(draft, resolvedContext.levelUpTargetContext);
  const persistedLevel = draft.classSelection.level;
  const effectiveLevel = resolutionDraft.classSelection.level;
  const classes = resolveClasses(snapshot.classes, resolvedContext);
  const classDef = resolutionDraft.classSelection.classId ? classes.find((entry) => entry.id === resolutionDraft.classSelection.classId) : undefined;
  const availableSubclasses = resolveSubclassesForClass(snapshot, classDef, resolvedContext, effectiveLevel);
  const subclassDef =
    classDef && resolutionDraft.subclassSelection.subclassId
      ? availableSubclasses.find((entry) => entry.id === resolutionDraft.subclassSelection.subclassId)
      : undefined;
  const speciesCatalog = resolveSpecies(snapshot.species, resolvedContext);
  const speciesDef = resolutionDraft.speciesSelection.speciesId
    ? speciesCatalog.find((entry) => entry.id === resolutionDraft.speciesSelection.speciesId)
    : undefined;
  const backgroundCatalog = resolveBackgrounds(snapshot.backgrounds, resolvedContext);
  const backgroundDef = resolutionDraft.backgroundSelection.backgroundId
    ? backgroundCatalog.find((entry) => entry.id === resolutionDraft.backgroundSelection.backgroundId)
    : undefined;
  const featCatalog = resolveFeats(snapshot.feats, resolvedContext);
  const spellCatalog = resolveSpells(snapshot.spells, resolvedContext);
  const equipmentCatalog = resolveEquipment(snapshot.equipment, resolvedContext);
  const selectedFeats = resolutionDraft.featIds
    .map((idValue) => featCatalog.find((entry) => entry.id === idValue))
    .filter((entry): entry is FeatDefinition => Boolean(entry));
  const selectedSpells = resolutionDraft.spellSelection.selectedSpellIds
    .map((idValue) => spellCatalog.find((entry) => entry.id === idValue))
    .filter((entry): entry is SpellDefinition => Boolean(entry));
  const levelFeatures = [
    ...(classDef?.features ?? []).filter((feature) => feature.minLevel <= effectiveLevel),
    ...(subclassDef?.features ?? []).filter((feature) => feature.minLevel <= effectiveLevel),
  ].sort((left, right) => left.minLevel - right.minLevel || left.name.localeCompare(right.name));

  const appliedRules = resolveAppliedCharacterRules({
    draft: resolutionDraft,
    classDef,
    subclassDef,
    speciesDef,
    backgroundDef,
    featCatalog,
    selectedSpells,
    levelFeatures,
  });
  const ruleEngine = resolveCharacterRuleEngine({
    draft: resolutionDraft,
    appliedRules,
    classDef,
    subclassDef,
    speciesDef,
    backgroundDef,
    selectedFeats,
    selectedSpells,
    equipmentCatalog,
    spellCatalog,
  });
  const derivedStats = resolveDerivedStats(resolutionDraft, appliedRules, {
    classDef,
    subclassDef,
    speciesDef,
    equipmentCatalog,
    ruleModifiers: ruleEngine.modifiers,
    optionScoped: ruleEngine.optionScoped,
  });
  const progression = resolveLevelProgression(resolutionDraft, appliedRules, derivedStats, {
    classDef,
    subclassDef,
    availableSubclasses,
    selectedSpells,
    targetLevel: effectiveLevel,
  });
  const actionResources = resolveCharacterActionResources(resolutionDraft, appliedRules, derivedStats, progression, {
    classDef,
    subclassDef,
    speciesDef,
    backgroundDef,
    selectedFeats,
    selectedSpells,
    equipmentCatalog,
    ruleEngine,
  });

  return {
    draft,
    resolutionDraft,
    context: resolvedContext,
    persistedLevel,
    effectiveLevel,
    levelUpTargetContext: resolvedContext.levelUpTargetContext,
    classDef,
    subclassDef,
    availableSubclasses,
    speciesDef,
    backgroundDef,
    featCatalog,
    spellCatalog,
    equipmentCatalog,
    selectedFeats,
    selectedSpells,
    ruleEngine,
    appliedRules,
    derivedStats,
    progression,
    actionResources,
  };
}

export function buildCharacterWizardResolverInput(
  snapshot: MpmContentSnapshot,
  draft: CharacterDraft,
  context: CharacterEngineQueryContext = {},
) {
  const engine = resolveCharacterEngineState(snapshot, draft, context);
  return {
    draft: engine.resolutionDraft,
    rulesMode: engine.context.rulesMode,
    classDef: engine.classDef,
    subclassDef: engine.subclassDef,
    backgroundDef: engine.backgroundDef,
    feats: engine.featCatalog,
    spells: engine.spellCatalog,
    appliedRules: engine.appliedRules,
    progression: engine.progression,
    derivedStats: engine.derivedStats,
    ruleEngine: engine.ruleEngine,
  };
}

export function resolveCharacterWizardState(
  snapshot: MpmContentSnapshot,
  draft: CharacterDraft,
  context: CharacterEngineQueryContext = {},
): CharacterWizardState {
  const input = buildCharacterWizardResolverInput(snapshot, draft, context);
  const featContexts = resolveFeatEligibility(input);
  const spellContexts = resolveSpellEligibility(input);
  const classSkillChoiceState = getClassSkillChoiceState(input.draft, input.appliedRules);
  const skillChoiceStates = getSkillChoiceStates(input.draft, input.appliedRules);
  const equipmentChoices = resolveStartingEquipmentChoices(input);
  const requiredChoices = getRequiredBuilderChoices(input.appliedRules, input.progression);
  const validations = {} as Record<WizardStepId, WizardStepValidation>;
  for (const stepId of WIZARD_STEP_IDS) {
    validations[stepId] = validateBuilderStep(stepId, input, featContexts, spellContexts, skillChoiceStates, equipmentChoices);
  }
  const completion = isCharacterCreationComplete(Object.values(validations));
  return {
    input,
    featContexts,
    spellContexts,
    classSkillChoiceState,
    skillChoiceStates,
    equipmentChoices,
    requiredChoices,
    validations,
    completion,
  };
}
