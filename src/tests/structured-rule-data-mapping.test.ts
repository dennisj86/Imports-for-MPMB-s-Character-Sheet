import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ClassDefinition, EquipmentDefinition, FeatDefinition, MpmContentSnapshot, SpellDefinition, SubclassDefinition } from "../domain/content";
import { createCharacterDraft } from "../domain/defaults";
import { buildCombatViewModel, buildFeatureGroupsViewModel, buildInventoryViewModel } from "../features/character/viewModels";
import { resolveCharacterEngineState } from "../services/characterEngine";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";
import { addActiveEffectFromSpell, addCustomActiveEffect, addResolvedActiveEffect, castSpell, dismissActiveEffect, endConcentration, rollAndRecord, type PlayStateRuntimeContext } from "../services/playState";
import { buildCharacterRollView, executeRollRequest } from "../services/rolls";
import { activeEffectsForRollType, buildActiveEffectCatalog, buildKnownUnmappedActiveEffectCatalog, buildWeaponAttackProfiles, resolveActiveEffectSpellCandidates, resolveRuleMappingContribution, searchActiveEffectCatalog, setRuleChoiceSelection } from "../services/rules";

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

const potionOfHeroism: EquipmentDefinition = {
  id: "equipment:potion-of-heroism",
  key: "potion-of-heroism",
  category: "magic-item",
  name: "Potion of Heroism",
  sourceRefs: ["test"],
  sourceMeta: TEST_SOURCE_META,
  description: "For 1 hour, the consumer is under the effect of the Bless spell (no concentration required).",
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

function bardClassDef(): ClassDefinition {
  return {
    id: "class:test-bard",
    key: "test-bard",
    name: "Test Bard",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    hitDie: 8,
    features: [
      {
        id: "feature:bardic-inspiration",
        key: "bardic-inspiration",
        name: "Bardic Inspiration",
        minLevel: 1,
        description: "A creature can add 1d6 to an ability check, attack roll, or saving throw.",
      },
    ],
  };
}

function warClericSubclassDef(): SubclassDefinition {
  return {
    id: "subclass:war-domain",
    key: "war-domain",
    classId: "class:mapping-fighter",
    classKey: "mapping-fighter",
    name: "War Domain",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    features: [
      {
        id: "feature:war-gods-blessing",
        key: "war-gods-blessing",
        name: "War God's Blessing",
        minLevel: 6,
        description: "As a reaction, a creature can gain a +10 bonus to an attack roll.",
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
    classes: [classDef(), bardClassDef()],
    subclasses: [warClericSubclassDef()],
    species: [{ id: "species:test", key: "test-species", name: "Test Species", sourceRefs: ["test"], sourceMeta: TEST_SOURCE_META }],
    backgrounds: [{ id: "background:test", key: "test-background", name: "Test Background", sourceRefs: ["test"], sourceMeta: TEST_SOURCE_META }],
    feats: [skilledFeat(), linguistFeat()],
    spells: [
      spell("Bless"),
      spell("Guidance", { level: 0 }),
      spell("Resistance", { level: 0 }),
      spell("Light", { level: 0, concentration: false }),
    ],
    equipment: [armor, longsword, longbow, greatsword, potionOfHeroism],
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

  it("replaces concentration-linked active effects when a new concentration spell is cast", () => {
    const snap = snapshot();
    const bless = snap.spells.find((entry) => entry.name === "Bless");
    const guidance = snap.spells.find((entry) => entry.name === "Guidance");
    expect(bless).toBeDefined();
    expect(guidance).toBeDefined();
    const draft = baseDraft();

    const afterBless = castSpell(draft.playState, runtime(), bless!, { trackConcentration: true }, "2026-05-10T11:00:00.000Z");
    expect(afterBless.activeEffects.some((effect) => effect.sourceName === "Bless" && effect.status === "active")).toBe(true);

    const afterGuidance = castSpell(afterBless, runtime(), guidance!, { trackConcentration: true }, "2026-05-10T11:01:00.000Z");
    expect(afterGuidance.activeEffects.some((effect) => effect.sourceName === "Bless" && effect.status === "active")).toBe(false);
    expect(afterGuidance.activeEffects.some((effect) => effect.sourceName === "Bless" && effect.status === "dismissed")).toBe(true);
    expect(afterGuidance.activeEffects.some((effect) => effect.sourceName === "Guidance" && effect.status === "active")).toBe(true);
  });

  it("allows external self buffs without requiring local concentration tracking", () => {
    const shieldOfFaith = spell("Shield of Faith", {
      level: 1,
      concentration: true,
      description: "A warded creature gains a +2 bonus to AC while the spell lasts.",
    });
    const snap = { ...snapshot(), spells: [...snapshot().spells, shieldOfFaith] };
    const draft = { ...baseDraft(), spellSelection: { selectedSpellIds: [shieldOfFaith.id] } };
    const engine = resolveCharacterEngineState(snap, draft, { provider: "mpmb", rulesMode: "2024" });

    const external = addActiveEffectFromSpell(draft.playState, shieldOfFaith, {
      target: "self",
      external: true,
      now: "2026-05-10T11:02:00.000Z",
    });
    const combat = buildCombatViewModel({ draft, engine, playState: external, maxHp: 20, hitDicePools: [] });
    expect(combat.armorClass.total).toBe(18);

    const afterEnd = endConcentration(external, "manual-check", "2026-05-10T11:03:00.000Z");
    const afterEndCombat = buildCombatViewModel({ draft, engine, playState: afterEnd, maxHp: 20, hitDicePools: [] });
    expect(afterEndCombat.armorClass.total).toBe(18);
  });

  it("builds external buff candidates from full spell catalog and includes mapped non-dice effects", () => {
    const shieldOfFaith = spell("Shield of Faith", {
      level: 1,
      concentration: true,
      description: "A warded creature gains a +2 bonus to AC while the spell lasts.",
    });
    const candidates = resolveActiveEffectSpellCandidates([
      ...snapshot().spells,
      shieldOfFaith,
    ]);
    expect(candidates.some((entry) => entry.spellName === "Bless")).toBe(true);
    expect(candidates.some((entry) => entry.spellName === "Guidance")).toBe(true);
    expect(candidates.some((entry) => entry.spellName === "Resistance")).toBe(true);
    expect(candidates.some((entry) => entry.spellName === "Shield of Faith")).toBe(true);
  });

  it("builds a source-agnostic active effect catalog across spells and features", () => {
    const catalog = buildActiveEffectCatalog(snapshot());
    expect(catalog.some((entry) => entry.sourceType === "spell" && entry.sourceName === "Bless" && entry.effectType === "roll-bonus")).toBe(true);
    expect(catalog.some((entry) => entry.sourceType === "class-feature" && entry.sourceName === "Bardic Inspiration" && entry.effectType === "roll-bonus")).toBe(true);
    expect(catalog.some((entry) => entry.sourceType === "subclass-feature" && entry.sourceName === "War God's Blessing" && entry.modifier.flat === 10)).toBe(true);
    expect(catalog.some((entry) => entry.sourceType === "item" && entry.sourceName === "Potion of Heroism" && entry.modifier.dice === "1d4")).toBe(true);
  });

  it("returns helpful diagnostics for unknown active effect searches", () => {
    const search = searchActiveEffectCatalog(buildActiveEffectCatalog(snapshot()), buildKnownUnmappedActiveEffectCatalog(), {
      query: "does-not-exist",
      sourceFilters: ["spells", "features"],
      effectFilter: "roll-bonus",
    });
    expect(search.matches).toEqual([]);
    expect(search.futureMatches).toEqual([]);
    expect(search.diagnostics.activeSourceFilters).toEqual(["spells", "features"]);
    expect(search.diagnostics.activeEffectFilter).toBe("roll-bonus");
    expect(search.diagnostics.searchedSourceTypes).toEqual(expect.arrayContaining(["spell", "class-feature", "subclass-feature", "feat"]));
    expect(search.diagnostics.mappedOnlyHint).toBe("Only mapped active effects are searchable.");
  });

  it("finds known unsupported future effects through normalized search and aliases", () => {
    const activeCatalog = buildActiveEffectCatalog(snapshot());
    const futureCatalog = buildKnownUnmappedActiveEffectCatalog();
    const search = searchActiveEffectCatalog(activeCatalog, futureCatalog, {
      query: "hero",
      sourceFilters: ["spells", "features", "items", "custom"],
      effectFilter: "all",
    });
    expect(search.futureMatches.some((entry) => entry.label === "Heroic Inspiration")).toBe(true);
    expect(search.matches.some((entry) => entry.label === "Heroic Inspiration")).toBe(false);
  });

  it("activates Bardic Inspiration as an external buff and consumes it only when selected on a roll", () => {
    const catalog = buildActiveEffectCatalog(snapshot());
    const bardic = catalog.find((entry) => entry.sourceName === "Bardic Inspiration");
    expect(bardic).toBeDefined();

    const activated = addResolvedActiveEffect(baseDraft().playState, bardic!.effect, {
      target: "self",
      external: true,
      diceExpression: "1d8",
      sourceCasterName: "Lyra",
      now: "2026-05-10T11:04:00.000Z",
    });
    const effect = activated.activeEffects.find((entry) => entry.sourceName === "Bardic Inspiration" && entry.status === "active");
    expect(effect?.label).toContain("Lyra");
    expect(effect?.modifierSummary?.dice).toBe("1d8");
    expect(activeEffectsForRollType(activated.activeEffects, "saving-throw").some((entry) => entry.id === effect?.id)).toBe(true);

    const withoutSelection = rollAndRecord(
      activated,
      runtime(),
      {
        id: "roll:save:no-bardic",
        type: "saving-throw",
        label: "Dex Save",
        modifier: 2,
        diceExpression: "1d20",
        rollMode: "normal",
      },
      { rng: rngFrom([0.45]), now: "2026-05-10T11:05:00.000Z" },
    );
    expect(withoutSelection.result.bonusDice).toEqual([]);
    expect(withoutSelection.playState.activeEffects.find((entry) => entry.id === effect?.id)?.status).toBe("active");

    const withSelection = rollAndRecord(
      activated,
      runtime(),
      {
        id: "roll:save:bardic",
        type: "saving-throw",
        label: "Dex Save",
        modifier: 2,
        diceExpression: "1d20",
        rollMode: "normal",
        temporaryModifiers: effect?.modifiers,
        selectedActiveEffectIds: effect ? [effect.id] : [],
        selectedActiveEffects: effect ? [{ id: effect.id, label: effect.label, sourceName: effect.sourceName }] : [],
      },
      { rng: rngFrom([0.45, 0.5]), now: "2026-05-10T11:06:00.000Z" },
    );
    expect(withSelection.result.bonusDice?.[0]?.expression).toBe("1d8");
    expect(withSelection.result.bonusDice?.[0]?.sourceName).toContain("Lyra");
    expect(withSelection.result.activeEffects?.[0]?.label).toContain("Lyra");
    expect(withSelection.playState.activeEffects.find((entry) => entry.id === effect?.id)?.status).toBe("dismissed");
    const rollEvent = withSelection.playState.playEvents.find((entry) => entry.type === "roll");
    expect(String(rollEvent?.payload.summary)).toContain("Bardic Inspiration");
    expect(String(rollEvent?.payload.summary)).toContain("1d8");
  });

  it("activates external Bless and Guidance without known or prepared spell dependencies", () => {
    const bless = snapshot().spells.find((entry) => entry.name === "Bless");
    const guidance = snapshot().spells.find((entry) => entry.name === "Guidance");
    expect(bless).toBeDefined();
    expect(guidance).toBeDefined();

    const draft = baseDraft();
    expect(draft.spellSelection.selectedSpellIds).not.toContain(bless?.id);
    expect(draft.spellSelection.selectedSpellIds).not.toContain(guidance?.id);

    const afterBless = addActiveEffectFromSpell(draft.playState, bless!, {
      target: "self",
      external: true,
      now: "2026-05-10T11:07:00.000Z",
    });
    const afterGuidance = addActiveEffectFromSpell(afterBless, guidance!, {
      target: "self",
      external: true,
      now: "2026-05-10T11:08:00.000Z",
    });
    expect(afterBless.activeEffects.some((effect) => effect.sourceName === "Bless" && effect.status === "active")).toBe(true);
    expect(afterGuidance.activeEffects.some((effect) => effect.sourceName === "Guidance" && effect.status === "active")).toBe(true);
  });

  it("creates, persists, applies, and dismisses a custom buff", () => {
    const custom = addCustomActiveEffect(baseDraft().playState, {
      name: "Lucky Push",
      applicableRollTypes: ["ability-check"],
      dice: "1d6",
      durationType: "manual",
      note: "Manual table bonus",
      now: "2026-05-10T11:09:00.000Z",
    });
    const effect = custom.activeEffects.find((entry) => entry.sourceName === "Lucky Push");
    expect(effect?.sourceType).toBe("custom");

    const rolled = rollAndRecord(
      custom,
      runtime(),
      {
        id: "roll:custom-buff",
        type: "ability-check",
        label: "Athletics Check",
        modifier: 3,
        diceExpression: "1d20",
        rollMode: "normal",
        temporaryModifiers: effect?.modifiers,
        selectedActiveEffectIds: effect ? [effect.id] : [],
        selectedActiveEffects: effect ? [{ id: effect.id, label: effect.label, sourceName: effect.sourceName }] : [],
      },
      { rng: rngFrom([0.4, 0.2]), now: "2026-05-10T11:10:00.000Z" },
    );
    expect(rolled.result.bonusDice?.[0]?.expression).toBe("1d6");
    expect(rolled.playState.activeEffects.find((entry) => entry.id === effect?.id)?.status).toBe("active");

    const dismissed = dismissActiveEffect(rolled.playState, effect!.id, "manual-check", "2026-05-10T11:11:00.000Z");
    expect(dismissed.activeEffects.find((entry) => entry.id === effect?.id)?.status).toBe("dismissed");

    const character = { ...baseDraft(), playState: custom };
    const [loaded] = deserializeCharacters(serializeCharacters([character]));
    expect(loaded?.playState.activeEffects[0]?.sourceName).toBe("Lucky Push");
  });

  it("uses structured base damage dice and versatile alternate dice", () => {
    const snap = snapshot();
    const quarterstaff: EquipmentDefinition = {
      id: "equipment:quarterstaff-structured",
      key: "quarterstaff-structured",
      category: "weapon",
      name: "Quarterstaff",
      sourceRefs: ["test"],
      sourceMeta: TEST_SOURCE_META,
      type: "simple melee weapon",
      description: "Versatile (1d8)",
      damage: [1, 6, "bludgeoning"],
    };
    const draft = {
      ...baseDraft(),
      inventory: {
        items: [
          {
            id: "quarterstaff-item",
            itemDefinitionId: quarterstaff.id,
            name: quarterstaff.name,
            quantity: 1,
            equipped: true,
          },
        ],
      },
    };
    const engine = resolveCharacterEngineState(snap, draft, { provider: "mpmb", rulesMode: "2024" });
    const profile = buildWeaponAttackProfiles({
      draft,
      equipmentCatalog: [...snap.equipment, quarterstaff],
      derivedStats: engine.derivedStats,
      modifiers: engine.ruleEngine.modifiers,
    }).find((entry) => entry.itemDefinitionId === quarterstaff.id);
    expect(profile?.damageDice).toBe("1d6");
    expect(profile?.versatileDamageDice).toBe("1d8");
  });

  it("does not apply Shield of Faith AC from preparation and only applies it as a self-targeted concentration effect", () => {
    const shieldOfFaith = spell("Shield of Faith", {
      level: 1,
      concentration: true,
      description: "A warded creature gains a +2 bonus to AC while the spell lasts.",
    });
    const snap = { ...snapshot(), spells: [...snapshot().spells, shieldOfFaith] };
    const draft = { ...baseDraft(), spellSelection: { selectedSpellIds: [shieldOfFaith.id] } };
    const engine = resolveCharacterEngineState(snap, draft, { provider: "mpmb", rulesMode: "2024" });

    expect(engine.ruleEngine.modifiers.some((modifier) => modifier.sourceName === "Shield of Faith" && modifier.target === "armor-class")).toBe(false);
    expect(engine.derivedStats.armorClass.value).toBe(16);

    const castOnOther = castSpell(draft.playState, runtime(), shieldOfFaith, { trackConcentration: true }, "2026-05-10T10:10:00.000Z");
    const otherCombat = buildCombatViewModel({ draft, engine, playState: castOnOther, maxHp: 20, hitDicePools: [] });
    expect(otherCombat.armorClass.total).toBe(16);

    const castOnSelf = castSpell(
      draft.playState,
      runtime(),
      shieldOfFaith,
      { trackConcentration: true, activeEffectTarget: "self" },
      "2026-05-10T10:11:00.000Z",
    );
    const selfCombat = buildCombatViewModel({ draft, engine, playState: castOnSelf, maxHp: 20, hitDicePools: [] });
    expect(selfCombat.armorClass.total).toBe(18);
    expect(selfCombat.armorClass.modifierSources).toContain("Shield of Faith +2");

    const ended = endConcentration(castOnSelf, "test", "2026-05-10T10:12:00.000Z");
    const endedCombat = buildCombatViewModel({ draft, engine, playState: ended, maxHp: 20, hitDicePools: [] });
    expect(endedCombat.armorClass.total).toBe(16);
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
