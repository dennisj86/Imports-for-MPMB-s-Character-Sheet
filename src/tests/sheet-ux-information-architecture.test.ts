import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EquipmentDefinition, SpellDefinition } from "../domain/content";
import { createCharacterDraft } from "../domain/defaults";
import type { CharacterEngineState } from "../services/characterEngine";
import { resolveArmorClassFromEquipment } from "../services/equipment";
import { classifySpell } from "../services/spells";
import { SHEET_TABS, buildFeatureGroupsViewModel, buildInventoryViewModel, buildProgressionViewModel } from "../features/character/viewModels";

function equipment(overrides: Partial<EquipmentDefinition> & Pick<EquipmentDefinition, "id" | "key" | "category" | "name">): EquipmentDefinition {
  return {
    sourceRefs: [],
    ...overrides,
  };
}

function spell(overrides: Partial<SpellDefinition> & Pick<SpellDefinition, "id" | "key" | "name" | "level" | "description">): SpellDefinition {
  return {
    sourceRefs: [],
    concentration: false,
    ritual: false,
    classes: [],
    ...overrides,
  };
}

const leather = equipment({ id: "leather", key: "leather", category: "armor", name: "Leather Armor", type: "light" });
const halfPlate = equipment({ id: "half-plate", key: "half-plate", category: "armor", name: "Half Plate", type: "medium" });
const chainMail = equipment({ id: "chain-mail", key: "chain-mail", category: "armor", name: "Chain Mail", type: "heavy" });
const shield = equipment({ id: "shield", key: "shield", category: "armor", name: "Shield", type: "shield" });
const rapier = equipment({ id: "rapier", key: "rapier", category: "weapon", name: "Rapier", type: "martial weapon", description: "1d8 piercing damage." });

