import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CharacterDraft } from "../domain/character";
import type { ClassDefinition, EquipmentDefinition, MpmContentSnapshot, SourceMeta } from "../domain/content";
import { createCharacterDraft } from "../domain/defaults";
import type { RuleChoice, RuleSourceDescriptor } from "../domain/rules";
import { resolveCharacterEngineState, resolveCharacterWizardState } from "../services/characterEngine";
import { setRuleChoiceSelection } from "../services/rules";
import { buildRuleChoiceSurface } from "../services/rules/ruleChoiceSurface";

const SOURCE_META: SourceMeta = {
  sourceSystem: "mpmb",
  sourceDocumentKey: "test",
  sourceDocumentName: "Test Rules",
  edition: "2024",
  importPreset: "mpmb-local",
  rawSourceRef: "test",
};

function baseSource(choices: RuleChoice[]): RuleSourceDescriptor {
  return {
    id: "rule-source:class-feature:fighting-style",
    sourceType: "class-feature",
    sourceId: "feature:fighting-style",
    sourceName: "Fighter: Fighting Style",
    rulesMode: "2024",
    provider: "mpmb",
    level: 1,
    tags: ["fighting-style", "choice"],
    choices,
    modifiers: [],
    effects: [],
    diagnostics: [],
  };
}

function choice(overrides: Partial<RuleChoice> & Pick<RuleChoice, "id" | "choiceType">): RuleChoice {
  return {
    sourceDescriptorId: "rule-source:class-feature:fighting-style",
    sourceType: "class-feature",
    requiredCount: 1,
    minCount: 1,
    maxCount: 1,
    options: [{ id: "defense", label: "Defense" }],
    selectedOptionIds: [],
    status: "pending",
    appliesAtLevel: 1,
    diagnostics: [],
    ...overrides,
  };
}

function weapon(id: string, name: string): EquipmentDefinition {
  return {
    id,
    key: id,
    category: "weapon",
    name,
    type: "martial melee weapon",
    description: "Melee weapon, 1d8 slashing damage.",
    sourceRefs: ["test"],
    sourceMeta: SOURCE_META,
  };
}

function classWithFeature(feature: { id: string; name: string; description: string }): ClassDefinition {
  return {
    id: "class:test-fighter",
    key: "test-fighter",
    name: "Test Fighter",
    hitDie: 10,
    sourceRefs: ["test"],
    sourceMeta: SOURCE_META,
    features: [
      {
        key: feature.id,
        minLevel: 1,
        ...feature,
      },
    ],
  };
}

function snapshot(classDef: ClassDefinition, equipment: EquipmentDefinition[] = []): MpmContentSnapshot {
  return {
    meta: { generatedAt: "2026-05-10T00:00:00.000Z", sourceFiles: [], parseErrors: [] },
    sources: [],
    classes: [classDef],
    subclasses: [],
    species: [{ id: "species:test", key: "test-species", name: "Test Species", sourceRefs: ["test"], sourceMeta: SOURCE_META }],
    backgrounds: [{ id: "background:test", key: "test-background", name: "Test Background", sourceRefs: ["test"], sourceMeta: SOURCE_META }],
    feats: [],
    spells: [],
    equipment,
  };
}

function draftFor(classDef: ClassDefinition): CharacterDraft {
  const draft = createCharacterDraft("choice-surface", "Choice Surface");
  draft.provider = "mpmb";
  draft.rulesMode = "2024";
  draft.classSelection.classId = classDef.id;
  draft.speciesSelection.speciesId = "species:test";
  draft.backgroundSelection.backgroundId = "background:test";
  return draft;
}

