import type { CharacterDraft } from "../../../domain/character";
import type { CharacterEngineState } from "../../../services/characterEngine";
import { hpGainKey } from "../../../services/levelUp";

export interface ProgressionChoiceViewModel {
  id: string;
  label: string;
  status: "complete" | "missing" | "unsupported" | "needs-builder";
  detail: string;
}

export interface AsiOrFeatChoiceViewModel {
  id: string;
  level: number;
  selectedOption?: "ability-score-improvement" | "feat";
  options: Array<"ability-score-improvement" | "feat">;
  status: "complete" | "missing" | "needs-builder";
  detail: string;
  asiIncreases?: Partial<Record<keyof CharacterDraft["abilityScores"], number>>;
  selectedFeatId?: string;
  selectedFeatName?: string;
}

export interface HpGainChoiceViewModel {
  level: number;
  selectedMethod: "fixed/default" | "manual" | "rolled" | "max";
  value?: number;
  status: "complete" | "missing";
  detail: string;
}

export interface ProgressionViewModel {
  currentLevel: number;
  className: string;
  subclassName?: string;
  pendingChoices: ProgressionChoiceViewModel[];
  missingCapabilities: ProgressionChoiceViewModel[];
  hpGainMethods: Array<"fixed/default" | "manual" | "rolled" | "max">;
  selectedHpGainMethod?: "fixed/default" | "manual" | "rolled" | "max";
  hpGainChoices: HpGainChoiceViewModel[];
  asiOrFeatChoices: AsiOrFeatChoiceViewModel[];
  pendingChoiceCount: number;
}

function hasPendingChoice(engine: CharacterEngineState, search: RegExp): boolean {
  return engine.progression.pendingChoices.some((choice) => search.test(choice.description));
}

export function buildProgressionViewModel(draft: CharacterDraft, engine: CharacterEngineState): ProgressionViewModel {
  const pendingChoices: ProgressionChoiceViewModel[] = engine.progression.pendingChoices.map((choice) => ({
    id: choice.id,
    label: choice.description,
    status: choice.satisfied ? "complete" : "missing",
    detail: choice.notes.join(" ") || `${choice.source} level ${choice.level}`,
  }));

  if (engine.progression.subclassRequirement?.required && !engine.progression.subclassRequirement.satisfied) {
    pendingChoices.push({
      id: "subclass-selection",
      label: `Subclass required at level ${engine.progression.subclassRequirement.unlockLevel}`,
      status: "missing",
      detail: "Return to Builder to choose a subclass.",
    });
  }

  const missingCapabilities: ProgressionChoiceViewModel[] = [];

  if (!hasPendingChoice(engine, /feat|asi|ability score/i) && engine.progression.asiOrFeatChoices.length === 0 && draft.classSelection.level >= 4) {
    missingCapabilities.push({
      id: "asi-feat-choice",
      label: "Feat / ASI Choice Surface",
      status: "unsupported",
      detail: "No structured pending choice is exposed for the current level. Do not auto-select feats or ability score improvements from the sheet.",
    });
  }

  missingCapabilities.push({
    id: "weapon-mastery",
    label: "Weapon Mastery Choice Surface",
    status: "unsupported",
    detail: hasPendingChoice(engine, /weapon mastery/i)
      ? "A pending Weapon Mastery choice is present and should be completed in the Builder."
      : "No structured Weapon Mastery choice state is exposed to the sheet yet.",
  });

  missingCapabilities.push({
    id: "fighting-style",
    label: "Fighting Style Choice Surface",
    status: "unsupported",
    detail: hasPendingChoice(engine, /fighting style/i)
      ? "A pending Fighting Style choice is present and should be completed in the Builder."
      : "No structured Fighting Style choice state is exposed to the sheet yet.",
  });

  const asiOrFeatChoices: AsiOrFeatChoiceViewModel[] = engine.progression.asiOrFeatChoices.map((choice) => ({
    id: choice.id,
    level: choice.level,
    options: [...choice.options],
    selectedOption: choice.selectedOption,
    status: choice.satisfied ? "complete" : choice.selectedOption === "feat" ? "needs-builder" : "missing",
    asiIncreases: draft.levelUp?.abilityScoreIncreases?.[choice.id]?.increases,
    selectedFeatId: draft.levelUp?.featChoices?.[choice.id]?.featId,
    selectedFeatName: draft.levelUp?.featChoices?.[choice.id]?.featId
      ? engine.selectedFeats.find((feat) => feat.id === draft.levelUp?.featChoices?.[choice.id]?.featId)?.name
      : undefined,
    detail:
      choice.selectedOption === "feat"
        ? choice.satisfied
          ? "Feat choice is selected and resolved."
          : "Feat option selected. Choose the exact feat and any feat subchoices in the Builder."
        : choice.selectedOption === "ability-score-improvement"
          ? choice.satisfied
            ? "Ability Score Improvement allocation is complete and applied to derived stats."
            : "Ability Score Improvement selected. Choose +2 to one ability or +1/+1 to two abilities in the Builder."
          : "Choose whether this level uses an Ability Score Improvement or a Feat.",
  }));

  const hpGainChoices: HpGainChoiceViewModel[] = Array.from({ length: Math.max(0, draft.classSelection.level - 1) }, (_, index) => index + 2).map((level) => {
    const state = draft.levelUp?.hpGainByLevel?.[hpGainKey(level)];
    const selectedMethod = state?.method ?? "fixed/default";
    const needsValue = selectedMethod === "manual" || selectedMethod === "rolled";
    const status = needsValue && state?.value === undefined ? "missing" : "complete";
    return {
      level,
      selectedMethod,
      value: state?.value,
      status,
      detail: needsValue
        ? state?.value === undefined
          ? "Enter the rolled/manual hit point gain for this level."
          : `Uses stored ${selectedMethod} value ${state.value}.`
        : selectedMethod === "max"
          ? "Uses maximum hit die result for this level."
          : "Uses fixed/default class hit die average for this level.",
    };
  });

  const currentHpGainKey = hpGainKey(draft.classSelection.level);
  const selectedHpGainMethod = draft.levelUp?.hpGainByLevel?.[currentHpGainKey]?.method;

  return {
    currentLevel: engine.progression.currentLevel,
    className: engine.classDef?.name ?? "Class pending",
    subclassName: engine.subclassDef?.name,
    pendingChoices,
    missingCapabilities,
    hpGainMethods: ["fixed/default", "manual", "rolled", "max"],
    selectedHpGainMethod,
    hpGainChoices,
    asiOrFeatChoices,
    pendingChoiceCount:
      pendingChoices.filter((choice) => choice.status === "missing").length +
      asiOrFeatChoices.filter((choice) => choice.status !== "complete").length +
      hpGainChoices.filter((choice) => choice.status !== "complete").length,
  };
}
