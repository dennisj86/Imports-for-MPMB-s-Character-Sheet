import type { AbilityKey } from "../../../domain/appliedRules";

export interface SpeciesAbilityRule {
  fixed?: Partial<Record<AbilityKey, number>>;
  choices?: Array<{
    amount: number;
    count: number;
    allowedAbilities: AbilityKey[];
    reason: string;
  }>;
}

const ALL_ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export const SPECIES_ABILITY_RULES: Record<string, SpeciesAbilityRule> = {
  "half-elf": {
    fixed: { cha: 2 },
    choices: [
      {
        amount: 1,
        count: 2,
        allowedAbilities: ALL_ABILITIES,
        reason: "Half-Elf flexible ability increases",
      },
    ],
  },
};

