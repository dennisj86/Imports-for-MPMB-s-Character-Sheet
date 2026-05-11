import { describe, expect, it } from "vitest";
import type { BackgroundDefinition, ClassDefinition, SourceMeta } from "../domain/content";
import { createCharacterDraft } from "../domain/defaults";
import { buildInventoryViewModel, buildProgressionViewModel } from "../features/character/viewModels";
import { resolveCharacterEngineState, resolveCharacterWizardState } from "../services/characterEngine";
import { applyBackgroundRules, applyBaseProficiencies, applyClassRules, applySpeciesRules } from "../services/data/appliedRulesResolver";
import { contentSnapshot } from "../services/data/content";
import { resolveEquipment } from "../services/data/rulesModeResolver";
import { buildBarbarianFixture, buildWizardFixture, PHB_TEST_CONTEXT } from "./support/phbGoldenFixtures";

function magicInitiateParentChoice(state: ReturnType<typeof resolveCharacterEngineState>) {
  const found = state.ruleEngine.choiceSurface.choices.find((choice) => choice.sourceName === "Magic Initiate" && choice.choiceType === "feature-option");
  expect(found).toBeDefined();
  return found!;
}

describe("alternative AC + choice completion consistency v1", () => {
  it("applies Barbarian unarmored defense as 10 + DEX + CON and keeps source/formula in AC breakdown", () => {
    const state = buildBarbarianFixture();
    const inventory = buildInventoryViewModel(state.draft, state.engine);

    expect(state.engine.derivedStats.armorClass.value).toBe(15);
    expect(inventory.armorClass.alternativeFormulaSource).toBe("Barbarian: Unarmored Defense");
    expect(inventory.armorClass.alternativeFormulaExpression).toBe("10 + DEX modifier + CON modifier");
  });

  it("adds shield bonus to Barbarian unarmored defense and keeps armor AC precedence when armor is worn", () => {
    const base = buildBarbarianFixture();
    const equipment = resolveEquipment(contentSnapshot.equipment, PHB_TEST_CONTEXT);
    const chainMail = equipment.find((entry) => entry.category === "armor" && /chain-mail|chain mail/i.test(`${entry.key} ${entry.name}`));
    expect(chainMail).toBeDefined();
    if (!chainMail) {
      return;
    }

    const withShield = {
      ...base.draft,
      inventory: {
        items: [
          ...base.draft.inventory.items,
          {
            id: "fixture:barbarian:shield",
            name: "Shield",
            quantity: 1,
            equipped: true,
            equipmentSlot: "shield" as const,
            category: "armor" as const,
          },
        ],
      },
    };
    const shieldEngine = resolveCharacterEngineState(contentSnapshot, withShield, PHB_TEST_CONTEXT);
    const shieldInventory = buildInventoryViewModel(withShield, shieldEngine);
    expect(shieldEngine.derivedStats.armorClass.value).toBe(17);
    expect(shieldInventory.armorClass.shieldBonus).toBe(2);
    expect(shieldInventory.armorClass.alternativeFormulaSource).toBe("Barbarian: Unarmored Defense");

    const withArmor = {
      ...withShield,
      inventory: {
        items: [
          ...withShield.inventory.items,
          {
            id: "fixture:barbarian:chain-mail",
            itemDefinitionId: chainMail.id,
            name: chainMail.name,
            quantity: 1,
            equipped: true,
          },
        ],
      },
    };
    const armoredEngine = resolveCharacterEngineState(contentSnapshot, withArmor, PHB_TEST_CONTEXT);
    const armoredInventory = buildInventoryViewModel(withArmor, armoredEngine);
    expect(armoredEngine.derivedStats.armorClass.value).toBe(18);
    expect(armoredInventory.armorClass.armorName?.toLowerCase()).toContain("chain");
    expect(armoredInventory.armorClass.alternativeFormulaSource).toBeUndefined();
  });

  it("keeps Magic Initiate parent pending when cantrip or level-1 child choices are missing and syncs builder/manage/review state", () => {
    const complete = buildWizardFixture();
    const magicInitiate = complete.engine.selectedFeats.find((entry) => entry.key === "magic initiate");
    expect(magicInitiate).toBeDefined();
    if (!magicInitiate) {
      return;
    }

    const cantripPrefix = `spell-choice:spell-context:${magicInitiate.id}:cantrip:`;
    const level1Prefix = `spell-choice:spell-context:${magicInitiate.id}:level1:`;

    const withoutCantrips = {
      ...complete.draft,
      featureChoices: complete.draft.featureChoices.filter((entry) => !entry.featureId.startsWith(cantripPrefix)),
    };
    const pendingCantripEngine = resolveCharacterEngineState(contentSnapshot, withoutCantrips, PHB_TEST_CONTEXT);
    const pendingCantripWizard = resolveCharacterWizardState(contentSnapshot, withoutCantrips, PHB_TEST_CONTEXT);
    const pendingCantripManage = buildProgressionViewModel(withoutCantrips, pendingCantripEngine);
    const pendingCantripChoice = magicInitiateParentChoice(pendingCantripEngine);
    expect(pendingCantripChoice.status).toBe("pending");
    expect(pendingCantripWizard.validations.feats.errors.some((entry) => entry.includes("Magic Initiate"))).toBe(true);
    expect(pendingCantripWizard.validations.review.errors).toContain("Generic rule choices are incomplete.");
    expect(pendingCantripManage.ruleChoices.find((entry) => entry.id === pendingCantripChoice.id)?.status).toBe("missing");

    const withoutLevel1 = {
      ...complete.draft,
      featureChoices: complete.draft.featureChoices.filter((entry) => !entry.featureId.startsWith(level1Prefix)),
    };
    const pendingLevel1Engine = resolveCharacterEngineState(contentSnapshot, withoutLevel1, PHB_TEST_CONTEXT);
    const pendingLevel1Choice = magicInitiateParentChoice(pendingLevel1Engine);
    expect(pendingLevel1Choice.status).toBe("pending");
  });

  it("marks Magic Initiate parent complete when all child choices are complete and keeps builder/manage/review consistent", () => {
    const state = buildWizardFixture();
    const parentChoice = magicInitiateParentChoice(state.engine);
    const manage = buildProgressionViewModel(state.draft, state.engine);

    expect(parentChoice.status).toBe("complete");
    expect(state.wizard.validations.feats.errors.some((entry) => entry.includes("Magic Initiate"))).toBe(false);
    expect(state.wizard.validations.review.errors).not.toContain("Generic rule choices are incomplete.");
    expect(manage.ruleChoices.find((entry) => entry.id === parentChoice.id)?.status).toBe("complete");
  });
});

