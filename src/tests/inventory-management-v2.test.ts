import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EquipmentDefinition, SpellDefinition } from "../domain/content";
import type { CharacterEngineState } from "../services/characterEngine";
import { createCharacterDraft } from "../domain/defaults";
import { buildInventoryViewModel } from "../features/character/viewModels";
import {
  addInventoryItem,
  applyCurrencyNormalization,
  applyCurrencyTransaction,
  consumeInventoryItem,
  duplicateInventoryItem,
  normalizeCurrencyDenominations,
  removeInventoryItem,
  updateInventoryItem,
} from "../services/equipment";
import { recordInventoryItemUse } from "../services/playState";
import { resolveCharacterEngineState } from "../services/characterEngine";
import { contentSnapshot } from "../services/data/content";
import { resolveBackgrounds, resolveClasses, resolveEquipment, resolveSpecies } from "../services/data/rulesModeResolver";

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

function mockEngine(overrides: Partial<CharacterEngineState> = {}): CharacterEngineState {
  const base = {
    classDef: undefined,
    selectedSpells: [],
    equipmentCatalog: [],
    ruleEngine: { modifiers: [] },
    derivedStats: {
      abilityScores: {
        str: { modifier: 1 },
        dex: { modifier: 2 },
        con: { modifier: 2 },
        int: { modifier: 0 },
        wis: { modifier: 0 },
        cha: { modifier: 0 },
      },
    },
  } as unknown as CharacterEngineState;
  return { ...base, ...overrides } as CharacterEngineState;
}

