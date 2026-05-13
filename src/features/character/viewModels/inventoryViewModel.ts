import type { CharacterDraft, CurrencyState, CurrencyTransaction, EquipmentSlot, InventoryItemType } from "../../../domain/character";
import type { EquipmentDefinition, SpellDefinition } from "../../../domain/content";
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
export type SpellMaterialStatus = "present" | "missing" | "covered-by-focus" | "unknown";

export interface SpellMaterialNeedViewModel {
  id: string;
  spellId: string;
  spellName: string;
  componentText: string;
  status: SpellMaterialStatus;
  statusLabel: string;
  matchingItemName?: string;
  addSuggestionName: string;
}

export interface InventoryItemViewModel {
  instanceId: string;
  id: string;
  itemDefinitionId: string;
  name: string;
  quantity: number;
  equipped: boolean;
  category: string;
  type?: string;
  itemType: InventoryItemType;
  notes?: string;
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
  currencyTransactions: CurrencyTransaction[];
  armorClass: ArmorClassBreakdown;
  equipped: InventoryItemViewModel[];
  armorShields: InventoryItemViewModel[];
  armor: InventoryItemViewModel[];
  shields: InventoryItemViewModel[];
  weapons: InventoryItemViewModel[];
  consumables: InventoryItemViewModel[];
  ammunition: InventoryItemViewModel[];
  toolsFocus: InventoryItemViewModel[];
  spellComponents: InventoryItemViewModel[];
  other: InventoryItemViewModel[];
  unresolvedItems: InventoryItemViewModel[];
  neededSpellComponents: SpellMaterialNeedViewModel[];
  hasComponentFocusCoverage: boolean;
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

function normalizeLooseToken(value: string | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function textFragments(definition: EquipmentDefinition | undefined, inventoryItem: CharacterDraft["inventory"]["items"][number]): string {
  return [definition?.name, definition?.type, definition?.description, inventoryItem.type, inventoryItem.notes].filter(Boolean).join(" ").toLowerCase();
}

function itemTypeFromNormalized(definition: EquipmentDefinition | undefined, inventoryItem: CharacterDraft["inventory"]["items"][number], slot: EquipmentSlot): InventoryItemType {
  const token = normalizeToken(`${definition?.name ?? inventoryItem.name} ${definition?.type ?? inventoryItem.type} ${definition?.description ?? ""} ${inventoryItem.notes ?? ""}`);
  if (inventoryItem.itemType) {
    return inventoryItem.itemType;
  }
  if (definition?.category === "weapon" || slot === "mainHand" || slot === "twoHanded" || slot === "ranged") {
    if (token.includes("ammunition") || token.includes("arrow") || token.includes("bolt") || token.includes("bullet") || token.includes("needle")) {
      return "ammunition";
    }
    return "weapon";
  }
  if (slot === "shield" || Boolean(definition && isShieldDefinition(definition))) {
    return "shield";
  }
  if (slot === "armor" || definition?.category === "armor") {
    return "armor";
  }
  if (token.includes("component-pouch") || token.includes("arcane-focus") || token.includes("holy-symbol") || token.includes("druidic-focus") || slot === "focus") {
    return "focus";
  }
  if (token.includes("spell-component")) {
    return "spell-component";
  }
  if (token.includes("ammunition") || token.includes("arrow") || token.includes("bolt") || token.includes("bullet") || token.includes("needle")) {
    return "ammunition";
  }
  if (definition?.category === "magic-item") {
    return "magic-item";
  }
  if (token.includes("potion") || token.includes("scroll") || token.includes("ration") || token.includes("holy-water") || token.includes("consumable")) {
    return "consumable";
  }
  if (token.includes("tool") || token.includes("kit") || token.includes("instrument")) {
    return "tool";
  }
  if (definition?.category === "gear") {
    return "gear";
  }
  return "custom";
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

function consumableStatus(
  definition: EquipmentDefinition | undefined,
  inventoryItem: CharacterDraft["inventory"]["items"][number],
  itemType: InventoryItemType,
): string | undefined {
  if (itemType === "ammunition") {
    return "Ammunition";
  }
  if (itemType === "consumable") {
    return "Consumable";
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
  itemType: InventoryItemType,
): InventoryAutomationStatus {
  if (!definition && itemType === "custom") {
    return "unknown";
  }
  if (category === "armor" || fallbackSlot === "armor" || fallbackSlot === "shield" || (definition && isShieldDefinition(definition))) {
    return "automated";
  }
  if (category === "weapon" || itemType === "weapon") {
    return "partial";
  }
  if (itemType === "ammunition" || itemType === "consumable" || itemType === "spell-component") {
    return "manual";
  }
  if (category === "magic-item" || itemType === "magic-item") {
    return "partial";
  }
  if (category === "gear" || itemType === "tool" || itemType === "focus") {
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
  const itemType = itemTypeFromNormalized(definition, inventoryItem, fallbackSlot);
  const category = definition?.category ?? inventoryItem.category ?? (fallbackSlot === "armor" || fallbackSlot === "shield" ? "armor" : "unresolved");
  const properties = propertyLabels(definition, inventoryItem);
  const masteryName = definition?.mastery?.trim() || undefined;
  const status = inventoryAutomationStatus(definition, category, fallbackSlot, itemType);
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
    itemType,
    notes: inventoryItem.notes,
    equipmentSlot: inventoryItem.equipmentSlot ?? fallbackSlot,
    canEquip: itemType === "armor" || itemType === "shield" || itemType === "weapon" || fallbackSlot === "armor" || fallbackSlot === "shield",
    relevantStats: itemStats(definition, fallbackSlot),
    description: definition?.description,
    sourceLabel: definition?.sourceMeta?.sourceDocumentName,
    weightLabel: definition?.weight !== undefined ? `${definition.weight} lb` : undefined,
    damageInfo: damageInfo(definition),
    armorInfo: armorInfo(definition),
    propertyLabels: properties,
    masteryName,
    consumableStatus: consumableStatus(definition, inventoryItem, itemType),
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

function spellComponentNeed(spell: SpellDefinition): { hasMaterial: boolean; componentText?: string } {
  const text = String(spell.description ?? "");
  const componentsLine = text.match(/(?:^|\n)\s*components?\s*:\s*([^\n]+)/i)?.[1]?.trim();
  if (componentsLine) {
    const hasMaterial = /\bm\b|material/i.test(componentsLine);
    const parenthetical = componentsLine.match(/\bm\s*\(([^)]+)\)/i)?.[1]?.trim();
    return {
      hasMaterial,
      componentText: parenthetical || (hasMaterial ? componentsLine : undefined),
    };
  }
  const parenthetical = text.match(/\bm\s*\(([^)]+)\)/i)?.[1]?.trim();
  if (parenthetical) {
    return {
      hasMaterial: true,
      componentText: parenthetical,
    };
  }
  const genericMaterial = text.match(/\bmaterial components?\b([^.\n]*)/i)?.[0]?.trim();
  if (genericMaterial) {
    return {
      hasMaterial: true,
      componentText: genericMaterial,
    };
  }
  return { hasMaterial: false };
}

function componentTokens(value: string): string[] {
  return normalizeLooseToken(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !["worth", "that", "with", "spell", "material", "components", "consumed", "consume"].includes(token))
    .slice(0, 8);
}

function hasFocusCoverage(item: InventoryItemViewModel): boolean {
  if (item.itemType === "focus") {
    return true;
  }
  const token = normalizeToken(`${item.name} ${item.type ?? ""} ${item.notes ?? ""}`);
  return token.includes("component-pouch") || token.includes("arcane-focus") || token.includes("holy-symbol") || token.includes("druidic-focus");
}

function componentStatusLabel(status: SpellMaterialStatus): string {
  if (status === "present") return "present";
  if (status === "missing") return "missing";
  if (status === "covered-by-focus") return "covered by focus/component pouch";
  return "unknown";
}

function itemMatchesComponent(item: InventoryItemViewModel, componentText: string): boolean {
  if (item.itemType !== "spell-component" && item.itemType !== "gear" && item.itemType !== "consumable" && item.itemType !== "custom") {
    return false;
  }
  const itemText = normalizeLooseToken(`${item.name} ${item.notes ?? ""} ${item.type ?? ""}`);
  const component = normalizeLooseToken(componentText);
  if (!itemText || !component) {
    return false;
  }
  if (itemText.includes(component) || component.includes(itemText)) {
    return true;
  }
  const tokens = componentTokens(componentText);
  return tokens.some((token) => itemText.includes(token));
}

function needsSpecificMaterial(componentText: string): boolean {
  return /\b\d+\s*gp\b|\bworth\b|\bconsum(?:e|ed|ing)\b/i.test(componentText);
}

function buildNeededSpellComponents(
  spells: SpellDefinition[],
  inventoryItems: InventoryItemViewModel[],
): SpellMaterialNeedViewModel[] {
  const hasFocus = inventoryItems.some(hasFocusCoverage);
  const items = inventoryItems.filter((item) => item.quantity > 0);
  const needs: SpellMaterialNeedViewModel[] = [];
  for (const spell of spells) {
    const parsed = spellComponentNeed(spell);
    if (!parsed.hasMaterial) {
      continue;
    }
    const componentText = parsed.componentText ?? "Material components are required, but local component text is incomplete.";
    const matchingItem = items.find((item) => itemMatchesComponent(item, componentText));
    const specificRequired = needsSpecificMaterial(componentText);
    const status: SpellMaterialStatus = !parsed.componentText
      ? "unknown"
      : matchingItem
        ? "present"
        : !specificRequired && hasFocus
          ? "covered-by-focus"
          : "missing";
    needs.push({
      id: `spell-component:${spell.id}`,
      spellId: spell.id,
      spellName: spell.name,
      componentText,
      status,
      statusLabel: componentStatusLabel(status),
      matchingItemName: matchingItem?.name,
      addSuggestionName: `Spell Component: ${spell.name}`,
    });
  }
  return needs;
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
  const itemEntries = normalizedInventory.items.map((item) => {
    const definition = resolveEquipmentDefinitionForInventoryItem(item, engine.equipmentCatalog);
    const fallbackSlot = inferEquipmentSlot(item, definition);
    return {
      item: toItemView(item, definition, fallbackSlot, draft),
      definition,
      slot: fallbackSlot,
    };
  });
  const itemViews = itemEntries.map((entry) => entry.item);
  const armor = itemEntries
    .filter((entry) => (entry.definition?.category === "armor" || entry.slot === "armor") && !(entry.definition && isShieldDefinition(entry.definition)) && entry.slot !== "shield")
    .map((entry) => entry.item);
  const shields = itemEntries
    .filter((entry) => entry.slot === "shield" || Boolean(entry.definition && isShieldDefinition(entry.definition)))
    .map((entry) => entry.item);
  const weapons = itemViews.filter((entry) => entry.itemType === "weapon");
  const consumables = itemViews.filter((entry) => entry.itemType === "consumable");
  const ammunition = itemViews.filter((entry) => entry.itemType === "ammunition");
  const toolsFocus = itemViews.filter((entry) => entry.itemType === "tool" || entry.itemType === "focus");
  const spellComponents = itemViews.filter((entry) => entry.itemType === "spell-component");
  const armorShields = itemViews.filter((entry) => entry.itemType === "armor" || entry.itemType === "shield");
  const unresolvedItems = itemEntries.filter((entry) => !entry.definition).map((entry) => entry.item);
  const excluded = new Set([
    ...armorShields.map((entry) => entry.instanceId),
    ...weapons.map((entry) => entry.instanceId),
    ...consumables.map((entry) => entry.instanceId),
    ...ammunition.map((entry) => entry.instanceId),
    ...toolsFocus.map((entry) => entry.instanceId),
    ...spellComponents.map((entry) => entry.instanceId),
  ]);
  const other = itemViews.filter((entry) => !excluded.has(entry.instanceId));
  const neededSpellComponents = buildNeededSpellComponents(engine.selectedSpells ?? [], itemViews);

  return {
    currency: normalizeCurrencyState(normalizedInventory.currency),
    currencyTotalGp: currencyTotalInGp(normalizedInventory.currency),
    currencyTransactions: [...(normalizedInventory.currencyTransactions ?? [])],
    armorClass,
    equipped: itemViews.filter((entry) => entry.equipped),
    armorShields,
    armor,
    shields,
    weapons,
    consumables,
    ammunition,
    toolsFocus,
    spellComponents,
    other,
    unresolvedItems,
    neededSpellComponents,
    hasComponentFocusCoverage: itemViews.some(hasFocusCoverage),
  };
}
