import type { RuleMapping } from "../ruleMappingTypes";

export const FEAT_RULE_MAPPINGS: RuleMapping[] = [
  {
    id: "feat:skilled:skill-proficiencies",
    appliesTo: {
      sourceType: "feat",
      normalizedName: "skilled",
    },
    confidence: "exact",
    emits: {
      diagnostics: ["Skilled feat mapping applied from declarative rule data."],
      choices: [
        {
          id: "skilled-skills",
          choiceType: "skill",
          requiredCount: 3,
          optionSource: "skills",
          applySelectionAs: {
            id: "selected-skill-proficiency",
            target: "proficiency",
            valueType: "set",
            value: true,
            condition: "always",
            skillFromOption: true,
            diagnostics: ["Selected skill is applied as a derived skill proficiency."],
          },
        },
      ],
    },
  },
  {
    id: "feat:skill-expert:skill-proficiency",
    appliesTo: {
      sourceType: "feat",
      normalizedName: "skill-expert",
    },
    confidence: "exact",
    emits: {
      diagnostics: ["Skill Expert feat mapping applied from declarative rule data."],
      choices: [
        {
          id: "skill-expert-skill",
          choiceType: "skill",
          requiredCount: 1,
          optionSource: "skills",
          applySelectionAs: {
            id: "selected-skill-proficiency",
            target: "proficiency",
            valueType: "set",
            value: true,
            condition: "always",
            skillFromOption: true,
            diagnostics: ["Selected skill is applied as a derived skill proficiency."],
          },
        },
      ],
    },
  },
  {
    id: "feat:linguist:language-choice",
    appliesTo: {
      sourceType: "feat",
      normalizedName: "linguist",
    },
    confidence: "exact",
    emits: {
      diagnostics: ["Linguist language choices are persisted; derived language application is not yet wired."],
      choices: [
        {
          id: "linguist-languages",
          choiceType: "language",
          requiredCount: 3,
          optionSource: "languages",
          diagnostics: ["Language selection is stored as a generic rule choice."],
        },
      ],
    },
  },
];
