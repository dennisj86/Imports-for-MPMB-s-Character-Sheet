import { toSlug } from "../../lib/slug";
import type { EquipmentSlot, InventoryItem } from "../../domain/character";
import type { ClassDefinition, EquipmentDefinition } from "../../domain/content";
import type { DerivedDataStatus } from "../../domain/derivedStats";
import type { RuleModifier } from "../../domain/rules";
import { modifiersForTarget, sumFlatModifiers } from "../rules/modifierPipeline";

export type ArmorDexMode = "full" | "max2" | "none";
export type ArmorCalculationMode = "unarmored" | "armor" | "armor+shield" | "unarmored+shield";
export type ArmorAbilityModifierKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface AlternativeArmorClassFormula {
  id: string;
  sourceName: string;
  formulaLabel: string;
  base: number;
  abilityModifiers: ArmorAbilityModifierKey[];
  requiresNoArmor?: boolean;
  canApplyWhileArmored?: boolean;
  allowsShield?: boolean;
}

export interface ArmorClassBreakdown {
  total: number;
  calculation: ArmorCalculationMode;
  armorName?: string;
  armorBase: number;
  dexModifier: number;
  dexMode: ArmorDexMode;
  dexApplied: number;
  shieldName?: string;
  shieldBonus: number;
  bonus: number;
  bonusSources: string[];
  modifierSources?: string[];
  alternativeFormulaId?: string;
  alternativeFormulaSource?: string;
  alternativeFormulaExpression?: string;
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

export function normalizeEquipmentToken(value: string | undefined): string {
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

function normalizeClassToken(value: string | undefined): string {
  return normalizeEquipmentToken(value).replace(/-legacy$/, "");
}

function hasFeatureAtOrBelowLevel(classDef: ClassDefinition | undefined, level: number, matcher: RegExp): boolean {
  if (!classDef) {
    return false;
  }
  return classDef.features.some((feature) => {
    if (feature.minLevel > level) {
      return false;
    }
    return matcher.test(`${feature.key ?? ""} ${feature.name}`);
  });
}

export function resolveAlternativeArmorClassFormulas(input: {
  classDef?: ClassDefinition;
  level: number;
}): AlternativeArmorClassFormula[] {
  const classToken = normalizeClassToken(input.classDef?.compatibility?.canonicalKey ?? input.classDef?.canonicalClassKey ?? input.classDef?.key ?? input.classDef?.name);
  const formulas: AlternativeArmorClassFormula[] = [];
  if (classToken === "barbarian" && hasFeatureAtOrBelowLevel(input.classDef, input.level, /unarmored defense/i)) {
    formulas.push({
      id: "barbarian-unarmored-defense",
      sourceName: "Barbarian: Unarmored Defense",
      formulaLabel: "10 + DEX modifier + CON modifier",
      base: 10,
      abilityModifiers: ["dex", "con"],
      requiresNoArmor: true,
      allowsShield: true,
    });
  }
  return formulas;
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

type EquipmentLike = Pick<EquipmentDefinition, "id" | "key" | "category" | "name" | "type" | "description">;

function parseDefinitionIdFromInventoryId(id: string): string | undefined {
  const marker = ":catalog:";
  const markerIndex = id.indexOf(marker);
  if (markerIndex === -1) {
    return undefined;
  }
  return id.slice(markerIndex + marker.length);
}

export function getInventoryItemDefinitionId(item: InventoryItem): string {
  return item.itemDefinitionId ?? parseDefinitionIdFromInventoryId(item.id) ?? item.id;
}

function findCatalogMatchByName(catalog: EquipmentDefinition[], item: InventoryItem): EquipmentDefinition | undefined {
  const needle = normalizeEquipmentToken(item.name);
  if (!needle) {
    return undefined;
  }
  return catalog.find((entry) => normalizeEquipmentToken(entry.name) === needle || normalizeEquipmentToken(entry.key) === needle);
}

export function resolveEquipmentDefinitionForInventoryItem(
  item: InventoryItem,
  equipmentCatalog: EquipmentDefinition[] | undefined,
): EquipmentDefinition | undefined {
  const catalog = equipmentCatalog ?? [];
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  return byId.get(getInventoryItemDefinitionId(item)) ?? byId.get(item.id) ?? findCatalogMatchByName(catalog, item);
}

function asEquipmentLike(item: InventoryItem, definition?: EquipmentDefinition): EquipmentLike {
  return {
    id: definition?.id ?? getInventoryItemDefinitionId(item),
    key: definition?.key ?? item.name,
    category: definition?.category ?? (item.category as EquipmentDefinition["category"] | undefined) ?? "gear",
    name: definition?.name ?? item.name,
    type: definition?.type ?? item.type ?? item.equipmentSlot,
    description: definition?.description,
  };
}

function resolveArmorProfile(item: EquipmentLike): { base: number; dexMode: ArmorDexMode } | undefined {
  const token = normalizeEquipmentToken(`${item.key} ${item.name}`);
  const byKey =
    ARMOR_BASE_BY_KEY[normalizeEquipmentToken(item.key)] ??
    ARMOR_BASE_BY_KEY[normalizeEquipmentToken(item.name)] ??
    Object.entries(ARMOR_BASE_BY_KEY).find(([key]) => token.includes(key))?.[1];
  if (byKey) {
    return byKey;
  }

  const fromDescription = parseArmorFromDescription(item.description);
  if (fromDescription) {
    return fromDescription;
  }

  const typeToken = normalizeEquipmentToken(item.type);
  if (typeToken === "light" || typeToken.includes("light-armor")) {
    return { base: 11, dexMode: "full" };
  }
  if (typeToken === "medium" || typeToken.includes("medium-armor")) {
    return { base: 13, dexMode: "max2" };
  }
  if (typeToken === "heavy" || typeToken.includes("heavy-armor")) {
    return { base: 16, dexMode: "none" };
  }
  return undefined;
}

export function isShieldDefinition(item: EquipmentLike): boolean {
  const nameToken = normalizeEquipmentToken(item.name);
  const keyToken = normalizeEquipmentToken(item.key);
  const typeToken = normalizeEquipmentToken(item.type);
  if (typeToken.includes("shield")) {
    return true;
  }
  if (item.category === "armor" && (nameToken.includes("shield") || keyToken.includes("shield"))) {
    return true;
  }
  return nameToken === "shield" || keyToken === "shield" || nameToken.startsWith("shield-of-") || keyToken.startsWith("shield-of-");
}

function isArmorDefinition(item: EquipmentLike): boolean {
  if (item.category === "armor") {
    return true;
  }
  const token = normalizeEquipmentToken(`${item.type ?? ""} ${item.key} ${item.name}`);
  return Boolean(resolveArmorProfile(item)) || token.includes("armor");
}

export function inferEquipmentSlot(item: InventoryItem, definition?: EquipmentDefinition): EquipmentSlot {
  const like = asEquipmentLike(item, definition);
  const token = normalizeEquipmentToken(`${like.type ?? ""} ${like.key} ${like.name} ${like.description ?? ""}`);
  if (isShieldDefinition(like)) {
    return "shield";
  }
  if (isArmorDefinition(like)) {
    return "armor";
  }
  if (like.category === "weapon") {
    if (token.includes("two-handed")) {
      return "twoHanded";
    }
    if (token.includes("ammunition") || token.includes("ranged")) {
      return "ranged";
    }
    return "mainHand";
  }
  if (token.includes("focus")) {
    return "focus";
  }
  return "other";
}

function parseShieldBonus(item: EquipmentLike): number {
  const text = `${item.name}\n${item.description ?? ""}`;
  const magicName = text.match(/\+([1-3])\s+shield/i);
  if (magicName) {
    return 2 + Number(magicName[1]);
  }
  const additionalBonus = text.match(/\+([1-3])\s+(?:bonus\s+)?to\s+(?:ac|armor class|rüstungsklasse)/i);
  if (additionalBonus) {
    return 2 + Number(additionalBonus[1]);
  }
  const explicitShieldIncrease = text.match(/(?:increases|increase|raises|raise).*?(?:ac|armor class|rüstungsklasse)\s+by\s+([1-5])/i);
  if (explicitShieldIncrease) {
    return Number(explicitShieldIncrease[1]);
  }
  const numberOnly = text.trim().match(/^([1-5])$/);
  if (numberOnly) {
    return Number(numberOnly[1]);
  }
  return 2;
}

function parseSimpleAcBonus(item: EquipmentLike): number | undefined {
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
  abilityModifiers?: Partial<Record<ArmorAbilityModifierKey, number>>;
  alternativeFormulas?: AlternativeArmorClassFormula[];
  ruleModifiers?: RuleModifier[];
  concentrationActive?: boolean;
}): ArmorClassBreakdown {
  const abilityModifiers: Record<ArmorAbilityModifierKey, number> = {
    str: input.abilityModifiers?.str ?? 0,
    dex: input.abilityModifiers?.dex ?? input.dexModifier,
    con: input.abilityModifiers?.con ?? 0,
    int: input.abilityModifiers?.int ?? 0,
    wis: input.abilityModifiers?.wis ?? 0,
    cha: input.abilityModifiers?.cha ?? 0,
  };
  const warnings: string[] = [];
  const equippedItems = input.inventoryItems.filter((entry) => entry.equipped);
  const equippedDefinitions = equippedItems.map((inventory) => {
    const definition = resolveEquipmentDefinitionForInventoryItem(inventory, input.equipmentCatalog);
    const like = asEquipmentLike(inventory, definition);
    if (!definition) {
      warnings.push(`${inventory.name} could not be resolved from the active equipment catalog; using name/type fallback.`);
    }
    return { inventory, definition, like };
  });

  const armorDefinitions = equippedDefinitions
    .map((entry) => entry.like)
    .filter((entry) => isArmorDefinition(entry) && !isShieldDefinition(entry));
  const shieldDefinitions = equippedDefinitions
    .map((entry) => entry.like)
    .filter((entry) => isShieldDefinition(entry));

  let armorName: string | undefined;
  let armorBase = 10;
  let dexMode: ArmorDexMode = "full";
  let dexApplied = abilityModifiers.dex;
  let armorTotal = 10 + abilityModifiers.dex;

  for (const armor of armorDefinitions) {
    const profile = resolveArmorProfile(armor);
    if (!profile) {
      warnings.push(`Armor profile for ${armor.name} is not structured enough for automatic AC.`);
      continue;
    }
    const candidateDex = dexForMode(abilityModifiers.dex, profile.dexMode);
    const candidateTotal = profile.base + candidateDex;
    if (candidateTotal > armorTotal || !armorName) {
      armorName = armor.name;
      armorBase = profile.base;
      dexMode = profile.dexMode;
      dexApplied = candidateDex;
      armorTotal = candidateTotal;
    }
  }

  let alternativeFormula:
    | {
      formula: AlternativeArmorClassFormula;
      total: number;
      expression: string;
      dexContribution: number;
      otherAbilityContribution: number;
    }
    | undefined;
  for (const formula of input.alternativeFormulas ?? []) {
    const canApplyWhileArmored = formula.canApplyWhileArmored === true;
    if (armorName && !canApplyWhileArmored) {
      continue;
    }
    if (formula.requiresNoArmor && armorName) {
      continue;
    }
    const dexContribution = formula.abilityModifiers.includes("dex") ? abilityModifiers.dex : 0;
    const otherAbilityContribution = formula.abilityModifiers
      .filter((ability) => ability !== "dex")
      .reduce((sum, ability) => sum + abilityModifiers[ability], 0);
    const total = formula.base + dexContribution + otherAbilityContribution;
    if (!alternativeFormula || total > alternativeFormula.total) {
      alternativeFormula = {
        formula,
        total,
        expression: formula.formulaLabel,
        dexContribution,
        otherAbilityContribution,
      };
    }
  }

  if (alternativeFormula && (!armorName || alternativeFormula.total >= armorTotal)) {
    armorName = undefined;
    armorBase = alternativeFormula.formula.base + alternativeFormula.otherAbilityContribution;
    dexMode = alternativeFormula.formula.abilityModifiers.includes("dex") ? "full" : "none";
    dexApplied = alternativeFormula.dexContribution;
    armorTotal = alternativeFormula.total;
  }

  const shield = shieldDefinitions[0];
  const shieldAllowed = alternativeFormula?.formula.allowsShield !== false;
  const shieldBonus = shield && shieldAllowed ? parseShieldBonus(shield) : 0;
  const bonusItems = equippedDefinitions
    .map((entry) => ({ item: entry.like, bonus: parseSimpleAcBonus(entry.like) }))
    .filter((entry): entry is { item: EquipmentLike; bonus: number } => entry.bonus !== undefined && !isShieldDefinition(entry.item));
  const ruleModifierResult = sumFlatModifiers(modifiersForTarget(input.ruleModifiers ?? [], "armor-class"), {
    inventoryItems: input.inventoryItems,
    shieldEquipped: Boolean(shield),
    wearingArmor: Boolean(armorName),
    concentrationActive: input.concentrationActive,
    target: "armor-class",
  });
  const ruleBonus = ruleModifierResult.total;
  const bonus = bonusItems.reduce((sum, entry) => sum + entry.bonus, 0) + ruleBonus;
  const bonusSources = bonusItems.map((entry) => `${entry.item.name} +${entry.bonus}`);
  const modifierSources = ruleModifierResult.applications
    .filter((entry) => entry.applied && entry.modifier.valueType === "flat")
    .map((entry) => `${entry.modifier.sourceName} +${entry.modifier.value}`);
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
    dexModifier: input.dexModifier,
    dexMode,
    dexApplied,
    shieldName: shield?.name,
    shieldBonus,
    bonus,
    bonusSources: [...bonusSources, ...modifierSources],
    modifierSources,
    alternativeFormulaId: alternativeFormula?.formula.id,
    alternativeFormulaSource: alternativeFormula?.formula.sourceName,
    alternativeFormulaExpression: alternativeFormula?.expression,
    warnings: [
      ...warnings,
      ...ruleModifierResult.applications.filter((entry) => !entry.applied && entry.reason).map((entry) => `${entry.modifier.sourceName}: ${entry.reason}`),
    ],
    dataStatus: warnings.length ? "partial" : "complete",
  };
}
