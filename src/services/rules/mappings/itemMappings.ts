import type { RuleMapping } from "../ruleMappingTypes";

export const ITEM_RULE_MAPPINGS: RuleMapping[] = [
  {
    id: "item:potion-of-heroism:active-effect",
    appliesTo: {
      sourceType: "item",
      normalizedName: "potion-of-heroism",
    },
    confidence: "exact",
    emits: {
      diagnostics: ["Potion of Heroism is exposed as a timed Bless-style roll bonus effect."],
      activeEffectDefinitions: [
        {
          id: "potion-of-heroism-bless-bonus",
          effectType: "roll-bonus",
          durationType: "timed",
          targets: ["self"],
          applicableRollTypes: ["attack-roll", "spell-attack", "saving-throw"],
          requiresPrompt: true,
          modifiers: [
            {
              id: "potion-of-heroism-1d4",
              target: "other",
              valueType: "dice",
              value: "1d4",
              condition: "manual",
              diagnostics: ["Optional Bless-style bonus die from Potion of Heroism."],
            },
          ],
        },
      ],
    },
  },
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
