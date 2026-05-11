import { toSlug } from "../../lib/slug";
import type { AppliedCharacterRules } from "../../domain/appliedRules";
import type { CharacterDraft } from "../../domain/character";
import type { AbilityKey, SkillKey } from "../../domain/derivedStats";
import type {
  OptionScopedAbilityScoreBonus,
  OptionScopedAbilityScoreMaximum,
  OptionScopedActionDelta,
  OptionScopedAppliedEntry,
  OptionScopedApplyDiagnostic,
  OptionScopedApplyState,
  OptionScopedProficiencyGrant,
  OptionScopedResourceDelta,
  RuleChoice,
  RuleChoiceOption,
  RuleModifier,
  RuleModifierCondition,
  RuleSourceDescriptor,
  RuleSourceType,
} from "../../domain/rules";
import { resolveLevelUpAbilityScoreBonuses } from "../levelUp";
import { applyChoiceState } from "./choicePipeline";

type StructuredRecord = Record<string, unknown>;

interface OptionScopedStructuredSlice {
  sourceDescriptorId: string;
  sourceName: string;
  sourceType: RuleSourceType;
  parentChoiceId?: string;
  optionId?: string;
  optionLabel?: string;
  selectedPath?: string[];
  choiceStage?: "child" | "subchoice";
  data: StructuredRecord;
}

interface AbilityPreviewEntry {
  ability: AbilityKey;
  baseScore: number;
  rulesBonus: number;
  levelUpBonus: number;
  optionBonus: number;
  modifierBonus: number;
  uncappedFinalScore: number;
  explicitMaximum?: number;
  finalScore: number;
  modifier: number;
}

export interface CombinedRuleProficiencies {
  skills: string[];
  expertiseSkills: string[];
  tools: string[];
  languages: string[];
  weapons: string[];
  armor: string[];
}

const ABILITY_KEYS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
const OPTION_SCOPED_FIELDS = [
  "scores",
  "scoresMaximum",
  "skills",
  "toolProfs",
  "languageProfs",
  "weaponProfs",
  "armorProfs",
  "addMod",
  "extraAC",
  "action",
  "usages",
  "recovery",
] as const;

const LANGUAGE_OPTIONS: RuleChoiceOption[] = [
  "common",
  "dwarvish",
  "elvish",
  "giant",
  "gnomish",
  "goblin",
  "halfling",
  "orc",
  "abyssal",
  "celestial",
  "draconic",
  "deep-speech",
  "infernal",
  "primordial",
  "sylvan",
  "undercommon",
].map((language) => ({
  id: language,
  label: language.split("-").map(capitalize).join(" "),
  value: language,
}));

const TOOL_OPTIONS: RuleChoiceOption[] = [
  "alchemist-supplies",
  "brewer-supplies",
  "calligrapher-supplies",
  "carpenter-tools",
  "cartographer-tools",
  "cobbler-tools",
  "cook-utensils",
  "disguise-kit",
  "forgery-kit",
  "herbalism-kit",
  "navigator-tools",
  "thieves-tools",
  "vehicles-land",
  "vehicles-water",
].map((tool) => ({
  id: tool,
  label: tool.split("-").map(capitalize).join(" "),
  value: tool,
}));

const SKILL_OPTIONS: RuleChoiceOption[] = [
  "acrobatics",
  "animal-handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight-of-hand",
  "stealth",
  "survival",
].map((skill) => ({
  id: skill,
  label: skill.split("-").map(capitalize).join(" "),
  value: skill,
}));

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeToken(value: string | undefined): string {
  return toSlug(value ?? "");
}

function asRecord(value: unknown): StructuredRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as StructuredRecord : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasUnsupportedHookLikeFields(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) {
    return false;
  }
  return ["eval", "removeeval", "changeeval", "calcChanges", "stopeval"].some((key) => record[key] !== undefined);
}

function optionObject(data: StructuredRecord, optionId: string): StructuredRecord | undefined {
  return asRecord(data[optionId]) ?? asRecord(data[optionId.toLowerCase()]) ?? asRecord(data[optionId.replace(/-/g, " ")]);
}

function hasOptionScopedFields(data: StructuredRecord): boolean {
  return OPTION_SCOPED_FIELDS.some((field) => data[field] !== undefined);
}

function mpmbChoiceId(source: RuleSourceDescriptor, suffix: string): string {
  return `rule-choice:${source.id}:mpmb:${suffix}`;
}

function mappedFightingStyleChoiceId(source: RuleSourceDescriptor): string {
  return `rule-choice:${source.id}:feature:fighting-style:choice:fighting-style`;
}

function parentChoiceIdFor(source: RuleSourceDescriptor, structured: StructuredRecord): string | undefined {
  if (Array.isArray(structured.choices) && structured.choices.length > 0) {
    return structured.choicesFightingStyles ? mappedFightingStyleChoiceId(source) : mpmbChoiceId(source, "choices");
  }
  return undefined;
}

function resolveSelectedOptionIds(source: RuleSourceDescriptor, draft: CharacterDraft, parentChoiceId: string | undefined): string[] {
  if (!parentChoiceId) {
    return [];
  }
  const rawChoice = source.choices.find((choice) => choice.id === parentChoiceId);
  const persisted = draft.ruleChoices?.[parentChoiceId];
  return rawChoice ? applyChoiceState(rawChoice, persisted).selectedOptionIds : persisted?.selectedOptionIds ?? [];
}

function collectStructuredSlicesForSource(source: RuleSourceDescriptor, draft: CharacterDraft): OptionScopedStructuredSlice[] {
  const structured = asRecord(source.structuredData);
  if (!structured) {
    return [];
  }
  const slices: OptionScopedStructuredSlice[] = [];
  const parentChoiceId = parentChoiceIdFor(source, structured);
  if (hasOptionScopedFields(structured)) {
    slices.push({
      sourceDescriptorId: source.id,
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      data: structured,
      choiceStage: "subchoice",
    });
  }
  for (const optionId of resolveSelectedOptionIds(source, draft, parentChoiceId)) {
    const optionData = optionObject(structured, optionId);
    if (!optionData || !hasOptionScopedFields(optionData)) {
      continue;
    }
    const optionLabel =
      source.choices
        .find((choice) => choice.id === parentChoiceId)
        ?.options.find((option) => option.id === optionId)
        ?.label;
    slices.push({
      sourceDescriptorId: source.id,
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      parentChoiceId,
      optionId,
      optionLabel,
      selectedPath: parentChoiceId ? [parentChoiceId, optionId] : undefined,
      choiceStage: "child",
      data: optionData,
    });
  }
  return slices;
}

