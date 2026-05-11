import { toSlug } from "../../lib/slug";
import type { CharacterDraft } from "../../domain/character";
import type { EquipmentDefinition, SpellDefinition } from "../../domain/content";
import type { ActiveEffectDefinition, RuleChoice, RuleChoiceOption, RuleModifier, RuleSourceDescriptor } from "../../domain/rules";
import type {
  RuleActiveEffectTemplate,
  RuleChoiceOptionTemplate,
  RuleChoiceTemplate,
  RuleMapping,
  RuleMappingOptionSource,
  RuleMappingOptionSourceFilters,
  RuleModifierTemplate,
} from "./ruleMappingTypes";
import { applyChoiceState } from "./choicePipeline";
import { resolveSpellCatalogOptions, resolveWeaponMasteryOptions, type RuleOptionSourceResult } from "./optionSources";
import { RULE_MAPPINGS } from "./ruleMappings";

export interface RuleMappingResolverContext {
  draft?: CharacterDraft;
  equipmentCatalog?: EquipmentDefinition[];
  spellCatalog?: SpellDefinition[];
}

export interface RuleMappingContribution {
  mappingIds: string[];
  choices: RuleChoice[];
  modifiers: RuleModifier[];
  effects: ActiveEffectDefinition[];
  diagnostics: string[];
}

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
].map((tool) => ({
  id: tool,
  label: tool.split("-").map(capitalize).join(" "),
  value: tool,
}));

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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function countWordToNumber(value: string | undefined): number | undefined {
  const token = String(value ?? "").toLowerCase();
  if (token === "one" || token === "a" || token === "an") return 1;
  if (token === "two") return 2;
  if (token === "three") return 3;
  if (token === "four") return 4;
  if (token === "five") return 5;
  if (token === "six") return 6;
  const parsed = Number(token);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function normalizeRuleMappingToken(value: string | undefined): string {
  return toSlug(value ?? "")
    .replace(/^rule-source-/, "")
    .replace(/^feature-/, "")
    .replace(/^feat-/, "")
    .replace(/^spell-/, "")
    .replace(/^item-/, "")
    .replace(/-2014$/, "")
    .replace(/-2024$/, "");
}

function sourceNameTokens(source: RuleSourceDescriptor): string[] {
  const full = normalizeRuleMappingToken(source.sourceName);
  const afterColon = normalizeRuleMappingToken(source.sourceName.split(":").pop());
  const sourceId = normalizeRuleMappingToken(source.sourceId);
  return Array.from(new Set([full, afterColon, sourceId, ...source.tags.map(normalizeRuleMappingToken)].filter(Boolean)));
}

function sourceTypeMatches(source: RuleSourceDescriptor, mapping: RuleMapping): boolean {
  const allowed = mapping.appliesTo.sourceType;
  if (!allowed) {
    return true;
  }
  return Array.isArray(allowed) ? allowed.includes(source.sourceType) : allowed === source.sourceType;
}

export function matchesRuleMapping(source: RuleSourceDescriptor, mapping: RuleMapping): boolean {
  if (!sourceTypeMatches(source, mapping)) return false;
  if (mapping.appliesTo.provider && mapping.appliesTo.provider !== source.provider) return false;
  if (mapping.appliesTo.rulesMode && mapping.appliesTo.rulesMode !== source.rulesMode) return false;
  if (mapping.appliesTo.sourceId && normalizeRuleMappingToken(mapping.appliesTo.sourceId) !== normalizeRuleMappingToken(source.sourceId)) return false;
  if (mapping.appliesTo.normalizedName && !sourceNameTokens(source).includes(normalizeRuleMappingToken(mapping.appliesTo.normalizedName))) return false;
  if (mapping.appliesTo.tags?.some((tag) => !source.tags.includes(tag))) return false;
  return true;
}

function emptyOptionSource(): RuleOptionSourceResult {
  return {
    source: {
      id: "option-source:none",
      optionType: "other",
      filters: {},
      diagnostics: [],
    },
    options: [],
    diagnostics: [],
  };
}

function optionsFromSource(
  source: RuleMappingOptionSource | undefined,
  context: RuleMappingResolverContext,
  filters: RuleMappingOptionSourceFilters = {},
): RuleOptionSourceResult {
  if (!source) return emptyOptionSource();
  if (source === "skills") {
    return {
      source: { id: "option-source:skills", optionType: "skill", filters: {}, diagnostics: ["Skill option source used static skill list."] },
      options: SKILL_OPTIONS.map((option) => ({ ...option, optionType: "skill" })),
      diagnostics: [`Option Source skills included ${SKILL_OPTIONS.length} option(s).`],
    };
  }
  if (source === "tools") {
    return {
      source: { id: "option-source:tools", optionType: "tool", filters: {}, diagnostics: ["Tool option source used static tool list."] },
      options: TOOL_OPTIONS.map((option) => ({ ...option, optionType: "tool" })),
      diagnostics: [`Option Source tools included ${TOOL_OPTIONS.length} option(s).`],
    };
  }
  if (source === "languages") {
    return {
      source: { id: "option-source:languages", optionType: "language", filters: {}, diagnostics: ["Language option source used static language list."] },
      options: LANGUAGE_OPTIONS.map((option) => ({ ...option, optionType: "language" })),
      diagnostics: [`Option Source languages included ${LANGUAGE_OPTIONS.length} option(s).`],
    };
  }
  if (source === "weapon-catalog") {
    return resolveWeaponMasteryOptions(context);
  }
  if (source === "spell-cantrips" || source === "spells") {
    return resolveSpellCatalogOptions(context, source === "spell-cantrips" ? "cantrip" : "spell", {
      spellClassKeys: filters.spellClassKeys,
      minLevel: filters.minLevel,
      maxLevel: filters.maxLevel,
    });
  }
  return emptyOptionSource();
}

function modifierFromTemplate(source: RuleSourceDescriptor, mapping: RuleMapping, template: RuleModifierTemplate, suffix?: string): RuleModifier {
  return {
    id: `rule-modifier:${source.id}:${mapping.id}:${template.id}${suffix ? `:${suffix}` : ""}`,
    sourceDescriptorId: source.id,
    sourceName: source.sourceName,
    sourceType: source.sourceType,
    target: template.target,
    valueType: template.valueType,
    value: template.value,
    damageType: template.damageType,
    ability: template.ability,
    skill: template.skill,
    condition: template.condition ?? "always",
    stackingKey: template.stackingKey,
    priority: template.priority,
    diagnostics: [
      `Rule mapping ${mapping.id} emitted this modifier (${mapping.confidence}).`,
      ...(template.diagnostics ?? []),
    ],
  };
}

function activeEffectFromTemplate(source: RuleSourceDescriptor, mapping: RuleMapping, template: RuleActiveEffectTemplate, suffix?: string): ActiveEffectDefinition {
  const modifiers = template.modifiers.map((modifier) => modifierFromTemplate(source, mapping, modifier, template.id));
  const modifierSummary = modifiers.reduce<{ dice?: string; flat?: number }>((summary, modifier) => {
    if (!summary.dice && modifier.valueType === "dice" && typeof modifier.value === "string") {
      summary.dice = String(modifier.value).replace(/\s+/g, "");
    }
    if (summary.flat === undefined && modifier.valueType === "flat" && typeof modifier.value === "number") {
      summary.flat = Number(modifier.value);
    }
    return summary;
  }, {});
  return {
    id: `active-effect:${source.id}:${mapping.id}:${template.id}${suffix ? `:${suffix}` : ""}`,
    sourceDescriptorId: source.id,
    label: source.sourceName,
    sourceName: source.sourceName,
    sourceType: source.sourceType,
    effectType: template.effectType,
    durationType: template.durationType,
    targets: template.targets ?? ["selected"],
    applicableRollTypes: [...template.applicableRollTypes],
    modifiers,
    requiresPrompt: template.requiresPrompt ?? true,
    remainingUses: template.remainingUses,
    modifierSummary: modifierSummary.dice !== undefined || modifierSummary.flat !== undefined ? modifierSummary : undefined,
    configurableFields: template.configurableFields,
    concentrationLinked: template.concentrationLinked ?? template.durationType === "concentration",
    diagnostics: [
      `Rule mapping ${mapping.id} emitted this active effect (${mapping.confidence}).`,
      ...(template.diagnostics ?? []),
    ],
  };
}

function choiceFromTemplate(
  source: RuleSourceDescriptor,
  mapping: RuleMapping,
  template: RuleChoiceTemplate,
  context: RuleMappingResolverContext,
  suffix?: string,
  parentChoice?: RuleChoice,
  selectedOptionId?: string,
): RuleChoice {
  const sourceText = `${source.sourceName}\n${source.sourceText ?? ""}`;
  const parsedRequiredCount = template.requiredCountFromSourceText
    ? countWordToNumber(
        sourceText.match(/\b(?:choose|select|gain mastery with|mastery properties of)\s+(one|two|three|four|five|six|[0-9]+)\b/i)?.[1] ??
          sourceText.match(/\b(one|two|three|four|five|six|[0-9]+)\s+(?:kinds of\s+)?(?:simple\s+or\s+martial\s+)?(?:melee\s+)?weapons?\b/i)?.[1],
      )
    : undefined;
  const requiredCountUnknown = Boolean(template.requiredCountFromSourceText && parsedRequiredCount === undefined && /\bnumber of\b/i.test(sourceText));
  const requiredCount = parsedRequiredCount ?? template.requiredCount;
  const optionSourceResult = optionsFromSource(template.optionSource, context, template.optionSourceFilters);
  const generatedOptions = [
    ...(template.options ?? []).map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value,
      optionType: template.choiceType,
      diagnostics: option.diagnostics,
    })),
    ...optionSourceResult.options,
  ];
  const optionMap = new Map<string, RuleChoiceOption>();
  for (const option of generatedOptions) {
    optionMap.set(option.id, option);
  }
  const options = Array.from(optionMap.values());
  const unsupported = Boolean((template.unsupportedWhenEmpty && options.length === 0) || (template.unsupportedWhenRequiredCountUnknown && requiredCountUnknown));
  return {
    id: `rule-choice:${source.id}:${mapping.id}:${template.id}${suffix ? `:${suffix}` : ""}`,
    sourceDescriptorId: source.id,
    sourceType: source.sourceType,
    choiceType: template.choiceType,
    requiredCount,
    minCount: template.minCount ?? requiredCount,
    maxCount: template.maxCount ?? requiredCount,
    options,
    selectedOptionIds: [],
    status: unsupported ? "unsupported" : "pending",
    appliesAtLevel: source.level,
    diagnostics: [
      `Rule mapping ${mapping.id} emitted this choice (${mapping.confidence}).`,
      ...(unsupported ? ["No deterministic option source was available."] : []),
      ...(requiredCountUnknown ? ["Required count could not be determined from structured data or declarative mapping."] : []),
      ...optionSourceResult.diagnostics,
      ...(template.diagnostics ?? []),
    ],
    parentChoiceId: parentChoice?.id,
    dependsOn: parentChoice && selectedOptionId
      ? {
          parentChoiceId: parentChoice.id,
          requiredSelectedOptionId: selectedOptionId,
          childChoiceId: `rule-choice:${source.id}:${mapping.id}:${template.id}${suffix ? `:${suffix}` : ""}`,
          dependencyType: "selected-option",
        }
      : undefined,
    selectedPath: parentChoice && selectedOptionId ? [parentChoice.id, selectedOptionId] : undefined,
    optionScope: selectedOptionId,
    generatedByOptionId: selectedOptionId,
    choiceStage: parentChoice ? "child" : "parent",
    isAvailable: true,
  };
}

