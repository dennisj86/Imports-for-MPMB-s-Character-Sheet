import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import type { CharacterEngineState } from "../services/characterEngine";
import { resolveCharacterEngineState } from "../services/characterEngine";
import { contentSnapshot } from "../services/data/content";
import { resolveBackgrounds, resolveClasses, resolveSpecies } from "../services/data/rulesModeResolver";
import { buildWizardV2State } from "../features/wizardV2";
import { buildPartySessionReadiness } from "../features/party/sessionReadinessViewModel";
import { buildProgressionViewModel } from "../features/character/viewModels";
import {
  applyLevelUpWithSnapshot,
  buildLevelUpPreviewDiff,
  setAbilityScoreIncreaseChoice,
  setAsiOrFeatOption,
} from "../services/levelUp";

function mockEngine(overrides: {
  level: number;
  hp: number;
  proficiencyBonus: number;
  [key: string]: unknown;
}): CharacterEngineState {
  const { level, hp, proficiencyBonus, ...rest } = overrides as {
    level: number;
    hp: number;
    proficiencyBonus: number;
    [key: string]: unknown;
  };
  const base = {
    progression: {
      currentLevel: level,
      unlockedFeatures: [],
      spellProgression: {
        spellSlots: {},
        pendingChoices: [],
        notes: [],
      },
      pendingChoices: [],
      unlockedClassFeatures: [],
      unlockedSubclassFeatures: [],
      asiOrFeatChoices: [],
      notes: [],
    },
    derivedStats: {
      hitPoints: { max: hp },
      proficiencyBonus,
      notes: [],
    },
    classDef: { name: "Test Class", hitDie: 10 },
    actionResources: {
      resourceSet: {
        resources: [],
      },
      pending: [],
    },
    ruleEngine: {
      choiceSurface: {
        choices: [],
      },
      optionScoped: {
        diagnostics: [],
      },
    },
  } as unknown as CharacterEngineState;
  return { ...base, ...rest } as CharacterEngineState;
}

function createLevelFourPaladin() {
  const context = { provider: "mpmb", rulesMode: "2024" } as const;
  const classes = resolveClasses(contentSnapshot.classes, context);
  const species = resolveSpecies(contentSnapshot.species, context);
  const backgrounds = resolveBackgrounds(contentSnapshot.backgrounds, context);
  const paladin = classes.find((entry) => /paladin/i.test(String(entry.key) + " " + String(entry.name))) ?? classes[0];
  const human = species.find((entry) => /human/i.test(String(entry.key) + " " + String(entry.name))) ?? species[0];
  const background = backgrounds[0];
  const draft = createCharacterDraft("level-up-readiness-paladin", "Level-Up Readiness");
  draft.provider = context.provider;
  draft.rulesMode = context.rulesMode;
  draft.classSelection.classId = paladin.id;
  draft.classSelection.level = 4;
  draft.speciesSelection.speciesId = human?.id;
  draft.backgroundSelection.backgroundId = background?.id;
  draft.abilityScores.str = 10;
  draft.abilityScores.con = 14;
  return { context, draft };
}

