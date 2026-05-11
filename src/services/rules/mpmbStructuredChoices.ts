import { toSlug } from "../../lib/slug";
import type { CharacterDraft } from "../../domain/character";
import type { EquipmentDefinition, SpellDefinition } from "../../domain/content";
import type { RuleChoice, RuleChoiceOption, RuleSourceDescriptor } from "../../domain/rules";
import { applyChoiceState } from "./choicePipeline";
import { resolveWeaponMasteryOptions } from "./optionSources";
import { buildOptionScopedChoiceArtifacts } from "./optionScopedApplyPaths";
import { filterSpellOptions } from "./spellOptionFilter";

export interface MpmbStructuredChoiceContext {
  draft: CharacterDraft;
  equipmentCatalog?: EquipmentDefinition[];
  spellCatalog?: SpellDefinition[];
}

type StructuredRecord = Record<string, unknown>;

const ABILITY_OPTIONS: RuleChoiceOption[] = [
  { id: "int", label: "Intelligence", value: "int" },
  { id: "wis", label: "Wisdom", value: "wis" },
  { id: "cha", label: "Charisma", value: "cha" },
];

function asRecord(value: unknown): StructuredRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as StructuredRecord : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeToken(value: string | undefined): string {
  return toSlug(value ?? "");
}

function optionKey(label: string): string {
  return normalizeToken(label);
}

function optionObject(data: StructuredRecord, optionId: string): StructuredRecord | undefined {
  return asRecord(data[optionId]) ?? asRecord(data[optionId.toLowerCase()]) ?? asRecord(data[optionId.replace(/-/g, " ")]);
}

function choiceOption(label: string): RuleChoiceOption {
  return {
    id: optionKey(label),
    label,
    value: optionKey(label),
  };
}

function stateFor(choice: RuleChoice, context: MpmbStructuredChoiceContext): RuleChoice {
  return applyChoiceState(choice, context.draft.ruleChoices?.[choice.id]);
}

function abilityIdFromMpmb(value: unknown): string | undefined {
  if (value === 4 || value === "int" || value === "Int" || value === "Intelligence") return "int";
  if (value === 5 || value === "wis" || value === "Wis" || value === "Wisdom") return "wis";
  if (value === 6 || value === "cha" || value === "Cha" || value === "Charisma") return "cha";
  return undefined;
}

function abilityOptions(value: unknown): RuleChoiceOption[] {
  const rawValues = Array.isArray(value) ? value : [value];
  const ids = rawValues.map(abilityIdFromMpmb).filter((entry): entry is string => Boolean(entry));
  const allowed = new Set(ids);
  return ABILITY_OPTIONS.filter((option) => allowed.has(option.id));
}

function levelRange(value: unknown): [number, number] | undefined {
  if (Array.isArray(value) && value.length >= 2) {
    const min = asNumber(value[0]);
    const max = asNumber(value[1]);
    if (min !== undefined && max !== undefined) {
      return [min, max];
    }
  }
  const level = asNumber(value);
  return level !== undefined ? [level, level] : undefined;
}

function spellClassKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => typeof entry === "string" ? [normalizeToken(entry)] : []);
  }
  return typeof value === "string" ? [normalizeToken(value)] : [];
}

function spellcastingBonuses(value: unknown): StructuredRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((entry): entry is StructuredRecord => Boolean(entry)) : [];
}

function fixedSelections(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").map(normalizeToken) : [];
}

function countFromStructured(value: StructuredRecord): number | undefined {
  const explicit = asNumber(value.extraTimes);
  if (explicit !== undefined) {
    return explicit;
  }
  const additional = Array.isArray(value.additional) ? value.additional : undefined;
  if (additional) {
    const numeric = additional.map(asNumber).find((entry): entry is number => entry !== undefined && entry > 0);
    if (numeric !== undefined) {
      return numeric;
    }
  }
  return undefined;
}

function choiceId(source: RuleSourceDescriptor, suffix: string): string {
  return `rule-choice:${source.id}:mpmb:${suffix}`;
}

function mappedFightingStyleChoiceId(source: RuleSourceDescriptor): string {
  return `rule-choice:${source.id}:feature:fighting-style:choice:fighting-style`;
}

