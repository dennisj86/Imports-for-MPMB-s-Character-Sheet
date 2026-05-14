import type { CharacterDraft } from "../../domain/character";
import type { MpmContentSnapshot, RulesMode, SpellDefinition } from "../../domain/content";
import type { SpellChoiceContext } from "../../domain/builderWizard";
import { getEligibleSpellsForChoice as selectEligibleSpellsForChoice } from "../../services/data/builderWizardResolver";
import { resolveCharacterWizardState, type CharacterEngineQueryContext } from "../../services/characterEngine";

export interface SpellManagementQueryContext extends CharacterEngineQueryContext {
  provider?: "mpmb" | "open5e" | "all";
  rulesMode?: RulesMode;
}

export interface SpellChoiceResolution {
  id: string;
  title: string;
  requiredCount: number;
  maxSelections?: number;
  selectedCount: number;
  missingCount: number;
  selectedSpellIds: string[];
  eligibleSpells: SpellDefinition[];
  notes: string[];
}

export interface SpellManagementState {
  contexts: SpellChoiceContext[];
  selectedSpells: SpellDefinition[];
  selectedSpellIds: string[];
  spellChoices: SpellChoiceResolution[];
  unresolvedChoices: SpellChoiceResolution[];
  isComplete: boolean;
}

type FeatureChoice = CharacterDraft["featureChoices"][number];

function setFeatureChoice(existing: FeatureChoice[], featureId: string, optionId: string | undefined): FeatureChoice[] {
  const without = existing.filter((entry) => entry.featureId !== featureId);
  if (!optionId) {
    return without;
  }
  return [...without, { featureId, optionId }];
}

function spellChoiceFeatureId(contextId: string, spellId: string): string {
  return `spell-choice:${contextId}:${spellId}`;
}

function getScopedSpellSelectionsForContext(
  existing: FeatureChoice[],
  contextId: string,
): string[] {
  const prefix = `spell-choice:${contextId}:`;
  const selected = existing
    .filter((entry) => entry.featureId.startsWith(prefix))
    .map((entry) => entry.featureId.slice(prefix.length))
    .filter(Boolean);
  return Array.from(new Set(selected));
}

function setScopedSpellSelection(
  existing: FeatureChoice[],
  contextId: string,
  spellId: string,
  selected: boolean,
): FeatureChoice[] {
  return setFeatureChoice(existing, spellChoiceFeatureId(contextId, spellId), selected ? "selected" : undefined);
}

function collectScopedSelectedSpellIds(
  existing: FeatureChoice[],
  contextIds: string[],
): string[] {
  const selected = new Set<string>();
  for (const contextId of contextIds) {
    for (const spellId of getScopedSpellSelectionsForContext(existing, contextId)) {
      selected.add(spellId);
    }
  }
  return Array.from(selected);
}

export function buildSpellManagementState(
  snapshot: MpmContentSnapshot,
  draft: CharacterDraft,
  context: SpellManagementQueryContext = {},
): SpellManagementState {
  const wizard = resolveCharacterWizardState(snapshot, draft, context);
  const spellCatalog = wizard.input.spells;
  const selectedSpellIds = Array.from(new Set(draft.spellSelection.selectedSpellIds));
  const selectedSpells = selectedSpellIds
    .map((idValue) => spellCatalog.find((entry) => entry.id === idValue))
    .filter((entry): entry is SpellDefinition => Boolean(entry));
  const spellChoices = wizard.spellContexts.map((choiceContext) => {
    const selectedForChoice = Array.from(new Set(choiceContext.selectedSpellIds));
    const requiredCount = choiceContext.requiredCount;
    const selectedCount = selectedForChoice.length;
    return {
      id: choiceContext.id,
      title: choiceContext.title,
      requiredCount,
      maxSelections: choiceContext.maxSelections,
      selectedCount,
      missingCount: Math.max(0, requiredCount - selectedCount),
      selectedSpellIds: selectedForChoice,
      eligibleSpells: selectEligibleSpellsForChoice(wizard.spellContexts, choiceContext.id),
      notes: choiceContext.notes,
    };
  });
  return {
    contexts: wizard.spellContexts,
    selectedSpells,
    selectedSpellIds,
    spellChoices,
    unresolvedChoices: spellChoices.filter((choice) => choice.missingCount > 0),
    isComplete: spellChoices.every((choice) => choice.missingCount === 0),
  };
}

export function applySpellSelectionToDraft(
  draft: CharacterDraft,
  spellManagement: Pick<SpellManagementState, "spellChoices">,
  contextId: string,
  spellId: string,
  selected: boolean,
): CharacterDraft {
  const choiceContext = spellManagement.spellChoices.find((entry) => entry.id === contextId);
  if (!choiceContext) {
    return draft;
  }
  const scopedSelectedForContext = getScopedSpellSelectionsForContext(draft.featureChoices, contextId);
  if (selected) {
    const contextSelectedCount = scopedSelectedForContext.length;
    const maxSelections = choiceContext.maxSelections ?? choiceContext.requiredCount;
    if (maxSelections > 0 && contextSelectedCount >= maxSelections && !scopedSelectedForContext.includes(spellId)) {
      return draft;
    }
  }
  const nextFeatureChoices = setScopedSpellSelection(draft.featureChoices, contextId, spellId, selected);
  const contextEligibleSpellIds = new Set(spellManagement.spellChoices.flatMap((entry) => entry.eligibleSpells.map((spell) => spell.id)));
  const retainedLegacy = draft.spellSelection.selectedSpellIds.filter((idValue) => !contextEligibleSpellIds.has(idValue));
  const scopedSelected = collectScopedSelectedSpellIds(nextFeatureChoices, spellManagement.spellChoices.map((entry) => entry.id));
  return {
    ...draft,
    featureChoices: nextFeatureChoices,
    spellSelection: {
      selectedSpellIds: Array.from(new Set([...retainedLegacy, ...scopedSelected])),
    },
  };
}