describe("rule choice surface consolidation v1", () => {
  it("deduplicates fallback and mapping sources into one canonical fighting style choice", () => {
    const legacy = choice({
      id: "rule-choice:legacy:fighting-style",
      choiceType: "fighting-style",
      options: [],
      status: "unsupported",
      diagnostics: ["Choice language detected for Fighting Style, but no deterministic option list was found."],
    });
    const mapped = choice({
      id: "rule-choice:mapping:fighting-style",
      choiceType: "fighting-style",
      diagnostics: ["Rule mapping feature:fighting-style:choice emitted this choice (declarative)."],
    });

    const surface = buildRuleChoiceSurface([baseSource([legacy, mapped])]);

    expect(surface.rawChoiceCount).toBe(2);
    expect(surface.choices).toHaveLength(1);
    expect(surface.choices[0]?.origin).toBe("rule-mapping");
    expect(surface.choices[0]?.builderEditable).toBe(true);
    expect(surface.hiddenDuplicates).toHaveLength(1);
    expect(surface.hiddenDuplicates[0]?.id).toBe(legacy.id);
  });

  it("gives completed persisted choices precedence over raw pending duplicates", () => {
    const pending = choice({
      id: "rule-choice:mapping:fighting-style",
      choiceType: "fighting-style",
      diagnostics: ["Rule mapping feature:fighting-style:choice emitted this choice (declarative)."],
    });
    const persistedChoice = choice({
      id: "rule-choice:structured:fighting-style",
      choiceType: "fighting-style",
      options: [
        { id: "defense", label: "Defense" },
        { id: "dueling", label: "Dueling" },
      ],
    });
    const persisted = {
      [persistedChoice.id]: {
        choiceId: persistedChoice.id,
        selectedOptionIds: ["dueling"],
        status: "complete" as const,
      },
    };

    const surface = buildRuleChoiceSurface([baseSource([pending, persistedChoice])], persisted);

    expect(surface.choices).toHaveLength(1);
    expect(surface.choices[0]?.id).toBe(persistedChoice.id);
    expect(surface.choices[0]?.status).toBe("complete");
    expect(surface.choices[0]?.selectedOptionIds).toEqual(["dueling"]);
  });

  it("keeps requiredCount independent from selectedCount for multi-select choices", () => {
    const multi = choice({
      id: "rule-choice:mapping:weapon-mastery",
      choiceType: "weapon-mastery",
      requiredCount: 2,
      minCount: 2,
      maxCount: 2,
      options: [
        { id: "longsword", label: "Longsword" },
        { id: "javelin", label: "Javelin" },
        { id: "shortbow", label: "Shortbow" },
      ],
      diagnostics: ["Rule mapping feature:weapon-mastery:choice emitted this choice (declarative)."],
    });

    const oneSelected = buildRuleChoiceSurface([baseSource([multi])], {
      [multi.id]: { choiceId: multi.id, selectedOptionIds: ["longsword"], status: "pending" },
    }).choices[0];
    const twoSelected = buildRuleChoiceSurface([baseSource([multi])], {
      [multi.id]: { choiceId: multi.id, selectedOptionIds: ["longsword", "javelin"], status: "complete" },
    }).choices[0];
    const rejected = setRuleChoiceSelection(createCharacterDraft("overselect", "Overselect"), multi, ["longsword", "javelin", "shortbow"]);

    expect(oneSelected?.requiredCount).toBe(2);
    expect(oneSelected?.selectedCount).toBe(1);
    expect(oneSelected?.status).toBe("pending");
    expect(twoSelected?.status).toBe("complete");
    expect(rejected.ruleChoices?.[multi.id]).toBeUndefined();
  });

  it("parses weapon mastery required count from declarative source text and keeps unknown counts unsupported", () => {
    const longsword = weapon("weapon:longsword", "Longsword");
    const javelin = weapon("weapon:javelin", "Javelin");
    const classDef = classWithFeature({
      id: "feature:weapon-mastery",
      name: "Weapon Mastery",
      description: "Your training allows you to use mastery properties of two kinds of weapons of your choice.",
    });
    const draft = draftFor(classDef);
    const engine = resolveCharacterEngineState(snapshot(classDef, [longsword, javelin]), draft, { provider: "mpmb", rulesMode: "2024" });
    const mastery = engine.ruleEngine.choices.find((entry) => entry.choiceType === "weapon-mastery");

    expect(mastery?.requiredCount).toBe(2);
    expect(mastery?.status).toBe("pending");

    const withOne = setRuleChoiceSelection(draft, mastery!, [longsword.id]);
    const withOneEngine = resolveCharacterEngineState(snapshot(classDef, [longsword, javelin]), withOne, { provider: "mpmb", rulesMode: "2024" });
    expect(withOneEngine.ruleEngine.choices.find((entry) => entry.id === mastery?.id)?.status).toBe("pending");

    const withTwo = setRuleChoiceSelection(draft, mastery!, [longsword.id, javelin.id]);
    const withTwoEngine = resolveCharacterEngineState(snapshot(classDef, [longsword, javelin]), withTwo, { provider: "mpmb", rulesMode: "2024" });
    expect(withTwoEngine.ruleEngine.choices.find((entry) => entry.id === mastery?.id)?.status).toBe("complete");

    const unknownClass = classWithFeature({
      id: "feature:weapon-mastery-unknown",
      name: "Weapon Mastery",
      description: "I gain mastery with a number of Simple/Martial weapons.",
    });
    const unknownEngine = resolveCharacterEngineState(snapshot(unknownClass, [longsword]), draftFor(unknownClass), { provider: "mpmb", rulesMode: "2024" });
    expect(unknownEngine.ruleEngine.choices.find((entry) => entry.choiceType === "weapon-mastery")?.status).toBe("unsupported");
  });

  it("feeds canonical rule choices into builder validation without hidden duplicate blocking", () => {
    const classDef = classWithFeature({
      id: "feature:fighting-style",
      name: "Fighting Style",
      description: "Choose a Fighting Style.",
    });
    const snap = snapshot(classDef);
    const draft = draftFor(classDef);
    const pending = resolveCharacterWizardState(snap, draft, { provider: "mpmb", rulesMode: "2024" });

    expect(pending.input.ruleEngine.choiceSurface.rawChoiceCount).toBeGreaterThan(pending.input.ruleEngine.choiceSurface.choices.length);
    expect(pending.validations.feats.errors.filter((entry) => entry.includes("choice is incomplete"))).toHaveLength(1);
    expect(pending.validations.review.errors).toContain("Generic rule choices are incomplete.");

    const canonical = pending.input.ruleEngine.choiceSurface.choices.find((entry) => entry.choiceType === "fighting-style");
    const completedDraft = setRuleChoiceSelection(draft, canonical!.choice, ["defense"]);
    const completed = resolveCharacterWizardState(snap, completedDraft, { provider: "mpmb", rulesMode: "2024" });

    expect(completed.input.ruleEngine.choiceSurface.choices.find((entry) => entry.choiceType === "fighting-style")?.status).toBe("complete");
    expect(completed.validations.feats.errors.filter((entry) => entry.includes("choice is incomplete"))).toHaveLength(0);
  });

  it("keeps builder and manage surfaces on canonical choices instead of old raw surfaces", () => {
    const builderSource = readFileSync("src/pages/CharacterBuilderPage.tsx", "utf8");
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    const progressionSource = readFileSync("src/features/character/viewModels/progressionViewModel.ts", "utf8");
    const diagnosticsSource = readFileSync("src/features/character/components/sheet/DiagnosticsPanel.tsx", "utf8");

    expect(builderSource).toContain("choiceSurface.choices");
    expect(sheetSource).toContain("open rule choice(s)");
    expect(progressionSource).not.toContain("Weapon Mastery Choice Surface");
    expect(progressionSource).not.toContain("Fighting Style Choice Surface");
    expect(diagnosticsSource).toContain("hidden duplicates");
  });
});
