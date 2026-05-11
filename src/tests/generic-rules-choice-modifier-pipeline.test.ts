import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CharacterDraft } from "../domain/character";
import type { ClassDefinition, EquipmentDefinition, FeatDefinition, MpmContentSnapshot, SpellDefinition } from "../domain/content";
import { createCharacterDraft } from "../domain/defaults";
import type { DerivedCharacterStats, SkillKey } from "../domain/derivedStats";
import { createDefaultCharacterPlayState } from "../domain/playState";
import type { RuleModifier } from "../domain/rules";
import { resolveCharacterEngineState, resolveCharacterWizardState } from "../services/characterEngine";
import { resolveArmorClassFromEquipment } from "../services/equipment";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";
import { castSpell, endConcentration, type PlayStateRuntimeContext } from "../services/playState";
import { createActiveEffectFromSpell, instantiateActiveEffect, resolveCharacterRuleEngine, setRuleChoiceSelection } from "../services/rules";
import { executeRollRequest } from "../services/rolls";
import { buildWeaponAttackProfiles } from "../services/rules";

const TEST_SOURCE_META = {
  sourceSystem: "mpmb",
  sourceDocumentKey: "test",
  sourceDocumentName: "Test Rules",
  edition: "2024",
  importPreset: "mpmb-local",
  rawSourceRef: "test",
} as const;

function createDerivedStats(): DerivedCharacterStats {
  const abilityScores = {
    str: { ability: "str", baseScore: 16, appliedBonus: 0, finalScore: 16, modifier: 3, notes: [] },
    dex: { ability: "dex", baseScore: 14, appliedBonus: 0, finalScore: 14, modifier: 2, notes: [] },
    con: { ability: "con", baseScore: 12, appliedBonus: 0, finalScore: 12, modifier: 1, notes: [] },
    int: { ability: "int", baseScore: 10, appliedBonus: 0, finalScore: 10, modifier: 0, notes: [] },
    wis: { ability: "wis", baseScore: 10, appliedBonus: 0, finalScore: 10, modifier: 0, notes: [] },
    cha: { ability: "cha", baseScore: 10, appliedBonus: 0, finalScore: 10, modifier: 0, notes: [] },
  } as DerivedCharacterStats["abilityScores"];
  return {
    abilityScores,
    proficiencyBonus: 2,
    savingThrows: {
      str: { ability: "str", proficient: true, abilityModifier: 3, proficiencyBonus: 2, total: 5 },
      dex: { ability: "dex", proficient: false, abilityModifier: 2, proficiencyBonus: 0, total: 2 },
      con: { ability: "con", proficient: true, abilityModifier: 1, proficiencyBonus: 2, total: 3 },
      int: { ability: "int", proficient: false, abilityModifier: 0, proficiencyBonus: 0, total: 0 },
      wis: { ability: "wis", proficient: false, abilityModifier: 0, proficiencyBonus: 0, total: 0 },
      cha: { ability: "cha", proficient: false, abilityModifier: 0, proficiencyBonus: 0, total: 0 },
    },
    skills: {
      athletics: { key: "athletics", label: "Athletics", ability: "str", proficient: true, expertise: false, abilityModifier: 3, proficiencyBonus: 2, total: 5 },
      stealth: { key: "stealth", label: "Stealth", ability: "dex", proficient: false, expertise: false, abilityModifier: 2, proficiencyBonus: 0, total: 2 },
    } as Record<SkillKey, DerivedCharacterStats["skills"][SkillKey]>,
    passivePerception: 10,
    passiveInvestigation: 10,
    passiveInsight: 10,
    initiative: 2,
    speed: { walking: 30, notes: [], dataStatus: "complete" },
    armorClass: { value: 12, calculation: "unarmored", dexApplied: 2, notes: [], dataStatus: "complete" },
    hitPoints: { max: 11, formula: "fixed", mode: "fixed-average", notes: [], dataStatus: "complete" },
    spellcasting: {
      available: true,
      ability: "cha",
      abilityModifier: 0,
      proficiencyBonus: 2,
      spellSaveDC: 10,
      spellAttackModifier: 2,
      preparationBasis: { mode: "known", notes: [] },
      slotBasis: { mode: "none", notes: [] },
      notes: [],
      dataStatus: "complete",
    },
    notes: [],
    pending: [],
    dataStatus: "complete",
  };
}

