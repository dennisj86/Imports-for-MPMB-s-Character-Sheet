import { describe, expect, it } from "vitest";
import type { ClassDefinition, EquipmentDefinition, FeatDefinition, MpmContentSnapshot } from "../domain/content";
import { createCharacterDraft } from "../domain/defaults";
import { buildFeatureGroupsViewModel } from "../features/character/viewModels";
import { resolveCharacterEngineState, resolveCharacterWizardState } from "../services/characterEngine";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";
import { buildWeaponAttackProfiles, resolveCombinedRuleProficiencies, setRuleChoiceSelection } from "../services/rules";

const TEST_SOURCE_META = {
  sourceSystem: "mpmb",
  sourceDocumentKey: "test",
  sourceDocumentName: "Test Rules",
  edition: "2024",
  importPreset: "mpmb-local",
  rawSourceRef: "test",
} as const;

const chainShirt: EquipmentDefinition = {
  id: "equipment:chain-shirt",
  key: "chain-shirt",
  category: "armor",
  name: "Chain Shirt",
  sourceRefs: ["test"],
  sourceMeta: TEST_SOURCE_META,
  type: "medium armor",
};

const longsword: EquipmentDefinition = {
  id: "equipment:longsword",
  key: "longsword",
  category: "weapon",
  name: "Longsword",
  sourceRefs: ["test"],
  sourceMeta: TEST_SOURCE_META,
  type: "martial melee weapon",
  description: "Melee weapon, 1d8 slashing, versatile (1d10).",
};

const longbow: EquipmentDefinition = {
  id: "equipment:longbow",
  key: "longbow",
  category: "weapon",
  name: "Longbow",
  sourceRefs: ["test"],
  sourceMeta: TEST_SOURCE_META,
  type: "martial ranged weapon",
  description: "Ranged weapon, 1d8 piercing, ammunition, range 150/600.",
};

function optionClass(): ClassDefinition {
  return {
    id: "class:option-tester",
    key: "option-tester",
    name: "Option Tester",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    hitDie: 8,
    features: [],
  };
}

function adaptiveTrainingFeat(): FeatDefinition {
  return {
    id: "feat:adaptive-training",
    key: "adaptive-training",
    name: "Adaptive Training",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    description: "Choose one: Mind and Body, Practical Study, Battle Drill, Tactical Guard, Command Routine, Hooked Ward.",
    structuredData: {
      choices: ["Mind and Body", "Practical Study", "Battle Drill", "Tactical Guard", "Command Routine", "Hooked Ward"],
      "mind-and-body": {
        scores: [0, 2, 0, 0, 0, 0],
        scoresMaximum: [0, 15, 0, 0, 0, 0],
      },
      "practical-study": {
        skills: ["Stealth"],
        toolProfs: ["Forgery Kit"],
        languageProfs: ["Giant"],
      },
      "battle-drill": {
        weaponProfs: [false, false, ["Longsword"]],
        armorProfs: [false, true, false, true],
      },
      "tactical-guard": {
        addMod: [
          { type: "skill", field: "Arcana", mod: "max(Wis|1)" },
          { type: "skill", field: "Init", mod: "prof" },
          { type: "save", field: "Dex", mod: "2" },
          { type: "skill", field: "Passive Perception", mod: "1" },
        ],
        extraAC: {
          mod: 1,
          text: "I gain a +1 bonus to AC while wearing Medium or Heavy armor.",
        },
      },
      "command-routine": {
        action: [["bonus action", ""]],
        usages: 2,
        recovery: "long rest",
      },
      "hooked-ward": {
        extraAC: {
          mod: 1,
          stopeval: "sheet-hook",
        },
      },
    },
  };
}

function duplicateLessonsFeat(): FeatDefinition {
  return {
    id: "feat:duplicate-lessons",
    key: "duplicate-lessons",
    name: "Duplicate Lessons",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    description: "Repeated training.",
    structuredData: {
      skills: ["Stealth"],
      toolProfs: ["Forgery Kit"],
      languageProfs: ["Giant"],
    },
  };
}

function openStudyFeat(): FeatDefinition {
  return {
    id: "feat:open-study",
    key: "open-study",
    name: "Open Study",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    description: "Choose one: Open Study.",
    structuredData: {
      choices: ["Open Study"],
      "open-study": {
        skills: [1],
        toolProfs: [["Tool of my choice", 1]],
        languageProfs: [1],
      },
    },
  };
}

function snapshot(): MpmContentSnapshot {
  return {
    meta: { generatedAt: "2026-05-10T00:00:00.000Z", sourceFiles: [], parseErrors: [] },
    sources: [],
    classes: [optionClass()],
    subclasses: [],
    species: [{ id: "species:test", key: "test-species", name: "Test Species", sourceRefs: ["test"], sourceMeta: TEST_SOURCE_META }],
    backgrounds: [{ id: "background:test", key: "test-background", name: "Test Background", sourceRefs: ["test"], sourceMeta: TEST_SOURCE_META }],
    feats: [adaptiveTrainingFeat(), duplicateLessonsFeat(), openStudyFeat()],
    spells: [],
    equipment: [chainShirt, longsword, longbow],
  };
}

