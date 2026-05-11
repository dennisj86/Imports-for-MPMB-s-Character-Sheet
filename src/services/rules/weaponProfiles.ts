import type { CharacterDraft, InventoryItem } from "../../domain/character";
import type { EquipmentDefinition } from "../../domain/content";
import type { AbilityKey, DerivedCharacterStats } from "../../domain/derivedStats";
import type { RuleModifier } from "../../domain/rules";
import { normalizeInventoryState, resolveEquipmentDefinitionForInventoryItem } from "../equipment";
import { modifiersForTarget, sumFlatModifiers } from "./modifierPipeline";

export interface WeaponAttackProfile {
  id: string;
  itemInstanceId: string;
  itemDefinitionId?: string;
  weaponName: string;
  equipped: boolean;
  usageMode: "melee" | "ranged" | "thrown" | "versatile-one-hand" | "versatile-two-hand";
  attackAbility: AbilityKey;
  proficiencyApplied: boolean;
  attackBonus: number;
  damageDice?: string;
  versatileDamageDice?: string;
  damageAbilityModifier: number;
  flatDamageModifier: number;
  damageModifier: number;
  damageType?: string;
  properties: string[];
  range?: string;
  masteryBadges: string[];
  breakdown: {
    attack: string[];
    damage: string[];
  };
  appliedAttackModifiers: RuleModifier[];
  appliedDamageModifiers: RuleModifier[];
  diagnostics: string[];
}

const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const PROPERTY_TOKENS = ["ammunition", "finesse", "heavy", "light", "loading", "range", "reach", "special", "thrown", "two-handed", "versatile", "ranged", "melee"];

function compactText(item: InventoryItem, definition: EquipmentDefinition | undefined): string {
  return [definition?.name ?? item.name, definition?.type ?? item.type, definition?.description].filter(Boolean).join(" ");
}

function extractDamageDice(text: string): string | undefined {
  return text.match(/\b\d*d\d+\b/i)?.[0]?.replace(/\s+/g, "");
}

function extractVersatileDamageDice(text: string): string | undefined {
  return text.match(/\bversatile\s*\((\d*d\d+)\)/i)?.[1]?.replace(/\s+/g, "");
}

function damageDiceFromStructuredDamage(damage: unknown): string | undefined {
  if (!Array.isArray(damage) || damage.length < 2) {
    return undefined;
  }
  const count = Number(damage[0]);
  const die = Number(damage[1]);
  if (!Number.isFinite(count) || !Number.isFinite(die) || count <= 0 || die <= 0) {
    return undefined;
  }
  return `${Math.trunc(count)}d${Math.trunc(die)}`;
}

function damageTypeFromStructuredDamage(damage: unknown): string | undefined {
  if (!Array.isArray(damage) || damage.length < 3 || typeof damage[2] !== "string") {
    return undefined;
  }
  return String(damage[2]).toLowerCase();
}

function extractDamageType(text: string): string | undefined {
  const lower = text.toLowerCase();
  return DAMAGE_TYPES.find((type) => lower.includes(type));
}

function extractProperties(text: string): string[] {
  const lower = text.toLowerCase();
  const props = new Set<string>();
  for (const token of PROPERTY_TOKENS) {
    if (lower.includes(token)) {
      props.add(token);
    }
  }
  if (/\b\d+\/\d+\b/.test(lower) || /\brange\b/.test(lower)) {
    props.add("ranged");
  }
  return Array.from(props);
}

function structuredProperties(
  item: InventoryItem,
  definition: EquipmentDefinition | undefined,
): string[] {
  const props = new Set<string>();
  const weaponList = String(definition?.weaponList ?? "").toLowerCase();
  const type = String(definition?.type ?? item.type ?? "").toLowerCase();
  if (weaponList === "ranged") {
    props.add("ranged");
  }
  if (weaponList === "melee") {
    props.add("melee");
  }
  if (type.includes("simple")) {
    props.add("simple");
  }
  if (type.includes("martial")) {
    props.add("martial");
  }
  return Array.from(props);
}

function extractRange(text: string): string | undefined {
  return text.match(/\b\d{2,3}\s*\/\s*\d{2,3}\b/)?.[0] ?? text.match(/\b\d{1,3}\s*ft\b/i)?.[0];
}

function abilityModifier(derivedStats: DerivedCharacterStats, ability: AbilityKey): number {
  return derivedStats.abilityScores[ability]?.modifier ?? 0;
}

