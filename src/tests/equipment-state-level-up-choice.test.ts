import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EquipmentDefinition } from "../domain/content";
import { createCharacterDraft } from "../domain/defaults";
import { buildCombatViewModel, buildInventoryViewModel, buildProgressionViewModel } from "../features/character/viewModels";
import { resolveCharacterEngineState } from "../services/characterEngine";
import { contentSnapshot } from "../services/data/content";
import { resolveBackgrounds, resolveClasses, resolveEquipment, resolveSpecies } from "../services/data/rulesModeResolver";
import { equipItem, normalizeInventoryState, setHpGainMethod, unequipItem } from "../services/equipment";
import { setAbilityScoreIncreaseChoice, setAsiOrFeatOption } from "../services/levelUp";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";

function pickEquipment(catalog: EquipmentDefinition[], search: RegExp): EquipmentDefinition {
  const found = catalog.find((entry) => search.test(`${entry.key} ${entry.name}`));
  expect(found).toBeDefined();
  return found as EquipmentDefinition;
}

function createPaladinWithEquipment() {
  const context = { provider: "mpmb", rulesMode: "2024" } as const;
  const classes = resolveClasses(contentSnapshot.classes, context);
  const species = resolveSpecies(contentSnapshot.species, context);
  const backgrounds = resolveBackgrounds(contentSnapshot.backgrounds, context);
  const equipment = resolveEquipment(contentSnapshot.equipment, context);
  const paladin = classes.find((entry) => /paladin/i.test(`${entry.key} ${entry.name}`)) ?? classes[0];
  const human = species.find((entry) => /human/i.test(`${entry.key} ${entry.name}`)) ?? species[0];
  const background = backgrounds[0];
  const chainMail = pickEquipment(equipment, /^chain-mail|chain mail/i);
  const shield = equipment.find((entry) => entry.category === "armor" && /^shield$/i.test(entry.key)) ?? pickEquipment(equipment, /^shield\b| shield$/i);
  const rapier = pickEquipment(equipment, /rapier/i);
  const draft = createCharacterDraft("paladin-equipment", "Paladin Equipment");
  draft.provider = "mpmb";
  draft.rulesMode = "2024";
  draft.classSelection.classId = paladin.id;
  draft.classSelection.level = 3;
  draft.speciesSelection.speciesId = human.id;
  draft.backgroundSelection.backgroundId = background.id;
  draft.abilityScores.dex = 10;
  draft.inventory.items = [
    {
      id: `starting:test:catalog:${chainMail.id}`,
      name: chainMail.name,
      quantity: 1,
      equipped: true,
    },
    {
      id: `starting:test:catalog:${shield.id}`,
      name: shield.name,
      quantity: 1,
      equipped: true,
    },
    {
      id: `starting:test:catalog:${rapier.id}`,
      name: rapier.name,
      quantity: 1,
      equipped: true,
    },
  ];
  return { context, draft, equipment, chainMail, shield, rapier };
}