describe("inventory management v2", () => {
  it("adds an inventory item", () => {
    const draft = createCharacterDraft("inventory-add", "Inventory Add");
    const next = addInventoryItem(draft.inventory, { name: "Potion of Healing", quantity: 2, itemType: "consumable" });
    expect(next.items.some((item) => item.name === "Potion of Healing")).toBe(true);
  });

  it("edits an inventory item", () => {
    const draft = createCharacterDraft("inventory-edit", "Inventory Edit");
    const added = addInventoryItem(draft.inventory, { name: "Rations", quantity: 2, itemType: "consumable" });
    const instanceId = added.items[0]?.instanceId ?? added.items[0]?.id;
    const updated = updateInventoryItem(added, instanceId ?? "", { name: "Trail Rations", quantity: 5 });
    expect(updated.items[0]?.name).toBe("Trail Rations");
    expect(updated.items[0]?.quantity).toBe(5);
  });

  it("deletes an inventory item", () => {
    const draft = createCharacterDraft("inventory-delete", "Inventory Delete");
    const added = addInventoryItem(draft.inventory, { name: "Holy Water", quantity: 1, itemType: "consumable" });
    const instanceId = added.items[0]?.instanceId ?? added.items[0]?.id;
    const removed = removeInventoryItem(added, instanceId ?? "");
    expect(removed.items).toHaveLength(0);
  });

  it("supports consumable quantity increase/decrease and consume", () => {
    const draft = createCharacterDraft("inventory-consume", "Inventory Consume");
    const added = addInventoryItem(draft.inventory, { name: "Rations", quantity: 3, itemType: "consumable" });
    const duplicated = duplicateInventoryItem(added, added.items[0]?.instanceId ?? "");
    expect(duplicated.items.length).toBeGreaterThanOrEqual(2);
    const consumed = consumeInventoryItem(added, added.items[0]?.instanceId ?? "", 1);
    expect(consumed.consumed).toBe(true);
    expect(consumed.remainingQuantity).toBe(2);
  });

  it("records a play-log entry when consuming an inventory item", () => {
    const draft = createCharacterDraft("inventory-log", "Inventory Log");
    const next = recordInventoryItemUse(draft.playState, {
      itemName: "Potion of Healing",
      amount: 1,
      remainingQuantity: 0,
      itemType: "consumable",
    });
    const event = next.playEvents.at(-1);
    expect(event?.type).toBe("inventory-item-use");
    expect(event?.shortLabel).toContain("Potion of Healing");
  });

  it("shows ammunition items in the ammunition group", () => {
    const draft = createCharacterDraft("inventory-ammo", "Inventory Ammo");
    draft.inventory = addInventoryItem(draft.inventory, { name: "Arrows", quantity: 20, itemType: "ammunition", category: "ammo" });
    const view = buildInventoryViewModel(draft, mockEngine());
    expect(view.ammunition.some((entry) => entry.name === "Arrows")).toBe(true);
  });

  it("normalizes currency denominations", () => {
    const normalized = normalizeCurrencyDenominations({ cp: 100, sp: 0, ep: 0, gp: 0, pp: 0 });
    expect(normalized).toEqual({ cp: 0, sp: 0, ep: 0, gp: 1, pp: 0 });
  });

  it("applies currency add/subtract transactions with log entries", () => {
    const draft = createCharacterDraft("currency-tx", "Currency TX");
    const plus = applyCurrencyTransaction(draft.inventory, { mode: "add", denomination: "gp", amount: 5, note: "Found treasure" });
    const minus = applyCurrencyTransaction(plus, { mode: "subtract", denomination: "gp", amount: 2, note: "Bought supplies" });
    const normalized = applyCurrencyNormalization(minus);
    expect(normalized.currency?.gp).toBe(3);
    expect((normalized.currencyTransactions ?? []).length).toBe(2);
  });

  it("detects prepared spell material component needs", () => {
    const draft = createCharacterDraft("components-detect", "Components Detect");
    const engine = mockEngine({
      selectedSpells: [
        spell({
          id: "spell:identify",
          key: "identify",
          name: "Identify",
          level: 1,
          description: "Components: V, S, M (a pearl worth at least 100 gp and an owl feather)",
        }),
      ],
    });
    const view = buildInventoryViewModel(draft, engine);
    expect(view.neededSpellComponents.some((entry) => entry.spellName === "Identify")).toBe(true);
  });

  it("adds a missing component as inventory item", () => {
    const draft = createCharacterDraft("components-add", "Components Add");
    const engine = mockEngine({
      selectedSpells: [
        spell({
          id: "spell:chromatic-orb",
          key: "chromatic-orb",
          name: "Chromatic Orb",
          level: 1,
          description: "Components: V, S, M (a diamond worth at least 50 gp)",
        }),
      ],
    });
    const view = buildInventoryViewModel(draft, engine);
    const need = view.neededSpellComponents[0];
    const nextInventory = addInventoryItem(draft.inventory, {
      name: need?.addSuggestionName ?? "Spell Component: Chromatic Orb",
      quantity: 1,
      itemType: "spell-component",
      notes: need?.componentText,
    });
    expect(nextInventory.items.some((item) => item.itemType === "spell-component")).toBe(true);
  });

  it("marks material needs as focus-covered when component pouch/focus exists", () => {
    const draft = createCharacterDraft("components-focus", "Components Focus");
    draft.inventory = addInventoryItem(draft.inventory, {
      name: "Component Pouch",
      quantity: 1,
      itemType: "focus",
      category: "gear",
      type: "focus",
    });
    const engine = mockEngine({
      selectedSpells: [
        spell({
          id: "spell:mage-armor",
          key: "mage-armor",
          name: "Mage Armor",
          level: 1,
          description: "Components: V, S, M (a piece of cured leather)",
        }),
      ],
    });
    const view = buildInventoryViewModel(draft, engine);
    expect(view.neededSpellComponents[0]?.status).toBe("covered-by-focus");
  });

  it("keeps equipped armor/shield AC calculation stable", () => {
    const chainMail = equipment({ id: "chain-mail", key: "chain-mail", category: "armor", name: "Chain Mail", type: "heavy" });
    const shield = equipment({ id: "shield", key: "shield", category: "armor", name: "Shield", type: "shield" });
    const draft = createCharacterDraft("inventory-ac", "Inventory AC");
    draft.inventory.items = [
      { id: "chain-mail", name: "Chain Mail", quantity: 1, equipped: true },
      { id: "shield", name: "Shield", quantity: 1, equipped: true },
    ];
    const view = buildInventoryViewModel(draft, mockEngine({ equipmentCatalog: [chainMail, shield], derivedStats: { abilityScores: { str: { modifier: 0 }, dex: { modifier: 4 }, con: { modifier: 0 }, int: { modifier: 0 }, wis: { modifier: 0 }, cha: { modifier: 0 } } } as CharacterEngineState["derivedStats"] }));
    expect(view.armorClass.total).toBe(18);
  });

  it("keeps equipped weapon attack profile presence stable", () => {
    const context = { provider: "mpmb", rulesMode: "2024" } as const;
    const classes = resolveClasses(contentSnapshot.classes, context);
    const species = resolveSpecies(contentSnapshot.species, context);
    const backgrounds = resolveBackgrounds(contentSnapshot.backgrounds, context);
    const equipmentCatalog = resolveEquipment(contentSnapshot.equipment, context);
    const paladin = classes.find((entry) => /paladin/i.test(`${entry.key} ${entry.name}`)) ?? classes[0];
    const human = species.find((entry) => /human/i.test(`${entry.key} ${entry.name}`)) ?? species[0];
    const background = backgrounds[0];
    const rapier = equipmentCatalog.find((entry) => /rapier/i.test(`${entry.key} ${entry.name}`));
    expect(rapier).toBeDefined();
    const draft = createCharacterDraft("inventory-weapon-profile", "Inventory Weapon Profile");
    draft.provider = "mpmb";
    draft.rulesMode = "2024";
    draft.classSelection.classId = paladin?.id;
    draft.classSelection.level = 3;
    draft.speciesSelection.speciesId = human?.id;
    draft.backgroundSelection.backgroundId = background?.id;
    draft.inventory.items = [{ id: rapier?.id ?? "rapier", itemDefinitionId: rapier?.id, name: rapier?.name ?? "Rapier", quantity: 1, equipped: true }];
    const engine = resolveCharacterEngineState(contentSnapshot, draft, context);
    expect(engine.actionResources.actionSet.actions.some((action: { name: string }) => action.name.includes(rapier?.name ?? "Rapier"))).toBe(true);
  });

  it("exposes magic-item automation status in inventory details", () => {
    const wand = equipment({
      id: "wand-of-testing",
      key: "wand-of-testing",
      category: "magic-item",
      name: "Wand of Testing",
      type: "wand",
      description: "A custom magic item.",
    });
    const draft = createCharacterDraft("magic-item-status", "Magic Item Status");
    draft.inventory.items = [{ id: wand.id, name: wand.name, quantity: 1, equipped: false }];
    const view = buildInventoryViewModel(draft, mockEngine({ equipmentCatalog: [wand] }));
    const item = view.other.find((entry) => entry.name === wand.name) ?? view.unresolvedItems.find((entry) => entry.name === wand.name);
    expect(item?.automationStatus === "partial" || item?.automationStatus === "manual" || item?.automationStatus === "unknown").toBe(true);
  });

  it("keeps builder/spell-choice ownership regression suite in place", () => {
    const source = readFileSync("src/tests/builder-spell-choice-ownership-preview-repair-v1.test.ts", "utf8");
    expect(source).toContain("builder spell choice ownership + preview repair v1");
    expect(source).toContain("Magic Initiate");
  });

  it("keeps roll trust and attack flow regression suites in place", () => {
    const rollTrust = readFileSync("src/tests/roll-trust-automation-settings-v1.test.ts", "utf8");
    const attackFlow = readFileSync("src/tests/attack-resolution-action-details-v1.test.ts", "utf8");
    expect(rollTrust).toContain("roll trust + automation settings v1");
    expect(attackFlow).toContain("attack resolution + action details v1");
  });
});