function normalizeSkillName(value: string): SkillKey | undefined {
  const token = normalizeToken(value).replace(/-skill$/, "");
  switch (token) {
    case "animal-handling":
    case "sleight-of-hand":
      return token;
    case "acrobatics":
    case "arcana":
    case "athletics":
    case "deception":
    case "history":
    case "insight":
    case "intimidation":
    case "investigation":
    case "medicine":
    case "nature":
    case "perception":
    case "performance":
    case "persuasion":
    case "religion":
    case "stealth":
    case "survival":
      return token;
    default:
      return undefined;
  }
}

function abilityFromText(value: string | undefined): AbilityKey | undefined {
  const token = normalizeToken(value);
  if (token === "str" || token === "strength") return "str";
  if (token === "dex" || token === "dexterity") return "dex";
  if (token === "con" || token === "constitution") return "con";
  if (token === "int" || token === "intelligence") return "int";
  if (token === "wis" || token === "wisdom") return "wis";
  if (token === "cha" || token === "charisma") return "cha";
  return undefined;
}

function modifierLabel(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function baseProficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

function normalizedChoiceSelection(draft: CharacterDraft, choiceId: string): string[] {
  return draft.ruleChoices?.[choiceId]?.selectedOptionIds ?? [];
}

function firstNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const match = value.match(/-?[0-9]+/);
    if (match) {
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  return undefined;
}

function rechargeRule(value: unknown, level: number): OptionScopedResourceDelta["recharge"] {
  const candidate = Array.isArray(value) ? value[Math.max(0, Math.min(level, value.length) - 1)] : value;
  const text = String(candidate ?? "").trim().toLowerCase();
  if (text.includes("short rest")) {
    return { type: "short-rest", label: "Short Rest", notes: [] };
  }
  if (text.includes("long rest")) {
    return { type: "long-rest", label: "Long Rest", notes: [] };
  }
  if (text.includes("at will")) {
    return { type: "at-will", label: "At Will", notes: [] };
  }
  if (text.includes("dawn") || text.includes("special")) {
    return { type: "special", label: String(candidate), notes: [] };
  }
  return { type: "manual", label: "Manual / Pending", notes: [] };
}

function usageAtLevel(value: unknown, level: number): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  const entries = value;
  if (entries.length === 0) {
    return undefined;
  }
  const byLevel = entries.find((entry) => asRecord(entry)?.level === level);
  if (byLevel && asRecord(byLevel)?.column_value !== undefined) {
    return asRecord(byLevel)?.column_value;
  }
  return entries[Math.max(0, Math.min(level, entries.length) - 1)];
}

function buildChoice(
  source: RuleSourceDescriptor,
  slice: OptionScopedStructuredSlice,
  field: "skill" | "tool" | "language",
  count: number,
  options: RuleChoiceOption[],
  index: number,
  diagnostics: string[],
): RuleChoice {
  const suffix = `${slice.optionId ? `option:${slice.optionId}:` : ""}${field}:${index}`;
  const id = mpmbChoiceId(source, suffix);
  return applyChoiceState({
    id,
    sourceDescriptorId: source.id,
    sourceType: source.sourceType,
    choiceType: field,
    requiredCount: count,
    minCount: count,
    maxCount: count,
    options,
    selectedOptionIds: [],
    status: options.length === 0 ? "unsupported" : "pending",
    appliesAtLevel: source.level,
    diagnostics,
    parentChoiceId: slice.parentChoiceId,
    dependsOn: slice.parentChoiceId && slice.optionId
      ? {
          parentChoiceId: slice.parentChoiceId,
          requiredSelectedOptionId: slice.optionId,
          childChoiceId: id,
          dependencyType: "selected-option",
        }
      : undefined,
    selectedPath: slice.selectedPath,
    optionScope: slice.optionId,
    generatedByOptionId: slice.optionId,
    choiceStage: slice.choiceStage ?? (slice.optionId ? "child" : "subchoice"),
    isAvailable: true,
  }, undefined);
}

function languageChoiceCounts(entries: unknown[]): { fixed: string[]; counts: number[] } {
  const fixed: string[] = [];
  const counts: number[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      fixed.push(entry);
      continue;
    }
    const numeric = asNumber(entry);
    if (numeric !== undefined && numeric > 0) {
      counts.push(numeric);
    }
  }
  return { fixed, counts };
}

function toolChoiceCounts(entries: unknown[]): { fixed: string[]; counts: number[] } {
  const fixed: string[] = [];
  const counts: number[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      fixed.push(entry);
      continue;
    }
    if (!Array.isArray(entry) || entry.length === 0) {
      continue;
    }
    const label = asString(entry[0]);
    const maybeCount = asNumber(entry[1]);
    if (label && maybeCount !== undefined && /choice|tool/i.test(label)) {
      counts.push(maybeCount);
      continue;
    }
    if (label) {
      fixed.push(label);
    }
  }
  return { fixed, counts };
}

function skillChoiceCounts(entries: unknown[]): { fixed: string[]; counts: number[] } {
  const fixed: string[] = [];
  const counts: number[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      fixed.push(entry);
      continue;
    }
    const numeric = asNumber(entry);
    if (numeric !== undefined && numeric > 0) {
      counts.push(numeric);
      continue;
    }
    if (Array.isArray(entry) && entry.length > 0) {
      const label = asString(entry[0]);
      const count = asNumber(entry[1]);
      if (label && count !== undefined && /choice|skill/i.test(label)) {
        counts.push(count);
      }
    }
  }
  return { fixed, counts };
}

