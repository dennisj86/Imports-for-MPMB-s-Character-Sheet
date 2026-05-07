import { contentSnapshot } from "./content";
import type {
  BackgroundDefinition,
  ClassDefinition,
  EquipmentDefinition,
  FeatDefinition,
  FeatureDefinition,
  MpmContentSnapshot,
  RulesMode,
  SourceDefinition,
  SpeciesDefinition,
  SpellDefinition,
  SubclassDefinition,
} from "../../domain/content";
import type { AppliedCharacterRules } from "../../domain/appliedRules";
import type { CharacterActionResourceState } from "../../domain/actionResources";
import type {
  ClassSkillChoiceState,
  FeatChoiceContext,
  SkillChoiceState,
  SpellChoiceContext,
  StartingEquipmentChoiceContext,
  WizardStepId,
  WizardStepValidation,
} from "../../domain/builderWizard";
import type { DerivedCharacterStats } from "../../domain/derivedStats";
import type { LevelProgressionResult } from "../../domain/progression";
import { getFeaturesForLevel } from "../../domain/derived";
import { resolveSourceProvider, type SourceProvider } from "./sourceProvider";
import type { CharacterDraft } from "../../domain/character";
import {
  getConvertedBackgroundBenefits,
  getConvertedSpeciesTraits,
  resolveBackgrounds,
  resolveClasses,
  resolveEquipment,
  resolveFeats,
  resolveSpecies,
  resolveSpells,
  resolveSubclasses,
  type RulesQueryContext,
} from "./rulesModeResolver";
import { resolveAppliedCharacterRules } from "./appliedRulesResolver";
import { resolveCharacterActionResources } from "./actionResourceResolver";
import {
  applyStartingEquipmentChoiceToInventory,
  getClassSkillChoiceState as resolveClassSkillChoiceState,
  getSkillChoiceStates as resolveSkillChoiceStates,
  getEligibleFeatsForChoice as selectEligibleFeatsForChoice,
  getEligibleSpellsForChoice as selectEligibleSpellsForChoice,
  getRequiredBuilderChoices as resolveRequiredBuilderChoices,
  isCharacterCreationComplete as resolveCharacterCreationComplete,
  resolveFeatEligibility,
  resolveStartingEquipmentChoices,
  resolveSpellEligibility,
  validateBuilderStep as resolveBuilderStepValidation,
} from "./builderWizardResolver";
import { resolveDerivedStats } from "./derivedStatsResolver";
import { resolveLevelProgression } from "./progressionResolver";

