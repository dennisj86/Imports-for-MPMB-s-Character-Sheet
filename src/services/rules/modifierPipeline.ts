import type { CharacterDraft, InventoryItem } from "../../domain/character";
import type { RuleModifier, RuleModifierApplication, RuleModifierTarget } from "../../domain/rules";

export interface ModifierEvaluationContext {
  draft?: CharacterDraft;
  inventoryItems?: InventoryItem[];
  target?: RuleModifierTarget;
  ability?: RuleModifier["ability"];
  skill?: RuleModifier["skill"];
  weapon?: {
    equipped?: boolean;
    properties?: string[];
    usageMode?: "melee" | "ranged" | "thrown" | "versatile-one-hand" | "versatile-two-hand";
  };
  shieldEquipped?: boolean;
  wearingArmor?: boolean;
  spellcasting?: boolean;
  concentrationActive?: boolean;
}

function numericValue(modifier: RuleModifier): number {
  return typeof modifier.value === "number" && Number.isFinite(modifier.value) ? Math.trunc(modifier.value) : 0;
}

function hasEquippedSlot(items: InventoryItem[] | undefined, slot: string): boolean {
  return Boolean(items?.some((item) => item.equipped && item.equipmentSlot === slot));
}

function mediumOrHeavyArmorEquipped(items: InventoryItem[] | undefined): boolean {
  return Boolean(items?.some((item) => {
    if (!item.equipped || item.equipmentSlot !== "armor") {
      return false;
    }
    const token = `${item.type ?? ""} ${item.name}`.toLowerCase();
    return token.includes("medium armor") || token.includes("heavy armor") || token.includes("chain mail") || token.includes("scale mail") || token.includes("breastplate") || token.includes("half plate") || token.includes("ring mail") || token.includes("splint") || token.includes("plate");
  }));
}

export function evaluateModifierCondition(
  modifier: RuleModifier,
  context: ModifierEvaluationContext = {},
): { applied: boolean; reason?: string } {
  if (context.target && modifier.target !== context.target) {
    return { applied: false, reason: `Target ${modifier.target} does not match ${context.target}.` };
  }
  if (modifier.ability && context.ability && modifier.ability !== context.ability) {
    return { applied: false, reason: `Ability ${modifier.ability} does not match ${context.ability}.` };
  }
  if (modifier.skill && context.skill && modifier.skill !== context.skill) {
    return { applied: false, reason: `Skill ${modifier.skill} does not match ${context.skill}.` };
  }

  const properties = new Set((context.weapon?.properties ?? []).map((entry) => entry.toLowerCase()));
  const wearingArmor = context.wearingArmor ?? hasEquippedSlot(context.inventoryItems, "armor");
  const shieldEquipped = context.shieldEquipped ?? hasEquippedSlot(context.inventoryItems, "shield");

  switch (modifier.condition) {
    case "always":
      return { applied: true };
    case "wearing-armor":
      return wearingArmor ? { applied: true } : { applied: false, reason: "Requires equipped armor." };
    case "wearing-medium-or-heavy-armor":
      return mediumOrHeavyArmorEquipped(context.inventoryItems) ? { applied: true } : { applied: false, reason: "Requires medium or heavy armor." };
    case "not-wearing-armor":
      return !wearingArmor ? { applied: true } : { applied: false, reason: "Requires no equipped armor." };
    case "shield-equipped":
      return shieldEquipped ? { applied: true } : { applied: false, reason: "Requires equipped shield." };
    case "weapon-equipped":
      return context.weapon?.equipped ? { applied: true } : { applied: false, reason: "Requires equipped weapon." };
    case "weapon-is-melee":
      return context.weapon?.usageMode === "melee" || properties.has("melee") ? { applied: true } : { applied: false, reason: "Requires melee weapon use." };
    case "weapon-is-ranged":
      return context.weapon?.usageMode === "ranged" || properties.has("ranged") ? { applied: true } : { applied: false, reason: "Requires ranged weapon use." };
    case "weapon-is-finesse":
      return properties.has("finesse") ? { applied: true } : { applied: false, reason: "Requires finesse weapon." };
    case "weapon-is-two-handed":
      return properties.has("two-handed") || context.weapon?.usageMode === "versatile-two-hand" ? { applied: true } : { applied: false, reason: "Requires two-handed weapon use." };
    case "weapon-is-one-handed":
      return !properties.has("two-handed") && context.weapon?.usageMode !== "versatile-two-hand" ? { applied: true } : { applied: false, reason: "Requires one-handed weapon use." };
    case "weapon-is-melee-one-handed-no-offhand": {
      const melee = context.weapon?.usageMode === "melee" || context.weapon?.usageMode === "versatile-one-hand" || properties.has("melee");
      const oneHanded = !properties.has("two-handed") && context.weapon?.usageMode !== "versatile-two-hand";
      const noOffhand = !hasEquippedSlot(context.inventoryItems, "offHand");
      if (!melee) return { applied: false, reason: "Requires melee weapon use." };
      if (!oneHanded) return { applied: false, reason: "Requires one-handed weapon use." };
      if (!noOffhand) return { applied: false, reason: "Requires no off-hand weapon." };
      return { applied: true };
    }
    case "no-offhand-weapon":
      return !hasEquippedSlot(context.inventoryItems, "offHand") ? { applied: true } : { applied: false, reason: "Requires no off-hand weapon." };
    case "spellcasting":
      return context.spellcasting ? { applied: true } : { applied: false, reason: "Requires spellcasting." };
    case "concentration-active":
      return context.concentrationActive ? { applied: true } : { applied: false, reason: "Requires active concentration." };
    case "manual":
      return { applied: false, reason: "Manual modifier; user must apply it explicitly." };
    default:
      return { applied: false, reason: "Unsupported modifier condition." };
  }
}

export function evaluateRuleModifiers(
  modifiers: RuleModifier[],
  context: ModifierEvaluationContext = {},
): RuleModifierApplication[] {
  return modifiers.map((modifier) => {
    const result = evaluateModifierCondition(modifier, context);
    return {
      modifier,
      applied: result.applied,
      reason: result.reason,
    };
  });
}

export function sumFlatModifiers(
  modifiers: RuleModifier[],
  context: ModifierEvaluationContext = {},
): { total: number; applications: RuleModifierApplication[] } {
  const applications = evaluateRuleModifiers(modifiers, context);
  return {
    total: applications
      .filter((entry) => entry.applied && entry.modifier.valueType === "flat")
      .reduce((sum, entry) => sum + numericValue(entry.modifier), 0),
    applications,
  };
}

export function modifiersForTarget(modifiers: RuleModifier[], target: RuleModifierTarget): RuleModifier[] {
  return modifiers.filter((modifier) => modifier.target === target);
}