export function buildOptionScopedChoiceArtifacts(
  source: RuleSourceDescriptor,
  draft: CharacterDraft,
): RuleChoice[] {
  const choices: RuleChoice[] = [];
  for (const slice of collectStructuredSlicesForSource(source, draft)) {
    const languageCounts = languageChoiceCounts(asArray(slice.data.languageProfs));
    languageCounts.counts.forEach((count, index) => {
      choices.push(buildChoice(source, slice, "language", count, LANGUAGE_OPTIONS, index, [
        "Structured MPMB languageProfs produced this child choice.",
        `Required count: ${count}.`,
      ]));
    });

    const toolCounts = toolChoiceCounts(asArray(slice.data.toolProfs));
    toolCounts.counts.forEach((count, index) => {
      choices.push(buildChoice(source, slice, "tool", count, TOOL_OPTIONS, index, [
        "Structured MPMB toolProfs produced this child choice.",
        `Required count: ${count}.`,
      ]));
    });

    const skillCounts = skillChoiceCounts(asArray(slice.data.skills));
    skillCounts.counts.forEach((count, index) => {
      choices.push(buildChoice(source, slice, "skill", count, SKILL_OPTIONS, index, [
        "Structured MPMB skills produced this child choice.",
        `Required count: ${count}.`,
      ]));
    });
  }
  return choices;
}

export function computeOptionScopedAbilityPreview(input: {
  draft: CharacterDraft;
  appliedRules?: AppliedCharacterRules;
  abilityScoreBonuses: OptionScopedAbilityScoreBonus[];
  abilityScoreMaximums: OptionScopedAbilityScoreMaximum[];
  modifierBonuses?: Partial<Record<AbilityKey, number>>;
}): Record<AbilityKey, AbilityPreviewEntry> {
  const levelUpBonuses = resolveLevelUpAbilityScoreBonuses(input.draft);
  const output = {} as Record<AbilityKey, AbilityPreviewEntry>;
  for (const ability of ABILITY_KEYS) {
    const baseScore = input.draft.abilityScores[ability];
    const rulesBonus = input.appliedRules?.abilityScoreAdjustments.fixed[ability] ?? 0;
    const levelUpBonus = levelUpBonuses[ability] ?? 0;
    const optionBonus = input.abilityScoreBonuses
      .filter((entry) => entry.ability === ability)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const modifierBonus = input.modifierBonuses?.[ability] ?? 0;
    const uncappedFinalScore = baseScore + rulesBonus + levelUpBonus + optionBonus + modifierBonus;
    const explicitMaximum = input.abilityScoreMaximums
      .filter((entry) => entry.ability === ability)
      .reduce<number | undefined>((highest, entry) => highest === undefined ? entry.maximum : Math.max(highest, entry.maximum), undefined);
    const finalScore =
      explicitMaximum !== undefined
        ? Math.min(explicitMaximum, uncappedFinalScore)
        : levelUpBonus > 0
          ? Math.min(20, uncappedFinalScore)
          : uncappedFinalScore;
    output[ability] = {
      ability,
      baseScore,
      rulesBonus,
      levelUpBonus,
      optionBonus,
      modifierBonus,
      uncappedFinalScore,
      explicitMaximum,
      finalScore,
      modifier: Math.floor((finalScore - 10) / 2),
    };
  }
  return output;
}

function evaluateAddModFormula(
  value: string,
  preview: Record<AbilityKey, AbilityPreviewEntry>,
  proficiencyBonus: number,
): number | undefined {
  const compact = value.replace(/\s+/g, "");
  if (!compact) {
    return undefined;
  }
  if (compact.toLowerCase() === "prof") {
    return proficiencyBonus;
  }
  const directNumber = Number(compact);
  if (Number.isFinite(directNumber)) {
    return directNumber;
  }
  const directAbility = abilityFromText(compact);
  if (directAbility) {
    return preview[directAbility].modifier;
  }
  const maxMatch = compact.match(/^max\((Str|Dex|Con|Int|Wis|Cha)\|(-?[0-9]+)\)$/i);
  if (maxMatch) {
    const ability = abilityFromText(maxMatch[1]);
    const minimum = Number(maxMatch[2]);
    return ability ? Math.max(preview[ability].modifier, minimum) : undefined;
  }
  return undefined;
}

function addDiagnostic(
  diagnostics: OptionScopedApplyDiagnostic[],
  entry: Omit<OptionScopedApplyDiagnostic, "id">,
): void {
  diagnostics.push({
    id: `option-scoped-diagnostic:${entry.sourceDescriptorId}:${entry.optionId ?? "root"}:${entry.field}:${diagnostics.length}`,
    ...entry,
  });
}

function parseScoreBonuses(slice: OptionScopedStructuredSlice): OptionScopedAbilityScoreBonus[] {
  const scores = asArray(slice.data.scores);
  const bonuses: OptionScopedAbilityScoreBonus[] = [];
  ABILITY_KEYS.forEach((ability, index) => {
    const amount = asNumber(scores[index]);
    if (amount === undefined || amount === 0) {
      return;
    }
    bonuses.push({
      id: `option-scoped-score:${slice.sourceDescriptorId}:${slice.optionId ?? "root"}:${ability}`,
      sourceDescriptorId: slice.sourceDescriptorId,
      sourceName: slice.sourceName,
      sourceType: slice.sourceType,
      optionId: slice.optionId,
      ability,
      amount,
      diagnostics: [`Structured scores bonus applied to ${ability.toUpperCase()}.`],
    });
  });
  return bonuses;
}

