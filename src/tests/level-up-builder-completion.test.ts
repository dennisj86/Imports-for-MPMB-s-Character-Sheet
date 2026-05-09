import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import { buildProgressionViewModel } from "../features/character/viewModels";
import { resolveCharacterEngineState, resolveCharacterWizardState } from "../services/characterEngine";
import { contentSnapshot } from "../services/data/content";
import { resolveBackgrounds, resolveClasses, resolveSpecies } from "../services/data/rulesModeResolver";
import {
  setAbilityScoreIncreaseChoice,
  setAsiOrFeatOption,
  setHpGainMethod,
  setLevelUpFeatChoice,
} from "../services/levelUp";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";

function createLevelFourPaladin() {
  const context = { provider: "mpmb", rulesMode: "2024" } as const;
  const classes = resolveClasses(contentSnapshot.classes, context);
  const species = resolveSpecies(contentSnapshot.species, context);
  const backgrounds = resolveBackgrounds(contentSnapshot.backgrounds, context);
  const paladin = classes.find((entry) => /paladin/i.test(`${entry.key} ${entry.name}`)) ?? classes[0];
  const human = species.find((entry) => /human/i.test(`${entry.key} ${entry.name}`)) ?? species[0];
  const background = backgrounds[0];
  const draft = createCharacterDraft("level-up-builder", "Level-Up Builder");
  draft.provider = context.provider;
  draft.rulesMode = context.rulesMode;
  draft.classSelection.classId = paladin.id;
  draft.classSelection.level = 4;
  draft.speciesSelection.speciesId = human.id;
  draft.backgroundSelection.backgroundId = background.id;
  draft.abilityScores.str = 10;
  draft.abilityScores.con = 14;
  return { context, draft };
}

function firstAsiChoiceId(draft = createLevelFourPaladin().draft, context = createLevelFourPaladin().context) {
  const engine = resolveCharacterEngineState(contentSnapshot, draft, context);
  const choice = engine.progression.asiOrFeatChoices[0];
  expect(choice).toBeDefined();
  return choice;
}