function childParentChoice(source: RuleSourceDescriptor, id: string, selectedOptionIds: string[]): RuleChoice {
  return {
    id,
    sourceDescriptorId: source.id,
    sourceType: source.sourceType,
    choiceType: "fighting-style",
    requiredCount: 1,
    minCount: 1,
    maxCount: 1,
    options: [],
    selectedOptionIds,
    status: selectedOptionIds.length ? "complete" : "pending",
    appliesAtLevel: source.level,
    diagnostics: ["Synthetic parent reference for option-scoped MPMB child choices."],
    choiceStage: "parent",
    isAvailable: true,
  };
}

function parentChoice(source: RuleSourceDescriptor, options: RuleChoiceOption[]): RuleChoice {
  return {
    id: choiceId(source, "choices"),
    sourceDescriptorId: source.id,
    sourceType: source.sourceType,
    choiceType: "feature-option",
    requiredCount: 1,
    minCount: 1,
    maxCount: 1,
    options,
    selectedOptionIds: [],
    status: "pending",
    appliesAtLevel: source.level,
    diagnostics: ["Structured MPMB choices field produced this parent choice."],
    choiceStage: "parent",
    isAvailable: true,
  };
}

function spellcastingAbilityChoice(source: RuleSourceDescriptor, parent: RuleChoice, optionId: string, option: StructuredRecord): RuleChoice | undefined {
  const options = abilityOptions(option.spellcastingAbility);
  if (options.length === 0) {
    return undefined;
  }
  return {
    id: choiceId(source, `option:${optionId}:spellcasting-ability`),
    sourceDescriptorId: source.id,
    sourceType: source.sourceType,
    choiceType: "ability-score",
    requiredCount: 1,
    minCount: 1,
    maxCount: 1,
    options,
    selectedOptionIds: [],
    status: "pending",
    appliesAtLevel: source.level,
    diagnostics: ["Structured MPMB spellcastingAbility field produced this child choice."],
    parentChoiceId: parent.id,
    dependsOn: {
      parentChoiceId: parent.id,
      requiredSelectedOptionId: optionId,
      childChoiceId: choiceId(source, `option:${optionId}:spellcasting-ability`),
      dependencyType: "selected-ability",
    },
    selectedPath: [parent.id, optionId],
    optionScope: optionId,
    generatedByOptionId: optionId,
    choiceStage: "child",
    isAvailable: true,
  };
}

function spellBonusChoice(
  source: RuleSourceDescriptor,
  parent: RuleChoice | undefined,
  optionId: string | undefined,
  bonus: StructuredRecord,
  index: number,
  context: MpmbStructuredChoiceContext,
): RuleChoice {
  const range = levelRange(bonus.level) ?? [0, 9];
  const classKeys = spellClassKeys(bonus.class);
  const filter = filterSpellOptions({
    spellCatalog: context.spellCatalog,
    classKeys,
    minLevel: range[0],
    maxLevel: range[1],
  });
  const isCantrip = range[0] === 0 && range[1] === 0;
  const requiredCount = asNumber(bonus.times) ?? (fixedSelections(bonus.selection).length || 1);
  const idSuffix = `${optionId ? `option:${optionId}:` : ""}spellcasting-bonus:${index}:${isCantrip ? "cantrip" : "spell"}`;
  const unsupported = filter.options.length === 0;
  const id = choiceId(source, idSuffix);
  return {
    id,
    sourceDescriptorId: source.id,
    sourceType: source.sourceType,
    choiceType: isCantrip ? "cantrip" : "spell",
    requiredCount,
    minCount: requiredCount,
    maxCount: requiredCount,
    options: filter.options,
    selectedOptionIds: [],
    status: unsupported ? "unsupported" : "pending",
    appliesAtLevel: source.level,
    diagnostics: [
      `Structured MPMB spellcastingBonus produced this ${isCantrip ? "cantrip" : "spell"} choice.`,
      `Filter: ${classKeys.length ? classKeys.join(", ") : "missing spell list"} level ${range[0]}-${range[1]}.`,
      ...filter.diagnostics,
      ...(bonus.prepared ? ["Spellcasting bonus marks selected spells as prepared."] : []),
      ...(bonus.firstCol ? [`firstCol hint: ${String(bonus.firstCol)}.`] : []),
    ],
    parentChoiceId: parent?.id,
    dependsOn: parent && optionId
      ? {
          parentChoiceId: parent.id,
          requiredSelectedOptionId: optionId,
          childChoiceId: id,
          dependencyType: "selected-spell-list",
        }
      : undefined,
    selectedPath: parent && optionId ? [parent.id, optionId] : undefined,
    optionScope: optionId,
    generatedByOptionId: optionId,
    choiceStage: parent ? "child" : "subchoice",
    isAvailable: true,
  };
}