function chooseAttackAbility(properties: string[], derivedStats: DerivedCharacterStats): { ability: AbilityKey; diagnostics: string[] } {
  const propSet = new Set(properties);
  if (propSet.has("ranged") && !propSet.has("thrown")) {
    return { ability: "dex", diagnostics: [] };
  }
  if (propSet.has("finesse")) {
    const str = abilityModifier(derivedStats, "str");
    const dex = abilityModifier(derivedStats, "dex");
    return {
      ability: dex > str ? "dex" : "str",
      diagnostics: ["Finesse weapon uses the better STR/DEX modifier until explicit usage selection exists."],
    };
  }
  return { ability: "str", diagnostics: [] };
}

function usageMode(properties: string[]): WeaponAttackProfile["usageMode"] {
  const propSet = new Set(properties);
  if (propSet.has("ranged") && !propSet.has("thrown")) {
    return "ranged";
  }
  if (propSet.has("thrown")) {
    return "thrown";
  }
  if (propSet.has("versatile")) {
    return "versatile-one-hand";
  }
  return "melee";
}

function normalizeSelectionToken(value: string | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function singularizeSelectionToken(value: string): string {
  if (value.endsWith("ies")) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith("es")) {
    return value.slice(0, -2);
  }
  if (value.endsWith("s")) {
    return value.slice(0, -1);
  }
  return value;
}

function expandSelectionTokens(values: Array<string | undefined>): Set<string> {
  const expanded = new Set<string>();
  for (const entry of values) {
    const normalized = normalizeSelectionToken(entry);
    if (!normalized) {
      continue;
    }
    expanded.add(normalized);
    const singular = singularizeSelectionToken(normalized);
    if (singular) {
      expanded.add(singular);
    }
  }
  return expanded;
}

function weaponCategoryToken(item: InventoryItem, definition: EquipmentDefinition | undefined): string {
  return `${definition?.type ?? item.type ?? ""} ${definition?.name ?? item.name}`.toLowerCase();
}

function isSimpleWeapon(item: InventoryItem, definition: EquipmentDefinition | undefined): boolean {
  return weaponCategoryToken(item, definition).includes("simple");
}

function isMartialWeapon(item: InventoryItem, definition: EquipmentDefinition | undefined): boolean {
  return weaponCategoryToken(item, definition).includes("martial");
}

function isSidearmWeapon(item: InventoryItem, definition: EquipmentDefinition | undefined): boolean {
  return weaponCategoryToken(item, definition).includes("sidearm");
}

function proficiencyAppliesForWeapon(
  item: InventoryItem,
  definition: EquipmentDefinition | undefined,
  weaponProficiencies: string[] | undefined,
): boolean {
  if (!weaponProficiencies) {
    return true;
  }
  const normalized = expandSelectionTokens(weaponProficiencies);
  if (normalized.has("all-weapons") || normalized.has("all")) {
    return true;
  }
  const specificTokens = expandSelectionTokens([
    definition?.id,
    definition?.key,
    definition?.name,
    item.itemDefinitionId,
    item.id,
    item.name,
  ]);
  if (Array.from(specificTokens).some((token) => normalized.has(token))) {
    return true;
  }
  if (normalized.has("simple-weapons") && isSimpleWeapon(item, definition)) {
    return true;
  }
  if (normalized.has("martial-weapons") && isMartialWeapon(item, definition)) {
    return true;
  }
  if (normalized.has("sidearms") && isSidearmWeapon(item, definition)) {
    return true;
  }
  return false;
}

export function weaponMasteryBadgesForItem(
  draft: CharacterDraft,
  item: InventoryItem,
  definition: EquipmentDefinition | undefined,
): string[] {
  const tokens = new Set([
    definition?.id,
    definition?.key,
    definition?.name,
    item.itemDefinitionId,
    item.id,
    item.instanceId,
    item.name,
  ].map(normalizeSelectionToken).filter(Boolean));
  const selected = Object.entries(draft.ruleChoices ?? [])
    .filter(([choiceId, state]) => choiceId.includes("weapon-mastery") && state.status === "complete")
    .flatMap(([, state]) => state.selectedOptionIds)
    .map(normalizeSelectionToken);
  return selected.some((optionId) => tokens.has(optionId)) ? ["Mastery selected"] : [];
}

