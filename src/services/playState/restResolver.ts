import type { CharacterActionResourceState, ResourceRechargeType } from "../../domain/actionResources";

export interface RestResetPlan {
  resourceKeys: string[];
  spellSlotKeys: string[];
  notes: string[];
}

export interface RestRecoveryPlan {
  shortRest: RestResetPlan;
  longRest: RestResetPlan;
}

function slotKeyFromResourceId(resourceId: string): string | undefined {
  const match = resourceId.match(/^resource:spell-slot:(\d+)$/);
  return match?.[1];
}

function canRecoverOnShortRest(type: ResourceRechargeType): boolean {
  return type === "short-rest" || type === "at-will";
}

function canRecoverOnLongRest(type: ResourceRechargeType): boolean {
  return type === "long-rest" || type === "short-rest" || type === "at-will";
}

export function resolveRestRecoveryPlan(
  actionResources: CharacterActionResourceState,
): RestRecoveryPlan {
  const shortResources: string[] = [];
  const longResources: string[] = [];
  const shortSpellSlots: string[] = [];
  const longSpellSlots: string[] = [];
  const notes: string[] = [];

  for (const resource of actionResources.resourceSet.resources) {
    if (resource.usesMax === undefined || resource.usesMax <= 0) {
      continue;
    }
    const slotKey = slotKeyFromResourceId(resource.id);
    const rechargeType = resource.recharge.type;

    if (slotKey) {
      if (canRecoverOnShortRest(rechargeType)) {
        shortSpellSlots.push(slotKey);
      }
      if (canRecoverOnLongRest(rechargeType)) {
        longSpellSlots.push(slotKey);
      }
      if (rechargeType === "manual" || rechargeType === "special") {
        notes.push(`Spell slot ${slotKey} uses ${resource.recharge.label}; automatic rest restore is skipped in V1.`);
      }
      continue;
    }

    if (canRecoverOnShortRest(rechargeType)) {
      shortResources.push(resource.id);
    }
    if (canRecoverOnLongRest(rechargeType)) {
      longResources.push(resource.id);
    }
    if (rechargeType === "manual" || rechargeType === "special") {
      notes.push(`Resource '${resource.name}' uses ${resource.recharge.label}; automatic rest restore is skipped in V1.`);
    }
  }

  return {
    shortRest: {
      resourceKeys: Array.from(new Set(shortResources)),
      spellSlotKeys: Array.from(new Set(shortSpellSlots)),
      notes,
    },
    longRest: {
      resourceKeys: Array.from(new Set(longResources)),
      spellSlotKeys: Array.from(new Set(longSpellSlots)),
      notes,
    },
  };
}