function parseScoreMaximums(slice: OptionScopedStructuredSlice): OptionScopedAbilityScoreMaximum[] {
  const scoresMaximum = asArray(slice.data.scoresMaximum);
  const maximums: OptionScopedAbilityScoreMaximum[] = [];
  ABILITY_KEYS.forEach((ability, index) => {
    const maximum = asNumber(scoresMaximum[index]);
    if (maximum === undefined || maximum <= 0) {
      return;
    }
    maximums.push({
      id: `option-scoped-score-max:${slice.sourceDescriptorId}:${slice.optionId ?? "root"}:${ability}`,
      sourceDescriptorId: slice.sourceDescriptorId,
      sourceName: slice.sourceName,
      sourceType: slice.sourceType,
      optionId: slice.optionId,
      ability,
      maximum,
      diagnostics: [`Structured scoresMaximum cap applied to ${ability.toUpperCase()}.`],
    });
  });
  return maximums;
}

function parseArmorGrant(entry: unknown): string[] {
  const values = asArray(entry);
  if (values.length === 0) {
    return [];
  }
  const labels = ["light armor", "medium armor", "heavy armor", "shields"];
  return labels.filter((_, index) => values[index] === true);
}

function parseWeaponGrant(entry: unknown): string[] {
  const values = asArray(entry);
  if (values.length === 0) {
    return [];
  }
  const grants: string[] = [];
  if (values[0] === true) {
    grants.push("simple weapons");
  }
  if (values[1] === true) {
    grants.push("martial weapons");
  }
  for (const specific of asArray(values[2])) {
    if (typeof specific === "string") {
      grants.push(specific);
    }
  }
  return grants;
}

function parseProficiencyGrants(
  source: RuleSourceDescriptor,
  slice: OptionScopedStructuredSlice,
  draft: CharacterDraft,
  diagnostics: OptionScopedApplyDiagnostic[],
): OptionScopedProficiencyGrant[] {
  const grants: OptionScopedProficiencyGrant[] = [];
  const pushGrant = (kind: OptionScopedProficiencyGrant["kind"], value: string, detail: string) => {
    grants.push({
      id: `option-scoped-grant:${slice.sourceDescriptorId}:${slice.optionId ?? "root"}:${kind}:${normalizeToken(value)}`,
      sourceDescriptorId: slice.sourceDescriptorId,
      sourceName: slice.sourceName,
      sourceType: slice.sourceType,
      optionId: slice.optionId,
      kind,
      value,
      diagnostics: [detail],
    });
  };

  const skillCounts = skillChoiceCounts(asArray(slice.data.skills));
  skillCounts.fixed.forEach((skill) => pushGrant("skill", skill, "Structured skills grant applied."));
  skillCounts.counts.forEach((count, index) => {
    const choiceId = mpmbChoiceId(source, `${slice.optionId ? `option:${slice.optionId}:` : ""}skill:${index}`);
    const selected = normalizedChoiceSelection(draft, choiceId);
    if (selected.length < count) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "skills",
        status: "choice-required",
        applyPath: "rule-choice -> skill proficiency grant",
        message: `${count} option-scoped skill choice(s) remain incomplete.`,
      });
    }
    selected
      .map((id) => SKILL_OPTIONS.find((option) => option.id === id)?.label)
      .filter((value): value is string => Boolean(value))
      .forEach((skill) => pushGrant("skill", skill, "Selected option-scoped skill proficiency applied."));
  });

  const toolCounts = toolChoiceCounts(asArray(slice.data.toolProfs));
  toolCounts.fixed.forEach((tool) => pushGrant("tool", tool, "Structured toolProfs grant applied."));
  toolCounts.counts.forEach((count, index) => {
    const choiceId = mpmbChoiceId(source, `${slice.optionId ? `option:${slice.optionId}:` : ""}tool:${index}`);
    const selected = normalizedChoiceSelection(draft, choiceId);
    if (selected.length < count) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "toolProfs",
        status: "choice-required",
        applyPath: "rule-choice -> tool proficiency grant",
        message: `${count} option-scoped tool choice(s) remain incomplete.`,
      });
    }
    selected
      .map((id) => TOOL_OPTIONS.find((option) => option.id === id)?.label)
      .filter((value): value is string => Boolean(value))
      .forEach((tool) => pushGrant("tool", tool, "Selected option-scoped tool proficiency applied."));
  });

  const languageCounts = languageChoiceCounts(asArray(slice.data.languageProfs));
  languageCounts.fixed.forEach((language) => pushGrant("language", language, "Structured languageProfs grant applied."));
  languageCounts.counts.forEach((count, index) => {
    const choiceId = mpmbChoiceId(source, `${slice.optionId ? `option:${slice.optionId}:` : ""}language:${index}`);
    const selected = normalizedChoiceSelection(draft, choiceId);
    if (selected.length < count) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "languageProfs",
        status: "choice-required",
        applyPath: "rule-choice -> language grant",
        message: `${count} option-scoped language choice(s) remain incomplete.`,
      });
    }
    selected
      .map((id) => LANGUAGE_OPTIONS.find((option) => option.id === id)?.label)
      .filter((value): value is string => Boolean(value))
      .forEach((language) => pushGrant("language", language, "Selected option-scoped language applied."));
  });

  parseArmorGrant(slice.data.armorProfs).forEach((armor) => pushGrant("armor", armor, "Structured armorProfs grant applied."));
  parseWeaponGrant(slice.data.weaponProfs).forEach((weapon) => pushGrant("weapon", weapon, "Structured weaponProfs grant applied."));
  return grants;
}