function selectedOptionsForChoice(choice: RuleChoice, context: RuleMappingResolverContext): RuleChoiceOption[] {
  const resolved = applyChoiceState(choice, context.draft?.ruleChoices?.[choice.id]);
  const optionById = new Map(resolved.options.map((option) => [option.id, option]));
  return resolved.selectedOptionIds.map((id) => optionById.get(id)).filter((entry): entry is RuleChoiceOption => Boolean(entry));
}

function templateOptions(template: RuleChoiceTemplate, context: RuleMappingResolverContext): RuleChoiceOptionTemplate[] {
  const staticOptions = template.options ?? [];
  const dynamic = optionsFromSource(template.optionSource, context, template.optionSourceFilters).options.map((option): RuleChoiceOptionTemplate => ({
    id: option.id,
    label: option.label,
    value: option.value,
    diagnostics: option.diagnostics,
  }));
  return [...staticOptions, ...dynamic];
}

function modifierForSelectedOption(
  source: RuleSourceDescriptor,
  mapping: RuleMapping,
  template: RuleChoiceTemplate,
  selectedOption: RuleChoiceOption,
): RuleModifier | undefined {
  const selection = template.applySelectionAs;
  if (!selection) return undefined;
  const skill = selection.skillFromOption ? selectedOption.id as RuleModifier["skill"] : undefined;
  const ability = selection.abilityFromOption ? selectedOption.id as RuleModifier["ability"] : undefined;
  return {
    id: `rule-modifier:${source.id}:${mapping.id}:${template.id}:${selection.id}:${selectedOption.id}`,
    sourceDescriptorId: source.id,
    sourceName: `${source.sourceName}: ${selectedOption.label}`,
    sourceType: source.sourceType,
    target: selection.target,
    valueType: selection.valueType ?? "set",
    value: selection.value ?? true,
    ability,
    skill,
    condition: selection.condition ?? "always",
    diagnostics: [
      `Rule mapping ${mapping.id} emitted this modifier from selected option ${selectedOption.label}.`,
      ...(selection.diagnostics ?? []),
    ],
  };
}

