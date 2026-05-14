import { useMemo } from "react";
import type { CharacterDraft } from "../../domain/character";
import type { BackgroundDefinition, ClassDefinition, SpeciesDefinition, SubclassDefinition } from "../../domain/content";
import { contentSnapshot } from "../../services/data/content";
import {
  resolveCharacterEngineState,
  resolveCharacterWizardState,
  resolveSubclassesForClassFromSnapshot,
  type CharacterEngineQueryContext,
  type CharacterEngineState,
  type CharacterWizardState,
} from "../../services/characterEngine";
import { createMpmbCoreRegistry, resolveSnapshotForCoreContext } from "../../services/mpmbCore";
import { resolveBackgrounds, resolveClasses, resolveSpecies } from "../../services/data/rulesModeResolver";
import { buildWizardV2State, type WizardV2State } from "./wizardV2Engine";
import { applyStartingEquipmentChoiceToInventory } from "../../services/data/builderWizardResolver";

export interface WizardV2ViewState {
  context: CharacterEngineQueryContext;
  snapshot: ReturnType<typeof resolveSnapshotForCoreContext>;
  engine: CharacterEngineState;
  wizard: CharacterWizardState;
  wizardUi: WizardV2State;
  classes: ClassDefinition[];
  speciesOptions: SpeciesDefinition[];
  backgrounds: BackgroundDefinition[];
  selectedClass?: ClassDefinition;
  subclassOptions: SubclassDefinition[];
  selectedSubclass?: SubclassDefinition;
  selectedSpecies?: SpeciesDefinition;
  selectedBackground?: BackgroundDefinition;
  resolveSubclassesForClass: (classId: string, classLevel?: number) => SubclassDefinition[];
  applyStartingEquipmentChoiceToDraft: (draft: CharacterDraft, equipmentContextId: string, optionId: string) => CharacterDraft;
}

export function resolveWizardV2ViewState(
  draft: CharacterDraft | undefined,
  activeSourceKeys: string[],
  contextOverrides: CharacterEngineQueryContext = {},
): WizardV2ViewState | undefined {
  if (!draft) {
    return undefined;
  }
  const context: CharacterEngineQueryContext = {
    provider: contextOverrides.provider ?? draft.provider,
    rulesMode: contextOverrides.rulesMode ?? draft.rulesMode,
    levelUpTargetContext: contextOverrides.levelUpTargetContext,
  };
  const coreRegistry = createMpmbCoreRegistry(contentSnapshot, activeSourceKeys);
  const snapshot = resolveSnapshotForCoreContext(coreRegistry, context);
  const engine = resolveCharacterEngineState(snapshot, draft, context);
  const wizard = resolveCharacterWizardState(snapshot, draft, context);
  const wizardUi = buildWizardV2State(snapshot, draft, context);
  const classes = resolveClasses(snapshot.classes, context);
  const speciesOptions = resolveSpecies(snapshot.species, context);
  const backgrounds = resolveBackgrounds(snapshot.backgrounds, context);
  const selectedClass = engine.classDef ?? (draft.classSelection.classId ? classes.find((entry) => entry.id === draft.classSelection.classId) : undefined);
  const subclassOptions = selectedClass
    ? resolveSubclassesForClassFromSnapshot(snapshot, selectedClass.id, {
      provider: context.provider ?? draft.provider,
      rulesMode: context.rulesMode ?? draft.rulesMode,
    }, engine.effectiveLevel)
    : [];
  const selectedSubclass = subclassOptions.find((entry) => entry.id === draft.subclassSelection.subclassId);
  const selectedSpecies = draft.speciesSelection.speciesId
    ? speciesOptions.find((entry) => entry.id === draft.speciesSelection.speciesId)
    : undefined;
  const selectedBackground = draft.backgroundSelection.backgroundId
    ? backgrounds.find((entry) => entry.id === draft.backgroundSelection.backgroundId)
    : undefined;
  return {
    context,
    snapshot,
    engine,
    wizard,
    wizardUi,
    classes,
    speciesOptions,
    backgrounds,
    selectedClass,
    subclassOptions,
    selectedSubclass,
    selectedSpecies,
    selectedBackground,
    resolveSubclassesForClass: (classId: string, classLevel = engine.effectiveLevel) =>
      resolveSubclassesForClassFromSnapshot(snapshot, classId, {
        provider: context.provider ?? draft.provider,
        rulesMode: context.rulesMode ?? draft.rulesMode,
      }, classLevel),
    applyStartingEquipmentChoiceToDraft: (currentDraft: CharacterDraft, equipmentContextId: string, optionId: string): CharacterDraft => {
      const choice = wizard.equipmentChoices.find((entry) => entry.id === equipmentContextId);
      if (!choice) {
        return currentDraft;
      }
      const option = choice.options.find((entry) => entry.id === optionId);
      if (!option) {
        return currentDraft;
      }
      return {
        ...currentDraft,
        inventory: applyStartingEquipmentChoiceToInventory(
          currentDraft.inventory,
          equipmentContextId,
          option,
          engine.equipmentCatalog,
        ),
      };
    },
  };
}

export function useWizardV2State(
  draft: CharacterDraft | undefined,
  activeSourceKeys: string[],
  generation = 0,
  contextOverrides: CharacterEngineQueryContext = {},
): WizardV2ViewState | undefined {
  return useMemo(
    () => resolveWizardV2ViewState(draft, activeSourceKeys, contextOverrides),
    [draft, activeSourceKeys, generation, contextOverrides],
  );
}