function conditionFromExtraAcText(text: string | undefined): RuleModifierCondition | undefined {
  const lower = String(text ?? "").toLowerCase();
  if (!lower.trim()) {
    return "always";
  }
  if (/while (?:(?:i'm|i am) )?not wearing armor/.test(lower)) {
    return "not-wearing-armor";
  }
  if (/while (?:(?:i'm|i am) )?wearing medium or heavy armor/.test(lower)) {
    return "wearing-medium-or-heavy-armor";
  }
  if (/while (?:(?:i'm|i am) )?wearing (?:light, )?medium,? or heavy armor/.test(lower) || /while (?:(?:i'm|i am) )?wearing armor/.test(lower)) {
    return "wearing-armor";
  }
  if (/while .*shield/.test(lower)) {
    return "shield-equipped";
  }
  return undefined;
}

function parseExtraAcModifier(
  slice: OptionScopedStructuredSlice,
  diagnostics: OptionScopedApplyDiagnostic[],
): RuleModifier[] {
  const extraAC = asRecord(slice.data.extraAC);
  if (!extraAC) {
    return [];
  }
  if (hasUnsupportedHookLikeFields(extraAC)) {
    addDiagnostic(diagnostics, {
      sourceDescriptorId: slice.sourceDescriptorId,
      sourceName: slice.sourceName,
      sourceType: slice.sourceType,
      optionId: slice.optionId,
      optionLabel: slice.optionLabel,
      field: "extraAC",
      status: "unsupported",
      message: "extraAC includes hook-like MPMB fields and was not applied.",
    });
    return [];
  }
  const mod = asNumber(extraAC.mod);
  if (mod === undefined) {
    addDiagnostic(diagnostics, {
      sourceDescriptorId: slice.sourceDescriptorId,
      sourceName: slice.sourceName,
      sourceType: slice.sourceType,
      optionId: slice.optionId,
      optionLabel: slice.optionLabel,
      field: "extraAC",
      status: "unsupported",
      message: "extraAC was recognized, but no numeric AC modifier was available.",
    });
    return [];
  }
  const condition = conditionFromExtraAcText(asString(extraAC.text));
  if (!condition) {
    addDiagnostic(diagnostics, {
      sourceDescriptorId: slice.sourceDescriptorId,
      sourceName: slice.sourceName,
      sourceType: slice.sourceType,
      optionId: slice.optionId,
      optionLabel: slice.optionLabel,
      field: "extraAC",
      status: "unsupported",
      message: "extraAC uses a condition that is not mapped safely yet.",
    });
    return [];
  }
  return [{
    id: `option-scoped-modifier:${slice.sourceDescriptorId}:${slice.optionId ?? "root"}:extra-ac`,
    sourceDescriptorId: slice.sourceDescriptorId,
    sourceName: slice.sourceName,
    sourceType: slice.sourceType,
    target: "armor-class",
    valueType: "flat",
    value: mod,
    condition,
    diagnostics: ["Structured extraAC apply path emitted this AC modifier."],
  }];
}

function parseSkillFieldTarget(field: string): { target: RuleModifier["target"]; skill?: SkillKey; ability?: AbilityKey } | undefined {
  if (/^init/i.test(field)) {
    return { target: "initiative" };
  }
  if (/^passive /i.test(field)) {
    const skill = normalizeSkillName(field.replace(/^passive /i, ""));
    return skill ? { target: "passive-score", skill } : undefined;
  }
  const skill = normalizeSkillName(field);
  if (skill) {
    return { target: "skill-check", skill };
  }
  const ability = abilityFromText(field);
  if (ability) {
    return { target: "ability-check", ability };
  }
  return undefined;
}

function parseSaveAbilities(field: string): AbilityKey[] {
  if (normalizeToken(field) === "all") {
    return [...ABILITY_KEYS];
  }
  const ability = abilityFromText(field);
  return ability ? [ability] : [];
}

function parseAddModModifiers(
  slice: OptionScopedStructuredSlice,
  preview: Record<AbilityKey, AbilityPreviewEntry>,
  proficiencyBonus: number,
  diagnostics: OptionScopedApplyDiagnostic[],
): RuleModifier[] {
  const rawEntries = Array.isArray(slice.data.addMod) ? slice.data.addMod : slice.data.addMod ? [slice.data.addMod] : [];
  const modifiers: RuleModifier[] = [];
  for (const rawEntry of rawEntries) {
    const entry = asRecord(rawEntry);
    if (!entry) {
      continue;
    }
    if (hasUnsupportedHookLikeFields(entry)) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "addMod",
        status: "unsupported",
        message: "addMod includes hook-like MPMB fields and was not applied.",
      });
      continue;
    }
    const type = asString(entry.type);
    const field = asString(entry.field);
    const modValue = asString(entry.mod);
    if (!type || !field || !modValue) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "addMod",
        status: "unsupported",
        message: "addMod was recognized, but its structured shape is incomplete.",
      });
      continue;
    }
    const resolvedValue = evaluateAddModFormula(modValue, preview, proficiencyBonus);
    if (resolvedValue === undefined) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "addMod",
        status: "unsupported",
        message: `addMod formula '${modValue}' is not supported yet.`,
      });
      continue;
    }

    if (normalizeToken(type) === "save") {
      const abilities = parseSaveAbilities(field);
      if (abilities.length === 0) {
        addDiagnostic(diagnostics, {
          sourceDescriptorId: slice.sourceDescriptorId,
          sourceName: slice.sourceName,
          sourceType: slice.sourceType,
          optionId: slice.optionId,
          optionLabel: slice.optionLabel,
          field: "addMod",
          status: "unsupported",
          message: `Saving throw addMod field '${field}' is not mapped yet.`,
        });
        continue;
      }
      abilities.forEach((ability) => {
        modifiers.push({
          id: `option-scoped-modifier:${slice.sourceDescriptorId}:${slice.optionId ?? "root"}:save:${ability}`,
          sourceDescriptorId: slice.sourceDescriptorId,
          sourceName: slice.sourceName,
          sourceType: slice.sourceType,
          target: "saving-throw",
          valueType: "flat",
          value: resolvedValue,
          ability,
          condition: "always",
          diagnostics: ["Structured addMod apply path emitted this saving throw modifier."],
        });
      });
      continue;
    }

    const target = parseSkillFieldTarget(field);
    if (!target) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "addMod",
        status: "unsupported",
        message: `addMod field '${field}' is not mapped yet.`,
      });
      continue;
    }
    modifiers.push({
      id: `option-scoped-modifier:${slice.sourceDescriptorId}:${slice.optionId ?? "root"}:${normalizeToken(type)}:${normalizeToken(field)}`,
      sourceDescriptorId: slice.sourceDescriptorId,
      sourceName: slice.sourceName,
      sourceType: slice.sourceType,
      target: target.target,
      valueType: "flat",
      value: resolvedValue,
      ability: target.ability,
      skill: target.skill,
      condition: "always",
      diagnostics: ["Structured addMod apply path emitted this flat modifier."],
    });
  }
  return modifiers;
}

