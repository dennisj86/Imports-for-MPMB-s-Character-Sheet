import type { RuleMapping } from "../ruleMappingTypes";

export const FEATURE_RULE_MAPPINGS: RuleMapping[] = [
  {
    id: "feature:bardic-inspiration:active-effect",
    appliesTo: {
      sourceType: "class-feature",
      normalizedName: "bardic-inspiration",
    },
    confidence: "exact",
    emits: {
      diagnostics: ["Bardic Inspiration is exposed as a configurable external roll-bonus effect."],
      activeEffectDefinitions: [
        {
          id: "bardic-inspiration-bonus-die",
          effectType: "roll-bonus",
          durationType: "until-used",
          targets: ["selected"],
          applicableRollTypes: ["ability-check", "skill-check", "attack-roll", "spell-attack", "saving-throw"],
          requiresPrompt: true,
          configurableFields: ["die-size"],
          modifiers: [
            {
              id: "bardic-inspiration-d6",
              target: "other",
              valueType: "dice",
              value: "1d6",
              condition: "manual",
              diagnostics: ["Default die size is d6; override it at activation when the source bard level is unknown or higher."],
            },
          ],
        },
      ],
    },
  },
  {
    id: "feature:war-gods-blessing:active-effect",
    appliesTo: {
      sourceType: "subclass-feature",
      normalizedName: "war-god-s-blessing",
    },
    confidence: "exact",
    emits: {
      diagnostics: ["War God's Blessing is exposed as a one-roll flat attack bonus effect."],
      activeEffectDefinitions: [
        {
          id: "war-gods-blessing-attack-bonus",
          effectType: "roll-bonus",
          durationType: "one-roll",
          targets: ["selected"],
          applicableRollTypes: ["attack-roll"],
          requiresPrompt: true,
          modifiers: [
            {
              id: "war-gods-blessing-plus-10",
              target: "other",
              valueType: "flat",
              value: 10,
              condition: "manual",
              diagnostics: ["Optional flat attack bonus applied only when the user selects the effect for a roll."],
            },
          ],
        },
      ],
    },
  },
  {
    id: "feature:fighting-style:choice",
    appliesTo: {
      sourceType: ["class-feature", "subclass-feature"],
      tags: ["fighting-style"],
    },
    confidence: "declarative",
    emits: {
      diagnostics: ["Fighting Style mapping applied from declarative rule data."],
      choices: [
        {
          id: "fighting-style",
          choiceType: "fighting-style",
          requiredCount: 1,
          options: [
            {
              id: "archery",
              label: "Archery",
              modifiers: [
                {
                  id: "archery-weapon-attack",
                  target: "weapon-attack",
                  valueType: "flat",
                  value: 2,
                  condition: "weapon-is-ranged",
                  diagnostics: ["Applies to ranged weapon attack profiles."],
                },
              ],
            },
            {
              id: "defense",
              label: "Defense",
              modifiers: [
                {
                  id: "defense-armor-class",
                  target: "armor-class",
                  valueType: "flat",
                  value: 1,
                  condition: "wearing-armor",
                  diagnostics: ["Applies while armor is equipped."],
                },
              ],
            },
            {
              id: "dueling",
              label: "Dueling",
              modifiers: [
                {
                  id: "dueling-weapon-damage",
                  target: "weapon-damage",
                  valueType: "flat",
                  value: 2,
                  condition: "weapon-is-melee-one-handed-no-offhand",
                  diagnostics: ["Applies to one-handed melee weapon damage when no off-hand weapon is equipped."],
                },
              ],
            },
            {
              id: "great-weapon-fighting",
              label: "Great Weapon Fighting",
              diagnostics: ["Choice is supported, but the reroll behavior is a future dice-engine capability."],
              modifiers: [
                {
                  id: "great-weapon-fighting-note",
                  target: "weapon-damage",
                  valueType: "note",
                  value: "Future capability: reroll low weapon damage dice.",
                  condition: "weapon-is-two-handed",
                  diagnostics: ["No automatic reroll engine is implemented in V1."],
                },
              ],
            },
            {
              id: "two-weapon-fighting",
              label: "Two-Weapon Fighting",
              diagnostics: ["Choice is supported, but off-hand damage automation remains a future weapon-profile capability."],
              modifiers: [
                {
                  id: "two-weapon-fighting-note",
                  target: "weapon-damage",
                  valueType: "note",
                  value: "Future capability: off-hand damage ability modifier handling.",
                  condition: "manual",
                  diagnostics: ["No automatic two-weapon fighting damage adjustment is implemented in V1."],
                },
              ],
            },
            {
              id: "protection",
              label: "Protection",
              diagnostics: ["Reaction style is surfaced as a supported manual capability, without combat automation."],
              modifiers: [
                {
                  id: "protection-note",
                  target: "other",
                  valueType: "note",
                  value: "Manual reaction; no encounter automation.",
                  condition: "manual",
                  diagnostics: ["Manual reaction style; not applied to derived stats."],
                },
              ],
            },
            {
              id: "interception",
              label: "Interception",
              diagnostics: ["Reaction style is surfaced as a supported manual capability, without damage interception automation."],
              modifiers: [
                {
                  id: "interception-note",
                  target: "other",
                  valueType: "note",
                  value: "Manual reaction; no encounter automation.",
                  condition: "manual",
                  diagnostics: ["Manual reaction style; not applied to derived stats."],
                },
              ],
            },
            {
              id: "blessed-warrior",
              label: "Blessed Warrior",
              diagnostics: ["Creates option-scoped cantrip subchoices from structured MPMB spellcastingBonus data when that data is available."],
              choices: [
                {
                  id: "blessed-warrior-cantrips",
                  choiceType: "cantrip",
                  requiredCount: 2,
                  minCount: 2,
                  maxCount: 2,
                  optionSource: "spell-cantrips",
                  optionSourceFilters: { spellClassKeys: ["cleric"], minLevel: 0, maxLevel: 0 },
                  unsupportedWhenEmpty: true,
                  diagnostics: ["Declarative Fighting Style mapping provides a Cleric cantrip child choice for Blessed Warrior."],
                },
              ],
            },
            {
              id: "druidic-warrior",
              label: "Druidic Warrior",
              diagnostics: ["Creates option-scoped cantrip subchoices from structured MPMB spellcastingBonus data when that data is available."],
              choices: [
                {
                  id: "druidic-warrior-cantrips",
                  choiceType: "cantrip",
                  requiredCount: 2,
                  minCount: 2,
                  maxCount: 2,
                  optionSource: "spell-cantrips",
                  optionSourceFilters: { spellClassKeys: ["druid"], minLevel: 0, maxLevel: 0 },
                  unsupportedWhenEmpty: true,
                  diagnostics: ["Declarative Fighting Style mapping provides a Druid cantrip child choice for Druidic Warrior."],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "feature:weapon-mastery:choice",
    appliesTo: {
      sourceType: ["class-feature", "subclass-feature", "feat"],
      tags: ["weapon-mastery"],
    },
    confidence: "declarative",
    emits: {
      diagnostics: ["Weapon Mastery mapping applied from declarative rule data."],
      choices: [
        {
          id: "weapon-mastery",
          choiceType: "weapon-mastery",
          requiredCount: 1,
          requiredCountFromSourceText: true,
          unsupportedWhenRequiredCountUnknown: true,
          optionSource: "weapon-catalog",
          unsupportedWhenEmpty: true,
          diagnostics: ["Weapon Mastery choices use weapon catalog entries as options. Effects are informational in V1."],
        },
      ],
    },
  },
];
