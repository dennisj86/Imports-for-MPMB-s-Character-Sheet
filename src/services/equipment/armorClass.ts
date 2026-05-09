import { toSlug } from "../../lib/slug";
import type { InventoryItem } from "../../domain/character";
import type { EquipmentDefinition } from "../../domain/content";
import type { DerivedDataStatus } from "../../domain/derivedStats";

export type ArmorDexMode = "full" | "max2" | "none";
export type ArmorCalculationMode = "unarmored" | "armor" | "armor+shield" | "unarmored+shield";

export interface ArmorClassBreakdown {
  total: number;
  calculation: ArmorCalculationMode;
  armorName?: string;
  armorBase: number;
  dexApplied: number;
  shieldName?: string;
  shieldBonus: number;
  bonus: number;
  bonusSources: string[];
  warnings: string[];
  dataStatus: DerivedDataStatus;
}

const ARMOR_BASE_BY_KEY: Record<string, { base: number; dexMode: ArmorDexMode }> = {
  padded: { base: 11, dexMode: "full" },
  leather: { base: 11, dexMode: "full" },
  "studded-leather": { base: 12, dexMode: "full" },
  hide: { base: 12, dexMode: "max2" },
  "chain-shirt": { base: 13, dexMode: "max2" },
  "scale-mail": { base: 14, dexMode: "max2" },
  breastplate: { base: 14, dexMode: "max2" },
  "half-plate": { base: 15, dexMode: "max2" },
  "ring-mail": { base: 14, dexMode: "none" },
  "chain-mail": { base: 16, dexMode: "none" },
  splint: { base: 17, dexMode: "none" },
  plate: { base: 18, dexMode: "none" },
};

function normalizeToken(value: string | undefined): string {
  return toSlug(value ?? "")
    .replace(/^srd-2024-/, "")
    .replace(/^srd-2014-/, "")
    .replace(/^srd-/, "")
    .replace(/^open5e-2024-/, "")
    .replace(/^open5e-2014-/, "")
    .replace(/^open5e-/, "")
    .replace(/-2014$/, "")
    .replace(/-2024$/, "");
}

function parseArmorFromDescription(description: string | undefined): { base: number; dexMode: ArmorDexMode } | undefined {
  const text = String(description ?? "");
  if (!text.trim()) {
    return undefined;
  }

  const plusDexMax = text.match(/([0-9]{1,2})\s*\+\s*dex[^0-9]*max[^0-9]*([0-9])/i);
  if (plusDexMax) {
    return { base: Number(plusDexMax[1]), dexMode: "max2" };
  }

  const plusDex = text.match(/([0-9]{1,2})\s*\+\s*dex/i);
  if (plusDex) {
    return { base: Number(plusDex[1]), dexMode: "full" };
  }

  const armorClass = text.match(/\b(?:ac|armor class|rüstungsklasse)[^0-9]*([0-9]{1,2})\b/i);
  if (armorClass) {
    return { base: Number(armorClass[1]), dexMode: "none" };
  }

  return undefined;
}

function resolveArmorProfile(item: EquipmentDefinition): { base: number; dexMode: ArmorDexMode } | undefined {
  const byKey = ARMOR_BASE_BY_KEY[normalizeToken(item.key)] ?? ARMOR_BASE_BY_KEY[normalizeToken(item.name)];
  if (byKey) {
    return byKey;
  }

  const fromDescription = parseArmorFromDescription(item.description);
  if (fromDescription) {
    return fromDescription;
  }

  const typeToken = normalizeToken(item.type);
  if (typeToken === "light") {
    return { base: 11, dexMode: "full" };
  }
  if (typeToken === "medium") {
    return { base: 13, dexMode: "max2" };
  }
  if (typeToken === "heavy") {
    return { base: 16, dexMode: "none" };
  }
  return undefined;
}

export function isShieldDefinition(item: EquipmentDefinition): boolean {
  const token = normalizeToken(`${item.type ?? ""} ${item.key} ${item.name}`);
  return token.includes("shield");
}

