import { beforeEach, describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import type { WizardStepValidation } from "../domain/builderWizard";
import { getVisibleWizardSteps } from "../features/character-builder/wizard/stepDefinitions";
import {
  getAppliedCharacterRules,
  getAvailableSources,
  getBackgrounds,
  getBuilderStepValidations,
  getClassSkillChoiceStateForBuilder,
  getClasses,
  getFeats,
  getSpecies,
  isCharacterCreationComplete,
  regenerateContentForSelectedSources,
  resolveFeatEligibilityForBuilder,
  resolveSpellEligibilityForBuilder,
} from "../services/data/adapter";

const ORIGIN_TOKENS = ["alert", "magic-initiate", "savage-attacker", "skilled"];

function buildDraft(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  const draft = createCharacterDraft(`wizard-${provider}-${rulesMode}`, `Wizard ${provider}/${rulesMode}`);
  draft.provider = provider;
  draft.rulesMode = rulesMode;
  return draft;
}

describe("builder wizard resolver", () => {
  beforeEach(() => {
    regenerateContentForSelectedSources(getAvailableSources().map((source) => source.key));
  });

  it("uses central step definitions with image-derived order and dynamic visibility", () => {
    const completeValidation = (stepId: WizardStepValidation["stepId"]): WizardStepValidation => ({
      stepId,
      completed: true,
      blocked: false,
      pending: false,
      errors: [],
      warnings: [],
    });
    const baseValidations = {
      class: completeValidation("class"),
      species: completeValidation("species"),
      background: completeValidation("background"),
      abilities: completeValidation("abilities"),
      feats: completeValidation("feats"),
      skills: completeValidation("skills"),
      spells: completeValidation("spells"),
      equipment: completeValidation("equipment"),
      review: completeValidation("review"),
    };

    const withoutFeatSpell = getVisibleWizardSteps({
      validations: baseValidations,
      hasFeatChoices: false,
      hasSpellChoices: false,
    });
    expect(withoutFeatSpell.map((step) => step.id)).toEqual(["class", "species", "background", "abilities", "skills", "equipment", "review"]);

    const withFeatSpell = getVisibleWizardSteps({
      validations: baseValidations,
      hasFeatChoices: true,
      hasSpellChoices: true,
    });
    expect(withFeatSpell.map((step) => step.id)).toEqual([
      "class",
      "species",
      "background",
      "abilities",
      "feats",
      "skills",
      "spells",
      "equipment",
      "review",
    ]);
  });

  it("filters origin feat choices to legal origin feats", () => {
    const draft = buildDraft("mpmb", "2024");
    const paladin = getClasses({ provider: "mpmb", rulesMode: "2024" }).find((entry) => entry.key === "paladin");
    const outlander = getBackgrounds({ provider: "mpmb", rulesMode: "2024" }).find((entry) => /outlander/i.test(entry.name));
    const species = getSpecies({ provider: "mpmb", rulesMode: "2024" })[0];
    expect(paladin).toBeDefined();
    expect(outlander).toBeDefined();
    expect(species).toBeDefined();
    if (!paladin || !outlander || !species) {
      return;
    }
    draft.classSelection.classId = paladin.id;
    draft.backgroundSelection.backgroundId = outlander.id;
    draft.speciesSelection.speciesId = species.id;

    const contexts = resolveFeatEligibilityForBuilder(draft, { provider: "mpmb", rulesMode: "2024" });
    const originContext = contexts.find((entry) => entry.kind === "origin-feat");
    expect(originContext).toBeDefined();
    if (!originContext) {
      return;
    }
    expect(originContext.eligibleFeats.length).toBeGreaterThan(0);
    expect(
      originContext.eligibleFeats.every((feat) => {
        const token = `${feat.compatibility?.canonicalKey ?? feat.key}`.toLowerCase();
        return ORIGIN_TOKENS.some((originToken) => token.includes(originToken));
      }),
    ).toBe(true);
  });

  it("filters spell choices to legal class/feat spell pools", () => {
    const draft = buildDraft("mpmb", "2024");
    const paladin = getClasses({ provider: "mpmb", rulesMode: "2024" }).find((entry) => entry.key === "paladin");
    const species = getSpecies({ provider: "mpmb", rulesMode: "2024" })[0];
    const background = getBackgrounds({ provider: "mpmb", rulesMode: "2024" }).find((entry) => /outlander/i.test(entry.name));
    const magicInitiate = getFeats({ provider: "mpmb", rulesMode: "2024" }).find((entry) =>
      `${entry.compatibility?.canonicalKey ?? entry.key}`.toLowerCase().includes("magic-initiate"),
    );
    expect(paladin).toBeDefined();
    expect(species).toBeDefined();
    expect(background).toBeDefined();
    expect(magicInitiate).toBeDefined();
    if (!paladin || !species || !background || !magicInitiate) {
      return;
    }

    draft.classSelection.classId = paladin.id;
    draft.classSelection.level = 2;
    draft.speciesSelection.speciesId = species.id;
    draft.backgroundSelection.backgroundId = background.id;
    draft.featureChoices.push({ featureId: "feat-choice:origin", optionId: magicInitiate.id });
    draft.featureChoices.push({ featureId: `feat-choice:${magicInitiate.id}:spell-list`, optionId: "cleric" });
    draft.featIds = [magicInitiate.id];

    const contexts = resolveSpellEligibilityForBuilder(draft, { provider: "mpmb", rulesMode: "2024" });
    const featCantripContext = contexts.find((entry) => entry.id === `spell-context:${magicInitiate.id}:cantrip`);
    const featLevel1Context = contexts.find((entry) => entry.id === `spell-context:${magicInitiate.id}:level1`);
    expect(featCantripContext).toBeDefined();
    expect(featLevel1Context).toBeDefined();
    if (!featCantripContext || !featLevel1Context) {
      return;
    }

    expect(featCantripContext.eligibleSpells.length).toBeGreaterThan(0);
    expect(featCantripContext.eligibleSpells.every((spell) => spell.level === 0 && spell.classes.includes("cleric"))).toBe(true);
    expect(featLevel1Context.eligibleSpells.every((spell) => spell.level === 1 && spell.classes.includes("cleric"))).toBe(true);
  });

  it("keeps completion state deterministic and requires class skill choices", () => {
    const draft = buildDraft("mpmb", "2014");
    const paladin = getClasses({ provider: "mpmb", rulesMode: "2014" }).find((entry) => entry.key === "paladin");
    const species = getSpecies({ provider: "mpmb", rulesMode: "2014" })[0];
    const background = getBackgrounds({ provider: "mpmb", rulesMode: "2014" }).find((entry) => /outlander/i.test(entry.name));
    expect(paladin).toBeDefined();
    expect(species).toBeDefined();
    expect(background).toBeDefined();
    if (!paladin || !species || !background) {
      return;
    }
    draft.classSelection.classId = paladin.id;
    draft.classSelection.level = 1;
    draft.speciesSelection.speciesId = species.id;
    draft.backgroundSelection.backgroundId = background.id;

    const before = isCharacterCreationComplete(draft, { provider: "mpmb", rulesMode: "2014" });
    expect(before.complete).toBe(false);
    expect(before.blockingSteps.includes("skills")).toBe(true);

    const appliedRules = getAppliedCharacterRules(draft, { provider: "mpmb", rulesMode: "2014" });
    const classSkillOptions = appliedRules.classResult.skillChoices.options;
    const resolvedOptions = classSkillOptions.includes("Any skill")
      ? [
          "Athletics",
          "Perception",
          "Insight",
          "Intimidation",
          "Persuasion",
          "Religion",
          "Medicine",
        ]
      : classSkillOptions;
    draft.featureChoices = [
      { featureId: "skill-choice:class:0", optionId: resolvedOptions[0] ?? "Athletics" },
      { featureId: "skill-choice:class:1", optionId: resolvedOptions[1] ?? "Perception" },
    ];

    const skillChoice = getClassSkillChoiceStateForBuilder(draft, { provider: "mpmb", rulesMode: "2014" });
    expect(skillChoice.missingCount).toBe(0);

    const validations = getBuilderStepValidations(draft, { provider: "mpmb", rulesMode: "2014" });
    expect(validations.skills.blocked).toBe(false);
  });
});