describe("level-up builder completion v1", () => {
  it("applies fixed/default, max, rolled, and manual HP gain to derived max HP", () => {
    const { context, draft } = createLevelFourPaladin();
    const withHp = setHpGainMethod(
      setHpGainMethod(
        setHpGainMethod(draft, 2, "fixed/default"),
        3,
        "rolled",
        4,
      ),
      4,
      "manual",
      5,
    );
    const withMax = setHpGainMethod(withHp, 3, "max");

    const rolledEngine = resolveCharacterEngineState(contentSnapshot, withHp, context);
    const maxEngine = resolveCharacterEngineState(contentSnapshot, withMax, context);

    expect(rolledEngine.derivedStats.hitPoints.max).toBe(33);
    expect(maxEngine.derivedStats.hitPoints.max).toBe(39);
    expect(maxEngine.derivedStats.hitPoints.formula).toContain("L3 max 10 + CON");
  });

  it("updates derived max HP when HP gain method changes without overwriting playState current HP", () => {
    const { context, draft } = createLevelFourPaladin();
    draft.playState.currentHp = 7;
    const fixed = setHpGainMethod(draft, 4, "fixed/default");
    const max = setHpGainMethod(fixed, 4, "max");

    expect(resolveCharacterEngineState(contentSnapshot, fixed, context).derivedStats.hitPoints.max).toBe(36);
    expect(resolveCharacterEngineState(contentSnapshot, max, context).derivedStats.hitPoints.max).toBe(40);
    expect(max.playState.currentHp).toBe(7);
  });

  it("applies +2 ASI and +1/+1 ASI to derived ability scores and blocks invalid distributions", () => {
    const { context, draft } = createLevelFourPaladin();
    const choice = firstAsiChoiceId(draft, context);
    if (!choice) {
      return;
    }
    const withOption = setAsiOrFeatOption(draft, choice.id, "ability-score-improvement");
    const withStrength = setAbilityScoreIncreaseChoice(withOption, choice.id, choice.level, { str: 2 });
    const strengthEngine = resolveCharacterEngineState(contentSnapshot, withStrength, context);
    expect(strengthEngine.derivedStats.abilityScores.str.finalScore).toBe(12);
    expect(strengthEngine.derivedStats.abilityScores.str.modifier).toBe(1);

    const withSplit = setAbilityScoreIncreaseChoice(withOption, choice.id, choice.level, { str: 1, dex: 1 });
    const splitEngine = resolveCharacterEngineState(contentSnapshot, withSplit, context);
    expect(splitEngine.derivedStats.abilityScores.str.finalScore).toBe(11);
    expect(splitEngine.derivedStats.abilityScores.dex.finalScore).toBe(11);

    const invalid = setAbilityScoreIncreaseChoice(withOption, choice.id, choice.level, { str: 1 });
    expect(invalid.levelUp?.abilityScoreIncreases?.[choice.id]).toBeUndefined();
  });

  it("keeps ASI pending until allocation is complete and persists the allocation", () => {
    const { context, draft } = createLevelFourPaladin();
    const choice = firstAsiChoiceId(draft, context);
    if (!choice) {
      return;
    }
    const withOptionOnly = setAsiOrFeatOption(draft, choice.id, "ability-score-improvement");
    const pending = resolveCharacterEngineState(contentSnapshot, withOptionOnly, context);
    expect(pending.progression.asiOrFeatChoices[0]?.satisfied).toBe(false);

    const completed = setAbilityScoreIncreaseChoice(withOptionOnly, choice.id, choice.level, { str: 2 });
    const completeEngine = resolveCharacterEngineState(contentSnapshot, completed, context);
    expect(completeEngine.progression.asiOrFeatChoices[0]?.satisfied).toBe(true);

    const roundTrip = deserializeCharacters(serializeCharacters([completed]))[0];
    expect(roundTrip?.levelUp?.abilityScoreIncreases?.[choice.id]?.increases.str).toBe(2);
  });

  it("persists concrete ASI/Feat feat selection and exposes it through engine selected feats", () => {
    const { context, draft } = createLevelFourPaladin();
    const choice = firstAsiChoiceId(draft, context);
    if (!choice) {
      return;
    }
    const withFeatOption = setAsiOrFeatOption(draft, choice.id, "feat");
    const wizard = resolveCharacterWizardState(contentSnapshot, withFeatOption, context);
    const featContext = wizard.featContexts.find((entry) => entry.id === `feat-choice:asi:${choice.id}`);
    const selectedFeat = featContext?.eligibleFeats[0];
    expect(selectedFeat).toBeDefined();
    if (!selectedFeat) {
      return;
    }

    const completed = setLevelUpFeatChoice(withFeatOption, choice.id, choice.level, selectedFeat.id);
    const engine = resolveCharacterEngineState(contentSnapshot, completed, context);
    const progression = buildProgressionViewModel(completed, engine);

    expect(completed.featureChoices.find((entry) => entry.featureId === `feat-choice:asi:${choice.id}`)?.optionId).toBe(selectedFeat.id);
    expect(completed.featIds).toContain(selectedFeat.id);
    expect(engine.selectedFeats.some((entry) => entry.id === selectedFeat.id)).toBe(true);
    expect(progression.asiOrFeatChoices.find((entry) => entry.id === choice.id)?.status).toBe("complete");
  });

  it("keeps unsupported Weapon Mastery and Fighting Style honest when no structured choices are exposed", () => {
    const { context, draft } = createLevelFourPaladin();
    const engine = resolveCharacterEngineState(contentSnapshot, draft, context);
    const progression = buildProgressionViewModel(draft, engine);
    expect(progression.missingCapabilities.find((entry) => entry.id === "weapon-mastery")?.status).toBe("unsupported");
    expect(progression.missingCapabilities.find((entry) => entry.id === "fighting-style")?.status).toBe("unsupported");
  });
});
