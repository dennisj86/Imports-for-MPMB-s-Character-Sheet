import { ruleInfo } from "./rulesInfo";
import type { RuleAutomationStatus } from "./ruleAutomationStatus";

export interface WeaponMasteryDetail {
  name: string;
  summary: string;
  automationStatus: RuleAutomationStatus;
  manualReminder: string;
  knownLimitations: string;
}

const WEAPON_MASTERY_BY_KEY: Record<string, WeaponMasteryDetail> = {
  cleave: {
    name: "Cleave",
    summary: "On a hit, the weapon can spill damage to a nearby second target.",
    automationStatus: "manual",
    manualReminder: "Choose the secondary target and apply the rider manually.",
    knownLimitations: "No encounter/target automation is active for secondary damage routing.",
  },
  graze: {
    name: "Graze",
    summary: "On a miss, still deal ability-modifier damage to the target.",
    automationStatus: "manual",
    manualReminder: "Apply graze damage manually on misses where it is valid.",
    knownLimitations: "Miss-damage rider automation is not implemented.",
  },
  nick: {
    name: "Nick",
    summary: "Enables a faster off-hand style strike during your attack sequence.",
    automationStatus: "manual",
    manualReminder: "Track off-hand timing and legal triggers manually.",
    knownLimitations: "No full two-weapon sequence engine is implemented.",
  },
  push: {
    name: "Push",
    summary: "Can move the target away from you after a successful hit.",
    automationStatus: "manual",
    manualReminder: "Move the target manually when conditions are met.",
    knownLimitations: "No target positioning system is implemented.",
  },
  sap: {
    name: "Sap",
    summary: "Can weaken the target's next offensive pressure.",
    automationStatus: "manual",
    manualReminder: "Track the next attack penalty manually on the table.",
    knownLimitations: "No target-side next-roll debuff tracking is implemented.",
  },
  slow: {
    name: "Slow",
    summary: "Can reduce the target's speed for the round.",
    automationStatus: "manual",
    manualReminder: "Apply the speed reduction manually to the target.",
    knownLimitations: "No encounter target speed-tracking engine is implemented.",
  },
  topple: {
    name: "Topple",
    summary: "Can force a target prone after a successful hit.",
    automationStatus: "manual",
    manualReminder: "Resolve the save/condition outcome manually.",
    knownLimitations: "No automated condition application to enemy targets is implemented.",
  },
  vex: {
    name: "Vex",
    summary: "Can set up advantage pressure for a follow-up attack.",
    automationStatus: "manual",
    manualReminder: "Track the follow-up advantage state manually.",
    knownLimitations: "No target-linked follow-up advantage queue is implemented.",
  },
};

export function normalizeWeaponMasteryToken(value: string | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function weaponMasteryInfoForToken(token: string | undefined): WeaponMasteryDetail | undefined {
  return token ? WEAPON_MASTERY_BY_KEY[token] : undefined;
}

export function weaponMasteryInfoForName(name: string | undefined): WeaponMasteryDetail | undefined {
  return weaponMasteryInfoForToken(normalizeWeaponMasteryToken(name));
}

export function weaponPropertySummary(property: string | undefined): string {
  return ruleInfo(property, "No structured local property description found.");
}