describe("sheet ux / information architecture v1", () => {
  it("defines the player-facing sheet sections and keeps diagnostics out of the default flow", () => {
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    const actionPanelSource = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    const resourceSource = readFileSync("src/features/character/components/sheet/ResourceTracker.tsx", "utf8");

    expect(SHEET_TABS).toEqual(["overview", "actions", "spells", "inventory", "features", "manage"]);
    expect(sheetSource).toContain("useCharacterEngine");
    expect(sheetSource).toContain("useCharacterPlayState");
    expect(sheetSource).toContain("Show Diagnostics");
    expect(sheetSource).not.toContain("Applied Rules Output");
    expect(sheetSource).not.toContain("Action/Resource Status");
    expect(sheetSource).not.toContain("Not Automated Yet");
    expect(actionPanelSource).not.toContain("No structured roll available");
    expect(actionPanelSource).not.toContain("No selected spells expose structured roll data yet");
    expect(resourceSource).toContain("showDiagnostics && resource.dataStatus");
  });

  it("keeps v2 sheet guardrails intact", () => {
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    const builderSource = readFileSync("src/pages/CharacterBuilderPage.tsx", "utf8");
    const contentSource = readFileSync("src/pages/ContentBrowserPage.tsx", "utf8");
    const viewModelSources = [
      "src/features/character/viewModels/combatViewModel.ts",
      "src/features/character/viewModels/spellbookViewModel.ts",
      "src/features/character/viewModels/inventoryViewModel.ts",
      "src/features/character/viewModels/featuresViewModel.ts",
    ].map((path) => readFileSync(path, "utf8")).join("\n");

    expect(`${sheetSource}\n${builderSource}\n${contentSource}`).not.toContain("../services/data/adapter");
    expect(`${sheetSource}\n${builderSource}\n${contentSource}`).not.toMatch(/\b(eval|removeeval|changeeval|calcChanges)\b/);
    expect(viewModelSources).not.toContain("useState");
    expect(viewModelSources).not.toContain("Math.random");
  });

  it("computes visible AC breakdowns from equipped armor and shields", () => {
    expect(resolveArmorClassFromEquipment({ inventoryItems: [], equipmentCatalog: [leather], dexModifier: 3 }).total).toBe(13);
    expect(
      resolveArmorClassFromEquipment({
        inventoryItems: [{ id: "leather", name: "Leather Armor", quantity: 1, equipped: true }],
        equipmentCatalog: [leather],
        dexModifier: 3,
      }).total,
    ).toBe(14);
    expect(
      resolveArmorClassFromEquipment({
        inventoryItems: [{ id: "half-plate", name: "Half Plate", quantity: 1, equipped: true }],
        equipmentCatalog: [halfPlate],
        dexModifier: 4,
      }).total,
    ).toBe(17);
    expect(
      resolveArmorClassFromEquipment({
        inventoryItems: [
          { id: "chain-mail", name: "Chain Mail", quantity: 1, equipped: true },
          { id: "shield", name: "Shield", quantity: 1, equipped: true },
        ],
        equipmentCatalog: [chainMail, shield],
        dexModifier: 4,
      }).total,
    ).toBe(18);
    expect(
      resolveArmorClassFromEquipment({
        inventoryItems: [
          { id: "chain-mail", name: "Chain Mail", quantity: 1, equipped: true },
          { id: "shield", name: "Shield", quantity: 1, equipped: false },
        ],
        equipmentCatalog: [chainMail, shield],
        dexModifier: 4,
      }).total,
    ).toBe(16);
  });

  it("classifies support spells without inventing damage actions from generic dice bonuses", () => {
    const bless = classifySpell(spell({
      id: "spell:bless",
      key: "bless",
      name: "Bless",
      level: 1,
      concentration: true,
      description: "Whenever a target makes an attack roll or saving throw before the spell ends, the target can roll a d4 and add it to the roll.",
    }));
    const guidance = classifySpell(spell({
      id: "spell:guidance",
      key: "guidance",
      name: "Guidance",
      level: 0,
      concentration: true,
      description: "The target can roll a d4 and add the number rolled to one ability check.",
    }));
    const resistance = classifySpell(spell({
      id: "spell:resistance",
      key: "resistance",
      name: "Resistance",
      level: 0,
      concentration: true,
      description: "The target can roll a d4 and add it to one saving throw.",
    }));

    expect(bless.categories).toContain("buff");
    expect(bless.categories).toContain("concentration");
    expect(bless.categories).not.toContain("damage");
    expect(bless.damageFormula).toBeUndefined();
    expect(guidance.categories).toContain("cantrip");
    expect(guidance.categories).not.toContain("damage");
    expect(resistance.categories).toContain("buff");
    expect(resistance.categories).not.toContain("damage");
  });

  it("classifies attack, save, and damage spell surfaces conservatively", () => {
    const fireBolt = classifySpell(spell({
      id: "spell:fire-bolt",
      key: "fire-bolt",
      name: "Fire Bolt",
      level: 0,
      description: "Make a ranged spell attack. Hit: 1d10 fire damage.",
    }));
    const burningHands = classifySpell(spell({
      id: "spell:burning-hands",
      key: "burning-hands",
      name: "Burning Hands",
      level: 1,
      description: "Each creature makes a Dexterity saving throw. It takes 3d6 fire damage on a failed save.",
    }));
    const cureWounds = classifySpell(spell({
      id: "spell:cure-wounds",
      key: "cure-wounds",
      name: "Cure Wounds",
      level: 1,
      description: "A creature regains 1d8 hit points.",
    }));

    expect(fireBolt.hasSpellAttack).toBe(true);
    expect(fireBolt.damageFormula).toBe("1d10");
    expect(burningHands.saveAbility).toBe("dex");
    expect(burningHands.damageFormula).toBe("3d6");
    expect(cureWounds.categories).toContain("healing");
    expect(cureWounds.healingFormula).toBe("1d8");
    expect(cureWounds.categories).not.toContain("damage");
  });

  it("builds inventory view models with equipped state and AC linkage", () => {
    const draft = createCharacterDraft("inventory-sheet", "Inventory Sheet");
    draft.inventory.items = [
      { id: "chain-mail", name: "Chain Mail", quantity: 1, equipped: true },
      { id: "shield", name: "Shield", quantity: 1, equipped: true },
      { id: "rapier", name: "Rapier", quantity: 1, equipped: true },
    ];
    const engine = {
      equipmentCatalog: [chainMail, shield, rapier],
      derivedStats: { abilityScores: { dex: { modifier: 3 } } },
    } as unknown as CharacterEngineState;

    const view = buildInventoryViewModel(draft, engine);
    expect(view.armorClass.total).toBe(18);
    expect(view.armor[0]?.equipped).toBe(true);
    expect(view.shields[0]?.name).toBe("Shield");
    expect(view.weapons[0]?.name).toBe("Rapier");
  });

  it("deduplicates and groups feature cards by source", () => {
    const engine = {
      classDef: { name: "Fighter" },
      subclassDef: undefined,
      selectedFeats: [],
      backgroundDef: undefined,
      appliedRules: { speciesResult: { traits: [] } },
      progression: {
        unlockedClassFeatures: [
          { id: "feature:second-wind", name: "Second Wind", minLevel: 1, description: "Recover hit points as a bonus action." },
          { id: "feature:second-wind", name: "Second Wind", minLevel: 1, description: "Recover hit points as a bonus action." },
        ],
        unlockedSubclassFeatures: [],
      },
    } as unknown as CharacterEngineState;

    const groups = buildFeatureGroupsViewModel(engine);
    expect(groups.find((group) => group.id === "class")?.features).toHaveLength(1);
    expect(groups.find((group) => group.id === "class")?.features[0]?.actionType).toBe("Bonus Action");
  });

  it("surfaces level-up gaps without fake completion", () => {
    const draft = createCharacterDraft("progression-sheet", "Progression Sheet");
    draft.classSelection.level = 4;
    const engine = {
      classDef: { name: "Fighter" },
      progression: {
        currentLevel: 4,
        pendingChoices: [],
        asiOrFeatChoices: [],
      },
    } as unknown as CharacterEngineState;

    const view = buildProgressionViewModel(draft, engine);
    expect(view.hpGainMethods).toEqual(["fixed/default", "manual", "rolled", "max"]);
    expect(view.missingCapabilities.some((entry) => entry.id === "hp-gain-method")).toBe(true);
    expect(view.missingCapabilities.some((entry) => entry.id === "asi-feat-choice")).toBe(true);
  });
});
