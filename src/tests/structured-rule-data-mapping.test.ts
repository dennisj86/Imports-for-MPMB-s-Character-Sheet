import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ClassDefinition, EquipmentDefinition, FeatDefinition, MpmContentSnapshot, SpellDefinition } from "../domain/content";
import { createCharacterDraft } from "../domain/defaults";
import { buildFeatureGroupsViewModel, buildInventoryViewModel } from "../features/character/viewModels";
import { resolveCharacterEngineState } from "../services/characterEngine";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";
import { castSpell, endConcentration, type PlayStateRuntimeContext } from "../services/playState";
import { buildCharacterRollView, executeRollRequest } from "../services/rolls";
import { activeEffectsForRollType, buildWeaponAttackProfiles, resolveRuleMappingContribution, setRuleChoiceSelection } from "../services/rules";

const TEST_SOURCE_META = {
  sourceSystem: "mpmb",
  sourceDocumentKey: "test",
  sourceDocumentName: "Test Rules",
  edition: "2024",
  importPreset: "mpmb-local",
  rawSourceRef: "test",
} as const;

const armor: EquipmentDefinition = {
  id: "equipment:chain-mail",
  key: "chain-mail",
  category: "armor",
  name: "Chain Mail",
  sourceRefs: ["test"],
  sourceMeta: TEST_SOURCE_META,
  type: "heavy armor",
};