describe("equipment state + level-up choice v1", () => {
  it("fixes the real product AC path for Paladin with Chain Mail and Shield", () => {
    const { context, draft } = createPaladinWithEquipment();
    const engine = resolveCharacterEngineState(contentSnapshot, draft, context);
    const inventory = buildInventoryViewModel(draft, engine);
    const combat = buildCombatViewModel({
      draft,
      engine,
      playState: draft.playState,
      maxHp: engine.derivedStats.hitPoints.max,
      hitDicePools: [],
    });

    expect(engine.derivedStats.armorClass.value).toBe(18);
    expect(inventory.armorClass.total).toBe(18);
    expect(combat.armorClass.total).toBe(18);
    expect(combat.coreStats.find((entry) => entry.id === "ac")?.value).toBe("18");
    expect(inventory.armorClass.armorName?.toLowerCase()).toContain("chain");
    expect(inventory.armorClass.shieldName?.toLowerCase()).toContain("shield");
  });

  it("updates AC immediately as armor and shield equip state changes", () => {
    const { context, draft, equipment, chainMail, shield } = createPaladinWithEquipment();
    const withoutShield = unequipItem(draft, equipment, shield.id).draft;
    expect(resolveCharacterEngineState(contentSnapshot, withoutShield, context).derivedStats.armorClass.value).toBe(16);

    const withoutArmor = unequipItem(withoutShield, equipment, chainMail.id).draft;
    expect(resolveCharacterEngineState(contentSnapshot, withoutArmor, context).derivedStats.armorClass.value).toBe(10);

    const shieldOnly = equipItem(withoutArmor, equipment, shield.id).draft;
    expect(resolveCharacterEngineState(contentSnapshot, shieldOnly, context).derivedStats.armorClass.value).toBe(12);
  });

  it("normalizes equipment state and enforces one armor and one shield", () => {
    const { draft, equipment, chainMail } = createPaladinWithEquipment();
    const leather = pickEquipment(equipment, /^leather\b|leather armor/i);
    const withLeather = {
      ...draft,
      inventory: normalizeInventoryState({
        items: [
          ...draft.inventory.items,
          { id: leather.id, name: leather.name, quantity: 1, equipped: false },
        ],
      }, equipment),
    };
    const equippedLeather = equipItem(withLeather, equipment, leather.id).draft;
    const chain = equippedLeather.inventory.items.find((item) => item.itemDefinitionId === chainMail.id);
    const leatherItem = equippedLeather.inventory.items.find((item) => item.itemDefinitionId === leather.id);

    expect(leatherItem?.equipped).toBe(true);
    expect(chain?.equipped).toBe(false);

    const roundTrip = deserializeCharacters(serializeCharacters([equippedLeather]))[0];
    expect(roundTrip?.inventory.items.find((item) => item.itemDefinitionId === leather.id)?.equipped).toBe(true);
  });

  it("uses equipped weapons as the primary attack surface and ignores unequipped weapons", () => {
    const { context, draft, rapier } = createPaladinWithEquipment();
    const engine = resolveCharacterEngineState(contentSnapshot, draft, context);
    expect(engine.actionResources.actionSet.actions.some((action) => action.name.includes(rapier.name))).toBe(true);

    const unequipped = {
      ...draft,
      inventory: {
        items: draft.inventory.items.map((item) => (item.name === rapier.name ? { ...item, equipped: false } : item)),
      },
    };
    const nextEngine = resolveCharacterEngineState(contentSnapshot, unequipped, context);
    expect(nextEngine.actionResources.actionSet.actions.some((action) => action.name.includes(rapier.name))).toBe(false);
  });

  it("persists HP gain method and exposes ASI/Feat choice completion state", () => {
    const { context, draft } = createPaladinWithEquipment();
    const leveled = { ...draft, classSelection: { ...draft.classSelection, level: 4 } };
    const withHpGain = setHpGainMethod(leveled, 4, "max");
    const engine = resolveCharacterEngineState(contentSnapshot, withHpGain, context);
    const progression = buildProgressionViewModel(withHpGain, engine);
    const asiChoice = progression.asiOrFeatChoices[0];
    expect(progression.selectedHpGainMethod).toBe("max");
    expect(asiChoice).toBeDefined();
    if (!asiChoice) {
      return;
    }
    expect(asiChoice.status).toBe("missing");

    const withAsiOption = setAsiOrFeatOption(withHpGain, asiChoice.id, "ability-score-improvement");
    const withAsi = setAbilityScoreIncreaseChoice(withAsiOption, asiChoice.id, asiChoice.level, { str: 2 });
    const nextEngine = resolveCharacterEngineState(contentSnapshot, withAsi, context);
    const nextProgression = buildProgressionViewModel(withAsi, nextEngine);
    expect(nextProgression.asiOrFeatChoices.find((entry) => entry.id === asiChoice.id)?.status).toBe("complete");

    const roundTrip = deserializeCharacters(serializeCharacters([withAsi]))[0];
    expect(roundTrip?.levelUp?.hpGainByLevel?.["level-4"]?.method).toBe("max");
    expect(roundTrip?.featureChoices.find((entry) => entry.featureId === asiChoice.id)?.optionId).toBe("ability-score-improvement");
    expect(roundTrip?.levelUp?.abilityScoreIncreases?.[asiChoice.id]?.increases.str).toBe(2);
  });

  it("keeps equipment and level-up guardrails outside UI components", () => {
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    const inventoryPanelSource = readFileSync("src/features/character/components/sheet/InventoryPanel.tsx", "utf8");
    const equipmentServiceSource = readFileSync("src/services/equipment/equipmentState.ts", "utf8");
    const armorServiceSource = readFileSync("src/services/equipment/armorClass.ts", "utf8");

    expect(sheetSource).toContain("useCharacterEngine");
    expect(sheetSource).toContain("useCharacterPlayState");
    expect(sheetSource).not.toContain("../services/data/adapter");
    expect(sheetSource).not.toMatch(/\b(eval|removeeval|changeeval|calcChanges)\b/);
    expect(inventoryPanelSource).not.toContain("resolveArmorClassFromEquipment");
    expect(equipmentServiceSource).toContain("setInventoryItemEquipped");
    expect(armorServiceSource).toContain("resolveEquipmentDefinitionForInventoryItem");
  });
});