function baseDraft() {
  const draft = createCharacterDraft("option-scoped", "Option Scoped");
  draft.provider = "mpmb";
  draft.rulesMode = "2024";
  draft.classSelection.classId = optionClass().id;
  draft.speciesSelection.speciesId = "species:test";
  draft.backgroundSelection.backgroundId = "background:test";
  draft.abilityScores.str = 16;
  draft.abilityScores.dex = 14;
  draft.abilityScores.con = 12;
  draft.abilityScores.int = 10;
  draft.abilityScores.wis = 14;
  draft.abilityScores.cha = 10;
  draft.inventory.items = [
    { id: "armor", itemDefinitionId: chainShirt.id, name: chainShirt.name, quantity: 1, equipped: true },
    { id: "longsword", itemDefinitionId: longsword.id, name: longsword.name, quantity: 1, equipped: true },
    { id: "longbow", itemDefinitionId: longbow.id, name: longbow.name, quantity: 1, equipped: true },
  ];
  return draft;
}

function featOptionChoiceId(engine: ReturnType<typeof resolveCharacterEngineState>, featId: string) {
  const source = engine.ruleEngine.sources.find((entry) => entry.sourceId === featId);
  return engine.ruleEngine.choices.find((choice) => choice.sourceDescriptorId === source?.id && choice.choiceType === "feature-option");
}

