import type { CharacterDraft, CurrencyState, EquipmentSlot } from "../../../domain/character";
import type { EquipmentDefinition } from "../../../domain/content";
import type { CharacterPlayState } from "../../../domain/playState";
import type { CharacterEngineState } from "../../../services/characterEngine";
import {
  currencyTotalInGp,
  inferEquipmentSlot,
  isShieldDefinition,
  normalizeCurrencyState,
  normalizeInventoryState,
  resolveAlternativeArmorClassFormulas,
  resolveArmorClassFromEquipment,
  resolveEquipmentDefinitionForInventoryItem,
  type ArmorClassBreakdown,
} from "../../../services/equipment";
import { activeEffectModifiersForTarget, weaponMasteryBadgesForItem } from "../../../services/rules";

export type InventoryAutomationStatus = "automated" | "partial" | "manual" | "unsupported" | "unknown";

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
  description?: string;
  sourceLabel?: string;
  weightLabel?: string;
  damageInfo?: string;
  armorInfo?: string;
  propertyLabels: string[];
  masteryName?: string;
  consumableStatus?: string;
  automationStatus: InventoryAutomationStatus;
  manualInstructions: string;
  knownLimitations?: string;
  mappingBadges: string[];
  diagnostics: string[];
}

export interface InventoryViewModel {
  currency: CurrencyState;
  currencyTotalGp: number;
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

const PROPERTY_TOKENS = ["ammunition", "finesse", "heavy", "light", "loading", "range", "reach", "special", "thrown", "two-handed", "versatile", "ranged", "melee"];

function normalizeToken(value: string | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function textFragments(definition: EquipmentDefinition | undefined, inventoryItem: CharacterDraft["inventory"]["items"][number]): string {
  return [definition?.name, definition?.type, definition?.description, inventoryItem.type].filter(Boolean).join(" ").toLowerCase();
}

function propertyLabels(definition: EquipmentDefinition | undefined, inventoryItem: CharacterDraft["inventory"]["items"][number]): string[] {
  const text = textFragments(definition, inventoryItem);
  const detected = PROPERTY_TOKENS.filter((token) => text.includes(token));
  if (definition?.range) {
    detected.push("range");
  }
  return Array.from(new Set(detected));
}

function damageInfo(definition: EquipmentDefinition | undefined): string | undefined {
  if (!definition) {
    return undefined;
  }
  if (Array.isArray(definition.damage) && definition.damage.length >= 2) {
    const count = Number(definition.damage[0]);
    const die = Number(definition.damage[1]);
    const damageType = typeof definition.damage[2] === "string" ? ` ${String(definition.damage[2])}` : "";
    if (Number.isFinite(count) && Number.isFinite(die)) {
      return `${Math.trunc(count)}d${Math.trunc(die)}${damageType}`.trim();
    }
  }
  return definition.description?.match(/\b\d*d\d+\s*(?:[+-]\s*\d+)?(?:\s*[a-z]+)?/i)?.[0]?.replace(/\s+/g, " ");
}

function armorInfo(definition: EquipmentDefinition | undefined): string | undefined {
  if (!definition || definition.category !== "armor") {
    return undefined;
  }
  const armorClass = definition.description?.match(/\b(?:ac|armor class)\s*[: ]\s*([0-9]{1,2})\b/i)?.[1];
  if (armorClass) {
    return `AC ${armorClass}${definition.type ? ` (${definition.type})` : ""}`;
  }
  if (definition.type) {
    return definition.type;
  }
  return definition.description?.match(/\b[0-9]{1,2}\s*\+\s*dex\b/i)?.[0];
}

function consumableStatus(definition: EquipmentDefinition | undefined, inventoryItem: CharacterDraft["inventory"]["items"][number]): string | undefined {
  if (definition?.category === "ammo" || normalizeToken(definition?.type).includes("ammunition")) {
    return "Ammunition";
  }
  const text = textFragments(definition, inventoryItem);
  if (/\b(consumable|potion|dose|charge|charges)\b/.test(text)) {
    return "Consumable/manual";
  }
  return undefined;
}

function inventoryAutomationStatus(
  definition: EquipmentDefinition | undefined,
  category: string,
  fallbackSlot: EquipmentSlot,
): InventoryAutomationStatus {
  if (!definition) {
    return "unknown";
  }
  if (category === "armor" || fallbackSlot === "armor" || fallbackSlot === "shield" || isShieldDefinition(definition)) {
    return "automated";
  }
  if (category === "weapon") {
    return "partial";
  }
  if (category === "ammo") {
    return "manual";
  }
  if (category === "magic-item") {
    return "partial";
  }
  if (category === "gear") {
    return "manual";
  }
  return "unknown";
}

function manualInstructionsForItem(status: InventoryAutomationStatus): string {
  if (status === "automated") return "Sheet applies this item automatically when equipped.";
  if (status === "partial") return "Sheet tracks core parts; resolve triggered effects manually.";
  if (status === "manual") return "Use this item manually during play.";
  if (status === "unsupported") return "Known item, but no automation is implemented.";
  return "No structured automation metadata found for this item.";
}

function knownLimitationsForItem(
  definition: EquipmentDefinition | undefined,
  status: InventoryAutomationStatus,
): string | undefined {
  if (!definition) {
    return "No catalog match; item behavior must be resolved manually.";
  }
  if (status === "partial" && definition.category === "weapon") {
    return "Weapon properties, mastery riders, and conditional effects require manual adjudication.";
  }
  if (status === "manual") {
    return "This item is tracked in inventory, but gameplay effects are manual.";
  }
  return undefined;
}

function toItemView(
  inventoryItem: CharacterDraft["inventory"]["items"][number],
  definition: EquipmentDefinition | undefined,
  fallbackSlot: EquipmentSlot,
  draft: CharacterDraft,
): InventoryItemViewModel {
  const category = definition?.category ?? inventoryItem.category ?? (fallbackSlot === "armor" || fallbackSlot === "shield" ? "armor" : "unresolved");
  const properties = propertyLabels(definition, inventoryItem);
  const masteryName = definition?.mastery?.trim() || undefined;
  const status = inventoryAutomationStatus(definition, category, fallbackSlot);
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
    description: definition?.description,
    sourceLabel: definition?.sourceMeta?.sourceDocumentName,
    weightLabel: definition?.weight !== undefined ? `${definition.weight} lb` : undefined,
    damageInfo: damageInfo(definition),
    armorInfo: armorInfo(definition),
    propertyLabels: properties,
    masteryName,
    consumableStatus: consumableStatus(definition, inventoryItem),
    automationStatus: status,
    manualInstructions: manualInstructionsForItem(status),
    knownLimitations: knownLimitationsForItem(definition, status),
    mappingBadges: definition?.category === "weapon" || category === "weapon" ? weaponMasteryBadgesForItem(draft, inventoryItem, definition) : [],
    diagnostics: [
      ...diagnostics,
      ...(properties.length ? [`Properties: ${properties.join(", ")}`] : []),
      ...(masteryName ? [`Mastery: ${masteryName}`] : []),
      ...(status === "unknown" ? ["Automation status unresolved from local item metadata."] : []),
    ],
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
    currency: normalizeCurrencyState(normalizedInventory.currency),
    currencyTotalGp: currencyTotalInGp(normalizedInventory.currency),
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
