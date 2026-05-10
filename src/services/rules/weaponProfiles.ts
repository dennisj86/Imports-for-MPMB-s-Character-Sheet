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
  damageAbilityModifier: number;
  flatDamageModifier: number;
  damageModifier: number;
  damageType?: string;
  properties: string[];
  range?: string;
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

export function buildWeaponAttackProfiles(input: {
  draft: CharacterDraft;
  equipmentCatalog: EquipmentDefinition[];
  derivedStats: DerivedCharacterStats;
  modifiers?: RuleModifier[];
  includeUnequipped?: boolean;
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
      const properties = extractProperties(text);
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
      const attackBonus = abilityMod + proficiencyBonus + attackModifiers.total;
      const flatDamageModifier = damageModifiers.total;
      const damageModifier = abilityMod + flatDamageModifier;
      const damageDice = extractDamageDice(text);
      const damageType = extractDamageType(text);
      const diagnostics = [
        ...attackAbility.diagnostics,
        ...(damageDice ? [] : ["No structured damage dice found for this weapon."]),
        ...(definition ? [] : ["Weapon definition missing; using inventory fallback fields."]),
      ];
      return {
        id: `weapon-profile:${definition?.id ?? item.itemDefinitionId ?? item.id}:${index}`,
        itemInstanceId: item.instanceId ?? item.id,
        itemDefinitionId: definition?.id ?? item.itemDefinitionId,
        weaponName: definition?.name ?? item.name,
        equipped: Boolean(item.equipped),
        usageMode: usageMode(properties),
        attackAbility: attackAbility.ability,
        proficiencyApplied: true,
        attackBonus,
        damageDice,
        damageAbilityModifier: abilityMod,
        flatDamageModifier,
        damageModifier,
        damageType,
        properties,
        range: extractRange(text),
        breakdown: {
          attack: [
            `${attackAbility.ability.toUpperCase()} ${abilityMod >= 0 ? `+${abilityMod}` : abilityMod}`,
            `Proficiency +${proficiencyBonus}`,
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
