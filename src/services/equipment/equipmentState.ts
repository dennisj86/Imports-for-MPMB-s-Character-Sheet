import type { CharacterDraft, EquipmentSlot, InventoryItem, InventoryState } from "../../domain/character";
import type { EquipmentDefinition } from "../../domain/content";
import {
  getInventoryItemDefinitionId,
  inferEquipmentSlot,
  isShieldDefinition,
  normalizeEquipmentToken,
  resolveEquipmentDefinitionForInventoryItem,
} from "./armorClass";
import { normalizeCurrencyState } from "./currencyState";
export { setHpGainMethod } from "../levelUp";

export interface EquipmentOperationResult {
  draft: CharacterDraft;
  warnings: string[];
}

function itemIdentity(item: InventoryItem, index: number): string {
  return item.instanceId ?? `inventory:${getInventoryItemDefinitionId(item)}:${index}`;
}

function isSameItem(item: InventoryItem, itemInstanceId: string, index: number): boolean {
  return item.instanceId === itemInstanceId || item.id === itemInstanceId || getInventoryItemDefinitionId(item) === itemInstanceId || itemIdentity(item, index) === itemInstanceId;
}

function isArmorItem(item: InventoryItem, definition: EquipmentDefinition | undefined): boolean {
  return inferEquipmentSlot(item, definition) === "armor";
}

function isShieldItem(item: InventoryItem, definition: EquipmentDefinition | undefined): boolean {
  if (definition && isShieldDefinition(definition)) {
    return true;
  }
  return inferEquipmentSlot(item, definition) === "shield";
}

function isWeaponItem(item: InventoryItem, definition: EquipmentDefinition | undefined): boolean {
  return definition?.category === "weapon" || item.category === "weapon";
}

function defaultSlotForItem(item: InventoryItem, definition: EquipmentDefinition | undefined, requestedSlot?: EquipmentSlot): EquipmentSlot | undefined {
  if (requestedSlot) {
    return requestedSlot;
  }
  return inferEquipmentSlot(item, definition);
}

export function normalizeInventoryState(
  inventory: InventoryState,
  equipmentCatalog?: EquipmentDefinition[],
): InventoryState {
  return {
    items: inventory.items.map((item, index) => {
      const definition = resolveEquipmentDefinitionForInventoryItem(item, equipmentCatalog);
      const definitionId = definition?.id ?? getInventoryItemDefinitionId(item);
      const slot = item.equipmentSlot ?? (item.equipped ? inferEquipmentSlot(item, definition) : undefined);
      return {
        ...item,
        instanceId: itemIdentity({ ...item, itemDefinitionId: definitionId }, index),
        itemDefinitionId: definitionId,
        name: definition?.name ?? item.name,
        quantity: Math.max(1, Math.floor(item.quantity || 1)),
        category: definition?.category ?? item.category,
        type: definition?.type ?? item.type,
        equipmentSlot: slot,
      };
    }),
    currency: normalizeCurrencyState(inventory.currency),
  };
}