function sourceClass(): ClassDefinition {
  return {
    id: "class:test-fighter",
    key: "test-fighter-2024",
    name: "Test Fighter",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    hitDie: 10,
    features: [
      {
        id: "feature:test-style",
        key: "test-style",
        name: "Style Choice",
        minLevel: 1,
        description: "Choose one: Alpha Style, Beta Style.",
      },
    ],
  };
}

function feat(): FeatDefinition {
  return {
    id: "feat:test-feat",
    key: "test-feat",
    name: "Test Feat",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    description: "Choose one: Acrobatics, Athletics.",
  };
}

function spell(overrides: Partial<SpellDefinition> = {}): SpellDefinition {
  return {
    id: "spell:test-bonus",
    key: "test-bonus",
    name: "Test Bonus",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    level: 0,
    concentration: true,
    ritual: false,
    classes: ["test-fighter"],
    description: "You can add 1d4 to an attack roll or saving throw.",
    ...overrides,
  };
}

function weapon(): EquipmentDefinition {
  return {
    id: "equipment:test-longsword",
    key: "test-longsword",
    category: "weapon",
    name: "Test Longsword",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    type: "martial melee weapon",
    description: "Melee weapon, 1d8 slashing, versatile (1d10).",
  };
}

function ruleModifier(overrides: Partial<RuleModifier>): RuleModifier {
  return {
    id: "rule-modifier:test",
    sourceDescriptorId: "rule-source:test",
    sourceName: "Test Source",
    sourceType: "custom",
    target: "other",
    valueType: "flat",
    value: 1,
    condition: "always",
    diagnostics: [],
    ...overrides,
  };
}

function runtime(): PlayStateRuntimeContext {
  return {
    maxHp: 11,
    constitutionModifier: 1,
    hitDicePools: [],
    resourceMaxByKey: {},
    resourceRechargeByKey: {},
    resourceNameByKey: {},
    spellSlotMaxByKey: {},
    spellSlotRechargeByKey: {},
    restPlan: {
      shortRest: { resourceKeys: [], spellSlotKeys: [], skipped: [], notes: [] },
      longRest: { resourceKeys: [], spellSlotKeys: [], skipped: [], notes: [] },
    },
  };
}

function customSnapshot(): MpmContentSnapshot {
  const classDef = sourceClass();
  return {
    meta: { generatedAt: "2026-05-09T00:00:00.000Z", sourceFiles: [], parseErrors: [] },
    sources: [],
    classes: [classDef],
    subclasses: [],
    species: [{ id: "species:test", key: "test-species", name: "Test Species", sourceRefs: ["test"], sourceMeta: TEST_SOURCE_META }],
    backgrounds: [{ id: "background:test", key: "test-background", name: "Test Background", sourceRefs: ["test"], sourceMeta: TEST_SOURCE_META }],
    feats: [feat()],
    spells: [spell()],
    equipment: [weapon()],
  };
}

