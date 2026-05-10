import type { CharacterDraft, RuleChoiceState } from "../../domain/character";
import type { RuleChoice, RuleChoiceStatus, RuleSourceDescriptor } from "../../domain/rules";

function countWordToNumber(value: string): number | undefined {
  const token = value.toLowerCase();
  if (token === "one" || token === "a" || token === "an") return 1;
  if (token === "two") return 2;
  if (token === "three") return 3;
  if (token === "four") return 4;
  const numeric = Number(token);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function choiceTypeFromText(text: string): RuleChoice["choiceType"] {
  const lower = text.toLowerCase();
  if (/\bfighting style\b/.test(lower)) return "fighting-style";
  if (/\bweapon mastery\b|\bmastery property\b/.test(lower)) return "weapon-mastery";
  if (/\bcantrip\b/.test(lower)) return "cantrip";
  if (/\bspell\b/.test(lower)) return "spell";
  if (/\bfeat\b/.test(lower)) return "feat";
  if (/\bability score\b|\bstrength\b|\bdexterity\b|\bconstitution\b|\bintelligence\b|\bwisdom\b|\bcharisma\b/.test(lower)) return "ability-score";
  if (/\bskill\b/.test(lower)) return "skill";
  if (/\btool\b/.test(lower)) return "tool";
  if (/\blanguage\b/.test(lower)) return "language";
  if (/\bweapon\b/.test(lower)) return "weapon";
  if (/\bproficiency\b/.test(lower)) return "proficiency";
  if (/\bresistance\b/.test(lower)) return "resistance";
  return "feature-option";
}

function parseOptionList(text: string): string[] {
  const optionText =
    text.match(/(?:from|among|following|options are)\s*[:\-]?\s*([^.]+)/i)?.[1] ??
    text.match(/choose\s+(?:one|two|three|four|[0-9]+)[^.]*?:\s*([^.]+)/i)?.[1];
  if (!optionText) {
    return [];
  }
  return optionText
    .split(/,|;|\bor\b|\band\b/gi)
    .map((entry) => entry.trim().replace(/^[*•-]\s*/, ""))
    .filter((entry) => entry.length > 1 && entry.length < 80)
    .slice(0, 24);
}

export function extractChoicesFromText(source: RuleSourceDescriptor, text: string | undefined): RuleChoice[] {
  const raw = String(text ?? "");
  if (!/\b(choose|select|gain proficiency in one|gain proficiency with one)\b/i.test(raw)) {
    return [];
  }
  const countMatch = raw.match(/\b(?:choose|select)\s+(one|two|three|four|[0-9]+)\b/i);
  const requiredCount = countWordToNumber(countMatch?.[1] ?? "one") ?? 1;
  const options = parseOptionList(raw).map((label) => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    label,
  }));
  const choiceType = choiceTypeFromText(raw);
  const unsupported = options.length === 0;
  return [
    {
      id: `rule-choice:${source.id}:0`,
      sourceDescriptorId: source.id,
      sourceType: source.sourceType,
      choiceType,
      requiredCount,
      minCount: requiredCount,
      maxCount: requiredCount,
      options,
      selectedOptionIds: [],
      status: unsupported ? "unsupported" : "pending",
      appliesAtLevel: source.level,
      diagnostics: unsupported
        ? [`Choice language detected for ${source.sourceName}, but no deterministic option list was found.`]
        : ["Choice parsed from structured/source text fallback."],
    },
  ];
}

export function resolveChoiceStatus(choice: RuleChoice, selectedOptionIds: string[]): RuleChoiceStatus {
  if (choice.status === "unsupported") {
    return "unsupported";
  }
  if (selectedOptionIds.length < choice.minCount) {
    return "pending";
  }
  if (selectedOptionIds.length > choice.maxCount) {
    return "pending";
  }
  return "complete";
}

export function applyChoiceState(choice: RuleChoice, state: RuleChoiceState | undefined): RuleChoice {
  const validOptionIds = new Set(choice.options.map((option) => option.id));
  const selectedOptionIds = (state?.selectedOptionIds ?? choice.selectedOptionIds).filter((id) => validOptionIds.has(id));
  return {
    ...choice,
    selectedOptionIds,
    status: state?.status === "unsupported" ? "unsupported" : resolveChoiceStatus(choice, selectedOptionIds),
  };
}

export function resolveRuleChoices(
  sources: RuleSourceDescriptor[],
  persisted: CharacterDraft["ruleChoices"] = {},
): RuleChoice[] {
  return sources.flatMap((source) => {
    const sourceChoices = source.choices.length ? source.choices : [];
    return sourceChoices.map((choice) => applyChoiceState(choice, persisted?.[choice.id]));
  });
}

export function setRuleChoiceSelection(
  draft: CharacterDraft,
  choice: RuleChoice,
  selectedOptionIds: string[],
  now = new Date().toISOString(),
): CharacterDraft {
  const uniqueSelected = Array.from(new Set(selectedOptionIds)).filter((id) => choice.options.some((option) => option.id === id));
  if (uniqueSelected.length > choice.maxCount) {
    return draft;
  }
  const status = resolveChoiceStatus(choice, uniqueSelected);
  return {
    ...draft,
    ruleChoices: {
      ...(draft.ruleChoices ?? {}),
      [choice.id]: {
        choiceId: choice.id,
        selectedOptionIds: uniqueSelected,
        status,
        updatedAt: now,
      },
    },
  };
}
