import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EquipmentDefinition } from "../domain/content";
import type { CharacterEngineState } from "../services/characterEngine";
import { createCharacterDraft } from "../domain/defaults";
import { buildFeatureGroupsViewModel, buildInventoryViewModel } from "../features/character/viewModels";
import { defaultManualInstructionForStatus, normalizeRuleAutomationStatus } from "../features/character/components/sheet/ruleAutomationStatus";
import { weaponMasteryInfoForToken } from "../features/character/components/sheet/weaponMasteryInfo";

function equipment(overrides: Partial<EquipmentDefinition> & Pick<EquipmentDefinition, "id" | "key" | "category" | "name">): EquipmentDefinition {
  return {
    sourceRefs: [],
    ...overrides,
  };
}

describe("rule detail drawer + automation status coverage v1", () => {
  it("renders spell detail drawer fields including timing, range, duration and description paths", () => {
    const source = readFileSync("src/features/character/components/sheet/SpellbookPanel.tsx", "utf8");
    expect(source).toContain("heading=\"Spell Details\"");
    expect(source).toContain("timing: spellTimingLabel");
    expect(source).toContain("rangeOrTarget: spell.range");
    expect(source).toContain("duration: spell.duration");
    expect(source).toContain("description: spell.details");
  });

  it("surfaces spell automation status and effect mapping status in detail payload", () => {
    const source = readFileSync("src/features/character/components/sheet/SpellbookPanel.tsx", "utf8");
    expect(source).toContain("automationStatus");
    expect(source).toContain("Active Effect Mapping Status");
    expect(source).toContain("effectMappingStatus");
  });

  it("uses the unified feature detail drawer with timing and description", () => {
    const source = readFileSync("src/features/character/components/sheet/FeatureCardsPanel.tsx", "utf8");
    expect(source).toContain("heading=\"Feature Details\"");
    expect(source).toContain("timing:");
    expect(source).toContain("description: feature.details");
  });

  it("keeps Divine Sense details available through feature view-model cards", () => {
    const draft = createCharacterDraft("feature-divine-sense", "Feature Divine Sense");
    draft.classSelection.level = 3;
    const groups = buildFeatureGroupsViewModel({
      draft,
      classDef: { name: "Paladin" },
      subclassDef: undefined,
      selectedFeats: [],
      backgroundDef: undefined,
      appliedRules: { speciesResult: { traits: [] } },
      progression: {
        unlockedClassFeatures: [
          {
            id: "class:paladin:feature:divine-sense",
            name: "Divine Sense",
            minLevel: 3,
            description: "As a Bonus Action, detect celestials, fiends, and undead for a short duration.",
            structuredData: { action: [["bonus action", ""]], additional: "1 Channel Divinity" },
          },
        ],
        unlockedSubclassFeatures: [],
      },
      ruleEngine: { choices: [], sources: [], optionScoped: { appliedEntries: [] } },
    } as unknown as CharacterEngineState);
    const divineSense = groups.flatMap((group) => group.features).find((entry) => entry.name === "Divine Sense");
    expect(divineSense?.details).toContain("Bonus Action");
    expect(divineSense?.timing).toBe("bonus action");
  });

  it("keeps Lay on Hands details available through feature view-model cards", () => {
    const draft = createCharacterDraft("feature-lay-on-hands", "Feature Lay On Hands");
    draft.classSelection.level = 3;
    const groups = buildFeatureGroupsViewModel({
      draft,
      classDef: { name: "Paladin" },
      subclassDef: undefined,
      selectedFeats: [],
      backgroundDef: undefined,
      appliedRules: { speciesResult: { traits: [] } },
      progression: {
        unlockedClassFeatures: [
          {
            id: "class:paladin:feature:lay-on-hands",
            name: "Lay on Hands",
            minLevel: 1,
            description: "As a Bonus Action, restore HP from your healing pool.",
            usages: ["15 HP pool"],
            recovery: "Long Rest",
            structuredData: { action: [["bonus action", ""]], additional: "15 HP pool" },
          },
        ],
        unlockedSubclassFeatures: [],
      },
      ruleEngine: { choices: [], sources: [], optionScoped: { appliedEntries: [] } },
    } as unknown as CharacterEngineState);
    const layOnHands = groups.flatMap((group) => group.features).find((entry) => entry.name === "Lay on Hands");
    expect(layOnHands?.details).toContain("restore HP");
    expect(layOnHands?.usesLabel).toContain("HP pool");
  });

  it("surfaces weapon mastery detail summary and manual automation status", () => {
    const mastery = weaponMasteryInfoForToken("vex");
    expect(mastery?.summary).toContain("advantage");
    expect(mastery?.automationStatus).toBe("manual");
  });

  it("builds inventory item details with equipped state, properties, and automation status", () => {
    const rapier = equipment({
      id: "rapier",
      key: "rapier",
      category: "weapon",
      name: "Rapier",
      type: "martial melee weapon",
      damage: [1, 8, "piercing"],
      description: "Finesse, light blade.",
      mastery: "Vex",
    });
    const draft = createCharacterDraft("inventory-details", "Inventory Details");
    draft.inventory.items = [{ id: "rapier", name: "Rapier", quantity: 1, equipped: true }];
    const engine = {
      classDef: undefined,
      spellCatalog: [],
      equipmentCatalog: [rapier],
      ruleEngine: { modifiers: [] },
      derivedStats: {
        abilityScores: {
          str: { modifier: 1 },
          dex: { modifier: 3 },
          con: { modifier: 2 },
          int: { modifier: 0 },
          wis: { modifier: 0 },
          cha: { modifier: 0 },
        },
      },
    } as unknown as CharacterEngineState;

    const view = buildInventoryViewModel(draft, engine);
    const item = view.weapons[0];
    expect(item?.equipped).toBe(true);
    expect(item?.propertyLabels).toContain("finesse");
    expect(item?.automationStatus).toBe("partial");
  });

  it("keeps condition detail actions keyboard and focus reachable", () => {
    const source = readFileSync("src/features/character/components/sheet/ConditionTray.tsx", "utf8");
    expect(source).toContain("Open details for condition");
    expect(source).toContain("Open active condition details");
    expect(source).toContain("type=\"button\"");
  });

  it("falls back unknown automation status to unknown/manual guidance", () => {
    expect(normalizeRuleAutomationStatus(undefined)).toBe("unknown");
    expect(defaultManualInstructionForStatus("unknown")).toContain("resolve manually");
  });

  it("preserves attack flow action-first anchors", () => {
    const source = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    expect(source).toContain("Attack Flow");
    expect(source).toContain("resolveAttackDecision(\"hit\")");
    expect(source).toContain("resolveAttackDecision(\"miss\")");
  });

  it("keeps active effect surfaces and drawer integration in the roll dock", () => {
    const source = readFileSync("src/features/character/components/sheet/PersistentRollDock.tsx", "utf8");
    expect(source).toContain("Active Buffs");
    expect(source).toContain("Optional Buffs");
    expect(source).toContain("heading=\"Active Effect Details\"");
  });

  it("retains death save, free dice roller, active buffs, and roll dock anchors", () => {
    const dockSource = readFileSync("src/features/character/components/sheet/PersistentRollDock.tsx", "utf8");
    const pageSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    expect(dockSource).toContain("Free Dice Roller");
    expect(dockSource).toContain("Death Save");
    expect(dockSource).toContain("Active Buffs");
    expect(pageSource).toContain("PersistentRollDock");
  });
});