describe("generic rules choice + modifier pipeline v1", () => {
  it("creates descriptors for class features, feats, items and spells without source-specific handlers", () => {
    const draft = createCharacterDraft("rule-descriptors", "Rule Descriptors");
    const item = weapon();
    draft.featIds = ["feat:test-feat"];
    draft.spellSelection.selectedSpellIds = ["spell:test-bonus"];
    draft.inventory.items = [{ id: "item:test-longsword", itemDefinitionId: item.id, name: item.name, quantity: 1, equipped: true }];

    const ruleEngine = resolveCharacterRuleEngine({
      draft,
      classDef: sourceClass(),
      selectedFeats: [feat()],
      selectedSpells: [spell()],
      equipmentCatalog: [item],
    });

    expect(ruleEngine.sources.map((entry) => entry.sourceType)).toEqual(expect.arrayContaining(["class-feature", "feat", "item", "spell"]));
    expect(ruleEngine.choices.some((choice) => choice.choiceType === "feature-option" && choice.status === "pending")).toBe(true);
    expect(ruleEngine.diagnostics.every((entry) => typeof entry === "string")).toBe(true);
  });

  it("persists generic rule choices and blocks invalid over-selection", () => {
    const draft = createCharacterDraft("rule-choice", "Rule Choice");
    const [choice] = resolveCharacterRuleEngine({ draft, classDef: sourceClass() }).choices;
    expect(choice).toBeDefined();
    expect(choice.status).toBe("pending");

    const rejected = setRuleChoiceSelection(draft, choice, choice.options.map((option) => option.id));
    expect(rejected.ruleChoices?.[choice.id]).toBeUndefined();

    const completed = setRuleChoiceSelection(draft, choice, [choice.options[0].id], "2026-05-09T10:00:00.000Z");
    expect(completed.ruleChoices?.[choice.id]?.status).toBe("complete");
    const [roundTrip] = deserializeCharacters(serializeCharacters([completed]));
    expect(roundTrip?.ruleChoices?.[choice.id]?.selectedOptionIds).toEqual([choice.options[0].id]);
  });

  it("feeds generic pending choices into builder validation and review", () => {
    const snapshot = customSnapshot();
    const draft = createCharacterDraft("builder-rule-choice", "Builder Rule Choice");
    draft.classSelection.classId = "class:test-fighter";
    draft.speciesSelection.speciesId = "species:test";
    draft.backgroundSelection.backgroundId = "background:test";

    const pending = resolveCharacterWizardState(snapshot, draft, { provider: "mpmb", rulesMode: "2024" });
    expect(pending.validations.feats.errors.some((entry) => entry.includes("choice is incomplete"))).toBe(true);
    expect(pending.validations.review.errors).toContain("Generic rule choices are incomplete.");

    const [choice] = resolveCharacterEngineState(snapshot, draft, { provider: "mpmb", rulesMode: "2024" }).ruleEngine.choices;
    const completedDraft = setRuleChoiceSelection(draft, choice, [choice.options[0].id]);
    const completed = resolveCharacterWizardState(snapshot, completedDraft, { provider: "mpmb", rulesMode: "2024" });
    expect(completed.validations.feats.errors.some((entry) => entry.includes("choice is incomplete"))).toBe(false);
  });

  it("applies permanent AC modifiers conditionally and reports non-applied diagnostics", () => {
    const draft = createCharacterDraft("ac-modifier", "AC Modifier");
    draft.inventory.items = [{ id: "shield", name: "Shield", quantity: 1, equipped: true, equipmentSlot: "shield", category: "armor" }];
    const shieldOnly = resolveArmorClassFromEquipment({
      inventoryItems: draft.inventory.items,
      equipmentCatalog: [],
      dexModifier: 0,
      ruleModifiers: [
        ruleModifier({ id: "ac:shield", sourceName: "Shielded Style", target: "armor-class", value: 1, condition: "shield-equipped" }),
        ruleModifier({ id: "ac:armor", sourceName: "Armored Style", target: "armor-class", value: 1, condition: "wearing-armor" }),
      ],
    });

    expect(shieldOnly.total).toBe(13);
    expect(shieldOnly.modifierSources).toContain("Shielded Style +1");
    expect(shieldOnly.warnings.some((entry) => entry.includes("Armored Style"))).toBe(true);
  });

  it("builds weapon attack and damage profiles with ability modifiers and without proficiency in damage", () => {
    const draft = createCharacterDraft("weapon-profile", "Weapon Profile");
    const item = weapon();
    draft.inventory.items = [{ id: "longsword-instance", itemDefinitionId: item.id, name: item.name, quantity: 1, equipped: true }];
    const profiles = buildWeaponAttackProfiles({
      draft,
      equipmentCatalog: [item],
      derivedStats: createDerivedStats(),
      modifiers: [
        ruleModifier({ id: "weapon-attack:+1", sourceName: "Accurate Grip", target: "weapon-attack", value: 1, condition: "weapon-equipped" }),
        ruleModifier({ id: "weapon-damage:+2", sourceName: "Heavy Strike", target: "weapon-damage", value: 2, condition: "weapon-equipped" }),
      ],
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].attackBonus).toBe(6);
    expect(profiles[0].damageModifier).toBe(5);
    expect(profiles[0].breakdown.damage.join(" ")).not.toContain("Proficiency");
    expect(profiles[0].appliedAttackModifiers[0]?.sourceName).toBe("Accurate Grip");
    expect(profiles[0].appliedDamageModifiers[0]?.sourceName).toBe("Heavy Strike");
  });

  it("stores concentration-linked active effects in playState and dismisses them with concentration", () => {
    const base = createDefaultCharacterPlayState("active-effect-character", { maxHp: 11, now: "2026-05-09T10:00:00.000Z" });
    const afterCast = castSpell(base, runtime(), spell(), { trackConcentration: true }, "2026-05-09T10:01:00.000Z");

    expect(afterCast.activeEffects).toHaveLength(1);
    expect(afterCast.activeEffects[0].applicableRollTypes).toEqual(expect.arrayContaining(["attack-roll", "saving-throw"]));
    expect(afterCast.playEvents.some((event) => event.type === "active-effect-start")).toBe(true);

    const ended = endConcentration(afterCast, "test", "2026-05-09T10:02:00.000Z");
    expect(ended.activeEffects[0].status).toBe("dismissed");
  });

  it("executes rolls with permanent and temporary modifier breakdowns plus bonus dice", () => {
    const result = executeRollRequest(
      {
        id: "roll:generic",
        type: "attack-roll",
        label: "Generic Attack",
        modifier: 0,
        baseModifier: 3,
        permanentModifiers: [ruleModifier({ id: "attack:+1", sourceName: "Permanent Accuracy", target: "weapon-attack", value: 1 })],
        temporaryModifiers: [ruleModifier({ id: "blessing:1d4", sourceName: "Optional Bonus", valueType: "dice", value: "1d4" })],
        diceExpression: "1d20",
        rollMode: "advantage",
      },
      { rng: rngFrom([0.5, 0.95, 0.05]), now: "2026-05-09T10:03:00.000Z" },
    );

    expect(result.dice.rawRolls).toEqual([20, 2]);
    expect(result.naturalRoll).toBe(20);
    expect(result.outcomeLabel).toBe("natural-20");
    expect(result.baseModifier).toBe(3);
    expect(result.permanentModifierBreakdown?.[0]?.sourceName).toBe("Permanent Accuracy");
    expect(result.temporaryModifierBreakdown?.[0]?.sourceName).toBe("Optional Bonus");
    expect(result.bonusDice?.[0]?.rolls).toEqual([3]);
    expect(result.total).toBe(27);
  });

  it("persists active effects without introducing a second roll history", () => {
    const draft = createCharacterDraft("persist-active-effect", "Persist Active Effect");
    const effect = createActiveEffectFromSpell(spell());
    expect(effect).toBeDefined();
    const effectState = instantiateActiveEffect(effect!, "2026-05-09T10:04:00.000Z");
    const character: CharacterDraft = {
      ...draft,
      playState: {
        ...draft.playState,
        activeEffects: [effectState],
      },
    };

    const [loaded] = deserializeCharacters(serializeCharacters([character]));
    expect(loaded?.playState.activeEffects[0]?.sourceName).toBe("Test Bonus");
    expect(loaded?.playState.playEvents).toEqual([]);
  });

  it("keeps guardrails for generic implementation boundaries", () => {
    const ruleServiceSource = readFileSync("src/services/rules/ruleDescriptors.ts", "utf8");
    const rollPanelSource = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");

    expect(ruleServiceSource).not.toMatch(/className\s*===|spellName\s*===|featureName\s*===/);
    expect(rollPanelSource).not.toContain("Math.random");
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
