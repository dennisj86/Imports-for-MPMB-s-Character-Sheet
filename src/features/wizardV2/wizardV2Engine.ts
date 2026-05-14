import type { CharacterDraft } from "../../domain/character";
import type { MpmContentSnapshot, RulesMode } from "../../domain/content";
import type { WizardStepId, WizardStepValidation } from "../../domain/builderWizard";
import { getVisibleWizardSteps } from "../character-builder/wizard/stepDefinitions";
import { resolveCharacterWizardState, type CharacterEngineQueryContext } from "../../services/characterEngine";

export type WizardV2QueryContext = CharacterEngineQueryContext & {
  provider?: "mpmb" | "open5e" | "all";
  rulesMode?: RulesMode;
};

export interface WizardV2StepState {
  id: WizardStepId;
  title: string;
  order: number;
  completed: boolean;
  issues: string[];
  imageRefs: string[];
}

export interface WizardV2State {
  activeStepId: WizardStepId;
  complete: boolean;
  steps: WizardV2StepState[];
  validations: Record<WizardStepId, WizardStepValidation>;
  featChoiceCount: number;
  spellChoiceCount: number;
  requiredChoiceCount: number;
}

export function buildWizardV2State(
  snapshot: MpmContentSnapshot,
  draft: CharacterDraft,
  context: WizardV2QueryContext = {},
): WizardV2State {
  const wizard = resolveCharacterWizardState(snapshot, draft, context);
  const hasFeatStepContent =
    wizard.featContexts.length > 0 ||
    wizard.input.draft.classSelection.level > 1 ||
    wizard.input.progression.asiOrFeatChoices.length > 0 ||
    wizard.input.progression.pendingChoices.some((entry) => entry.kind !== "spell-selection") ||
    wizard.input.ruleEngine.choiceSurface.choices.some(
      (choice) => choice.playerVisible && choice.choiceType !== "spell" && choice.choiceType !== "cantrip",
    );
  const visibleSteps = getVisibleWizardSteps({
    validations: wizard.validations,
    hasFeatChoices: hasFeatStepContent,
    hasSpellChoices: wizard.spellContexts.length > 0,
  });
  const stepStates = visibleSteps.map((step) => {
    const validation = wizard.validations[step.id];
    return {
      id: step.id,
      title: step.title,
      order: step.order,
      completed: Boolean(validation?.completed),
      issues: [...(validation?.errors ?? []), ...(validation?.warnings ?? [])],
      imageRefs: step.imageRefs,
    };
  });

  const firstIncomplete = stepStates.find((step) => !step.completed)?.id;
  const fallbackStep = stepStates[0]?.id ?? "class";
  return {
    activeStepId: firstIncomplete ?? fallbackStep,
    complete: wizard.completion.complete,
    steps: stepStates,
    validations: wizard.validations,
    featChoiceCount: wizard.featContexts.length,
    spellChoiceCount: wizard.spellContexts.length,
    requiredChoiceCount: wizard.requiredChoices.length,
  };
}
