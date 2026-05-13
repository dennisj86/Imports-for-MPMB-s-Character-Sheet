import type { CharacterDraft, EquipmentSlot, InventoryItem, InventoryItemType, InventoryState } from "../../domain/character";
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

function nextInventoryInstanceId(baseId: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `inventory:${baseId}:${crypto.randomUUID()}`;
  }
  return `inventory:${baseId}:${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function clampItemQuantity(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.max(1, Math.floor(parsed));
}

function inferInventoryItemType(
  item: InventoryItem,
  definition: EquipmentDefinition | undefined,
): InventoryItemType {
  if (item.itemType) {
    return item.itemType;
  }
  const slot = inferEquipmentSlot(item, definition);
  const text = normalizeEquipmentToken(`${definition?.name ?? item.name} ${definition?.type ?? item.type} ${definition?.description ?? ""} ${item.notes ?? ""}`);
  if (isShieldDefinition(definition ?? { id: item.id, key: item.id, category: "armor", name: item.name })) {
    return "shield";
  }
  if (definition?.category === "weapon" || slot === "mainHand" || slot === "twoHanded" || slot === "ranged" || slot === "offHand") {
    if (text.includes("ammunition") || text.includes("arrow") || text.includes("bolt") || text.includes("bullet") || text.includes("needle")) {
      return "ammunition";
    }
    return "weapon";
  }
  if (definition?.category === "armor" || slot === "armor") {
    return "armor";
  }
  if (text.includes("component-pouch") || text.includes("arcane-focus") || text.includes("holy-symbol") || text.includes("druidic-focus") || slot === "focus") {
    return "focus";
  }
  if (text.includes("spell-component")) {
    return "spell-component";
  }
  if (text.includes("ammunition") || text.includes("arrow") || text.includes("bolt") || text.includes("bullet") || text.includes("needle")) {
    return "ammunition";
  }
  if (definition?.category === "magic-item" || text.includes("magic-item")) {
    return "magic-item";
  }
  if (text.includes("potion") || text.includes("scroll") || text.includes("ration") || text.includes("holy-water") || text.includes("consumable")) {
    return "consumable";
  }
  if (text.includes("tool") || text.includes("kit") || text.includes("instrument")) {
    return "tool";
  }
  if (definition?.category === "gear") {
    return "gear";
  }
  return "custom";
}

function normalizeItemCategory(
  itemType: InventoryItemType,
  definition: EquipmentDefinition | undefined,
  existingCategory: string | undefined,
): string {
  if (definition?.category) {
    return definition.category;
  }
  if (itemType === "weapon") return "weapon";
  if (itemType === "armor" || itemType === "shield") return "armor";
  if (itemType === "ammunition") return "ammo";
  if (itemType === "magic-item") return "magic-item";
  if (itemType === "focus" || itemType === "tool" || itemType === "gear" || itemType === "consumable" || itemType === "spell-component") return "gear";
  return existingCategory ?? "custom";
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
      const itemType = inferInventoryItemType(item, definition);
      return {
        ...item,
        instanceId: item.instanceId ?? itemIdentity({ ...item, itemDefinitionId: definitionId }, index),
        itemDefinitionId: definitionId,
        name: definition?.name ?? item.name,
        quantity: clampItemQuantity(item.quantity),
        itemType,
        notes: item.notes?.trim() || undefined,
        category: normalizeItemCategory(itemType, definition, item.category),
        type: definition?.type ?? item.type,
        equipmentSlot: slot,
      };
    }),
    currency: normalizeCurrencyState(inventory.currency),
    currencyTransactions: [...(inventory.currencyTransactions ?? [])],
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
    inventory: { items: nextItems, currency: normalized.currency, currencyTransactions: normalized.currencyTransactions },
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

function findInventoryItemIndex(items: InventoryItem[], itemInstanceId: string): number {
  return items.findIndex((item, index) => isSameItem(item, itemInstanceId, index));
}

export interface AddInventoryItemInput {
  id?: string;
  itemDefinitionId?: string;
  name: string;
  quantity?: number;
  equipped?: boolean;
  equipmentSlot?: EquipmentSlot;
  category?: string;
  type?: string;
  itemType?: InventoryItemType;
  notes?: string;
}

export function addInventoryItem(
  inventory: InventoryState,
  input: AddInventoryItemInput,
  equipmentCatalog?: EquipmentDefinition[],
): InventoryState {
  const normalized = normalizeInventoryState(inventory, equipmentCatalog);
  const baseDefinitionId = input.itemDefinitionId;
  const baseToken = normalizeEquipmentToken(input.id ?? input.itemDefinitionId ?? input.name) || "custom-item";
  const provided: InventoryItem = {
    id: input.id ?? (baseDefinitionId ? `inventory:catalog:${baseDefinitionId}` : `inventory:custom:${baseToken}`),
    itemDefinitionId: baseDefinitionId,
    name: input.name.trim() || "Custom Item",
    quantity: clampItemQuantity(input.quantity ?? 1),
    equipped: Boolean(input.equipped),
    equipmentSlot: input.equipmentSlot,
    category: input.category,
    type: input.type,
    itemType: input.itemType,
    notes: input.notes?.trim() || undefined,
    instanceId: nextInventoryInstanceId(baseToken),
  };
  const definition = resolveEquipmentDefinitionForInventoryItem(provided, equipmentCatalog);
  const normalizedType = inferInventoryItemType(provided, definition);
  const stackable = normalizedType === "consumable" || normalizedType === "ammunition" || normalizedType === "spell-component" || normalizedType === "gear";
  if (stackable) {
    const stackIndex = normalized.items.findIndex((entry) => {
      const entryDef = resolveEquipmentDefinitionForInventoryItem(entry, equipmentCatalog);
      const entryType = inferInventoryItemType(entry, entryDef);
      return (
        entryType === normalizedType
        && normalizeEquipmentToken(entry.name) === normalizeEquipmentToken(provided.name)
        && (entry.itemDefinitionId ?? "") === (provided.itemDefinitionId ?? "")
        && !entry.equipped
      );
    });
    if (stackIndex >= 0) {
      const nextItems = normalized.items.map((entry, index) =>
        index === stackIndex ? { ...entry, quantity: clampItemQuantity(entry.quantity + provided.quantity) } : entry);
      return normalizeInventoryState({ ...normalized, items: nextItems }, equipmentCatalog);
    }
  }
  return normalizeInventoryState(
    {
      ...normalized,
      items: [...normalized.items, provided],
    },
    equipmentCatalog,
  );
}

export function updateInventoryItem(
  inventory: InventoryState,
  itemInstanceId: string,
  patch: Partial<Omit<InventoryItem, "instanceId">>,
  equipmentCatalog?: EquipmentDefinition[],
): InventoryState {
  const normalized = normalizeInventoryState(inventory, equipmentCatalog);
  const index = findInventoryItemIndex(normalized.items, itemInstanceId);
  if (index === -1) {
    return normalized;
  }
  const current = normalized.items[index]!;
  const next: InventoryItem = {
    ...current,
    ...patch,
    name: (patch.name ?? current.name).trim() || current.name,
    quantity: clampItemQuantity(patch.quantity ?? current.quantity),
    notes: patch.notes === undefined ? current.notes : patch.notes.trim() || undefined,
  };
  const nextItems = normalized.items.map((entry, entryIndex) => (entryIndex === index ? next : entry));
  const patched = normalizeInventoryState({ ...normalized, items: nextItems }, equipmentCatalog);
  if (patch.equipped === true || patch.equipped === false) {
    return setInventoryItemEquipped(
      patched,
      equipmentCatalog,
      itemInstanceId,
      patch.equipped,
      patch.equipmentSlot,
    ).inventory;
  }
  return patched;
}

export function removeInventoryItem(
  inventory: InventoryState,
  itemInstanceId: string,
  equipmentCatalog?: EquipmentDefinition[],
): InventoryState {
  const normalized = normalizeInventoryState(inventory, equipmentCatalog);
  return {
    ...normalized,
    items: normalized.items.filter((entry, index) => !isSameItem(entry, itemInstanceId, index)),
  };
}

export function duplicateInventoryItem(
  inventory: InventoryState,
  itemInstanceId: string,
  equipmentCatalog?: EquipmentDefinition[],
): InventoryState {
  const normalized = normalizeInventoryState(inventory, equipmentCatalog);
  const index = findInventoryItemIndex(normalized.items, itemInstanceId);
  if (index === -1) {
    return normalized;
  }
  const source = normalized.items[index]!;
  const baseToken = normalizeEquipmentToken(source.itemDefinitionId ?? source.id ?? source.name) || "custom-item";
  const duplicate: InventoryItem = {
    ...source,
    equipped: false,
    equipmentSlot: undefined,
    instanceId: nextInventoryInstanceId(baseToken),
    id: source.id,
  };
  return normalizeInventoryState({ ...normalized, items: [...normalized.items, duplicate] }, equipmentCatalog);
}

export function adjustInventoryItemQuantity(
  inventory: InventoryState,
  itemInstanceId: string,
  delta: number,
  equipmentCatalog?: EquipmentDefinition[],
): InventoryState {
  const normalized = normalizeInventoryState(inventory, equipmentCatalog);
  const index = findInventoryItemIndex(normalized.items, itemInstanceId);
  if (index === -1) {
    return normalized;
  }
  const target = normalized.items[index]!;
  const nextQuantity = clampItemQuantity(target.quantity + Math.trunc(delta));
  return normalizeInventoryState({
    ...normalized,
    items: normalized.items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, quantity: nextQuantity } : entry)),
  }, equipmentCatalog);
}

export interface ConsumeInventoryItemResult {
  inventory: InventoryState;
  consumed: boolean;
  itemName?: string;
  amount: number;
  remainingQuantity?: number;
}

export function consumeInventoryItem(
  inventory: InventoryState,
  itemInstanceId: string,
  amount = 1,
  equipmentCatalog?: EquipmentDefinition[],
): ConsumeInventoryItemResult {
  const normalized = normalizeInventoryState(inventory, equipmentCatalog);
  const index = findInventoryItemIndex(normalized.items, itemInstanceId);
  const useAmount = Math.max(1, Math.floor(amount));
  if (index === -1) {
    return { inventory: normalized, consumed: false, amount: useAmount };
  }
  const target = normalized.items[index]!;
  const nextQuantity = target.quantity - useAmount;
  if (nextQuantity > 0) {
    const nextInventory = normalizeInventoryState(
      {
        ...normalized,
        items: normalized.items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, quantity: nextQuantity } : entry)),
      },
      equipmentCatalog,
    );
    return {
      inventory: nextInventory,
      consumed: true,
      itemName: target.name,
      amount: useAmount,
      remainingQuantity: nextQuantity,
    };
  }
  const nextInventory = {
    ...normalized,
    items: normalized.items.filter((_, entryIndex) => entryIndex !== index),
  };
  return {
    inventory: nextInventory,
    consumed: true,
    itemName: target.name,
    amount: useAmount,
    remainingQuantity: 0,
  };
}

export function setFeatureChoice(draft: CharacterDraft, featureId: string, optionId: string): CharacterDraft {
  const existing = draft.featureChoices.filter((entry) => entry.featureId !== featureId);
  return {
    ...draft,
    featureChoices: [...existing, { featureId, optionId }],
  };
}