function parseActionType(value: unknown): OptionScopedActionDelta["activationType"] | undefined {
  const tuple = Array.isArray(value) ? value : [value];
  const first = tuple[0];
  const raw = Array.isArray(first) ? first[0] : first;
  const token = normalizeToken(asString(raw));
  if (token === "action") return "action";
  if (token === "bonus-action" || token === "bonusaction") return "bonus-action";
  if (token === "reaction") return "reaction";
  if (token === "free") return "free";
  return undefined;
}

function resourceFormula(value: unknown, preview: Record<AbilityKey, AbilityPreviewEntry>, proficiencyBonus: number, level: number): { usesMax?: number; formula?: string } {
  const candidate = usageAtLevel(value, level);
  if (candidate === undefined || candidate === null || candidate === "") {
    return {};
  }
  const numeric = firstNumber(candidate);
  if (typeof candidate === "number" && numeric !== undefined) {
    return { usesMax: numeric, formula: "fixed" };
  }
  const text = String(candidate).trim();
  if (!text) {
    return {};
  }
  if (/proficiency bonus/i.test(text)) {
    return { usesMax: Math.max(1, proficiencyBonus), formula: "proficiency bonus" };
  }
  const directAbility = text.match(/(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)\s+modifier/i);
  if (directAbility) {
    const ability = abilityFromText(directAbility[1]);
    return ability ? { usesMax: Math.max(1, preview[ability].modifier), formula: `${ability.toUpperCase()} modifier` } : {};
  }
  const onePlusAbility = text.match(/1\s*\+\s*(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)\s+modifier/i);
  if (onePlusAbility) {
    const ability = abilityFromText(onePlusAbility[1]);
    return ability ? { usesMax: Math.max(1, 1 + preview[ability].modifier), formula: `1 + ${ability.toUpperCase()} modifier` } : {};
  }
  if (text.includes("×")) {
    const multiplier = firstNumber(text);
    const abilityMatch = text.match(/(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)\s+mod/i);
    const ability = abilityMatch ? abilityFromText(abilityMatch[1]) : undefined;
    if (multiplier !== undefined && ability) {
      return {
        usesMax: Math.max(1, multiplier * Math.max(0, preview[ability].modifier)),
        formula: `${multiplier} × ${ability.toUpperCase()} modifier`,
      };
    }
  }
  if (numeric !== undefined) {
    return { usesMax: numeric, formula: "fixed" };
  }
  return {};
}

function parseActionAndResource(
  slice: OptionScopedStructuredSlice,
  preview: Record<AbilityKey, AbilityPreviewEntry>,
  proficiencyBonus: number,
  level: number,
  diagnostics: OptionScopedApplyDiagnostic[],
): { action?: OptionScopedActionDelta; resource?: OptionScopedResourceDelta } {
  const activationType = parseActionType(slice.data.action);
  const resourceResolved = resourceFormula(slice.data.usages, preview, proficiencyBonus, level);
  const recharge = rechargeRule(slice.data.recovery, level);
  const label = slice.optionLabel ? `${slice.sourceName}: ${slice.optionLabel}` : slice.sourceName;
  let resource: OptionScopedResourceDelta | undefined;
  if (slice.data.usages !== undefined || slice.data.recovery !== undefined) {
    if (resourceResolved.usesMax !== undefined && recharge.type !== "manual") {
      resource = {
        id: `option-scoped-resource:${slice.sourceDescriptorId}:${slice.optionId ?? "root"}`,
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        label,
        usesMax: resourceResolved.usesMax,
        formula: resourceResolved.formula,
        recharge,
        diagnostics: ["Structured option-scoped usages/recovery produced this resource."],
        dataStatus: "complete",
      };
    } else {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "usages",
        status: "unsupported",
        message: "Option-scoped usages/recovery was recognized, but no deterministic resource formula was available.",
      });
    }
  }

  if (!slice.data.action) {
    return { resource };
  }
  if (!activationType) {
    addDiagnostic(diagnostics, {
      sourceDescriptorId: slice.sourceDescriptorId,
      sourceName: slice.sourceName,
      sourceType: slice.sourceType,
      optionId: slice.optionId,
      optionLabel: slice.optionLabel,
      field: "action",
      status: "unsupported",
      message: "Option-scoped action was recognized, but its activation type is not mapped yet.",
    });
    return { resource };
  }
  const action: OptionScopedActionDelta = {
    id: `option-scoped-action:${slice.sourceDescriptorId}:${slice.optionId ?? "root"}`,
    sourceDescriptorId: slice.sourceDescriptorId,
    sourceName: slice.sourceName,
    sourceType: slice.sourceType,
    optionId: slice.optionId,
    label,
    activationType,
    description: slice.optionLabel ? `${slice.sourceName} option ${slice.optionLabel}` : slice.sourceName,
    resourceId: resource?.id,
    diagnostics: ["Structured option-scoped action produced this feature action."],
    dataStatus: resource ? resource.dataStatus : "complete",
  };
  return { action, resource };
}

function emptyOptionScopedApplyState(): OptionScopedApplyState {
  return {
    choices: [],
    diagnostics: [],
    abilityScoreBonuses: [],
    abilityScoreMaximums: [],
    proficiencyGrants: [],
    modifiers: [],
    actions: [],
    resources: [],
    appliedEntries: [],
  };
}

