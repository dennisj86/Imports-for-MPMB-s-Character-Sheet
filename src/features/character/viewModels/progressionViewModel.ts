import type { CharacterDraft } from "../../../domain/character";
import type { CharacterEngineState } from "../../../services/characterEngine";

export interface ProgressionChoiceViewModel {
  id: string;
  label: string;
  status: "complete" | "missing" | "needs-ui";
  detail: string;
}

export interface ProgressionViewModel {
  currentLevel: number;
  className: string;
  pendingChoices: ProgressionChoiceViewModel[];
  missingCapabilities: ProgressionChoiceViewModel[];
  hpGainMethods: Array<"fixed/default" | "manual" | "rolled" | "max">;
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

  const missingCapabilities: ProgressionChoiceViewModel[] = [
    {
      id: "hp-gain-method",
      label: "Level-Up HP Gain Method",
      status: "needs-ui",
      detail: "The sheet distinguishes fixed/default, manual, rolled, and max HP gain, but max HP is still resolved by the current progression baseline.",
    },
  ];

  if (!hasPendingChoice(engine, /feat|asi|ability score/i) && engine.progression.asiOrFeatChoices.length === 0 && draft.classSelection.level >= 4) {
    missingCapabilities.push({
      id: "asi-feat-choice",
      label: "Feat / ASI Choice Surface",
      status: "needs-ui",
      detail: "No structured pending choice is exposed for the current level. Do not auto-select feats or ability score improvements from the sheet.",
    });
  }

  missingCapabilities.push({
    id: "weapon-mastery",
    label: "Weapon Mastery Choice Surface",
    status: "needs-ui",
    detail: hasPendingChoice(engine, /weapon mastery/i)
      ? "A pending Weapon Mastery choice is present and should be completed in the Builder."
      : "No structured Weapon Mastery choice state is exposed to the sheet yet.",
  });

  missingCapabilities.push({
    id: "fighting-style",
    label: "Fighting Style Choice Surface",
    status: "needs-ui",
    detail: hasPendingChoice(engine, /fighting style/i)
      ? "A pending Fighting Style choice is present and should be completed in the Builder."
      : "No structured Fighting Style choice state is exposed to the sheet yet.",
  });

  return {
    currentLevel: engine.progression.currentLevel,
    className: engine.classDef?.name ?? "Class pending",
    pendingChoices,
    missingCapabilities,
    hpGainMethods: ["fixed/default", "manual", "rolled", "max"],
  };
}