function normalizeKey(value: string | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type SpellFilters = {
  query?: string;
  level?: number;
  classKey?: string;
  concentration?: boolean;
  ritual?: boolean;
};

export type EquipmentFilters = {
  query?: string;
  category?: EquipmentDefinition["category"];
  rarity?: string;
};

export type DataQueryContext = RulesQueryContext & {
  provider?: SourceProvider | "all";
  rulesMode?: RulesMode;
};

const fullSnapshot = contentSnapshot;
let activeSnapshot: MpmContentSnapshot = fullSnapshot;
let activeSourceKeys = new Set(fullSnapshot.sources.map((source) => source.key));

function sourceRefMatchesSelection(sourceRefs: string[], selection: Set<string>): boolean {
  if (selection.size === 0) {
    return false;
  }
  if (sourceRefs.length === 0) {
    return true;
  }
  return sourceRefs.some((ref) => {
    const sourceKey = ref.split(":")[0]?.trim();
    return Boolean(sourceKey) && selection.has(sourceKey);
  });
}

function filterBySources<T extends { sourceRefs: string[] }>(entries: T[], selection: Set<string>): T[] {
  return entries.filter((entry) => sourceRefMatchesSelection(entry.sourceRefs, selection));
}

function applySourceSelection(sourceKeys: string[]): MpmContentSnapshot {
  const selection = new Set(sourceKeys);
  return {
    ...fullSnapshot,
    sources: fullSnapshot.sources.filter((source) => selection.has(source.key)),
    classes: filterBySources(fullSnapshot.classes, selection),
    subclasses: filterBySources(fullSnapshot.subclasses, selection),
    species: filterBySources(fullSnapshot.species, selection),
    backgrounds: filterBySources(fullSnapshot.backgrounds, selection),
    feats: filterBySources(fullSnapshot.feats, selection),
    spells: filterBySources(fullSnapshot.spells, selection),
    equipment: filterBySources(fullSnapshot.equipment, selection),
  };
}

export function getAvailableSources(): SourceDefinition[] {
  return fullSnapshot.sources;
}

export function getAvailableSourceProviders(): Array<{ key: SourceProvider; label: string; sourceCount: number }> {
  const providerCounts = new Map<SourceProvider, number>();
  for (const source of fullSnapshot.sources) {
    const provider = resolveSourceProvider(source);
    providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
  }
  return [
    { key: "mpmb", label: "MPMB", sourceCount: providerCounts.get("mpmb") ?? 0 },
    { key: "open5e", label: "Open5e", sourceCount: providerCounts.get("open5e") ?? 0 },
  ];
}

export function getActiveSourceKeys(): string[] {
  return Array.from(activeSourceKeys);
}

export function regenerateContentForSelectedSources(sourceKeys: string[]) {
  activeSourceKeys = new Set(sourceKeys);
  activeSnapshot = applySourceSelection(sourceKeys);
  return {
    sourceCount: activeSnapshot.sources.length,
    classCount: activeSnapshot.classes.length,
    subclassCount: activeSnapshot.subclasses.length,
    speciesCount: activeSnapshot.species.length,
    backgroundCount: activeSnapshot.backgrounds.length,
    featCount: activeSnapshot.feats.length,
    spellCount: activeSnapshot.spells.length,
    equipmentCount: activeSnapshot.equipment.length,
  };
}

export function getClasses(context: DataQueryContext = {}): ClassDefinition[] {
  return resolveClasses(activeSnapshot.classes, context);
}

export function getClassById(id: string, context: DataQueryContext = {}): ClassDefinition | undefined {
  return getClasses(context).find((entry) => entry.id === id);
}

export function getSubclassesForClass(classId: string, context: DataQueryContext = {}): SubclassDefinition[] {
  const classes = getClasses(context);
  const parentClass = classes.find((entry) => entry.id === classId) ?? activeSnapshot.classes.find((entry) => entry.id === classId);
  if (!parentClass) {
    return [];
  }
  const classesForResolution = classes.some((entry) => entry.id === parentClass.id) ? classes : [...classes, parentClass];
  const resolved = resolveSubclasses(activeSnapshot.subclasses, classesForResolution, {
    ...context,
    selectedClassId: parentClass.id,
  });
  const parentCanonical = normalizeKey(parentClass.compatibility?.canonicalKey ?? parentClass.canonicalClassKey ?? parentClass.key);
  return resolved.filter((entry) => {
    if (entry.classId === classId) {
      return true;
    }
    const subclassClassCanonical = normalizeKey(entry.canonicalClassKey ?? entry.classKey);
    return subclassClassCanonical === parentCanonical;
  });
}

export function getSpecies(context: DataQueryContext = {}): SpeciesDefinition[] {
  return resolveSpecies(activeSnapshot.species, context);
}

export function getBackgrounds(context: DataQueryContext = {}): BackgroundDefinition[] {
  return resolveBackgrounds(activeSnapshot.backgrounds, context);
}

export function getBackgroundById(id: string, context: DataQueryContext = {}): BackgroundDefinition | undefined {
  return getBackgrounds(context).find((entry) => entry.id === id);
}

export function getFeats(context: DataQueryContext = {}): FeatDefinition[] {
  return resolveFeats(activeSnapshot.feats, context);
}

function normalizeLookup(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findFeatByNameLike(name: string, context: DataQueryContext = {}): FeatDefinition | undefined {
  const needle = normalizeLookup(name);
  if (!needle) {
    return undefined;
  }
  const feats = getFeats(context);
  return (
    feats.find((entry) => normalizeLookup(entry.name) === needle || normalizeLookup(entry.key) === needle) ??
    feats.find((entry) => normalizeLookup(entry.name).startsWith(needle) || normalizeLookup(entry.key).startsWith(needle))
  );
}

export function getSpells(filters: SpellFilters = {}, context: DataQueryContext = {}): SpellDefinition[] {
  const query = filters.query?.toLowerCase().trim();
  const spellRows = resolveSpells(activeSnapshot.spells, context);
  return spellRows.filter((spell) => {
    if (query && !spell.name.toLowerCase().includes(query) && !spell.key.toLowerCase().includes(query)) {
      return false;
    }
    if (filters.level !== undefined && spell.level !== filters.level) {
      return false;
    }
    if (filters.classKey && !spell.classes.includes(filters.classKey.toLowerCase())) {
      return false;
    }
    if (filters.concentration !== undefined && spell.concentration !== filters.concentration) {
      return false;
    }
    if (filters.ritual !== undefined && spell.ritual !== filters.ritual) {
      return false;
    }
    return true;
  });
}

export function getSpellById(id: string, context: DataQueryContext = {}): SpellDefinition | undefined {
  return resolveSpells(activeSnapshot.spells, context).find((entry) => entry.id === id);
}

export function getEquipmentCatalog(filters: EquipmentFilters = {}, context: DataQueryContext = {}): EquipmentDefinition[] {
  const query = filters.query?.toLowerCase().trim();
  const rarity = filters.rarity?.toLowerCase().trim();
  const equipmentRows = resolveEquipment(activeSnapshot.equipment, context);
  return equipmentRows.filter((item) => {
    if (query && !item.name.toLowerCase().includes(query) && !item.key.toLowerCase().includes(query)) {
      return false;
    }
    if (filters.category && item.category !== filters.category) {
      return false;
    }
    if (rarity && (item.rarity ?? "").toLowerCase() !== rarity) {
      return false;
    }
    return true;
  });
}

export function getFeaturesForClassLevel(
  classId: string | undefined,
  subclassId: string | undefined,
  level: number,
  context: DataQueryContext = {},
): FeatureDefinition[] {
  const classDef = classId ? getClassById(classId, context) : undefined;
  const subclassDef =
    classId && subclassId
      ? getSubclassesForClass(classId, {
          ...context,
          classLevel: level,
        }).find((entry) => entry.id === subclassId)
      : undefined;
  return getFeaturesForLevel(classDef, subclassDef, level);
}

export function getAppliedCharacterRules(draft: CharacterDraft, context: DataQueryContext = {}): AppliedCharacterRules {
  const effectiveContext: DataQueryContext = {
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  };
  const classDef = draft.classSelection.classId ? getClassById(draft.classSelection.classId, effectiveContext) : undefined;
  const subclassDef =
    classDef && draft.subclassSelection.subclassId
      ? getSubclassesForClass(classDef.id, {
          ...effectiveContext,
          classLevel: draft.classSelection.level,
        }).find((entry) => entry.id === draft.subclassSelection.subclassId)
      : undefined;
  const speciesDef = draft.speciesSelection.speciesId
    ? getSpecies(effectiveContext).find((entry) => entry.id === draft.speciesSelection.speciesId)
    : undefined;
  const backgroundDef = draft.backgroundSelection.backgroundId
    ? getBackgrounds(effectiveContext).find((entry) => entry.id === draft.backgroundSelection.backgroundId)
    : undefined;
  const featCatalog = getFeats(effectiveContext);
  const selectedSpells = draft.spellSelection.selectedSpellIds
    .map((idValue) => getSpellById(idValue, effectiveContext))
    .filter((entry): entry is SpellDefinition => Boolean(entry));
  const levelFeatures = getFeaturesForClassLevel(
    draft.classSelection.classId,
    draft.subclassSelection.subclassId,
    draft.classSelection.level,
    {
      ...effectiveContext,
      classLevel: draft.classSelection.level,
    },
  );

  return resolveAppliedCharacterRules({
    draft,
    classDef,
    subclassDef,
    speciesDef,
    backgroundDef,
    featCatalog,
    selectedSpells,
    levelFeatures,
  });
}

export function getDerivedCharacterStats(draft: CharacterDraft, context: DataQueryContext = {}): DerivedCharacterStats {
  const effectiveContext: DataQueryContext = {
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  };
  const appliedRules = getAppliedCharacterRules(draft, effectiveContext);
  const classDef = draft.classSelection.classId ? getClassById(draft.classSelection.classId, effectiveContext) : undefined;
  const subclassDef =
    classDef && draft.subclassSelection.subclassId
      ? getSubclassesForClass(classDef.id, {
          ...effectiveContext,
          classLevel: draft.classSelection.level,
        }).find((entry) => entry.id === draft.subclassSelection.subclassId)
      : undefined;
  const speciesDef = draft.speciesSelection.speciesId
    ? getSpecies(effectiveContext).find((entry) => entry.id === draft.speciesSelection.speciesId)
    : undefined;
  const equipmentCatalog = getEquipmentCatalog({}, effectiveContext);

  return resolveDerivedStats(draft, appliedRules, {
    classDef,
    subclassDef,
    speciesDef,
    equipmentCatalog,
  });
}

export function getCharacterProgression(draft: CharacterDraft, context: DataQueryContext = {}): LevelProgressionResult {
  const effectiveContext: DataQueryContext = {
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  };
  const classDef = draft.classSelection.classId ? getClassById(draft.classSelection.classId, effectiveContext) : undefined;
  const availableSubclasses = classDef
    ? getSubclassesForClass(classDef.id, {
        ...effectiveContext,
        classLevel: draft.classSelection.level,
      })
    : [];
  const subclassDef =
    classDef && draft.subclassSelection.subclassId
      ? availableSubclasses.find((entry) => entry.id === draft.subclassSelection.subclassId)
      : undefined;
  const appliedRules = getAppliedCharacterRules(draft, effectiveContext);
  const derivedStats = getDerivedCharacterStats(draft, effectiveContext);
  const selectedSpells = draft.spellSelection.selectedSpellIds
    .map((idValue) => getSpellById(idValue, effectiveContext))
    .filter((entry): entry is SpellDefinition => Boolean(entry));

  return resolveLevelProgression(draft, appliedRules, derivedStats, {
    classDef,
    subclassDef,
    availableSubclasses,
    selectedSpells,
  });
}

export function getCharacterActionResources(draft: CharacterDraft, context: DataQueryContext = {}): CharacterActionResourceState {
  const effectiveContext: DataQueryContext = {
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  };
  const classDef = draft.classSelection.classId ? getClassById(draft.classSelection.classId, effectiveContext) : undefined;
  const availableSubclasses = classDef
    ? getSubclassesForClass(classDef.id, {
        ...effectiveContext,
        classLevel: draft.classSelection.level,
      })
    : [];
  const subclassDef =
    classDef && draft.subclassSelection.subclassId
      ? availableSubclasses.find((entry) => entry.id === draft.subclassSelection.subclassId)
      : undefined;
  const speciesDef = draft.speciesSelection.speciesId
    ? getSpecies(effectiveContext).find((entry) => entry.id === draft.speciesSelection.speciesId)
    : undefined;
  const backgroundDef = draft.backgroundSelection.backgroundId
    ? getBackgrounds(effectiveContext).find((entry) => entry.id === draft.backgroundSelection.backgroundId)
    : undefined;
  const featCatalog = getFeats(effectiveContext);
  const selectedFeats = draft.featIds
    .map((idValue) => featCatalog.find((entry) => entry.id === idValue))
    .filter((entry): entry is FeatDefinition => Boolean(entry));
  const selectedSpells = draft.spellSelection.selectedSpellIds
    .map((idValue) => getSpellById(idValue, effectiveContext))
    .filter((entry): entry is SpellDefinition => Boolean(entry));
  const equipmentCatalog = getEquipmentCatalog({}, effectiveContext);
  const appliedRules = getAppliedCharacterRules(draft, effectiveContext);
  const derivedStats = getDerivedCharacterStats(draft, effectiveContext);
  const progression = resolveLevelProgression(draft, appliedRules, derivedStats, {
    classDef,
    subclassDef,
    availableSubclasses,
    selectedSpells,
  });

  return resolveCharacterActionResources(draft, appliedRules, derivedStats, progression, {
    classDef,
    subclassDef,
    speciesDef,
    backgroundDef,
    selectedFeats,
    selectedSpells,
    equipmentCatalog,
  });
}

function buildWizardResolverInput(draft: CharacterDraft, context: DataQueryContext = {}) {
  const effectiveContext: DataQueryContext = {
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  };
  const classDef = draft.classSelection.classId ? getClassById(draft.classSelection.classId, effectiveContext) : undefined;
  const availableSubclasses = classDef
    ? getSubclassesForClass(classDef.id, {
      ...effectiveContext,
      classLevel: draft.classSelection.level,
    })
    : [];
  const subclassDef =
    classDef && draft.subclassSelection.subclassId
      ? availableSubclasses.find((entry) => entry.id === draft.subclassSelection.subclassId)
      : undefined;
  const backgroundDef = draft.backgroundSelection.backgroundId
    ? getBackgrounds(effectiveContext).find((entry) => entry.id === draft.backgroundSelection.backgroundId)
    : undefined;
  const feats = getFeats(effectiveContext);
  const spells = getSpells({}, effectiveContext);
  const appliedRules = getAppliedCharacterRules(draft, effectiveContext);
  const derivedStats = getDerivedCharacterStats(draft, effectiveContext);
  const progression = resolveLevelProgression(draft, appliedRules, derivedStats, {
    classDef,
    subclassDef,
    availableSubclasses,
    selectedSpells: draft.spellSelection.selectedSpellIds
      .map((idValue) => spells.find((entry) => entry.id === idValue))
      .filter((entry): entry is SpellDefinition => Boolean(entry)),
  });

  return {
    draft,
    rulesMode: effectiveContext.rulesMode ?? draft.rulesMode,
    classDef,
    subclassDef,
    backgroundDef,
    feats,
    spells,
    appliedRules,
    progression,
    derivedStats,
  };
}

export function resolveFeatEligibilityForBuilder(draft: CharacterDraft, context: DataQueryContext = {}): FeatChoiceContext[] {
  return resolveFeatEligibility(buildWizardResolverInput(draft, context));
}

export function resolveSpellEligibilityForBuilder(draft: CharacterDraft, context: DataQueryContext = {}): SpellChoiceContext[] {
  return resolveSpellEligibility(buildWizardResolverInput(draft, context));
}

export function getEligibleFeatsForChoice(
  draft: CharacterDraft,
  choiceContextId: string,
  context: DataQueryContext = {},
): FeatDefinition[] {
  const contexts = resolveFeatEligibilityForBuilder(draft, context);
  return selectEligibleFeatsForChoice(contexts, choiceContextId);
}

export function getEligibleSpellsForChoice(
  draft: CharacterDraft,
  choiceContextId: string,
  context: DataQueryContext = {},
): SpellDefinition[] {
  const contexts = resolveSpellEligibilityForBuilder(draft, context);
  return selectEligibleSpellsForChoice(contexts, choiceContextId);
}

export function getClassSkillChoiceStateForBuilder(
  draft: CharacterDraft,
  context: DataQueryContext = {},
): ClassSkillChoiceState {
  const resolved = buildWizardResolverInput(draft, context);
  return resolveClassSkillChoiceState(draft, resolved.appliedRules);
}

export function getSkillChoiceStatesForBuilder(
  draft: CharacterDraft,
  context: DataQueryContext = {},
): SkillChoiceState[] {
  const resolved = buildWizardResolverInput(draft, context);
  return resolveSkillChoiceStates(draft, resolved.appliedRules);
}

export function getStartingEquipmentChoicesForBuilder(
  draft: CharacterDraft,
  context: DataQueryContext = {},
): StartingEquipmentChoiceContext[] {
  const resolved = buildWizardResolverInput(draft, context);
  return resolveStartingEquipmentChoices(resolved);
}

export function applyStartingEquipmentChoiceForBuilder(
  draft: CharacterDraft,
  equipmentContextId: string,
  optionId: string,
  context: DataQueryContext = {},
): CharacterDraft {
  const resolved = buildWizardResolverInput(draft, context);
  const equipmentChoices = resolveStartingEquipmentChoices(resolved);
  const choice = equipmentChoices.find((entry) => entry.id === equipmentContextId);
  if (!choice) {
    return draft;
  }
  const option = choice.options.find((entry) => entry.id === optionId);
  if (!option) {
    return draft;
  }
  const equipmentCatalog = getEquipmentCatalog({}, context);
  return {
    ...draft,
    inventory: applyStartingEquipmentChoiceToInventory(draft.inventory, equipmentContextId, option, equipmentCatalog),
  };
}

export function getRequiredBuilderChoices(
  draft: CharacterDraft,
  context: DataQueryContext = {},
) {
  const resolved = buildWizardResolverInput(draft, context);
  return resolveRequiredBuilderChoices(resolved.appliedRules, resolved.progression);
}

export function validateBuilderStep(
  draft: CharacterDraft,
  stepId: WizardStepId,
  context: DataQueryContext = {},
): WizardStepValidation {
  const resolved = buildWizardResolverInput(draft, context);
  const featContexts = resolveFeatEligibility(resolved);
  const spellContexts = resolveSpellEligibility(resolved);
  const skillChoices = resolveSkillChoiceStates(draft, resolved.appliedRules);
  const equipmentChoices = resolveStartingEquipmentChoices(resolved);
  return resolveBuilderStepValidation(stepId, resolved, featContexts, spellContexts, skillChoices, equipmentChoices);
}

export function getBuilderStepValidations(
  draft: CharacterDraft,
  context: DataQueryContext = {},
): Record<WizardStepId, WizardStepValidation> {
  const resolved = buildWizardResolverInput(draft, context);
  const featContexts = resolveFeatEligibility(resolved);
  const spellContexts = resolveSpellEligibility(resolved);
  const skillChoices = resolveSkillChoiceStates(draft, resolved.appliedRules);
  const equipmentChoices = resolveStartingEquipmentChoices(resolved);
  const stepIds: WizardStepId[] = ["class", "species", "background", "abilities", "feats", "skills", "spells", "equipment", "review"];
  const output = {} as Record<WizardStepId, WizardStepValidation>;
  for (const stepId of stepIds) {
    output[stepId] = resolveBuilderStepValidation(stepId, resolved, featContexts, spellContexts, skillChoices, equipmentChoices);
  }
  return output;
}

export function isCharacterCreationComplete(
  draft: CharacterDraft,
  context: DataQueryContext = {},
) {
  const validations = Object.values(getBuilderStepValidations(draft, context));
  return resolveCharacterCreationComplete(validations);
}

export { getConvertedBackgroundBenefits, getConvertedSpeciesTraits };

export function getContentMeta() {
  return {
    ...fullSnapshot.meta,
    activeSourceKeys: getActiveSourceKeys(),
    totalSources: fullSnapshot.sources.length,
  };
}
