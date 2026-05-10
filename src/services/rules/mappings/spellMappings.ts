import type { RuleMapping } from "../ruleMappingTypes";

export const SPELL_RULE_MAPPINGS: RuleMapping[] = [
  {
    id: "spell:bless:active-effect",
    appliesTo: {
      sourceType: "spell",
      normalizedName: "bless",
    },
    confidence: "exact",
    emits: {
      diagnostics: ["Bless active effect mapping creates optional attack/save bonus dice."],
      activeEffectDefinitions: [
        {
          id: "bless-bonus-dice",
          durationType: "concentration",
          concentrationLinked: true,
          targets: ["selected"],
          applicableRollTypes: ["attack-roll", "spell-attack", "saving-throw"],
          requiresPrompt: true,
          modifiers: [
            {
              id: "bless-1d4",
              target: "other",
              valueType: "dice",
              value: "1d4",
              condition: "manual",
              diagnostics: ["Optional bonus die; user selects it per roll."],
            },
          ],
        },
      ],
    },
  },
  {
    id: "spell:guidance:active-effect",
    appliesTo: {
      sourceType: "spell",
      normalizedName: "guidance",
    },
    confidence: "exact",
    emits: {
      diagnostics: ["Guidance active effect mapping creates optional ability/skill bonus dice."],
      activeEffectDefinitions: [
        {
          id: "guidance-bonus-dice",
          durationType: "concentration",
          concentrationLinked: true,
          targets: ["selected"],
          applicableRollTypes: ["ability-check", "skill-check"],
          requiresPrompt: true,
          modifiers: [
            {
              id: "guidance-1d4",
              target: "other",
              valueType: "dice",
              value: "1d4",
              condition: "manual",
              diagnostics: ["Optional bonus die; user selects it per roll."],
            },
          ],
        },
      ],
    },
  },
  {
    id: "spell:resistance:active-effect",
    appliesTo: {
      sourceType: "spell",
      normalizedName: "resistance",
    },
    confidence: "exact",
    emits: {
      diagnostics: ["Resistance active effect mapping creates optional saving throw bonus dice."],
      activeEffectDefinitions: [
        {
          id: "resistance-bonus-dice",
          durationType: "concentration",
          concentrationLinked: true,
          targets: ["selected"],
          applicableRollTypes: ["saving-throw"],
          requiresPrompt: true,
          modifiers: [
            {
              id: "resistance-1d4",
              target: "other",
              valueType: "dice",
              value: "1d4",
              condition: "manual",
              diagnostics: ["Optional bonus die; user selects it per roll."],
            },
          ],
        },
      ],
    },
  },
];