export function setInventoryItemEquipped(
  inventory: InventoryState,
  equipmentCatalog: EquipmentDefinition[] | undefined,
  itemInstanceId: string,
  equipped: boolean,
  slot?: EquipmentSlot,
): { inventory: InventoryState; warnings: string[] } {
  const normalized = normalizeInventoryState(inventory, equipmentCatalog);
  const warnings: string[] = [];
  const targetIndex = normalized.items.findIndex((item, index) => isSameItem(item, itemInstanceId, index));
  if (targetIndex === -1) {
    return {
      inventory: normalized,
      warnings: [`Inventory item ${itemInstanceId} could not be found.`],
    };
  }

  const target = normalized.items[targetIndex];
  const targetDefinition = resolveEquipmentDefinitionForInventoryItem(target, equipmentCatalog);
  const targetSlot = defaultSlotForItem(target, targetDefinition, slot);
  const nextItems = normalized.items.map((item, index) => {
    const definition = resolveEquipmentDefinitionForInventoryItem(item, equipmentCatalog);
    const sameItem = index === targetIndex;
    if (!equipped) {
      return sameItem ? { ...item, equipped: false, equipmentSlot: undefined } : item;
    }

    if (sameItem) {
      return { ...item, equipped: true, equipmentSlot: targetSlot };
    }

    if (targetSlot === "armor" && isArmorItem(item, definition)) {
      warnings.push(`${item.name} was unequipped because only one armor can be equipped.`);
      return { ...item, equipped: false, equipmentSlot: undefined };
    }
    if (targetSlot === "shield" && isShieldItem(item, definition)) {
      warnings.push(`${item.name} was unequipped because only one shield can be equipped.`);
      return { ...item, equipped: false, equipmentSlot: undefined };
    }
    if (targetSlot === "twoHanded" && (item.equipmentSlot === "offHand" || item.equipmentSlot === "shield")) {
      warnings.push(`${item.name} was unequipped because the new weapon needs both hands.`);
      return { ...item, equipped: false, equipmentSlot: undefined };
    }
    if (targetSlot === "shield" && item.equipmentSlot === "offHand") {
      warnings.push(`${item.name} was unequipped because the shield occupies the off hand.`);
      return { ...item, equipped: false, equipmentSlot: undefined };
    }
    if (targetSlot === "offHand" && item.equipmentSlot === "shield") {
      warnings.push(`${item.name} was unequipped because the off-hand item conflicts with the shield.`);
      return { ...item, equipped: false, equipmentSlot: undefined };
    }
    return item;
  });

  if (equipped && !targetDefinition) {
    warnings.push(`${target.name} was equipped by name/type fallback because no catalog definition was found.`);
  }
  if (equipped && isWeaponItem(target, targetDefinition) && targetSlot === "mainHand") {
    const twoHanded = normalizeEquipmentToken(`${target.type ?? ""} ${targetDefinition?.description ?? ""}`).includes("two-handed");
    if (twoHanded) {
      warnings.push(`${target.name} looks two-handed, but only conservative hand-slot handling is active.`);
    }
  }

  return {
    inventory: { items: nextItems, currency: normalized.currency },
    warnings,
  };
}

export function equipItem(
  draft: CharacterDraft,
  equipmentCatalog: EquipmentDefinition[] | undefined,
  itemInstanceId: string,
  slot?: EquipmentSlot,
): EquipmentOperationResult {
  const result = setInventoryItemEquipped(draft.inventory, equipmentCatalog, itemInstanceId, true, slot);
  return {
    draft: {
      ...draft,
      inventory: result.inventory,
    },
    warnings: result.warnings,
  };
}

export function unequipItem(
  draft: CharacterDraft,
  equipmentCatalog: EquipmentDefinition[] | undefined,
  itemInstanceId: string,
): EquipmentOperationResult {
  const result = setInventoryItemEquipped(draft.inventory, equipmentCatalog, itemInstanceId, false);
  return {
    draft: {
      ...draft,
      inventory: result.inventory,
    },
    warnings: result.warnings,
  };
}

export function toggleEquipped(
  draft: CharacterDraft,
  equipmentCatalog: EquipmentDefinition[] | undefined,
  itemInstanceId: string,
  slot?: EquipmentSlot,
): EquipmentOperationResult {
  const normalized = normalizeInventoryState(draft.inventory, equipmentCatalog);
  const target = normalized.items.find((item, index) => isSameItem(item, itemInstanceId, index));
  if (!target?.equipped) {
    return equipItem({ ...draft, inventory: normalized }, equipmentCatalog, itemInstanceId, slot);
  }
  return unequipItem({ ...draft, inventory: normalized }, equipmentCatalog, itemInstanceId);
}

export function setFeatureChoice(draft: CharacterDraft, featureId: string, optionId: string): CharacterDraft {
  const existing = draft.featureChoices.filter((entry) => entry.featureId !== featureId);
  return {
    ...draft,
    featureChoices: [...existing, { featureId, optionId }],
  };
}
