import type { RuleMapping } from "../ruleMappingTypes";

export const ITEM_RULE_MAPPINGS: RuleMapping[] = [
  {
    id: "item:cloak-of-protection:core-bonuses",
    appliesTo: {
      sourceType: "item",
      normalizedName: "cloak-of-protection",
    },
    confidence: "exact",
    emits: {
      diagnostics: ["Cloak of Protection mapping applies simple AC and saving throw bonuses."],
      modifiers: [
        {
          id: "cloak-of-protection-ac",
          target: "armor-class",
          valueType: "flat",
          value: 1,
          condition: "always",
          diagnostics: ["Simple item AC bonus from declarative mapping."],
        },
        {
          id: "cloak-of-protection-saves",
          target: "saving-throw",
          valueType: "flat",
          value: 1,
          condition: "always",
          diagnostics: ["Simple item saving throw bonus from declarative mapping."],
        },
      ],
    },
  },
];