export function buildWeaponAttackProfiles(input: {
  draft: CharacterDraft;
  equipmentCatalog: EquipmentDefinition[];
  derivedStats: DerivedCharacterStats;
  modifiers?: RuleModifier[];
  includeUnequipped?: boolean;
  weaponProficiencies?: string[];
}): WeaponAttackProfile[] {
  const inventory = normalizeInventoryState(input.draft.inventory, input.equipmentCatalog);
  return inventory.items
    .map((item, index): WeaponAttackProfile | undefined => {
      const definition = resolveEquipmentDefinitionForInventoryItem(item, input.equipmentCatalog);
      if ((definition?.category ?? item.category) !== "weapon") {
        return undefined;
      }
      if (!item.equipped && !input.includeUnequipped) {
        return undefined;
      }
      const text = compactText(item, definition);
      const properties = Array.from(new Set([...extractProperties(text), ...structuredProperties(item, definition)]));
      const attackAbility = chooseAttackAbility(properties, input.derivedStats);
      const abilityMod = abilityModifier(input.derivedStats, attackAbility.ability);
      const weaponContext = {
        draft: input.draft,
        inventoryItems: inventory.items,
        weapon: {
          equipped: Boolean(item.equipped),
          properties,
          usageMode: usageMode(properties),
        },
      };
      const attackModifiers = sumFlatModifiers(modifiersForTarget(input.modifiers ?? [], "weapon-attack"), weaponContext);
      const damageModifiers = sumFlatModifiers(modifiersForTarget(input.modifiers ?? [], "weapon-damage"), weaponContext);
      const proficiencyBonus = input.derivedStats.proficiencyBonus;
      const proficiencyApplied = proficiencyAppliesForWeapon(item, definition, input.weaponProficiencies);
      const attackBonus = abilityMod + (proficiencyApplied ? proficiencyBonus : 0) + attackModifiers.total;
      const flatDamageModifier = damageModifiers.total;
      const damageModifier = abilityMod + flatDamageModifier;
      const structuredDamageDice = damageDiceFromStructuredDamage(definition?.damage);
      const damageDice = structuredDamageDice ?? extractDamageDice(text);
      const versatileDamageDice = extractVersatileDamageDice(text);
      const damageType = damageTypeFromStructuredDamage(definition?.damage) ?? extractDamageType(text);
      const masteryBadges = weaponMasteryBadgesForItem(input.draft, item, definition);
      const diagnostics = [
        ...attackAbility.diagnostics,
        ...(damageDice ? [] : ["No structured damage dice found for this weapon."]),
        ...(definition ? [] : ["Weapon definition missing; using inventory fallback fields."]),
        ...(structuredDamageDice ? [] : ["Base weapon damage dice fell back to textual extraction."]),
        ...(input.weaponProficiencies && !proficiencyApplied ? ["Weapon proficiency not established by the current deterministic proficiency set."] : []),
      ];
      return {
        id: `weapon-profile:${definition?.id ?? item.itemDefinitionId ?? item.id}:${index}`,
        itemInstanceId: item.instanceId ?? item.id,
        itemDefinitionId: definition?.id ?? item.itemDefinitionId,
        weaponName: definition?.name ?? item.name,
        equipped: Boolean(item.equipped),
        usageMode: usageMode(properties),
        attackAbility: attackAbility.ability,
        proficiencyApplied,
        attackBonus,
        damageDice,
        versatileDamageDice,
        damageAbilityModifier: abilityMod,
        flatDamageModifier,
        damageModifier,
        damageType,
        properties,
        range: definition?.range ?? extractRange(text),
        masteryBadges,
        breakdown: {
          attack: [
            `${attackAbility.ability.toUpperCase()} ${abilityMod >= 0 ? `+${abilityMod}` : abilityMod}`,
            ...(proficiencyApplied ? [`Proficiency +${proficiencyBonus}`] : ["No proficiency bonus"]),
            ...attackModifiers.applications.filter((entry) => entry.applied).map((entry) => `${entry.modifier.sourceName} +${entry.modifier.value}`),
          ],
          damage: [
            `${attackAbility.ability.toUpperCase()} ${abilityMod >= 0 ? `+${abilityMod}` : abilityMod}`,
            ...damageModifiers.applications.filter((entry) => entry.applied).map((entry) => `${entry.modifier.sourceName} +${entry.modifier.value}`),
          ],
        },
        appliedAttackModifiers: attackModifiers.applications.filter((entry) => entry.applied).map((entry) => entry.modifier),
        appliedDamageModifiers: damageModifiers.applications.filter((entry) => entry.applied).map((entry) => entry.modifier),
        diagnostics,
      };
    })
    .filter((entry): entry is WeaponAttackProfile => Boolean(entry))
    .sort((left, right) => Number(right.equipped) - Number(left.equipped) || left.weaponName.localeCompare(right.weaponName));
}