function weaponMasteryChoice(source: RuleSourceDescriptor, structured: StructuredRecord, context: MpmbStructuredChoiceContext): RuleChoice | undefined {
  if (!structured.choicesWeaponMasteries) {
    return undefined;
  }
  const requiredCount = countFromStructured(structured);
  const optionSource = resolveWeaponMasteryOptions(context);
  const options = optionSource.options;
  const unsupported = requiredCount === undefined || options.length === 0;
  return {
    id: choiceId(source, "weapon-mastery"),
    sourceDescriptorId: source.id,
    sourceType: source.sourceType,
    choiceType: "weapon-mastery",
    requiredCount: requiredCount ?? 0,
    minCount: requiredCount ?? 0,
    maxCount: requiredCount ?? 0,
    options,
    selectedOptionIds: [],
    status: unsupported ? "unsupported" : "pending",
    appliesAtLevel: source.level,
    diagnostics: [
      "Structured MPMB choicesWeaponMasteries produced this weapon mastery choice.",
      ...(requiredCount === undefined ? ["Required count is not deterministic from extraTimes/additional."] : [`Required count: ${requiredCount}.`]),
      ...(options.length === 0 ? ["No weapon catalog options were available for this choice."] : [`Weapon catalog options: ${options.length}.`]),
      ...optionSource.diagnostics,
    ],
    choiceStage: "parent",
    isAvailable: true,
  };
}

export function resolveMpmbStructuredChoices(source: RuleSourceDescriptor, context: MpmbStructuredChoiceContext): RuleChoice[] {
  const structured = asRecord(source.structuredData);
  if (!structured) {
    return [];
  }
  const choices: RuleChoice[] = [];
  const optionLabels = asStringArray(structured.choices);
  const isFightingStyleChoiceFamily = Boolean(structured.choicesFightingStyles);
  if (optionLabels.length > 0 && isFightingStyleChoiceFamily) {
    const parentId = mappedFightingStyleChoiceId(source);
    const selectedOptionIds = context.draft.ruleChoices?.[parentId]?.selectedOptionIds ?? [];
    const selectedOptionId = selectedOptionIds[0];
    const selectedOption = selectedOptionId ? optionObject(structured, selectedOptionId) : undefined;
    if (selectedOption && selectedOptionId) {
      const parent = childParentChoice(source, parentId, selectedOptionIds);
      const abilityChoice = spellcastingAbilityChoice(source, parent, selectedOptionId, selectedOption);
      if (abilityChoice) choices.push(abilityChoice);
      for (const [index, bonus] of spellcastingBonuses(selectedOption.spellcastingBonus).entries()) {
        choices.push(spellBonusChoice(source, parent, selectedOptionId, bonus, index, context));
      }
    }
  } else if (optionLabels.length > 0) {
    const parent = stateFor(parentChoice(source, optionLabels.map(choiceOption)), context);
    choices.push(parent);
    const selectedOptionId = parent.selectedOptionIds[0];
    const selectedOption = selectedOptionId ? optionObject(structured, selectedOptionId) : undefined;
    if (selectedOption && selectedOptionId) {
      const abilityChoice = spellcastingAbilityChoice(source, parent, selectedOptionId, selectedOption);
      if (abilityChoice) choices.push(abilityChoice);
      for (const [index, bonus] of spellcastingBonuses(selectedOption.spellcastingBonus).entries()) {
        choices.push(spellBonusChoice(source, parent, selectedOptionId, bonus, index, context));
      }
    }
  }

  if (choices.length === 0) {
    for (const [index, bonus] of spellcastingBonuses(structured.spellcastingBonus).entries()) {
      choices.push(spellBonusChoice(source, undefined, undefined, bonus, index, context));
    }
  }

  const mastery = weaponMasteryChoice(source, structured, context);
  if (mastery) {
    choices.push(mastery);
  }

  choices.push(...buildOptionScopedChoiceArtifacts(source, context.draft));

  return choices;
}
