import type { RulesMode } from "../../../domain/content";

export interface ClassProgressionRule {
  subclassUnlockByRulesMode: Record<RulesMode, number>;
  asiOrFeatLevelsByRulesMode: Record<RulesMode, number[]>;
}

const COMMON_ASI_LEVELS = [4, 8, 12, 16, 19];

export const CLASS_PROGRESSION_RULES: Record<string, ClassProgressionRule> = {
  artificer: {
    subclassUnlockByRulesMode: { 2014: 3, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: COMMON_ASI_LEVELS, 2024: COMMON_ASI_LEVELS },
  },
  barbarian: {
    subclassUnlockByRulesMode: { 2014: 3, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: COMMON_ASI_LEVELS, 2024: COMMON_ASI_LEVELS },
  },
  bard: {
    subclassUnlockByRulesMode: { 2014: 3, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: COMMON_ASI_LEVELS, 2024: COMMON_ASI_LEVELS },
  },
  cleric: {
    subclassUnlockByRulesMode: { 2014: 1, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: COMMON_ASI_LEVELS, 2024: COMMON_ASI_LEVELS },
  },
  druid: {
    subclassUnlockByRulesMode: { 2014: 2, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: COMMON_ASI_LEVELS, 2024: COMMON_ASI_LEVELS },
  },
  fighter: {
    subclassUnlockByRulesMode: { 2014: 3, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: [4, 6, 8, 12, 14, 16, 19], 2024: [4, 6, 8, 10, 12, 14, 16, 19] },
  },
  monk: {
    subclassUnlockByRulesMode: { 2014: 3, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: COMMON_ASI_LEVELS, 2024: COMMON_ASI_LEVELS },
  },
  paladin: {
    subclassUnlockByRulesMode: { 2014: 3, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: COMMON_ASI_LEVELS, 2024: COMMON_ASI_LEVELS },
  },
  ranger: {
    subclassUnlockByRulesMode: { 2014: 3, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: COMMON_ASI_LEVELS, 2024: COMMON_ASI_LEVELS },
  },
  rogue: {
    subclassUnlockByRulesMode: { 2014: 3, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: [4, 8, 10, 12, 16, 19], 2024: [4, 8, 10, 12, 16, 19] },
  },
  sorcerer: {
    subclassUnlockByRulesMode: { 2014: 1, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: COMMON_ASI_LEVELS, 2024: COMMON_ASI_LEVELS },
  },
  warlock: {
    subclassUnlockByRulesMode: { 2014: 1, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: COMMON_ASI_LEVELS, 2024: COMMON_ASI_LEVELS },
  },
  wizard: {
    subclassUnlockByRulesMode: { 2014: 2, 2024: 3 },
    asiOrFeatLevelsByRulesMode: { 2014: COMMON_ASI_LEVELS, 2024: COMMON_ASI_LEVELS },
  },
};

export function getDefaultSubclassUnlockLevel(rulesMode: RulesMode): number {
  return rulesMode === "2024" ? 3 : 1;
}

export function getClassProgressionRule(classKey: string): ClassProgressionRule | undefined {
  return CLASS_PROGRESSION_RULES[classKey];
}