describe("option-scoped apply paths v1", () => {
  it("applies option-scoped scores and respects scoresMaximum caps with source breakdown", () => {
    const draft = { ...baseDraft(), featIds: [adaptiveTrainingFeat().id] };
    const initial = resolveCharacterEngineState(snapshot(), draft, { provider: "mpmb", rulesMode: "2024" });
    const choice = featOptionChoiceId(initial, adaptiveTrainingFeat().id);
    const selected = setRuleChoiceSelection(draft, choice!, ["mind-and-body"]);
    const engine = resolveCharacterEngineState(snapshot(), selected, { provider: "mpmb", rulesMode: "2024" });

    expect(engine.derivedStats.abilityScores.dex.finalScore).toBe(15);
    expect(engine.derivedStats.abilityScores.dex.notes).toEqual(expect.arrayContaining(["Adaptive Training: +2.", "Adaptive Training: max 15.", "Ability score capped at 15."]));
    expect(engine.ruleEngine.optionScoped.diagnostics.some((entry) => entry.field === "scores" && entry.status === "applied")).toBe(true);

    const featureCard = buildFeatureGroupsViewModel(engine).flatMap((group) => group.features).find((feature) => feature.id === adaptiveTrainingFeat().id);
    expect(featureCard?.appliedSummaryLabels).toEqual(expect.arrayContaining(["DEX +2", "DEX max 15"]));
  });

  it("applies option-scoped skill, tool, and language proficiencies and deduplicates repeated grants", () => {
    const draft = { ...baseDraft(), featIds: [adaptiveTrainingFeat().id, duplicateLessonsFeat().id] };
    const initial = resolveCharacterEngineState(snapshot(), draft, { provider: "mpmb", rulesMode: "2024" });
    const choice = featOptionChoiceId(initial, adaptiveTrainingFeat().id);
    const selected = setRuleChoiceSelection(draft, choice!, ["practical-study"]);
    const engine = resolveCharacterEngineState(snapshot(), selected, { provider: "mpmb", rulesMode: "2024" });
    const proficiencies = resolveCombinedRuleProficiencies(engine.appliedRules, engine.ruleEngine.optionScoped);

    expect(engine.derivedStats.skills.stealth.proficient).toBe(true);
    expect(proficiencies.skills.filter((entry) => entry === "Stealth")).toHaveLength(1);
    expect(proficiencies.tools.filter((entry) => entry === "Forgery Kit")).toHaveLength(1);
    expect(proficiencies.languages.filter((entry) => entry === "Giant")).toHaveLength(1);
  });

  it("applies option-scoped weapon and armor proficiencies to attack proficiency and summaries", () => {
    const draft = { ...baseDraft(), featIds: [adaptiveTrainingFeat().id] };
    const initial = resolveCharacterEngineState(snapshot(), draft, { provider: "mpmb", rulesMode: "2024" });
    const choice = featOptionChoiceId(initial, adaptiveTrainingFeat().id);
    const selected = setRuleChoiceSelection(draft, choice!, ["battle-drill"]);
    const engine = resolveCharacterEngineState(snapshot(), selected, { provider: "mpmb", rulesMode: "2024" });
    const proficiencies = resolveCombinedRuleProficiencies(engine.appliedRules, engine.ruleEngine.optionScoped);
    const profiles = buildWeaponAttackProfiles({
      draft: selected,
      equipmentCatalog: snapshot().equipment,
      derivedStats: engine.derivedStats,
      weaponProficiencies: proficiencies.weapons,
    });

    expect(proficiencies.weapons).toContain("Longsword");
    expect(proficiencies.armor).toEqual(expect.arrayContaining(["medium armor", "shields"]));
    expect(profiles.find((profile) => profile.itemDefinitionId === longsword.id)?.proficiencyApplied).toBe(true);
    expect(profiles.find((profile) => profile.itemDefinitionId === longbow.id)?.proficiencyApplied).toBe(false);
  });

  it("applies option-scoped addMod and extraAC without fake hooks", () => {
    const draft = { ...baseDraft(), featIds: [adaptiveTrainingFeat().id] };
    const initial = resolveCharacterEngineState(snapshot(), draft, { provider: "mpmb", rulesMode: "2024" });
    const choice = featOptionChoiceId(initial, adaptiveTrainingFeat().id);
    const selected = setRuleChoiceSelection(draft, choice!, ["tactical-guard"]);
    const engine = resolveCharacterEngineState(snapshot(), selected, { provider: "mpmb", rulesMode: "2024" });

    expect(engine.derivedStats.skills.arcana.total).toBe(2);
    expect(engine.derivedStats.savingThrows.dex.total).toBe(4);
    expect(engine.derivedStats.initiative).toBe(4);
    expect(engine.derivedStats.passivePerception).toBe(13);
    expect(engine.derivedStats.armorClass.value).toBe(16);
  });

  it("emits option-scoped feature actions and resources when action/usages/recovery are deterministic", () => {
    const draft = { ...baseDraft(), featIds: [adaptiveTrainingFeat().id] };
    const initial = resolveCharacterEngineState(snapshot(), draft, { provider: "mpmb", rulesMode: "2024" });
    const choice = featOptionChoiceId(initial, adaptiveTrainingFeat().id);
    const selected = setRuleChoiceSelection(draft, choice!, ["command-routine"]);
    const engine = resolveCharacterEngineState(snapshot(), selected, { provider: "mpmb", rulesMode: "2024" });

    expect(engine.actionResources.actionSet.bonusActions.some((entry) => entry.name === "Adaptive Training: Command Routine")).toBe(true);
    expect(engine.actionResources.resourceSet.resources.some((entry) => entry.name === "Adaptive Training: Command Routine" && entry.usesMax === 2 && entry.recharge.type === "long-rest")).toBe(true);
  });

  it("keeps required option-scoped child choices pending until they are filled and persists them across round trips", () => {
    const draft = { ...baseDraft(), featIds: [openStudyFeat().id] };
    const initial = resolveCharacterEngineState(snapshot(), draft, { provider: "mpmb", rulesMode: "2024" });
    const parent = featOptionChoiceId(initial, openStudyFeat().id);
    const withParent = setRuleChoiceSelection(draft, parent!, ["open-study"]);

    const pendingWizard = resolveCharacterWizardState(snapshot(), withParent, { provider: "mpmb", rulesMode: "2024" });
    expect(pendingWizard.validations.review.errors).toContain("Generic rule choices are incomplete.");

    const pendingEngine = resolveCharacterEngineState(snapshot(), withParent, { provider: "mpmb", rulesMode: "2024" });
    const skillChoice = pendingEngine.ruleEngine.choices.find((choice) => choice.id.includes("option:open-study:skill:0"));
    const toolChoice = pendingEngine.ruleEngine.choices.find((choice) => choice.id.includes("option:open-study:tool:0"));
    const languageChoice = pendingEngine.ruleEngine.choices.find((choice) => choice.id.includes("option:open-study:language:0"));
    const withSkill = setRuleChoiceSelection(withParent, skillChoice!, ["arcana"]);
    const withTool = setRuleChoiceSelection(withSkill, toolChoice!, ["forgery-kit"]);
    const completeDraft = setRuleChoiceSelection(withTool, languageChoice!, ["draconic"]);
    const [roundTrip] = deserializeCharacters(serializeCharacters([completeDraft]));
    const completeWizard = resolveCharacterWizardState(snapshot(), roundTrip!, { provider: "mpmb", rulesMode: "2024" });

    expect(roundTrip?.ruleChoices?.[skillChoice!.id]?.selectedOptionIds).toEqual(["arcana"]);
    expect(completeWizard.validations.review.errors).not.toContain("Generic rule choices are incomplete.");
  });

  it("reports hook-like option-scoped fields as unsupported and does not apply fake bonuses", () => {
    const draft = { ...baseDraft(), featIds: [adaptiveTrainingFeat().id] };
    const initial = resolveCharacterEngineState(snapshot(), draft, { provider: "mpmb", rulesMode: "2024" });
    const choice = featOptionChoiceId(initial, adaptiveTrainingFeat().id);
    const selected = setRuleChoiceSelection(draft, choice!, ["hooked-ward"]);
    const engine = resolveCharacterEngineState(snapshot(), selected, { provider: "mpmb", rulesMode: "2024" });

    expect(engine.derivedStats.armorClass.value).toBe(15);
    expect(engine.ruleEngine.optionScoped.diagnostics.some((entry) => entry.field === "extraAC" && entry.status === "unsupported" && entry.message.includes("hook-like"))).toBe(true);
    expect(engine.ruleEngine.modifiers.some((modifier) => modifier.sourceName === "Adaptive Training" && modifier.target === "armor-class")).toBe(false);
  });
});
