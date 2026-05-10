import type { RuleMapping } from "../ruleMappingTypes";

export const FEATURE_RULE_MAPPINGS: RuleMapping[] = [
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
              diagnostics: ["Creates a cantrip subchoice when spell catalog data is available."],
              choices: [
                {
                  id: "blessed-warrior-cantrips",
                  choiceType: "cantrip",
                  requiredCount: 2,
                  optionSource: "spell-cantrips",
                  unsupportedWhenEmpty: true,
                  diagnostics: ["Select cantrips through the generic rule choice pipeline."],
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
          optionSource: "weapon-catalog",
          unsupportedWhenEmpty: true,
          diagnostics: ["Weapon Mastery choices use weapon catalog entries as options. Effects are informational in V1."],
        },
      ],
    },
  },
];