describe("level-up + readiness flow hardening v1", () => {
  it("does not block confirm for pending fighting style choices and shows warning confirm text", () => {
    const before = mockEngine({ level: 1, hp: 12, proficiencyBonus: 2 });
    const after = mockEngine({
      level: 2,
      hp: 18,
      proficiencyBonus: 2,
      ruleEngine: {
        choiceSurface: {
          choices: [
            {
              id: "rule-choice:fighting-style",
              label: "Fighting Style - Paladin: Fighting Style",
              status: "pending",
              choiceType: "fighting-style",
              playerVisible: true,
              selectedCount: 0,
              requiredCount: 1,
              options: [{ id: "defense", label: "Defense" }],
            },
          ],
        },
        optionScoped: { diagnostics: [] },
      },
    });

    const diff = buildLevelUpPreviewDiff(before, after);

    expect(diff.canConfirm).toBe(true);
    expect(diff.confirmLabel).toBe("Level up with unresolved choices");
    expect(diff.choiceStatuses.find((entry) => /fighting style/i.test(entry.label))?.classification).toBe("pending-choice");
  });

  it("does not block confirm for pending spell or cantrip choices and points them to the spells tab", () => {
    const before = mockEngine({ level: 4, hp: 28, proficiencyBonus: 2 });
    const after = mockEngine({
      level: 5,
      hp: 34,
      proficiencyBonus: 3,
      progression: {
        currentLevel: 5,
        unlockedFeatures: [],
        spellProgression: {
          spellSlots: { 1: 4, 2: 2 },
          pendingChoices: [],
          notes: [],
        },
        pendingChoices: [
          {
            id: "progression:spell-selection:cantrip",
            kind: "spell-selection",
            level: 5,
            description: "Select 1 additional cantrip.",
            required: true,
            satisfied: false,
            source: "spellcasting",
            notes: [],
          },
        ],
      },
    });

    const diff = buildLevelUpPreviewDiff(before, after);
    const cantrip = diff.choiceStatuses.find((entry) => /cantrip/i.test(entry.label));

    expect(diff.canConfirm).toBe(true);
    expect(cantrip?.builderTarget?.stepId).toBe("spells");
  });

  it("does not block confirm for unsupported manual choices but still flags them", () => {
    const before = mockEngine({ level: 1, hp: 10, proficiencyBonus: 2 });
    const after = mockEngine({
      level: 2,
      hp: 16,
      proficiencyBonus: 2,
      ruleEngine: {
        choiceSurface: {
          choices: [
            {
              id: "rule-choice:smite",
              label: "Spell - Paladin's Smite",
              status: "unsupported",
              choiceType: "spell",
              playerVisible: true,
              selectedCount: 0,
              requiredCount: 1,
              options: [],
            },
          ],
        },
        optionScoped: { diagnostics: [] },
      },
    });

    const diff = buildLevelUpPreviewDiff(before, after);

    expect(diff.canConfirm).toBe(true);
    expect(diff.choiceStatuses[0]?.classification).toBe("unsupported-manual");
  });

  it("blocks confirm only for critical blockers", () => {
    const before = mockEngine({ level: 4, hp: 28, proficiencyBonus: 2 });
    const after = mockEngine({
      level: 4,
      hp: 28,
      proficiencyBonus: 2,
      classDef: undefined,
    });

    const diff = buildLevelUpPreviewDiff(before, after);

    expect(diff.canConfirm).toBe(false);
    expect(diff.openEntries.some((entry) => entry.classification === "critical-blocker")).toBe(true);
  });

  it("keeps unresolved choices visible after confirming the level-up", () => {
    const context = { provider: "mpmb", rulesMode: "2024" } as const;
    const classes = resolveClasses(contentSnapshot.classes, context);
    const paladin = classes.find((entry) => /paladin/i.test(String(entry.key) + " " + String(entry.name))) ?? classes[0];
    const draft = createCharacterDraft("level-up-confirm-pending", "Level-Up Confirm Pending");
    draft.provider = context.provider;
    draft.rulesMode = context.rulesMode;
    draft.classSelection.classId = paladin.id;
    draft.classSelection.level = 1;

    const leveled = applyLevelUpWithSnapshot(draft, { targetLevel: 2 });
    const engine = resolveCharacterEngineState(contentSnapshot, leveled, context);
    const progression = buildProgressionViewModel(leveled, engine);

    expect(leveled.classSelection.level).toBe(2);
    expect(progression.pendingChoiceCount).toBeGreaterThan(0);
    expect(progression.ruleChoices.some((entry) => /fighting style/i.test(entry.label))).toBe(true);
  });

  it("keeps the feats step visible for level-up and generic rule surfaces so deep links have a target", () => {
    const context = { provider: "mpmb", rulesMode: "2024" } as const;
    const classes = resolveClasses(contentSnapshot.classes, context);
    const paladin = classes.find((entry) => /paladin/i.test(String(entry.key) + " " + String(entry.name))) ?? classes[0];
    const draft = createCharacterDraft("level-up-feat-step", "Level-Up Feat Step");
    draft.provider = context.provider;
    draft.rulesMode = context.rulesMode;
    draft.classSelection.classId = paladin.id;
    draft.classSelection.level = 2;

    const wizardUi = buildWizardV2State(contentSnapshot, draft, context);
    const engine = resolveCharacterEngineState(contentSnapshot, draft, context);
    const progression = buildProgressionViewModel(draft, engine);
    const fightingStyle = progression.ruleChoices.find((entry) => /fighting style/i.test(entry.label));

    expect(wizardUi.steps.some((step) => step.id === "feats")).toBe(true);
    expect(fightingStyle?.builderTarget?.stepId).toBe("feats");
    expect(fightingStyle?.builderTarget?.focusId).toContain("builder-rule-choice");
  });

  it("updates manage, preview and party readiness after resolving a pending level-up choice", () => {
    const { context, draft } = createLevelFourPaladin();
    const beforeEngine = resolveCharacterEngineState(contentSnapshot, draft, context);
    const beforeProgression = buildProgressionViewModel(draft, beforeEngine);
    const beforePreview = buildLevelUpPreviewDiff(
      beforeEngine,
      resolveCharacterEngineState(contentSnapshot, { ...draft, classSelection: { ...draft.classSelection, level: 5 } }, context),
    );
    const beforeReadiness = buildPartySessionReadiness(undefined, [draft], { partyId: "default" });
    const asiChoice = beforeEngine.progression.asiOrFeatChoices[0];
    expect(asiChoice).toBeDefined();
    if (!asiChoice) {
      return;
    }

    const withAsi = setAbilityScoreIncreaseChoice(
      setAsiOrFeatOption(draft, asiChoice.id, "ability-score-improvement"),
      asiChoice.id,
      asiChoice.level,
      { str: 2 },
    );
    const afterEngine = resolveCharacterEngineState(contentSnapshot, withAsi, context);
    const afterProgression = buildProgressionViewModel(withAsi, afterEngine);
    const afterPreview = buildLevelUpPreviewDiff(
      afterEngine,
      resolveCharacterEngineState(contentSnapshot, { ...withAsi, classSelection: { ...withAsi.classSelection, level: 5 } }, context),
    );
    const afterReadiness = buildPartySessionReadiness(undefined, [withAsi], { partyId: "default" });

    expect(beforeProgression.pendingChoiceCount).toBeGreaterThan(afterProgression.pendingChoiceCount);
    expect(beforePreview.choiceStatuses.some((entry) => entry.label === "Choose Ability Score Improvement or Feat for level 4.")).toBe(true);
    expect(afterPreview.choiceStatuses.some((entry) => entry.label === "Choose Ability Score Improvement or Feat for level 4.")).toBe(false);
    expect(beforeReadiness.characters[0]?.pendingChoices).toBeGreaterThan(afterReadiness.characters[0]?.pendingChoices ?? 0);
  });

  it("wires builder deep links, scroll focus, and manual hints into the sheet UI", () => {
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    const builderSource = readFileSync("src/pages/CharacterBuilderPage.tsx", "utf8");
    const lifecycleSource = readFileSync("src/services/levelUp/levelUpLifecycle.ts", "utf8");

    expect(lifecycleSource).toContain("Level up with unresolved choices");
    expect(sheetSource).toContain("disabled={!levelUpPreview.canConfirm}");
    expect(sheetSource).toContain("Open Builder Spells Tab");
    expect(sheetSource).toContain("Show manual hint");
    expect(sheetSource).toContain("Manual / Detail Hint");
    expect(builderSource).toContain("useSearchParams");
    expect(builderSource).toContain('searchParams.get("step")');
    expect(builderSource).toContain('searchParams.get("focus")');
    expect(builderSource).toContain("scrollIntoView");
  });
});