function contributionFromMapping(source: RuleSourceDescriptor, mapping: RuleMapping, context: RuleMappingResolverContext): RuleMappingContribution {
  const choices: RuleChoice[] = [];
  const modifiers: RuleModifier[] = [];
  const effects: ActiveEffectDefinition[] = [];
  const diagnostics = [
    `Rule mapping applied: ${mapping.id} (${mapping.confidence}).`,
    ...(mapping.emits.diagnostics ?? []),
  ];

  for (const modifier of mapping.emits.modifiers ?? []) {
    modifiers.push(modifierFromTemplate(source, mapping, modifier));
  }
  for (const effect of mapping.emits.activeEffectDefinitions ?? []) {
    effects.push(activeEffectFromTemplate(source, mapping, effect));
  }
  for (const choiceTemplate of mapping.emits.choices ?? []) {
    const choice = choiceFromTemplate(source, mapping, choiceTemplate, context);
    choices.push(choice);
    const selectedOptions = selectedOptionsForChoice(choice, context);
    const optionTemplates = new Map(templateOptions(choiceTemplate, context).map((option) => [option.id, option]));
    for (const selected of selectedOptions) {
      const optionTemplate = optionTemplates.get(selected.id);
      const selectionModifier = modifierForSelectedOption(source, mapping, choiceTemplate, selected);
      if (selectionModifier) {
        modifiers.push(selectionModifier);
      }
      for (const modifier of optionTemplate?.modifiers ?? []) {
        modifiers.push(modifierFromTemplate(source, mapping, modifier, selected.id));
      }
      for (const effect of optionTemplate?.activeEffectDefinitions ?? []) {
        effects.push(activeEffectFromTemplate(source, mapping, effect, selected.id));
      }
      for (const nestedChoiceTemplate of optionTemplate?.choices ?? []) {
        choices.push(choiceFromTemplate(source, mapping, nestedChoiceTemplate, context, selected.id, choice, selected.id));
      }
    }
  }

  return {
    mappingIds: [mapping.id],
    choices,
    modifiers,
    effects,
    diagnostics,
  };
}