const longsword: EquipmentDefinition = {
  id: "equipment:longsword",
  key: "longsword",
  category: "weapon",
  name: "Longsword",
  sourceRefs: ["test"],
  sourceMeta: TEST_SOURCE_META,
  type: "martial melee weapon",
  description: "Melee weapon, 1d8 slashing, versatile.",
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

const greatsword: EquipmentDefinition = {
  id: "equipment:greatsword",
  key: "greatsword",
  category: "weapon",
  name: "Greatsword",
  sourceRefs: ["test"],
  sourceMeta: TEST_SOURCE_META,
  type: "martial melee weapon",
  description: "Melee weapon, 2d6 slashing, heavy, two-handed.",
};

function classDef(): ClassDefinition {
  return {
    id: "class:mapping-fighter",
    key: "mapping-fighter",
    name: "Mapping Fighter",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    hitDie: 10,
    features: [
      {
        id: "feature:fighting-style",
        key: "fighting-style",
        name: "Fighting Style",
        minLevel: 1,
        description: "You gain a Fighting Style.",
      },
      {
        id: "feature:weapon-mastery",
        key: "weapon-mastery",
        name: "Weapon Mastery",
        minLevel: 1,
        description: "Your training includes weapon mastery choices.",
      },
    ],
  };
}

function skilledFeat(): FeatDefinition {
  return {
    id: "feat:skilled",
    key: "skilled",
    name: "Skilled",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    description: "You gain skill proficiencies.",
  };
}

function linguistFeat(): FeatDefinition {
  return {
    id: "feat:linguist",
    key: "linguist",
    name: "Linguist",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    description: "You learn languages.",
  };
}

function spell(name: string, overrides: Partial<SpellDefinition> = {}): SpellDefinition {
  return {
    id: `spell:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    level: 1,
    concentration: true,
    ritual: false,
    classes: ["cleric"],
    description: "Declarative mapping test spell.",
    ...overrides,
  };
}

function snapshot(): MpmContentSnapshot {
  return {
    meta: { generatedAt: "2026-05-10T00:00:00.000Z", sourceFiles: [], parseErrors: [] },
    sources: [],
    classes: [classDef()],
    subclasses: [],
    species: [{ id: "species:test", key: "test-species", name: "Test Species", sourceRefs: ["test"], sourceMeta: TEST_SOURCE_META }],
    backgrounds: [{ id: "background:test", key: "test-background", name: "Test Background", sourceRefs: ["test"], sourceMeta: TEST_SOURCE_META }],
    feats: [skilledFeat(), linguistFeat()],
    spells: [
      spell("Bless"),
      spell("Guidance", { level: 0 }),
      spell("Resistance", { level: 0 }),
      spell("Light", { level: 0, concentration: false }),
    ],
    equipment: [armor, longsword, longbow, greatsword],
  };
}

function baseDraft() {
  const draft = createCharacterDraft("structured-mapping", "Structured Mapping");
  draft.provider = "mpmb";
  draft.rulesMode = "2024";
  draft.classSelection.classId = "class:mapping-fighter";
  draft.speciesSelection.speciesId = "species:test";
  draft.backgroundSelection.backgroundId = "background:test";
  draft.abilityScores.str = 16;
  draft.abilityScores.dex = 14;
  draft.inventory.items = [
    { id: "armor", itemDefinitionId: armor.id, name: armor.name, quantity: 1, equipped: true },
    { id: "longsword", itemDefinitionId: longsword.id, name: longsword.name, quantity: 1, equipped: true },
    { id: "longbow", itemDefinitionId: longbow.id, name: longbow.name, quantity: 1, equipped: true },
  ];
  return draft;
}

function runtime(): PlayStateRuntimeContext {
  return {
    maxHp: 20,
    constitutionModifier: 1,
    hitDicePools: [],
    resourceMaxByKey: {},
    resourceRechargeByKey: {},
    resourceNameByKey: {},
    spellSlotMaxByKey: { "1": 1 },
    spellSlotRechargeByKey: { "1": "long-rest" },
    restPlan: {
      shortRest: { resourceKeys: [], spellSlotKeys: [], skipped: [], notes: [] },
      longRest: { resourceKeys: [], spellSlotKeys: ["1"], skipped: [], notes: [] },
    },
  };
}

describe("structured rule data mapping v1", () => {
  it("applies deterministic mappings and exposes mapping diagnostics", () => {
    const engine = resolveCharacterEngineState(snapshot(), baseDraft(), { provider: "mpmb", rulesMode: "2024" });
    expect(engine.ruleEngine.choices.map((choice) => choice.choiceType)).toEqual(expect.arrayContaining(["fighting-style", "weapon-mastery"]));
    expect(engine.ruleEngine.sources.find((source) => source.sourceId === "feature:fighting-style")?.mappingRefs).toContain("feature:fighting-style:choice");
    expect(engine.ruleEngine.diagnostics.some((entry) => entry.includes("Rule mapping applied"))).toBe(true);

    const source = engine.ruleEngine.sources.find((entry) => entry.sourceId === "feature:fighting-style");
    expect(source).toBeDefined();
    const first = resolveRuleMappingContribution(source!, { draft: baseDraft(), equipmentCatalog: snapshot().equipment, spellCatalog: snapshot().spells });
    const second = resolveRuleMappingContribution(source!, { draft: baseDraft(), equipmentCatalog: snapshot().equipment, spellCatalog: snapshot().spells });
    expect(second.choices.map((choice) => choice.id)).toEqual(first.choices.map((choice) => choice.id));
  });

  it("maps Defense to a conditional AC modifier with breakdown source", () => {
    const snap = snapshot();
    const draft = baseDraft();
    const engine = resolveCharacterEngineState(snap, draft, { provider: "mpmb", rulesMode: "2024" });
    const styleChoice = engine.ruleEngine.choices.find((choice) => choice.choiceType === "fighting-style");
    expect(styleChoice).toBeDefined();

    const withDefense = setRuleChoiceSelection(draft, styleChoice!, ["defense"]);
    const defenseEngine = resolveCharacterEngineState(snap, withDefense, { provider: "mpmb", rulesMode: "2024" });
    expect(defenseEngine.derivedStats.armorClass.value).toBe(17);
    const inventory = buildInventoryViewModel(withDefense, defenseEngine);
    expect(inventory.armorClass.modifierSources?.some((entry) => entry.includes("Fighting Style"))).toBe(true);

    const withoutArmor = {
      ...withDefense,
      inventory: { items: withDefense.inventory.items.map((item) => item.itemDefinitionId === armor.id ? { ...item, equipped: false } : item) },
    };
    const noArmorEngine = resolveCharacterEngineState(snap, withoutArmor, { provider: "mpmb", rulesMode: "2024" });
    expect(noArmorEngine.derivedStats.armorClass.value).toBe(12);
  });

  it("maps Dueling, Archery and Great Weapon Fighting without combat automation", () => {
    const snap = snapshot();
    const draft = baseDraft();
    const styleChoice = resolveCharacterEngineState(snap, draft, { provider: "mpmb", rulesMode: "2024" }).ruleEngine.choices.find((choice) => choice.choiceType === "fighting-style");
    expect(styleChoice).toBeDefined();

    const duelingDraft = setRuleChoiceSelection(draft, styleChoice!, ["dueling"]);
    const duelingEngine = resolveCharacterEngineState(snap, duelingDraft, { provider: "mpmb", rulesMode: "2024" });
    const duelingProfile = buildWeaponAttackProfiles({
      draft: duelingDraft,
      equipmentCatalog: snap.equipment,
      derivedStats: duelingEngine.derivedStats,
      modifiers: duelingEngine.ruleEngine.modifiers,
    }).find((profile) => profile.itemDefinitionId === longsword.id);
    expect(duelingProfile?.damageModifier).toBe(5);
    expect(duelingProfile?.breakdown.damage.some((entry) => entry.includes("Fighting Style"))).toBe(true);

    const archeryDraft = setRuleChoiceSelection(draft, styleChoice!, ["archery"]);
    const archeryEngine = resolveCharacterEngineState(snap, archeryDraft, { provider: "mpmb", rulesMode: "2024" });
    const archeryProfile = buildWeaponAttackProfiles({
      draft: archeryDraft,
      equipmentCatalog: snap.equipment,
      derivedStats: archeryEngine.derivedStats,
      modifiers: archeryEngine.ruleEngine.modifiers,
    }).find((profile) => profile.itemDefinitionId === longbow.id);
    expect(archeryProfile?.attackBonus).toBe(6);

    const greatWeaponDraft = {
      ...setRuleChoiceSelection(draft, styleChoice!, ["great-weapon-fighting"]),
      inventory: { items: [{ id: "greatsword", itemDefinitionId: greatsword.id, name: greatsword.name, quantity: 1, equipped: true }] },
    };
    const greatWeaponEngine = resolveCharacterEngineState(snap, greatWeaponDraft, { provider: "mpmb", rulesMode: "2024" });
    expect(greatWeaponEngine.ruleEngine.modifiers.some((modifier) => modifier.valueType === "note" && String(modifier.value).includes("Future capability"))).toBe(true);
  });

  it("creates nested Blessed Warrior cantrip choices when the style is selected", () => {
    const snap = snapshot();
    const draft = baseDraft();
    const engine = resolveCharacterEngineState(snap, draft, { provider: "mpmb", rulesMode: "2024" });
    const styleChoice = engine.ruleEngine.choices.find((choice) => choice.choiceType === "fighting-style");
    const withBlessedWarrior = setRuleChoiceSelection(draft, styleChoice!, ["blessed-warrior"]);
    const nextEngine = resolveCharacterEngineState(snap, withBlessedWarrior, { provider: "mpmb", rulesMode: "2024" });
    const cantripChoice = nextEngine.ruleEngine.choices.find((choice) => choice.choiceType === "cantrip" && choice.id.includes("blessed-warrior"));
    expect(cantripChoice?.requiredCount).toBe(2);
    expect(cantripChoice?.options.map((option) => option.label)).toEqual(expect.arrayContaining(["Guidance", "Resistance", "Light"]));
  });

  it("maps Weapon Mastery to a persisted weapon choice and shows badges on weapons/actions", () => {
    const snap = snapshot();
    const draft = baseDraft();
    const masteryChoice = resolveCharacterEngineState(snap, draft, { provider: "mpmb", rulesMode: "2024" }).ruleEngine.choices.find((choice) => choice.choiceType === "weapon-mastery");
    expect(masteryChoice?.options.some((option) => option.id === longsword.id)).toBe(true);

    const withMastery = setRuleChoiceSelection(draft, masteryChoice!, [longsword.id]);
    const roundTrip = deserializeCharacters(serializeCharacters([withMastery]))[0];
    expect(roundTrip?.ruleChoices?.[masteryChoice!.id]?.selectedOptionIds).toEqual([longsword.id]);

    const engine = resolveCharacterEngineState(snap, withMastery, { provider: "mpmb", rulesMode: "2024" });
    const inventory = buildInventoryViewModel(withMastery, engine);
    expect(inventory.weapons.find((item) => item.itemDefinitionId === longsword.id)?.mappingBadges).toContain("Mastery selected");
    const rollView = buildCharacterRollView(engine);
    expect(rollView.actionRolls.find((action) => action.mappingBadges?.includes("Mastery selected"))).toBeDefined();
  });

  it("maps feat subchoices for skills and languages while keeping missing apply paths honest", () => {
    const snap = snapshot();
    const draft = { ...baseDraft(), featIds: [skilledFeat().id, linguistFeat().id] };
    const engine = resolveCharacterEngineState(snap, draft, { provider: "mpmb", rulesMode: "2024" });
    const skillChoice = engine.ruleEngine.choices.find((choice) => choice.id.includes("skilled-skills"));
    const languageChoice = engine.ruleEngine.choices.find((choice) => choice.id.includes("linguist-languages"));
    expect(skillChoice?.requiredCount).toBe(3);
    expect(languageChoice?.requiredCount).toBe(3);

    const withSkills = setRuleChoiceSelection(draft, skillChoice!, ["stealth", "arcana", "perception"]);
    const skillEngine = resolveCharacterEngineState(snap, withSkills, { provider: "mpmb", rulesMode: "2024" });
    expect(skillEngine.derivedStats.skills.stealth.proficient).toBe(true);
    expect(skillEngine.derivedStats.skills.arcana.proficient).toBe(true);
    expect(buildFeatureGroupsViewModel(skillEngine).flatMap((group) => group.features).some((feature) => feature.ruleChoiceLabels.some((label) => label.includes("Stealth")))).toBe(true);

    const withLanguage = setRuleChoiceSelection(withSkills, languageChoice!, ["draconic", "elvish", "giant"]);
    const languageEngine = resolveCharacterEngineState(snap, withLanguage, { provider: "mpmb", rulesMode: "2024" });
    expect(languageEngine.ruleEngine.diagnostics.some((entry) => entry.includes("Linguist language choices are persisted"))).toBe(true);
  });

  it("maps simple spell active effects into playState and roll results", () => {
    const snap = snapshot();
    const draft = { ...baseDraft(), spellSelection: { selectedSpellIds: ["spell:bless"] } };
    const engine = resolveCharacterEngineState(snap, draft, { provider: "mpmb", rulesMode: "2024" });
    expect(engine.ruleEngine.effects.some((effect) => effect.sourceName === "Bless")).toBe(true);

    const afterCast = castSpell(draft.playState, runtime(), snap.spells.find((entry) => entry.name === "Bless")!, { trackConcentration: true }, "2026-05-10T10:00:00.000Z");
    expect(afterCast.activeEffects[0]?.sourceName).toBe("Bless");
    expect(activeEffectsForRollType(afterCast.activeEffects, "saving-throw")).toHaveLength(1);
    const ended = endConcentration(afterCast, "test", "2026-05-10T10:01:00.000Z");
    expect(ended.activeEffects[0]?.status).toBe("dismissed");

    const effect = afterCast.activeEffects[0];
    const result = executeRollRequest(
      {
        id: "roll:save",
        type: "saving-throw",
        label: "Strength Save",
        modifier: 2,
        temporaryModifiers: effect.modifiers,
        diceExpression: "1d20",
        rollMode: "normal",
      },
      { rng: rngFrom([0.45, 0.5]), now: "2026-05-10T10:02:00.000Z" },
    );
    expect(result.bonusDice?.[0]?.expression).toBe("1d4");
    expect(result.bonusDice?.[0]?.sourceName).toContain("Bless");
  });

  it("keeps mapping logic declarative and away from UI/runtime hook paths", () => {
    const mappingResolver = readFileSync("src/services/rules/ruleMappingResolver.ts", "utf8");
    const featureMappings = readFileSync("src/services/rules/mappings/featureMappings.ts", "utf8");
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");

    expect(mappingResolver).not.toMatch(/className\s*===|spellName\s*===|featureName\s*===/);
    expect(featureMappings).not.toMatch(/if\s*\(/);
    expect(sheetSource).toContain("useCharacterEngine");
    expect(sheetSource).toContain("useCharacterPlayState");
    expect(sheetSource).not.toMatch(/\b(eval|removeeval|changeeval|calcChanges)\b/);
  });
});

function rngFrom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? 0;
    index += 1;
    return value;
  };
}
