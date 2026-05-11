import type { CharacterDraft, EquipmentSlot } from "../../../domain/character";
import type { EquipmentDefinition } from "../../../domain/content";
import type { CharacterPlayState } from "../../../domain/playState";
import type { CharacterEngineState } from "../../../services/characterEngine";
import {
  inferEquipmentSlot,
  isShieldDefinition,
  normalizeInventoryState,
  resolveAlternativeArmorClassFormulas,
  resolveArmorClassFromEquipment,
  resolveEquipmentDefinitionForInventoryItem,
  type ArmorClassBreakdown,
} from "../../../services/equipment";
import { activeEffectModifiersForTarget, weaponMasteryBadgesForItem } from "../../../services/rules";

export interface InventoryItemViewModel {
  instanceId: string;
  id: string;
  itemDefinitionId: string;
  name: string;
  quantity: number;
  equipped: boolean;
  category: string;
  type?: string;
  equipmentSlot?: EquipmentSlot;
  canEquip: boolean;
  relevantStats: string[];
  mappingBadges: string[];
  diagnostics: string[];
}

export interface InventoryViewModel {
  armorClass: ArmorClassBreakdown;
  armor: InventoryItemViewModel[];
  shields: InventoryItemViewModel[];
  weapons: InventoryItemViewModel[];
  other: InventoryItemViewModel[];
  unresolvedItems: InventoryItemViewModel[];
}

function itemStats(definition: EquipmentDefinition | undefined, slot?: EquipmentSlot): string[] {
  if (!definition) {
    return slot ? [slot] : [];
  }
  const stats: string[] = [];
  if (definition.type) {
    stats.push(definition.type);
  }
  if (definition.weight !== undefined) {
    stats.push(`${definition.weight} lb`);
  }
  const damage = definition.description?.match(/\b\d*d\d+\s*(?:[+-]\s*\d+)?\b/i)?.[0]?.replace(/\s+/g, "");
  if (definition.category === "weapon" && damage) {
    stats.push(damage);
  }
  return stats;
}

function toItemView(
  inventoryItem: CharacterDraft["inventory"]["items"][number],
  definition: EquipmentDefinition | undefined,
  fallbackSlot: EquipmentSlot,
  draft: CharacterDraft,
): InventoryItemViewModel {
  const category = definition?.category ?? inventoryItem.category ?? (fallbackSlot === "armor" || fallbackSlot === "shield" ? "armor" : "unresolved");
  const diagnostics = definition
    ? [`Definition ${definition.id} matched as ${category}${fallbackSlot ? `/${fallbackSlot}` : ""}.`]
    : [`No catalog definition matched for ${inventoryItem.name}; using inventory fallback fields.`];
  return {
    instanceId: inventoryItem.instanceId ?? inventoryItem.id,
    id: inventoryItem.id,
    itemDefinitionId: inventoryItem.itemDefinitionId ?? inventoryItem.id,
    name: definition?.name ?? inventoryItem.name,
    quantity: inventoryItem.quantity,
    equipped: Boolean(inventoryItem.equipped),
    category,
    type: definition?.type ?? inventoryItem.type,
    equipmentSlot: inventoryItem.equipmentSlot ?? fallbackSlot,
    canEquip: category === "armor" || category === "weapon" || fallbackSlot === "armor" || fallbackSlot === "shield",
    relevantStats: itemStats(definition, fallbackSlot),
    mappingBadges: definition?.category === "weapon" || category === "weapon" ? weaponMasteryBadgesForItem(draft, inventoryItem, definition) : [],
    diagnostics,
  };
}

export function buildInventoryViewModel(draft: CharacterDraft, engine: CharacterEngineState, playState?: CharacterPlayState): InventoryViewModel {
  const normalizedInventory = normalizeInventoryState(draft.inventory, engine.equipmentCatalog);
  const abilityModifiers = {
    str: engine.derivedStats.abilityScores.str?.modifier ?? 0,
    dex: engine.derivedStats.abilityScores.dex?.modifier ?? 0,
    con: engine.derivedStats.abilityScores.con?.modifier ?? 0,
    int: engine.derivedStats.abilityScores.int?.modifier ?? 0,
    wis: engine.derivedStats.abilityScores.wis?.modifier ?? 0,
    cha: engine.derivedStats.abilityScores.cha?.modifier ?? 0,
  };
  const armorClass = resolveArmorClassFromEquipment({
    inventoryItems: normalizedInventory.items,
    equipmentCatalog: engine.equipmentCatalog,
    dexModifier: abilityModifiers.dex,
    abilityModifiers,
    alternativeFormulas: resolveAlternativeArmorClassFormulas({
      classDef: engine.classDef,
      level: draft.classSelection.level,
    }),
    ruleModifiers: [
      ...(engine.ruleEngine?.modifiers ?? []),
      ...activeEffectModifiersForTarget(playState?.activeEffects, "armor-class", { targetScope: "self" }),
    ],
    concentrationActive: Boolean(playState?.concentration),
  });
  const items = normalizedInventory.items.map((item) => {
    const definition = resolveEquipmentDefinitionForInventoryItem(item, engine.equipmentCatalog);
    const fallbackSlot = inferEquipmentSlot(item, definition);
    return {
      item: toItemView(item, definition, fallbackSlot, draft),
      definition,
      slot: fallbackSlot,
    };
  });

  return {
    armorClass,
    armor: items
      .filter((entry) => (entry.definition?.category === "armor" || entry.slot === "armor") && !(entry.definition && isShieldDefinition(entry.definition)) && entry.slot !== "shield")
      .map((entry) => entry.item),
    shields: items
      .filter((entry) => entry.slot === "shield" || Boolean(entry.definition && isShieldDefinition(entry.definition)))
      .map((entry) => entry.item),
    weapons: items.filter((entry) => entry.definition?.category === "weapon" || entry.item.category === "weapon").map((entry) => entry.item),
    other: items
      .filter((entry) => entry.definition && entry.definition.category !== "armor" && entry.definition.category !== "weapon")
      .map((entry) => entry.item),
    unresolvedItems: items.filter((entry) => !entry.definition).map((entry) => entry.item),
  };
}