function summarizeAppliedEntry(
  slice: OptionScopedStructuredSlice,
  bonuses: OptionScopedAbilityScoreBonus[],
  maximums: OptionScopedAbilityScoreMaximum[],
  grants: OptionScopedProficiencyGrant[],
  modifiers: RuleModifier[],
  action: OptionScopedActionDelta | undefined,
  resource: OptionScopedResourceDelta | undefined,
): OptionScopedAppliedEntry | undefined {
  const summaries: string[] = [];
  bonuses.forEach((bonus) => summaries.push(`${bonus.ability.toUpperCase()} ${modifierLabel(bonus.amount)}`));
  maximums.forEach((maximum) => summaries.push(`${maximum.ability.toUpperCase()} max ${maximum.maximum}`));
  grants.forEach((grant) => {
    const prefix =
      grant.kind === "skill" ? "Skill" :
        grant.kind === "tool" ? "Tool" :
          grant.kind === "language" ? "Language" :
            grant.kind === "weapon" ? "Weapon" : "Armor";
    summaries.push(`${prefix}: ${grant.value}`);
  });
  modifiers.forEach((modifier) => {
    if (modifier.target === "armor-class" && typeof modifier.value === "number") {
      summaries.push(`AC ${modifierLabel(modifier.value)}${modifier.condition === "wearing-armor" ? " while armored" : modifier.condition === "not-wearing-armor" ? " while unarmored" : modifier.condition === "wearing-medium-or-heavy-armor" ? " with medium/heavy armor" : ""}`);
    } else if (modifier.target === "initiative" && typeof modifier.value === "number") {
      summaries.push(`Initiative ${modifierLabel(modifier.value)}`);
    } else if (modifier.target === "saving-throw" && typeof modifier.value === "number" && modifier.ability) {
      summaries.push(`${modifier.ability.toUpperCase()} save ${modifierLabel(modifier.value)}`);
    } else if (modifier.target === "skill-check" && typeof modifier.value === "number" && modifier.skill) {
      summaries.push(`${modifier.skill} ${modifierLabel(modifier.value)}`);
    }
  });
  if (action) {
    summaries.push(`${action.activationType.replace(/-/g, " ")}`);
  }
  if (resource?.usesMax !== undefined) {
    summaries.push(`${resource.usesMax}/${resource.recharge.label}`);
  }
  if (summaries.length === 0) {
    return undefined;
  }
  return {
    id: `option-scoped-applied:${slice.sourceDescriptorId}:${slice.optionId ?? "root"}`,
    sourceDescriptorId: slice.sourceDescriptorId,
    sourceName: slice.sourceName,
    sourceType: slice.sourceType,
    optionId: slice.optionId,
    optionLabel: slice.optionLabel,
    summaries,
    diagnostics: [],
  };
}

