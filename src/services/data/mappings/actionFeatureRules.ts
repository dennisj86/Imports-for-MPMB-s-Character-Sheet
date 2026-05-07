import type { CharacterActionActivationType, ResourceRechargeType } from "../../../domain/actionResources";

export interface FeatureActionRule {
  activationType?: CharacterActionActivationType;
  notes?: string[];
}

export interface FeatureResourceFallbackRule {
  usesFormula?: "class-level*5" | "1+cha-mod" | "cha-mod" | "prof-bonus";
  minUses?: number;
  recharge?: ResourceRechargeType;
  notes?: string[];
}

export interface FeatureRule {
  action?: FeatureActionRule;
  resourceFallback?: FeatureResourceFallbackRule;
}

export const ACTION_FEATURE_RULES: Record<string, FeatureRule> = {
  "second-wind": {
    action: { activationType: "bonus-action" },
    resourceFallback: {
      minUses: 1,
      recharge: "short-rest",
      notes: ["Fallback from known Second Wind cadence."],
    },
  },
  rage: {
    action: { activationType: "bonus-action" },
  },
  "bardic-inspiration": {
    action: { activationType: "bonus-action" },
    resourceFallback: {
      usesFormula: "cha-mod",
      minUses: 1,
      recharge: "long-rest",
      notes: ["Fallback from known Bardic Inspiration baseline."],
    },
  },
  "lay-on-hands": {
    resourceFallback: {
      usesFormula: "class-level*5",
      minUses: 5,
      recharge: "long-rest",
      notes: ["Fallback from Lay on Hands pool formula."],
    },
  },
  "divine-sense": {
    resourceFallback: {
      usesFormula: "1+cha-mod",
      minUses: 1,
      recharge: "long-rest",
      notes: ["Fallback from 2014 Divine Sense baseline."],
    },
  },
  "action-surge": {
    action: {
      activationType: "special",
    },
  },
};