const TEST_SOURCE_META: SourceMeta = {
  sourceSystem: "mpmb",
  sourceDocumentKey: "test",
  sourceDocumentName: "Test Rules",
  edition: "2024",
  importPreset: "mpmb-local",
  rawSourceRef: "test",
};

function classWithTextTools(): ClassDefinition {
  return {
    id: "class:tool-normalization",
    key: "tool-normalization",
    name: "Tool Normalization",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    hitDie: 8,
    features: [
      {
        id: "feature:tool-normalization",
        key: "tool-normalization",
        name: "Tool Normalization",
        minLevel: 1,
        description: "**Saving Throws:** Strength, Dexterity\n**Skills:** Choose 0 from Acrobatics\n**Tools:** Thieves' tools, thieves tools, Dex",
      },
    ],
  };
}

function backgroundWithTextTools(): BackgroundDefinition {
  return {
    id: "background:tool-normalization",
    key: "tool-normalization",
    name: "Tool Normalization",
    sourceRefs: ["test"],
    sourceMeta: TEST_SOURCE_META,
    skillText: "",
    toolText: "Wisdom; one tool of your choice; thieves' tools",
  };
}

describe("tool proficiency normalization diagnostics v1", () => {
  it("deduplicates normalized tool proficiencies and emits diagnostics for uncertain tokens", () => {
    const draft = createCharacterDraft("tool-normalization", "Tool Normalization");
    draft.provider = "mpmb";
    draft.rulesMode = "2024";
    const classResult = applyClassRules(classWithTextTools(), undefined, 1);
    const backgroundResult = applyBackgroundRules(backgroundWithTextTools(), "2024", [], []);
    const speciesResult = applySpeciesRules(undefined, "2024");
    const proficiencies = applyBaseProficiencies(draft, classResult, backgroundResult, speciesResult);

    expect(proficiencies.tools.filter((entry) => entry === "Thieves' tools")).toHaveLength(1);
    expect(proficiencies.tools.some((entry) => entry.toLowerCase() === "dex" || entry.toLowerCase() === "wisdom")).toBe(false);
    expect(classResult.notes.some((entry) => entry.includes("ambiguous"))).toBe(true);
    expect(backgroundResult.notes.some((entry) => entry.includes("ambiguous"))).toBe(true);
    expect(proficiencies.diagnostics.some((entry) => entry.includes("merged"))).toBe(true);
  });
});
