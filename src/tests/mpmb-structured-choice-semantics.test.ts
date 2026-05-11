import { describe, expect, it } from "vitest";
import type { CharacterDraft } from "../domain/character";
import type { ClassDefinition, EquipmentDefinition, FeatDefinition, MpmContentSnapshot, SourceMeta, SpellDefinition } from "../domain/content";
import { createCharacterDraft } from "../domain/defaults";
import { getFeats } from "../services/data/adapter";
import { resolveCharacterEngineState, resolveCharacterWizardState } from "../services/characterEngine";
import { setRuleChoiceSelection } from "../services/rules";

const SOURCE_META: SourceMeta = {
  sourceSystem: "mpmb",
  sourceDocumentKey: "test",
  sourceDocumentName: "Test Rules",
  edition: "2024",
  importPreset: "mpmb-local",
  rawSourceRef: "test",
};

function spell(name: string, level: number, classes: string[]): SpellDefinition {
  return {
    id: `spell:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    sourceRefs: ["test"],
    sourceMeta: SOURCE_META,
    level,
    concentration: false,
    ritual: false,
    classes,
    description: "Structured choice filtering test spell.",
  };
}

function weapon(id: string, name: string, overrides: Partial<EquipmentDefinition> = {}): EquipmentDefinition {
  return {
    id,
    key: id,
    category: "weapon",
    name,
    sourceRefs: ["test"],
    sourceMeta: SOURCE_META,
    type: "Martial",
    weaponList: "melee",
    damage: [1, 8, "slashing"],
    mastery: "Sap",
    ...overrides,
  };
}

function magicInitiateFeat(): FeatDefinition {
  return {
    id: "feat:magic-initiate",
    key: "magic initiate",
    name: "Magic Initiate",
    sourceRefs: ["test"],
    sourceMeta: SOURCE_META,
    description: "Pick Cleric, Druid, or Wizard.",
    structuredData: {
      choices: ["Cleric", "Druid", "Wizard"],
      cleric: {
        spellcastingAbility: [4, 5, 6],
        spellcastingBonus: [
          { name: "Cantrip", class: "cleric", level: [0, 0], times: 2 },
          { name: "1st-Level", class: "cleric", level: [1, 1], firstCol: "oncelr+markedbox" },
        ],
      },
      druid: {
        spellcastingAbility: [4, 5, 6],
        spellcastingBonus: [
          { name: "Cantrip", class: "druid", level: [0, 0], times: 2 },
          { name: "1st-Level", class: "druid", level: [1, 1], firstCol: "oncelr+markedbox" },
        ],
      },
      wizard: {
        spellcastingAbility: [4, 5, 6],
        spellcastingBonus: [
          { name: "Cantrip", class: "wizard", level: [0, 0], times: 2 },
          { name: "1st-Level", class: "wizard", level: [1, 1], firstCol: "oncelr+markedbox" },
        ],
      },
    },
  };
}

function classWithFeature(feature: ClassDefinition["features"][number]): ClassDefinition {
  return {
    id: "class:test-class",
    key: "test-class",
    name: "Test Class",
    sourceRefs: ["test"],
    sourceMeta: SOURCE_META,
    hitDie: 8,
    features: [feature],
  };
}

function snapshot(overrides: Partial<MpmContentSnapshot> = {}): MpmContentSnapshot {
  return {
    meta: { generatedAt: "2026-05-10T00:00:00.000Z", sourceFiles: [], parseErrors: [] },
    sources: [],
    classes: [],
    subclasses: [],
    species: [{ id: "species:test", key: "test-species", name: "Test Species", sourceRefs: ["test"], sourceMeta: SOURCE_META }],
    backgrounds: [{ id: "background:test", key: "test-background", name: "Test Background", sourceRefs: ["test"], sourceMeta: SOURCE_META }],
    feats: [],
    spells: [
      spell("Cleric Cantrip A", 0, ["cleric"]),
      spell("Cleric Cantrip B", 0, ["cleric"]),
      spell("Cleric First", 1, ["cleric"]),
      spell("Druid Cantrip", 0, ["druid"]),
      spell("Druid First", 1, ["druid"]),
      spell("Wizard Cantrip", 0, ["wizard"]),
      spell("Wizard First", 1, ["wizard"]),
      ...Array.from({ length: 24 }, (_, index) => spell(`Unrelated Spell ${index + 1}`, index % 2, ["bard"])),
    ],
    equipment: [
      weapon("weapon:longsword", "Longsword", { mastery: "Sap" }),
      weapon("weapon:javelin", "Javelin", { weaponList: "ranged", damage: [1, 6, "piercing"], mastery: "Slow" }),
    ],
    ...overrides,
  };
}

function draft(id = "mpmb-choice-semantics"): CharacterDraft {
  const draftValue = createCharacterDraft(id, "Structured Choices");
  draftValue.provider = "mpmb";
  draftValue.rulesMode = "2024";
  draftValue.speciesSelection.speciesId = "species:test";
  draftValue.backgroundSelection.backgroundId = "background:test";
  return draftValue;
}

function choiceByType(engine: ReturnType<typeof resolveCharacterEngineState>, type: string, sourceName?: string) {
  return engine.ruleEngine.choices.find((choice) =>
    choice.choiceType === type && (!sourceName || engine.ruleEngine.sources.find((source) => source.id === choice.sourceDescriptorId)?.sourceName.includes(sourceName))
  );
}

function canonicalChoiceByType(engine: ReturnType<typeof resolveCharacterEngineState>, type: string, sourceName?: string) {
  return engine.ruleEngine.choiceSurface.choices.find((choice) => choice.choiceType === type && (!sourceName || choice.sourceName.includes(sourceName)));
}

describe("MPMB structured choice semantics v1", () => {
  it("keeps resolved 2024 Magic Initiate backed by structured MPMB choice data", () => {
    const magicInitiate = getFeats({ provider: "mpmb", rulesMode: "2024" }).find((feat) => feat.key === "magic initiate");

    expect(magicInitiate?.structuredData).toMatchObject({
      choices: ["Cleric", "Druid", "Wizard"],
    });
  });

  it("models Magic Initiate as parent and filtered child spell choices instead of global spell lists", () => {
    const snap = snapshot({ feats: [magicInitiateFeat()] });
    const baseDraft = { ...draft(), featIds: ["feat:magic-initiate"] };
    const before = resolveCharacterEngineState(snap, baseDraft, { provider: "mpmb", rulesMode: "2024" });
    const parent = choiceByType(before, "feature-option", "Magic Initiate");

    expect(parent?.options.map((option) => option.id)).toEqual(["cleric", "druid", "wizard"]);
    expect(before.ruleEngine.choices.some((choice) => choice.choiceType === "cantrip")).toBe(false);
    expect(before.ruleEngine.choices.some((choice) => choice.choiceType === "spell")).toBe(false);

    const withCleric = setRuleChoiceSelection(baseDraft, parent!, ["cleric"]);
    const clericEngine = resolveCharacterEngineState(snap, withCleric, { provider: "mpmb", rulesMode: "2024" });
    const ability = choiceByType(clericEngine, "ability-score", "Magic Initiate");
    const cantrips = choiceByType(clericEngine, "cantrip", "Magic Initiate");
    const levelOne = choiceByType(clericEngine, "spell", "Magic Initiate");

    expect(ability?.parentChoiceId).toBe(parent?.id);
    expect(ability?.options.map((option) => option.id)).toEqual(["int", "wis", "cha"]);
    expect(cantrips?.requiredCount).toBe(2);
    expect(cantrips?.options.map((option) => option.label)).toEqual(["Cleric Cantrip A", "Cleric Cantrip B"]);
    expect(levelOne?.requiredCount).toBe(1);
    expect(levelOne?.options.map((option) => option.label)).toEqual(["Cleric First"]);
    expect(cantrips?.options.length).toBeLessThan(snap.spells.length);

    const completedDraft = [ability!, cantrips!, levelOne!].reduce(
      (current, choice) => {
        if (choice.choiceType === "ability-score") return setRuleChoiceSelection(current, choice, ["wis"]);
        if (choice.choiceType === "cantrip") return setRuleChoiceSelection(current, choice, choice.options.map((option) => option.id));
        return setRuleChoiceSelection(current, choice, [choice.options[0].id]);
      },
      withCleric,
    );
    const completedEngine = resolveCharacterEngineState(snap, completedDraft, { provider: "mpmb", rulesMode: "2024" });
    expect(choiceByType(completedEngine, "ability-score", "Magic Initiate")?.status).toBe("complete");
    expect(choiceByType(completedEngine, "cantrip", "Magic Initiate")?.status).toBe("complete");
    expect(choiceByType(completedEngine, "spell", "Magic Initiate")?.status).toBe("complete");

    const withWizard = setRuleChoiceSelection(completedDraft, parent!, ["wizard"]);
    const wizardEngine = resolveCharacterEngineState(snap, withWizard, { provider: "mpmb", rulesMode: "2024" });
    const wizardCantrips = choiceByType(wizardEngine, "cantrip", "Magic Initiate");
    const wizardSpell = choiceByType(wizardEngine, "spell", "Magic Initiate");
    expect(wizardCantrips?.options.map((option) => option.label)).toEqual(["Wizard Cantrip"]);
    expect(wizardCantrips?.selectedOptionIds).toEqual([]);
    expect(wizardSpell?.options.map((option) => option.label)).toEqual(["Wizard First"]);
  });

  it("uses the same spellcastingBonus graph for Blessed Warrior and Druidic Warrior style options", () => {
    const feature = {
      id: "feature:fighting-style",
      key: "fighting-style",
      name: "Fighting Style",
      minLevel: 1,
      description: "Choose a fighting style.",
      structuredData: {
        choicesFightingStyles: true,
        choices: ["Blessed Warrior", "Druidic Warrior"],
        "blessed warrior": {
          spellcastingAbility: 6,
          spellcastingBonus: [{ name: "Cantrip", class: "cleric", level: [0, 0], times: 2 }],
        },
        "druidic warrior": {
          spellcastingAbility: 5,
          spellcastingBonus: [{ name: "Cantrip", class: "druid", level: [0, 0], times: 2 }],
        },
      },
    };
    const classDef = classWithFeature(feature);
    const snap = snapshot({ classes: [classDef] });
    const baseDraft = { ...draft("warrior-style"), classSelection: { classId: classDef.id, level: 1 } };
    const rootEngine = resolveCharacterEngineState(snap, baseDraft, { provider: "mpmb", rulesMode: "2024" });
    const style = choiceByType(rootEngine, "fighting-style", "Fighting Style");

    expect(style?.options.map((option) => option.id)).toEqual(expect.arrayContaining(["defense", "blessed-warrior", "druidic-warrior"]));
    expect(choiceByType(rootEngine, "feature-option", "Fighting Style")).toBeUndefined();
    expect(rootEngine.ruleEngine.choices.some((choice) => choice.choiceType === "cantrip")).toBe(false);

    const defenseDraft = setRuleChoiceSelection(baseDraft, style!, ["defense"]);
    const defenseEngine = resolveCharacterEngineState(snap, defenseDraft, { provider: "mpmb", rulesMode: "2024" });
    expect(canonicalChoiceByType(defenseEngine, "fighting-style", "Fighting Style")?.status).toBe("complete");
    expect(choiceByType(defenseEngine, "feature-option", "Fighting Style")).toBeUndefined();
    expect(defenseEngine.ruleEngine.choices.filter((choice) => choice.choiceType === "fighting-style")).toHaveLength(1);

    const blessedDraft = setRuleChoiceSelection(baseDraft, style!, ["blessed-warrior"]);
    const blessedEngine = resolveCharacterEngineState(snap, blessedDraft, { provider: "mpmb", rulesMode: "2024" });
    expect(canonicalChoiceByType(blessedEngine, "fighting-style", "Fighting Style")?.status).toBe("pending");
    expect(choiceByType(blessedEngine, "cantrip", "Fighting Style")?.options.map((option) => option.label)).toEqual([
      "Cleric Cantrip A",
      "Cleric Cantrip B",
    ]);
    expect(choiceByType(blessedEngine, "cantrip", "Fighting Style")?.parentChoiceId).toBe(style?.id);

    const druidicDraft = setRuleChoiceSelection(baseDraft, style!, ["druidic-warrior"]);
    const druidicEngine = resolveCharacterEngineState(snap, druidicDraft, { provider: "mpmb", rulesMode: "2024" });
    expect(choiceByType(druidicEngine, "cantrip", "Fighting Style")?.options.map((option) => option.label)).toEqual(["Druid Cantrip"]);
  });

  it("applies deterministic option-scoped MPMB fields through the central apply path", () => {
    const structuredFeat: FeatDefinition = {
      id: "feat:structured-option",
      key: "structured option",
      name: "Structured Option",
      sourceRefs: ["test"],
      sourceMeta: SOURCE_META,
      description: "Choose an option.",
      structuredData: {
        choices: ["Agile"],
        agile: {
          skills: ["Acrobatics"],
          scores: [0, 1, 0, 0, 0, 0],
          addMod: [{ type: "skill", field: "Init", mod: "prof" }],
        },
      },
    };
    const snap = snapshot({ feats: [structuredFeat] });
    const baseDraft = { ...draft("option-diagnostics"), featIds: [structuredFeat.id] };
    const engine = resolveCharacterEngineState(snap, baseDraft, { provider: "mpmb", rulesMode: "2024" });
    const parent = choiceByType(engine, "feature-option", "Structured Option");

    const selected = setRuleChoiceSelection(baseDraft, parent!, ["agile"]);
    const selectedEngine = resolveCharacterEngineState(snap, selected, { provider: "mpmb", rulesMode: "2024" });
    expect(selectedEngine.derivedStats.skills.acrobatics.proficient).toBe(true);
    expect(selectedEngine.derivedStats.abilityScores.dex.finalScore).toBe(baseDraft.abilityScores.dex + 1);
    expect(selectedEngine.derivedStats.initiative).toBe(selectedEngine.derivedStats.abilityScores.dex.modifier + selectedEngine.derivedStats.proficiencyBonus);
    expect(selectedEngine.ruleEngine.optionScoped.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "skills", status: "applied" }),
      expect.objectContaining({ field: "scores", status: "applied" }),
      expect.objectContaining({ field: "addMod", status: "applied" }),
    ]));
  });

  it("uses structured MPMB weapon mastery counts and keeps review blocked until child counts are satisfied", () => {
    const classDef = classWithFeature({
      id: "feature:weapon-mastery",
      key: "weapon-mastery",
      name: "Weapon Mastery",
      minLevel: 1,
      description: "Select weapon mastery choices.",
      structuredData: {
        choicesWeaponMasteries: true,
        extraTimes: 2,
      },
    });
    const snap = snapshot({ classes: [classDef] });
    const baseDraft = { ...draft("weapon-mastery"), classSelection: { classId: classDef.id, level: 1 } };
    const engine = resolveCharacterEngineState(snap, baseDraft, { provider: "mpmb", rulesMode: "2024" });
    const mastery = choiceByType(engine, "weapon-mastery", "Weapon Mastery");

    expect(mastery?.requiredCount).toBe(2);
    expect(mastery?.options.map((option) => option.id)).toEqual(["weapon:javelin", "weapon:longsword"]);
    expect(mastery?.options.every((option) => option.optionType === "weapon-mastery")).toBe(true);
    expect(mastery?.options.find((option) => option.id === "weapon:longsword")?.metadata?.masteryLabel).toBe("Sap");

    const oneSelected = setRuleChoiceSelection(baseDraft, mastery!, ["weapon:longsword"]);
    const oneEngine = resolveCharacterEngineState(snap, oneSelected, { provider: "mpmb", rulesMode: "2024" });
    expect(choiceByType(oneEngine, "weapon-mastery", "Weapon Mastery")?.status).toBe("pending");
    expect(resolveCharacterWizardState(snap, oneSelected, { provider: "mpmb", rulesMode: "2024" }).validations.review.blocked).toBe(true);

    const twoSelected = setRuleChoiceSelection(baseDraft, mastery!, ["weapon:longsword", "weapon:javelin"]);
    const twoEngine = resolveCharacterEngineState(snap, twoSelected, { provider: "mpmb", rulesMode: "2024" });
    expect(choiceByType(twoEngine, "weapon-mastery", "Weapon Mastery")?.status).toBe("complete");
  });

  it("uses weapon option sources for Weapon Mastery instead of spell-like catalog entries", () => {
    const classDef = classWithFeature({
      id: "feature:weapon-mastery-source",
      key: "weapon-mastery-source",
      name: "Weapon Mastery",
      minLevel: 1,
      description: "Select weapon mastery choices.",
      structuredData: {
        choicesWeaponMasteries: true,
        extraTimes: 2,
      },
    });
    const snap = snapshot({
      classes: [classDef],
      equipment: [
        weapon("weapon:longsword", "Longsword", { mastery: "Sap" }),
        weapon("weapon:battleaxe", "Battleaxe", { mastery: "Topple" }),
        weapon("weapon:club", "Club", { type: "Simple", damage: [1, 4, "bludgeoning"], mastery: "Slow" }),
        weapon("magic-item:talking-sword", "Talking Sword", {
          type: "Weapon",
          damage: { source: "magic-item" },
          sourceMeta: { ...SOURCE_META, rawSourceRef: "magic item:talking sword" },
        }),
        weapon("spell-attack:acid-splash", "Acid Splash", { type: "Cantrip", damage: [1, 6, "acid"], mastery: "" }),
        weapon("spell-attack:fire-bolt", "Fire Bolt", { type: "Cantrip", damage: [1, 10, "fire"], mastery: "" }),
        weapon("spell-attack:booming-blade", "Booming Blade", { type: "Cantrip", damage: [1, 8, "thunder"], mastery: "" }),
        weapon("spell-attack:chill-touch", "Chill Touch", { type: "Cantrip", damage: [1, 8, "necrotic"], mastery: "" }),
        {
          id: "gear:alchemists-fire",
          key: "gear:alchemists-fire",
          category: "gear",
          name: "Alchemist's Fire",
          sourceRefs: ["test"],
          sourceMeta: SOURCE_META,
          type: "Adventuring Gear",
        },
      ],
    });
    const baseDraft = { ...draft("weapon-mastery-source"), classSelection: { classId: classDef.id, level: 1 } };
    const engine = resolveCharacterEngineState(snap, baseDraft, { provider: "mpmb", rulesMode: "2024" });
    const mastery = choiceByType(engine, "weapon-mastery", "Weapon Mastery");
    const optionLabels = mastery?.options.map((option) => option.label) ?? [];

    expect(mastery?.diagnostics.join(" ")).toContain("Option Source weapon-mastery");
    expect(optionLabels).toEqual(["Battleaxe", "Club", "Longsword"]);
    expect(optionLabels).not.toEqual(expect.arrayContaining(["Acid Splash", "Fire Bolt", "Booming Blade", "Chill Touch", "Talking Sword"]));
    expect(mastery?.options.every((option) => option.optionType === "weapon-mastery")).toBe(true);
    expect(mastery?.options.find((option) => option.label === "Battleaxe")?.metadata?.masteryLabel).toBe("Topple");
    expect(mastery?.options.find((option) => option.label === "Club")?.metadata?.damage).toBe("1d4 bludgeoning");
  });
});