export function resolveOptionScopedApplyState(input: {
  sources: RuleSourceDescriptor[];
  draft: CharacterDraft;
  appliedRules?: AppliedCharacterRules;
}): OptionScopedApplyState {
  const base = emptyOptionScopedApplyState();
  const slices = input.sources.flatMap((source) => collectStructuredSlicesForSource(source, input.draft).map((slice) => ({ source, slice })));
  if (slices.length === 0) {
    return base;
  }

  const abilityScoreBonuses = slices.flatMap(({ slice }) => parseScoreBonuses(slice));
  const abilityScoreMaximums = slices.flatMap(({ slice }) => parseScoreMaximums(slice));
  const proficiencyBonus = input.appliedRules?.classResult.proficiencyBonus ?? baseProficiencyBonus(input.draft.classSelection.level);
  const preview = computeOptionScopedAbilityPreview({
    draft: input.draft,
    appliedRules: input.appliedRules,
    abilityScoreBonuses,
    abilityScoreMaximums,
  });

  const diagnostics: OptionScopedApplyDiagnostic[] = [];
  const proficiencyGrants: OptionScopedProficiencyGrant[] = [];
  const modifiers: RuleModifier[] = [];
  const actions: OptionScopedActionDelta[] = [];
  const resources: OptionScopedResourceDelta[] = [];
  const appliedEntries: OptionScopedAppliedEntry[] = [];

  for (const { source, slice } of slices) {
    const sliceBonuses = abilityScoreBonuses.filter((entry) => entry.sourceDescriptorId === slice.sourceDescriptorId && entry.optionId === slice.optionId);
    const sliceMaximums = abilityScoreMaximums.filter((entry) => entry.sourceDescriptorId === slice.sourceDescriptorId && entry.optionId === slice.optionId);
    if (slice.data.scores !== undefined) {
      if (sliceBonuses.length > 0) {
        addDiagnostic(diagnostics, {
          sourceDescriptorId: slice.sourceDescriptorId,
          sourceName: slice.sourceName,
          sourceType: slice.sourceType,
          optionId: slice.optionId,
          optionLabel: slice.optionLabel,
          field: "scores",
          status: "applied",
          applyPath: "ability score bonus",
          message: `Applied ${sliceBonuses.map((entry) => `${entry.ability.toUpperCase()} ${modifierLabel(entry.amount)}`).join(", ")}.`,
        });
      } else {
        addDiagnostic(diagnostics, {
          sourceDescriptorId: slice.sourceDescriptorId,
          sourceName: slice.sourceName,
          sourceType: slice.sourceType,
          optionId: slice.optionId,
          optionLabel: slice.optionLabel,
          field: "scores",
          status: "unsupported",
          message: "scores was recognized, but no deterministic ability bonus values were available.",
        });
      }
    }
    if (slice.data.scoresMaximum !== undefined) {
      if (sliceMaximums.length > 0) {
        addDiagnostic(diagnostics, {
          sourceDescriptorId: slice.sourceDescriptorId,
          sourceName: slice.sourceName,
          sourceType: slice.sourceType,
          optionId: slice.optionId,
          optionLabel: slice.optionLabel,
          field: "scoresMaximum",
          status: "applied",
          applyPath: "ability score maximum",
          message: `Applied ${sliceMaximums.map((entry) => `${entry.ability.toUpperCase()} max ${entry.maximum}`).join(", ")}.`,
        });
      } else {
        addDiagnostic(diagnostics, {
          sourceDescriptorId: slice.sourceDescriptorId,
          sourceName: slice.sourceName,
          sourceType: slice.sourceType,
          optionId: slice.optionId,
          optionLabel: slice.optionLabel,
          field: "scoresMaximum",
          status: "unsupported",
          message: "scoresMaximum was recognized, but no deterministic caps were available.",
        });
      }
    }

    const sliceGrants = parseProficiencyGrants(source, slice, input.draft, diagnostics);
    proficiencyGrants.push(...sliceGrants);
    if (slice.data.skills !== undefined && sliceGrants.some((entry) => entry.kind === "skill")) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "skills",
        status: "applied",
        applyPath: "skill proficiency grant",
        message: `Applied ${sliceGrants.filter((entry) => entry.kind === "skill").map((entry) => entry.value).join(", ")}.`,
      });
    }
    if (slice.data.toolProfs !== undefined && sliceGrants.some((entry) => entry.kind === "tool")) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "toolProfs",
        status: "applied",
        applyPath: "tool proficiency grant",
        message: `Applied ${sliceGrants.filter((entry) => entry.kind === "tool").map((entry) => entry.value).join(", ")}.`,
      });
    }
    if (slice.data.languageProfs !== undefined && sliceGrants.some((entry) => entry.kind === "language")) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "languageProfs",
        status: "applied",
        applyPath: "language grant",
        message: `Applied ${sliceGrants.filter((entry) => entry.kind === "language").map((entry) => entry.value).join(", ")}.`,
      });
    }
    if (slice.data.weaponProfs !== undefined && sliceGrants.some((entry) => entry.kind === "weapon")) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "weaponProfs",
        status: "applied",
        applyPath: "weapon proficiency grant",
        message: `Applied ${sliceGrants.filter((entry) => entry.kind === "weapon").map((entry) => entry.value).join(", ")}.`,
      });
    }
    if (slice.data.armorProfs !== undefined && sliceGrants.some((entry) => entry.kind === "armor")) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "armorProfs",
        status: "applied",
        applyPath: "armor proficiency grant",
        message: `Applied ${sliceGrants.filter((entry) => entry.kind === "armor").map((entry) => entry.value).join(", ")}.`,
      });
    }

    const sliceModifiers = [
      ...parseAddModModifiers(slice, preview, proficiencyBonus, diagnostics),
      ...parseExtraAcModifier(slice, diagnostics),
    ];
    modifiers.push(...sliceModifiers);
    if (slice.data.addMod !== undefined && sliceModifiers.some((modifier) => modifier.id.includes(":save:") || modifier.id.includes(":skill:") || modifier.target === "initiative" || modifier.target === "ability-check" || modifier.target === "passive-score")) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "addMod",
        status: "applied",
        applyPath: "rule modifier",
        message: `Applied ${sliceModifiers.filter((modifier) => modifier.target !== "armor-class").length} modifier(s).`,
      });
    }
    if (slice.data.extraAC !== undefined && sliceModifiers.some((modifier) => modifier.target === "armor-class")) {
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "extraAC",
        status: "applied",
        applyPath: "armor class modifier",
        message: `Applied ${sliceModifiers.filter((modifier) => modifier.target === "armor-class").map((modifier) => `AC ${modifierLabel(Number(modifier.value))}`).join(", ")}.`,
      });
    }

    const parsed = parseActionAndResource(slice, preview, proficiencyBonus, input.draft.classSelection.level, diagnostics);
    if (parsed.action) {
      actions.push(parsed.action);
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "action",
        status: "applied",
        applyPath: "feature action",
        message: `Applied ${parsed.action.activationType.replace(/-/g, " ")} action.`,
      });
    }
    if (parsed.resource) {
      resources.push(parsed.resource);
      addDiagnostic(diagnostics, {
        sourceDescriptorId: slice.sourceDescriptorId,
        sourceName: slice.sourceName,
        sourceType: slice.sourceType,
        optionId: slice.optionId,
        optionLabel: slice.optionLabel,
        field: "usages",
        status: "applied",
        applyPath: "resource delta",
        message: `Applied ${parsed.resource.usesMax}/${parsed.resource.recharge.label}.`,
      });
    }

    const summary = summarizeAppliedEntry(slice, sliceBonuses, sliceMaximums, sliceGrants, sliceModifiers, parsed.action, parsed.resource);
    if (summary) {
      appliedEntries.push(summary);
    }
  }

  return {
    choices: input.sources.flatMap((source) => buildOptionScopedChoiceArtifacts(source, input.draft)),
    diagnostics,
    abilityScoreBonuses,
    abilityScoreMaximums,
    proficiencyGrants,
    modifiers,
    actions,
    resources,
    appliedEntries,
  };
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

export function resolveCombinedRuleProficiencies(
  appliedRules: AppliedCharacterRules,
  optionScoped: OptionScopedApplyState,
): CombinedRuleProficiencies {
  const skills = [
    ...appliedRules.proficiencies.skills,
    ...optionScoped.proficiencyGrants.filter((entry) => entry.kind === "skill" && !entry.expertise).map((entry) => entry.value),
  ];
  const expertiseSkills = optionScoped.proficiencyGrants.filter((entry) => entry.kind === "skill" && entry.expertise).map((entry) => entry.value);
  const tools = [
    ...appliedRules.proficiencies.tools,
    ...appliedRules.classResult.toolProficiencies,
    ...optionScoped.proficiencyGrants.filter((entry) => entry.kind === "tool").map((entry) => entry.value),
  ];
  const languages = [
    ...appliedRules.proficiencies.languages,
    ...optionScoped.proficiencyGrants.filter((entry) => entry.kind === "language").map((entry) => entry.value),
  ];
  const weapons = [
    ...appliedRules.classResult.weaponProficiencies,
    ...optionScoped.proficiencyGrants.filter((entry) => entry.kind === "weapon").map((entry) => entry.value),
  ];
  const armor = [
    ...appliedRules.classResult.armorProficiencies,
    ...optionScoped.proficiencyGrants.filter((entry) => entry.kind === "armor").map((entry) => entry.value),
  ];
  return {
    skills: dedupe(skills),
    expertiseSkills: dedupe(expertiseSkills),
    tools: dedupe(tools),
    languages: dedupe(languages),
    weapons: dedupe(weapons),
    armor: dedupe(armor),
  };
}
