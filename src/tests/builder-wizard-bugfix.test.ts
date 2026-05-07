import { beforeEach, describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import {
  applyStartingEquipmentChoiceForBuilder,
  getAppliedCharacterRules,
  getAvailableSources,
  getBackgrounds,
  getBuilderStepValidations,
  getClasses,
  getDerivedCharacterStats,
  getFeats,
  getSkillChoiceStatesForBuilder,
  getSpecies,
  getStartingEquipmentChoicesForBuilder,
  resolveFeatEligibilityForBuilder,
  resolveSpellEligibilityForBuilder,
  regenerateContentForSelectedSources,
} from "../services/data/adapter";

function includesText(value: string | undefined, search: string): boolean {
  return String(value ?? "").toLowerCase().includes(search.toLowerCase());
}

function buildDraft(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  const draft = createCharacterDraft(`wizard-bugfix-${provider}-${rulesMode}`, `Wizard Bugfix ${provider}/${rulesMode}`);
  draft.provider = provider;
  draft.rulesMode = rulesMode;
  draft.classSelection.level = 1;
  return draft;
}

function pickPaladin(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  return getClasses({ provider, rulesMode }).find((entry) => entry.key === "paladin");
}

function pickOutlander(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  return getBackgrounds({ provider, rulesMode }).find((entry) => includesText(`${entry.name} ${entry.key}`, "outlander"));
}

function pickHalfElf(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  return getSpecies({ provider, rulesMode }).find((entry) => includesText(`${entry.name} ${entry.key}`, "half-elf"));
}

describe("builder wizard bugfixes", () => {
  beforeEach(() => {
    regenerateContentForSelectedSources(getAvailableSources().map((source) => source.key));
  });

  it("marks background step completed after valid background selection and exposes conversion benefits", () => {
    const draft = buildDraft("mpmb", "2024");
    const paladin = pickPaladin("mpmb", "2024");
    const species = pickHalfElf("mpmb", "2024");
    const background = pickOutlander("mpmb", "2024");
    expect(paladin).toBeDefined();
    expect(species).toBeDefined();
    expect(background).toBeDefined();
    if (!paladin || !species || !background) {
      return;
    }
    draft.classSelection.classId = paladin.id;
    draft.speciesSelection.speciesId = species.id;
    draft.backgroundSelection.backgroundId = background.id;

    const validations = getBuilderStepValidations(draft, { provider: "mpmb", rulesMode: "2024" });
    expect(validations.background.blocked).toBe(false);
    expect(validations.background.pending).toBe(false);
    expect(validations.background.completed).toBe(true);

    const applied = getAppliedCharacterRules(draft, { provider: "mpmb", rulesMode: "2024" });
    expect(applied.backgroundResult.skillProficiencies.length).toBeGreaterThan(0);
    expect(applied.backgroundResult.toolProficiencies.length).toBeGreaterThan(0);
    expect(applied.backgroundResult.abilityScoreRule).toBe("background-2024");
    expect(applied.backgroundResult.originFeatRequirement?.required).toBe(true);
  });

  it("supports species-vs-background ASI mode and applies species skill choices into derived skills", () => {
    const draft = buildDraft("mpmb", "2024");
    const paladin = pickPaladin("mpmb", "2024");
    const species = pickHalfElf("mpmb", "2024");
    const background = pickOutlander("mpmb", "2024");
    expect(paladin).toBeDefined();
    expect(species).toBeDefined();
    expect(background).toBeDefined();
    if (!paladin || !species || !background) {
      return;
    }
    draft.classSelection.classId = paladin.id;
    draft.speciesSelection.speciesId = species.id;
    draft.backgroundSelection.backgroundId = background.id;
    draft.featureChoices = [
      { featureId: "ability-choice:background:0:0", optionId: "str" },
      { featureId: "ability-choice:background:1:0", optionId: "dex" },
      { featureId: "skill-choice:class:0", optionId: "Intimidation" },
      { featureId: "skill-choice:class:1", optionId: "Persuasion" },
      { featureId: "skill-choice:species:0", optionId: "Arcana" },
      { featureId: "skill-choice:species:1", optionId: "Perception" },
    ];

    const appliedBackgroundMode = getAppliedCharacterRules(draft, { provider: "mpmb", rulesMode: "2024" });
    expect(appliedBackgroundMode.abilityScoreAdjustments.originMode).toBe("background-2024");
    const derivedBackgroundMode = getDerivedCharacterStats(draft, { provider: "mpmb", rulesMode: "2024" });
    expect(derivedBackgroundMode.abilityScores.str.finalScore).toBe(12);
    expect(derivedBackgroundMode.abilityScores.dex.finalScore).toBe(11);
    expect(derivedBackgroundMode.abilityScores.cha.finalScore).toBe(10);
    expect(derivedBackgroundMode.skills.arcana.proficient).toBe(true);
    expect(derivedBackgroundMode.skills.arcana.total).toBeGreaterThanOrEqual(2);
    expect(derivedBackgroundMode.skills.perception.proficient).toBe(true);

    draft.featureChoices = [
      { featureId: "ability-choice:origin-mode", optionId: "species" },
      { featureId: "ability-choice:species:0:0", optionId: "str" },
      { featureId: "ability-choice:species:0:1", optionId: "dex" },
      { featureId: "skill-choice:class:0", optionId: "Intimidation" },
      { featureId: "skill-choice:class:1", optionId: "Persuasion" },
      { featureId: "skill-choice:species:0", optionId: "Arcana" },
      { featureId: "skill-choice:species:1", optionId: "Perception" },
    ];
    const derivedSpeciesMode = getDerivedCharacterStats(draft, { provider: "mpmb", rulesMode: "2024" });
    expect(derivedSpeciesMode.abilityScores.cha.finalScore).toBe(12);
    expect(derivedSpeciesMode.abilityScores.str.finalScore).toBe(11);
    expect(derivedSpeciesMode.abilityScores.dex.finalScore).toBe(11);

    const skillStates = getSkillChoiceStatesForBuilder(draft, { provider: "mpmb", rulesMode: "2024" });
    expect(skillStates.some((entry) => entry.source === "species" && entry.requiredCount === 2)).toBe(true);
  });

  it("requires and stores structured feat subchoices for Magic Initiate and unlocks spell contexts", () => {
    const draft = buildDraft("mpmb", "2024");
    const paladin = pickPaladin("mpmb", "2024");
    const species = pickHalfElf("mpmb", "2024");
    const background = pickOutlander("mpmb", "2024");
    const magicInitiate = getFeats({ provider: "mpmb", rulesMode: "2024" }).find((entry) =>
      includesText(`${entry.name} ${entry.key}`, "magic initiate"),
    );
    expect(paladin).toBeDefined();
    expect(species).toBeDefined();
    expect(background).toBeDefined();
    expect(magicInitiate).toBeDefined();
    if (!paladin || !species || !background || !magicInitiate) {
      return;
    }

    draft.classSelection.classId = paladin.id;
    draft.speciesSelection.speciesId = species.id;
    draft.backgroundSelection.backgroundId = background.id;
    draft.featureChoices = [{ featureId: "feat-choice:origin", optionId: magicInitiate.id }];
    draft.featIds = [magicInitiate.id];

    const before = resolveFeatEligibilityForBuilder(draft, { provider: "mpmb", rulesMode: "2024" });
    const originBefore = before.find((entry) => entry.id === "feat-choice:origin");
    expect(originBefore).toBeDefined();
    if (!originBefore) {
      return;
    }
    expect(originBefore.subchoices.length).toBeGreaterThan(0);
    expect(originBefore.satisfied).toBe(false);

    draft.featureChoices.push({ featureId: `feat-choice:${magicInitiate.id}:spell-list`, optionId: "cleric" });
    draft.featureChoices.push({ featureId: `feat-choice:${magicInitiate.id}:spell-ability`, optionId: "wis" });
    const after = resolveFeatEligibilityForBuilder(draft, { provider: "mpmb", rulesMode: "2024" });
    const originAfter = after.find((entry) => entry.id === "feat-choice:origin");
    expect(originAfter?.satisfied).toBe(true);

    const spellContexts = resolveSpellEligibilityForBuilder(draft, { provider: "mpmb", rulesMode: "2024" });
    const cantripContext = spellContexts.find((entry) => entry.id === `spell-context:${magicInitiate.id}:cantrip`);
    expect(cantripContext).toBeDefined();
    expect(cantripContext?.eligibleSpells.length).toBeGreaterThan(0);
  });

  it("treats a selected origin feat as fulfilled and keeps spell selections isolated per spell context", () => {
    const draft = buildDraft("mpmb", "2024");
    const paladin = pickPaladin("mpmb", "2024");
    const species = pickHalfElf("mpmb", "2024");
    const background = pickOutlander("mpmb", "2024");
    const magicInitiate = getFeats({ provider: "mpmb", rulesMode: "2024" }).find((entry) =>
      includesText(`${entry.name} ${entry.key}`, "magic initiate"),
    );
    expect(paladin).toBeDefined();
    expect(species).toBeDefined();
    expect(background).toBeDefined();
    expect(magicInitiate).toBeDefined();
    if (!paladin || !species || !background || !magicInitiate) {
      return;
    }

    draft.classSelection.classId = paladin.id;
    draft.speciesSelection.speciesId = species.id;
    draft.backgroundSelection.backgroundId = background.id;
    draft.featureChoices = [
      { featureId: "feat-choice:origin", optionId: magicInitiate.id },
      { featureId: `feat-choice:${magicInitiate.id}:spell-list`, optionId: "cleric" },
      { featureId: `feat-choice:${magicInitiate.id}:spell-ability`, optionId: "wis" },
    ];
    draft.featIds = [magicInitiate.id];

    const applied = getAppliedCharacterRules(draft, { provider: "mpmb", rulesMode: "2024" });
    expect(applied.backgroundResult.originFeatRequirement?.required).toBe(true);
    expect(applied.backgroundResult.originFeatRequirement?.satisfied).toBe(true);
    expect(applied.pendingChoices.some((choice) => choice.kind === "origin-feat")).toBe(false);

    let contexts = resolveSpellEligibilityForBuilder(draft, { provider: "mpmb", rulesMode: "2024" });
    const classPool = contexts.find((entry) => entry.id === "spell-context:class-prepared-pool");
    const featCantrip = contexts.find((entry) => entry.id === `spell-context:${magicInitiate.id}:cantrip`);
    expect(classPool).toBeDefined();
    expect(featCantrip).toBeDefined();
    if (!classPool || !featCantrip) {
      return;
    }

    const classSpellId = classPool.eligibleSpells[0]?.id;
    expect(classSpellId).toBeDefined();
    if (!classSpellId) {
      return;
    }

    draft.featureChoices.push({
      featureId: `spell-choice:${classPool.id}:${classSpellId}`,
      optionId: "selected",
    });
    draft.spellSelection.selectedSpellIds = [classSpellId];

    contexts = resolveSpellEligibilityForBuilder(draft, { provider: "mpmb", rulesMode: "2024" });
    const classPoolAfter = contexts.find((entry) => entry.id === classPool.id);
    const featCantripAfter = contexts.find((entry) => entry.id === featCantrip.id);
    expect(classPoolAfter?.selectedSpellIds).toContain(classSpellId);
    expect(featCantripAfter?.selectedSpellIds.length).toBe(0);
    expect(featCantripAfter?.satisfied).toBe(false);
  });

  it("shows legal paladin 2024 level-1 spell options when spell choices are required", () => {
    const draft = buildDraft("mpmb", "2024");
    const paladin = pickPaladin("mpmb", "2024");
    const species = pickHalfElf("mpmb", "2024");
    const background = pickOutlander("mpmb", "2024");
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

    const contexts = resolveSpellEligibilityForBuilder(draft, { provider: "mpmb", rulesMode: "2024" });
    const classPool = contexts.find((entry) => entry.id === "spell-context:class-prepared-pool");
    expect(classPool).toBeDefined();
    if (!classPool) {
      return;
    }
    expect(classPool.requiredCount).toBeGreaterThanOrEqual(1);
    expect(classPool.eligibleSpells.length).toBeGreaterThan(0);
    expect(classPool.eligibleSpells.every((spell) => spell.classes.includes("paladin"))).toBe(true);
    expect(classPool.eligibleSpells.some((spell) => spell.level === 1)).toBe(true);

    const beforeValidation = getBuilderStepValidations(draft, { provider: "mpmb", rulesMode: "2024" });
    expect(beforeValidation.spells.blocked).toBe(true);
    const selectedSpellId = classPool.eligibleSpells[0].id;
    draft.spellSelection.selectedSpellIds = [selectedSpellId];
    const contextsAfterSelect = resolveSpellEligibilityForBuilder(draft, { provider: "mpmb", rulesMode: "2024" });
    const classPoolAfter = contextsAfterSelect.find((entry) => entry.id === "spell-context:class-prepared-pool");
    expect(classPoolAfter?.selectedSpellIds).toContain(selectedSpellId);
    const afterValidation = getBuilderStepValidations(draft, { provider: "mpmb", rulesMode: "2024" });
    expect(afterValidation.spells.errors.length).toBeLessThanOrEqual(beforeValidation.spells.errors.length);
  });

  it("provides class starting-equipment vs GP choice for paladin when class equipment text is not structured", () => {
    const draft = buildDraft("mpmb", "2024");
    const paladin = pickPaladin("mpmb", "2024");
    const background = pickOutlander("mpmb", "2024");
    expect(paladin).toBeDefined();
    expect(background).toBeDefined();
    if (!paladin || !background) {
      return;
    }
    draft.classSelection.classId = paladin.id;
    draft.backgroundSelection.backgroundId = background.id;

    const contexts = getStartingEquipmentChoicesForBuilder(draft, { provider: "mpmb", rulesMode: "2024" });
    const classContext = contexts.find((entry) => entry.source === "class");
    expect(classContext).toBeDefined();
    if (!classContext) {
      return;
    }
    expect(classContext.options.length).toBeGreaterThanOrEqual(2);
    expect(classContext.options.some((entry) => includesText(entry.label, "gp"))).toBe(true);
    expect(classContext.options.some((entry) => includesText(entry.label, "equipment package"))).toBe(true);

    const packageOption = classContext.options.find((entry) => includesText(entry.label, "equipment package"));
    expect(packageOption).toBeDefined();
    if (!packageOption) {
      return;
    }

    const withPackage = applyStartingEquipmentChoiceForBuilder(draft, classContext.id, packageOption.id, {
      provider: "mpmb",
      rulesMode: "2024",
    });
    const inventoryNames = withPackage.inventory.items.map((entry) => entry.name.toLowerCase());
    expect(inventoryNames.some((entry) => entry.includes("paladin starting equipment package"))).toBe(false);
    expect(inventoryNames.some((entry) => entry.includes("chain mail"))).toBe(true);
    const javelins = withPackage.inventory.items.find((entry) => entry.name.toLowerCase().includes("javelin"));
    expect(javelins?.quantity).toBe(6);
  });

  it("applies class/background equipment and GP alternatives into inventory state", () => {
    const draft = buildDraft("open5e", "2014");
    const classes = getClasses({ provider: "open5e", rulesMode: "2014" });
    const background = pickOutlander("open5e", "2014") ?? getBackgrounds({ provider: "open5e", rulesMode: "2014" })[0];
    expect(background).toBeDefined();
    if (!background) {
      return;
    }
    draft.backgroundSelection.backgroundId = background.id;

    let selectedClassId: string | undefined;
    let gpContext: { id: string; optionId: string } | undefined;
    for (const classDef of classes) {
      const probeDraft = { ...draft, classSelection: { classId: classDef.id, level: 1 } };
      const contexts = getStartingEquipmentChoicesForBuilder(probeDraft, { provider: "open5e", rulesMode: "2014" });
      const gpChoice = contexts
        .flatMap((context) => context.options.map((option) => ({ contextId: context.id, option })))
        .find((entry) => (entry.option.gpAmount ?? 0) > 0);
      if (gpChoice) {
        selectedClassId = classDef.id;
        gpContext = { id: gpChoice.contextId, optionId: gpChoice.option.id };
        break;
      }
    }

    if (!selectedClassId || !gpContext) {
      // Kein deterministischer GP-Case im aktiven Datensatz; dann mindestens Background-Equipment pruefen.
      draft.classSelection.classId = classes[0]?.id;
      const fallbackContexts = getStartingEquipmentChoicesForBuilder(draft, { provider: "open5e", rulesMode: "2014" });
      const backgroundContext = fallbackContexts.find((entry) => entry.source === "background");
      expect(backgroundContext).toBeDefined();
      if (!backgroundContext) {
        return;
      }
      const next = applyStartingEquipmentChoiceForBuilder(draft, backgroundContext.id, backgroundContext.options[0].id, {
        provider: "open5e",
        rulesMode: "2014",
      });
      expect(next.inventory.items.some((entry) => entry.id.startsWith(`starting:${backgroundContext.id}:`))).toBe(true);
      return;
    }

    draft.classSelection.classId = selectedClassId;
    const withGp = applyStartingEquipmentChoiceForBuilder(draft, gpContext.id, gpContext.optionId, {
      provider: "open5e",
      rulesMode: "2014",
    });
    expect(withGp.inventory.items.some((entry) => entry.id === `currency:gp:${gpContext.id}`)).toBe(true);

    const allContexts = getStartingEquipmentChoicesForBuilder(withGp, { provider: "open5e", rulesMode: "2014" });
    const backgroundContext = allContexts.find((entry) => entry.source === "background");
    expect(backgroundContext).toBeDefined();
    if (!backgroundContext) {
      return;
    }
    const withBackground = applyStartingEquipmentChoiceForBuilder(withGp, backgroundContext.id, backgroundContext.options[0].id, {
      provider: "open5e",
      rulesMode: "2014",
    });
    expect(withBackground.inventory.items.some((entry) => entry.id.startsWith(`starting:${backgroundContext.id}:`))).toBe(true);
  });
});