function dedupeById<T extends { id: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    output.push(entry);
  }
  return output;
}

export function resolveRuleMappingContribution(
  source: RuleSourceDescriptor,
  context: RuleMappingResolverContext = {},
  mappings: RuleMapping[] = RULE_MAPPINGS,
): RuleMappingContribution {
  const contributions = mappings
    .filter((mapping) => matchesRuleMapping(source, mapping))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((mapping) => contributionFromMapping(source, mapping, context));
  return {
    mappingIds: Array.from(new Set(contributions.flatMap((entry) => entry.mappingIds))).sort(),
    choices: dedupeById(contributions.flatMap((entry) => entry.choices)),
    modifiers: dedupeById(contributions.flatMap((entry) => entry.modifiers)),
    effects: dedupeById(contributions.flatMap((entry) => entry.effects)),
    diagnostics: Array.from(new Set(contributions.flatMap((entry) => entry.diagnostics))),
  };
}

export function applyRuleMappingsToSources(
  sources: RuleSourceDescriptor[],
  context: RuleMappingResolverContext = {},
  mappings: RuleMapping[] = RULE_MAPPINGS,
): RuleSourceDescriptor[] {
  return sources.map((source) => {
    const contribution = resolveRuleMappingContribution(source, context, mappings);
    if (contribution.mappingIds.length === 0) {
      return source;
    }
    return {
      ...source,
      choices: dedupeById([...source.choices, ...contribution.choices]),
      modifiers: dedupeById([...source.modifiers, ...contribution.modifiers]),
      effects: dedupeById([...source.effects, ...contribution.effects]),
      diagnostics: [...source.diagnostics, ...contribution.diagnostics],
      mappingRefs: Array.from(new Set([...(source.mappingRefs ?? []), ...contribution.mappingIds])).sort(),
    };
  });
}
