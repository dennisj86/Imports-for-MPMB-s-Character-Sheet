import type { CharacterActionResourceState, ResourceRechargeType } from "../../domain/actionResources";

export interface RestSkippedEntry {
  key: string;
  name: string;
  rechargeType: ResourceRechargeType;
  rechargeLabel: string;
  kind: "resource" | "spell-slot";
}

export interface RestResetPlan {
  resourceKeys: string[];
  spellSlotKeys: string[];
  skipped: RestSkippedEntry[];
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
  return type === "short-rest";
}

function canRecoverOnLongRest(type: ResourceRechargeType): boolean {
  return type === "long-rest" || type === "short-rest";
}

function shouldReportSkipped(type: ResourceRechargeType): boolean {
  return type === "manual" || type === "special";
}

export function resolveRestRecoveryPlan(
  actionResources: CharacterActionResourceState,
): RestRecoveryPlan {
  const shortResources: string[] = [];
  const longResources: string[] = [];
  const shortSpellSlots: string[] = [];
  const longSpellSlots: string[] = [];
  const shortSkipped: RestSkippedEntry[] = [];
  const longSkipped: RestSkippedEntry[] = [];
  const shortNotes: string[] = [];
  const longNotes: string[] = [];

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
      if (shouldReportSkipped(rechargeType)) {
        const skipped: RestSkippedEntry = {
          key: slotKey,
          name: `Spell Slot L${slotKey}`,
          rechargeType,
          rechargeLabel: resource.recharge.label,
          kind: "spell-slot",
        };
        shortSkipped.push(skipped);
        longSkipped.push(skipped);
        shortNotes.push(`Spell Slot L${slotKey} uses ${resource.recharge.label}; automatic rest restore is skipped.`);
        longNotes.push(`Spell Slot L${slotKey} uses ${resource.recharge.label}; automatic rest restore is skipped.`);
      }
      continue;
    }

    if (canRecoverOnShortRest(rechargeType)) {
      shortResources.push(resource.id);
    }
    if (canRecoverOnLongRest(rechargeType)) {
      longResources.push(resource.id);
    }
    if (shouldReportSkipped(rechargeType)) {
      const skipped: RestSkippedEntry = {
        key: resource.id,
        name: resource.name,
        rechargeType,
        rechargeLabel: resource.recharge.label,
        kind: "resource",
      };
      shortSkipped.push(skipped);
      longSkipped.push(skipped);
      shortNotes.push(`${resource.name} uses ${resource.recharge.label}; automatic rest restore is skipped.`);
      longNotes.push(`${resource.name} uses ${resource.recharge.label}; automatic rest restore is skipped.`);
    }
  }

  return {
    shortRest: {
      resourceKeys: Array.from(new Set(shortResources)),
      spellSlotKeys: Array.from(new Set(shortSpellSlots)),
      skipped: shortSkipped,
      notes: shortNotes,
    },
    longRest: {
      resourceKeys: Array.from(new Set(longResources)),
      spellSlotKeys: Array.from(new Set(longSpellSlots)),
      skipped: longSkipped,
      notes: longNotes,
    },
  };
}
