import type { CharacterDraft } from "../../../domain/character";
import type { EquipmentDefinition } from "../../../domain/content";
import type { CharacterEngineState } from "../../../services/characterEngine";
import { isShieldDefinition, resolveArmorClassFromEquipment, type ArmorClassBreakdown } from "../../../services/equipment";

export interface InventoryItemViewModel {
  id: string;
  name: string;
  quantity: number;
  equipped: boolean;
  category: string;
  type?: string;
  relevantStats: string[];
}

export interface InventoryViewModel {
  armorClass: ArmorClassBreakdown;
  armor: InventoryItemViewModel[];
  shields: InventoryItemViewModel[];
  weapons: InventoryItemViewModel[];
  other: InventoryItemViewModel[];
  unresolvedItems: InventoryItemViewModel[];
}

function itemStats(definition: EquipmentDefinition | undefined): string[] {
  if (!definition) {
    return [];
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
): InventoryItemViewModel {
  return {
    id: inventoryItem.id,
    name: definition?.name ?? inventoryItem.name,
    quantity: inventoryItem.quantity,
    equipped: Boolean(inventoryItem.equipped),
    category: definition?.category ?? "unresolved",
    type: definition?.type,
    relevantStats: itemStats(definition),
  };
}

export function buildInventoryViewModel(draft: CharacterDraft, engine: CharacterEngineState): InventoryViewModel {
  const byId = new Map(engine.equipmentCatalog.map((entry) => [entry.id, entry]));
  const armorClass = resolveArmorClassFromEquipment({
    inventoryItems: draft.inventory.items,
    equipmentCatalog: engine.equipmentCatalog,
    dexModifier: engine.derivedStats.abilityScores.dex.modifier,
  });
  const items = draft.inventory.items.map((item) => ({ item: toItemView(item, byId.get(item.id)), definition: byId.get(item.id) }));

  return {
    armorClass,
    armor: items
      .filter((entry) => entry.definition?.category === "armor" && !isShieldDefinition(entry.definition))
      .map((entry) => entry.item),
    shields: items
      .filter((entry) => entry.definition?.category === "armor" && isShieldDefinition(entry.definition))
      .map((entry) => entry.item),
    weapons: items.filter((entry) => entry.definition?.category === "weapon").map((entry) => entry.item),
    other: items
      .filter((entry) => entry.definition && entry.definition.category !== "armor" && entry.definition.category !== "weapon")
      .map((entry) => entry.item),
    unresolvedItems: items.filter((entry) => !entry.definition).map((entry) => entry.item),
  };
}
