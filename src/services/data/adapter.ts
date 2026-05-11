// Compat layer: legacy/test-facing facade kept for backward compatibility.
// Productive UI runtime paths should use V2 services/hooks (`mpmbCore`, `wizardV2`, `spellManagement`, `characterEngine`).
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
import {
  applyStartingEquipmentChoiceToInventory,
  getEligibleFeatsForChoice as selectEligibleFeatsForChoice,
  getEligibleSpellsForChoice as selectEligibleSpellsForChoice,
} from "./builderWizardResolver";
import { createMpmbCoreRegistry, resolveSnapshotForCoreContext } from "../mpmbCore";
import { resolveCharacterEngineState, resolveCharacterWizardState } from "../characterEngine";

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
let activeSourceKeys = new Set(fullSnapshot.sources.map((source) => source.key));
let activeCoreRegistry = createMpmbCoreRegistry(fullSnapshot);

function getSnapshotForContext(context: DataQueryContext = {}): MpmContentSnapshot {
  return resolveSnapshotForCoreContext(activeCoreRegistry, {
    provider: context.provider ?? "all",
    rulesMode: context.rulesMode,
  });
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
  activeCoreRegistry = createMpmbCoreRegistry(fullSnapshot, sourceKeys);
  const activeSnapshot = activeCoreRegistry.selectedSnapshot;
  return {
    sourceCount: activeSourceKeys.size,
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
  return resolveClasses(getSnapshotForContext(context).classes, context);
}

export function getClassById(id: string, context: DataQueryContext = {}): ClassDefinition | undefined {
  return getClasses(context).find((entry) => entry.id === id);
}

export function getSubclassesForClass(classId: string, context: DataQueryContext = {}): SubclassDefinition[] {
  const snapshot = getSnapshotForContext(context);
  const classes = getClasses(context);
  const parentClass = classes.find((entry) => entry.id === classId) ?? snapshot.classes.find((entry) => entry.id === classId);
  if (!parentClass) {
    return [];
  }
  const classesForResolution = classes.some((entry) => entry.id === parentClass.id) ? classes : [...classes, parentClass];
  const resolved = resolveSubclasses(snapshot.subclasses, classesForResolution, {
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
  return resolveSpecies(getSnapshotForContext(context).species, context);
}

export function getBackgrounds(context: DataQueryContext = {}): BackgroundDefinition[] {
  return resolveBackgrounds(getSnapshotForContext(context).backgrounds, context);
}

export function getBackgroundById(id: string, context: DataQueryContext = {}): BackgroundDefinition | undefined {
  return getBackgrounds(context).find((entry) => entry.id === id);
}

export function getFeats(context: DataQueryContext = {}): FeatDefinition[] {
  return resolveFeats(getSnapshotForContext(context).feats, context);
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
  const spellRows = resolveSpells(getSnapshotForContext(context).spells, context);
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
  return resolveSpells(getSnapshotForContext(context).spells, context).find((entry) => entry.id === id);
}

export function getEquipmentCatalog(filters: EquipmentFilters = {}, context: DataQueryContext = {}): EquipmentDefinition[] {
  const query = filters.query?.toLowerCase().trim();
  const rarity = filters.rarity?.toLowerCase().trim();
  const equipmentRows = resolveEquipment(getSnapshotForContext(context).equipment, context);
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
  const snapshot = getSnapshotForContext(effectiveContext);
  return resolveCharacterEngineState(snapshot, draft, effectiveContext).appliedRules;
}

export function getDerivedCharacterStats(draft: CharacterDraft, context: DataQueryContext = {}): DerivedCharacterStats {
  const effectiveContext: DataQueryContext = {
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  };
  const snapshot = getSnapshotForContext(effectiveContext);
  return resolveCharacterEngineState(snapshot, draft, effectiveContext).derivedStats;
}

export function getCharacterProgression(draft: CharacterDraft, context: DataQueryContext = {}): LevelProgressionResult {
  const effectiveContext: DataQueryContext = {
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  };
  const snapshot = getSnapshotForContext(effectiveContext);
  return resolveCharacterEngineState(snapshot, draft, effectiveContext).progression;
}

export function getCharacterActionResources(draft: CharacterDraft, context: DataQueryContext = {}): CharacterActionResourceState {
  const effectiveContext: DataQueryContext = {
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  };
  const snapshot = getSnapshotForContext(effectiveContext);
  return resolveCharacterEngineState(snapshot, draft, effectiveContext).actionResources;
}

export function resolveFeatEligibilityForBuilder(draft: CharacterDraft, context: DataQueryContext = {}): FeatChoiceContext[] {
  const snapshot = getSnapshotForContext({
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  });
  return resolveCharacterWizardState(snapshot, draft, context).featContexts;
}

export function resolveSpellEligibilityForBuilder(draft: CharacterDraft, context: DataQueryContext = {}): SpellChoiceContext[] {
  const snapshot = getSnapshotForContext({
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  });
  return resolveCharacterWizardState(snapshot, draft, context).spellContexts;
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
  const snapshot = getSnapshotForContext({
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  });
  return resolveCharacterWizardState(snapshot, draft, context).classSkillChoiceState;
}

export function getSkillChoiceStatesForBuilder(
  draft: CharacterDraft,
  context: DataQueryContext = {},
): SkillChoiceState[] {
  const snapshot = getSnapshotForContext({
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  });
  return resolveCharacterWizardState(snapshot, draft, context).skillChoiceStates;
}

export function getStartingEquipmentChoicesForBuilder(
  draft: CharacterDraft,
  context: DataQueryContext = {},
): StartingEquipmentChoiceContext[] {
  const snapshot = getSnapshotForContext({
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  });
  return resolveCharacterWizardState(snapshot, draft, context).equipmentChoices;
}

export function applyStartingEquipmentChoiceForBuilder(
  draft: CharacterDraft,
  equipmentContextId: string,
  optionId: string,
  context: DataQueryContext = {},
): CharacterDraft {
  const snapshot = getSnapshotForContext({
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  });
  const equipmentChoices = resolveCharacterWizardState(snapshot, draft, context).equipmentChoices;
  const choice = equipmentChoices.find((entry) => entry.id === equipmentContextId);
  if (!choice) {
    return draft;
  }
  const option = choice.options.find((entry) => entry.id === optionId);
  if (!option) {
    return draft;
  }
  const equipmentCatalog = getEquipmentCatalog({}, {
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  });
  return {
    ...draft,
    inventory: applyStartingEquipmentChoiceToInventory(draft.inventory, equipmentContextId, option, equipmentCatalog),
  };
}

export function getRequiredBuilderChoices(
  draft: CharacterDraft,
  context: DataQueryContext = {},
) {
  const snapshot = getSnapshotForContext({
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  });
  return resolveCharacterWizardState(snapshot, draft, context).requiredChoices;
}

export function validateBuilderStep(
  draft: CharacterDraft,
  stepId: WizardStepId,
  context: DataQueryContext = {},
): WizardStepValidation {
  const snapshot = getSnapshotForContext({
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  });
  return resolveCharacterWizardState(snapshot, draft, context).validations[stepId];
}

export function getBuilderStepValidations(
  draft: CharacterDraft,
  context: DataQueryContext = {},
): Record<WizardStepId, WizardStepValidation> {
  const snapshot = getSnapshotForContext({
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  });
  return resolveCharacterWizardState(snapshot, draft, context).validations;
}

export function isCharacterCreationComplete(
  draft: CharacterDraft,
  context: DataQueryContext = {},
) {
  const snapshot = getSnapshotForContext({
    provider: context.provider ?? draft.provider,
    rulesMode: context.rulesMode ?? draft.rulesMode,
  });
  return resolveCharacterWizardState(snapshot, draft, context).completion;
}

export { getConvertedBackgroundBenefits, getConvertedSpeciesTraits };

export function getContentMeta() {
  return {
    ...fullSnapshot.meta,
    activeSourceKeys: getActiveSourceKeys(),
    totalSources: fullSnapshot.sources.length,
    activeSourceCount: activeCoreRegistry.selectedSnapshot.sources.length,
  };
}