function parseShieldBonus(item: EquipmentDefinition): number {
  const text = String(item.description ?? "");
  const byPhrase = text.match(/(?:increases|bonus|ac|armor class|rüstungsklasse).*?([0-9]+)/i);
  if (byPhrase) {
    const value = Number(byPhrase[1]);
    if (Number.isFinite(value) && value > 0 && value <= 5) {
      return value;
    }
  }
  return 2;
}

function parseSimpleAcBonus(item: EquipmentDefinition): number | undefined {
  const text = `${item.name}\n${item.description ?? ""}`;
  const match = text.match(/\+([1-3])\s+(?:bonus\s+)?(?:to\s+)?(?:ac|armor class|rüstungsklasse)/i);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function dexForMode(dexModifier: number, mode: ArmorDexMode): number {
  if (mode === "none") {
    return 0;
  }
  if (mode === "max2") {
    return Math.min(2, dexModifier);
  }
  return dexModifier;
}

export function resolveArmorClassFromEquipment(input: {
  inventoryItems: InventoryItem[];
  equipmentCatalog: EquipmentDefinition[] | undefined;
  dexModifier: number;
}): ArmorClassBreakdown {
  const warnings: string[] = [];
  const equippedItems = input.inventoryItems.filter((entry) => entry.equipped);
  const byId = new Map((input.equipmentCatalog ?? []).map((entry) => [entry.id, entry]));
  const equippedDefinitions = equippedItems
    .map((inventory) => ({ inventory, definition: byId.get(inventory.id) }))
    .filter((entry): entry is { inventory: InventoryItem; definition: EquipmentDefinition } => Boolean(entry.definition));
  const unresolvedCount = equippedItems.length - equippedDefinitions.length;
  if (unresolvedCount > 0) {
    warnings.push(`${unresolvedCount} equipped item(s) could not be resolved from the active equipment catalog.`);
  }

  const armorDefinitions = equippedDefinitions
    .map((entry) => entry.definition)
    .filter((entry) => entry.category === "armor" && !isShieldDefinition(entry));
  const shieldDefinitions = equippedDefinitions
    .map((entry) => entry.definition)
    .filter((entry) => entry.category === "armor" && isShieldDefinition(entry));

  let armorName: string | undefined;
  let armorBase = 10;
  let dexApplied = input.dexModifier;
  let armorTotal = 10 + input.dexModifier;

  for (const armor of armorDefinitions) {
    const profile = resolveArmorProfile(armor);
    if (!profile) {
      warnings.push(`Armor profile for ${armor.name} is not structured enough for automatic AC.`);
      continue;
    }
    const candidateDex = dexForMode(input.dexModifier, profile.dexMode);
    const candidateTotal = profile.base + candidateDex;
    if (candidateTotal > armorTotal || !armorName) {
      armorName = armor.name;
      armorBase = profile.base;
      dexApplied = candidateDex;
      armorTotal = candidateTotal;
    }
  }

  const shield = shieldDefinitions[0];
  const shieldBonus = shield ? parseShieldBonus(shield) : 0;
  const bonusItems = equippedDefinitions
    .map((entry) => ({ item: entry.definition, bonus: parseSimpleAcBonus(entry.definition) }))
    .filter((entry): entry is { item: EquipmentDefinition; bonus: number } => entry.bonus !== undefined && !isShieldDefinition(entry.item));
  const bonus = bonusItems.reduce((sum, entry) => sum + entry.bonus, 0);
  const bonusSources = bonusItems.map((entry) => `${entry.item.name} +${entry.bonus}`);
  const total = armorTotal + shieldBonus + bonus;
  const calculation: ArmorCalculationMode = armorName
    ? shield
      ? "armor+shield"
      : "armor"
    : shield
      ? "unarmored+shield"
      : "unarmored";

  return {
    total,
    calculation,
    armorName,
    armorBase,
    dexApplied,
    shieldName: shield?.name,
    shieldBonus,
    bonus,
    bonusSources,
    warnings,
    dataStatus: warnings.length ? "partial" : "complete",
  };
}
