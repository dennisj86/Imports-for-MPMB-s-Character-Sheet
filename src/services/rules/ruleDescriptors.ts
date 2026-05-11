import { toSlug } from "../../lib/slug";
import type { CharacterDraft } from "../../domain/character";
import type { BackgroundDefinition, ClassDefinition, EquipmentDefinition, FeatDefinition, FeatureDefinition, SpeciesDefinition, SpellDefinition, SubclassDefinition } from "../../domain/content";
import type { CharacterRuleEngineState, RuleModifier, RuleSourceDescriptor, RuleSourceType } from "../../domain/rules";
import { resolveEquipmentDefinitionForInventoryItem } from "../equipment";
import { extractChoicesFromText } from "./choicePipeline";
import { resolveMpmbStructuredChoices } from "./mpmbStructuredChoices";
import { resolveOptionScopedApplyState } from "./optionScopedApplyPaths";
import { buildRuleChoiceSurface } from "./ruleChoiceSurface";
import { applyRuleMappingsToSources } from "./ruleMappingResolver";
import type { AppliedCharacterRules } from "../../domain/appliedRules";

export interface RuleDescriptorInput {
  draft: CharacterDraft;
  appliedRules?: AppliedCharacterRules;
  classDef?: ClassDefinition;
  subclassDef?: SubclassDefinition;
  speciesDef?: SpeciesDefinition;
  backgroundDef?: BackgroundDefinition;
  selectedFeats?: FeatDefinition[];
  selectedSpells?: SpellDefinition[];
  equipmentCatalog?: EquipmentDefinition[];
  spellCatalog?: SpellDefinition[];
}

function descriptorId(sourceType: RuleSourceType, id: string | undefined, index = 0): string {
  return `rule-source:${sourceType}:${toSlug(id || `anonymous-${index}`)}`;
}

function tagsFromText(text: string | undefined): string[] {
  const lower = String(text ?? "").toLowerCase();
  const tags = new Set<string>();
  if (/\bfighting style\b/.test(lower)) tags.add("fighting-style");
  if (/\bweapon mastery\b|\bmastery property\b/.test(lower)) tags.add("weapon-mastery");
  if (/\bspellcasting\b/.test(lower)) tags.add("spellcasting");
  if (/\bchoose|select\b/.test(lower)) tags.add("choice");
  if (/\bbonus\b|\bmodifier\b|\bd\d+\b/.test(lower)) tags.add("modifier-candidate");
  if (/\bconcentration\b/.test(lower)) tags.add("concentration");
  return Array.from(tags);
}

function parseFlatAcModifier(source: RuleSourceDescriptor, text: string | undefined): RuleModifier[] {
  if (source.sourceType === "spell") {
    return [];
  }
  const match = String(text ?? "").match(/\+([1-5])\s+(?:bonus\s+)?(?:to\s+)?(?:ac|armor class)\b/i);
  if (!match) {
    return [];
  }
  return [
    {
      id: `rule-modifier:${source.id}:ac:${match[1]}`,
      sourceDescriptorId: source.id,
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      target: "armor-class",
      valueType: "flat",
      value: Number(match[1]),
      condition: "always",
      diagnostics: ["Flat AC modifier parsed from structured item/source text fallback."],
    },
  ];
}

function createDescriptor(input: {
  draft: CharacterDraft;
  sourceType: RuleSourceType;
  sourceId?: string;
  sourceName: string;
  level?: number;
  text?: string;
  structuredData?: unknown;
  index?: number;
}): RuleSourceDescriptor {
  const source: RuleSourceDescriptor = {
    id: descriptorId(input.sourceType, input.sourceId ?? input.sourceName, input.index),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    provider: input.draft.provider,
    rulesMode: input.draft.rulesMode,
    level: input.level,
    tags: tagsFromText(`${input.sourceName}\n${input.text ?? ""}`),
    choices: [],
    modifiers: [],
    effects: [],
    diagnostics: [],
    sourceText: input.text,
    structuredData: input.structuredData,
  };
  source.choices = extractChoicesFromText(source, input.text);
  source.modifiers = parseFlatAcModifier(source, input.text);
  if (source.choices.some((choice) => choice.status === "unsupported")) {
    source.diagnostics.push("Choice-like rule source needs structured option data before it can be completed.");
  }
  return source;
}

function featureDescriptor(draft: CharacterDraft, sourceType: RuleSourceType, ownerName: string | undefined, feature: FeatureDefinition): RuleSourceDescriptor {
  return createDescriptor({
    draft,
    sourceType,
    sourceId: feature.id,
    sourceName: `${ownerName ? `${ownerName}: ` : ""}${feature.name}`,
    level: feature.minLevel,
    text: feature.description,
    structuredData: feature.structuredData,
  });
}

export function resolveRuleSourceDescriptors(input: RuleDescriptorInput): RuleSourceDescriptor[] {
  const sources: RuleSourceDescriptor[] = [];
  const level = input.draft.classSelection.level;

  for (const feature of input.classDef?.features.filter((entry) => entry.minLevel <= level) ?? []) {
    sources.push(featureDescriptor(input.draft, "class-feature", input.classDef?.name, feature));
  }
  for (const feature of input.subclassDef?.features.filter((entry) => entry.minLevel <= level) ?? []) {
    sources.push(featureDescriptor(input.draft, "subclass-feature", input.subclassDef?.name, feature));
  }
  if (input.speciesDef?.traits) {
    input.speciesDef.traits.split(/\r?\n+/).filter(Boolean).forEach((trait, index) => {
      sources.push(createDescriptor({
        draft: input.draft,
        sourceType: "species-feature",
        sourceId: `${input.speciesDef?.id}:trait:${index}`,
        sourceName: `${input.speciesDef?.name ?? "Species"} Trait`,
        text: trait,
        index,
      }));
    });
  }
  if (input.backgroundDef) {
    sources.push(createDescriptor({
      draft: input.draft,
      sourceType: "background-feature",
      sourceId: input.backgroundDef.id,
      sourceName: input.backgroundDef.name,
      text: [input.backgroundDef.traitText, input.backgroundDef.skillText, input.backgroundDef.toolText, input.backgroundDef.bonusFeat].filter(Boolean).join("\n"),
    }));
  }
  for (const feat of input.selectedFeats ?? []) {
    sources.push(createDescriptor({
      draft: input.draft,
      sourceType: "feat",
      sourceId: feat.id,
      sourceName: feat.name,
      text: [feat.prerequisite, feat.description].filter(Boolean).join("\n"),
      structuredData: feat.structuredData,
    }));
  }
  for (const item of input.draft.inventory.items.filter((entry) => entry.equipped)) {
    const definition = resolveEquipmentDefinitionForInventoryItem(item, input.equipmentCatalog);
    sources.push(createDescriptor({
      draft: input.draft,
      sourceType: "item",
      sourceId: definition?.id ?? item.itemDefinitionId ?? item.id,
      sourceName: definition?.name ?? item.name,
      text: [definition?.type, definition?.description, item.type].filter(Boolean).join("\n"),
    }));
  }
  for (const spell of input.selectedSpells ?? []) {
    sources.push(createDescriptor({
      draft: input.draft,
      sourceType: "spell",
      sourceId: spell.id,
      sourceName: spell.name,
      text: [spell.castingTime, spell.duration, spell.description].filter(Boolean).join("\n"),
    }));
  }
  return sources;
}

export function resolveCharacterRuleEngine(input: RuleDescriptorInput): CharacterRuleEngineState {
  const structuredSources = resolveRuleSourceDescriptors(input).map((source) => ({
    ...source,
    choices: [
      ...source.choices,
      ...resolveMpmbStructuredChoices(source, {
        draft: input.draft,
        equipmentCatalog: input.equipmentCatalog,
        spellCatalog: input.spellCatalog,
      }),
    ],
  }));
  const sources = applyRuleMappingsToSources(structuredSources, {
    draft: input.draft,
    equipmentCatalog: input.equipmentCatalog,
    spellCatalog: input.spellCatalog,
  });
  const optionScoped = resolveOptionScopedApplyState({
    sources,
    draft: input.draft,
    appliedRules: input.appliedRules,
  });
  const choiceSurface = buildRuleChoiceSurface(sources, input.draft.ruleChoices);
  const canonicalChoices = choiceSurface.choices.map((choice) => choice.choice);
  const modifiers = [...sources.flatMap((source) => source.modifiers), ...optionScoped.modifiers];
  const effects = sources.flatMap((source) => source.effects);
  const diagnostics = sources.flatMap((source) => source.diagnostics);
  const optionScopedDiagnostics = optionScoped.diagnostics.map((entry) => {
    const optionLabel = entry.optionLabel ?? entry.optionId;
    return `${entry.sourceName}${optionLabel ? ` / ${optionLabel}` : ""}: ${entry.field} ${entry.status}${entry.applyPath ? ` via ${entry.applyPath}` : ""}. ${entry.message}`;
  });
  const hasUnsupportedOptionScoped = optionScoped.diagnostics.some((entry) => entry.status === "unsupported");
  return {
    sources,
    choices: canonicalChoices,
    choiceSurface,
    modifiers,
    effects,
    optionScoped,
    diagnostics: [...diagnostics, ...optionScopedDiagnostics, ...choiceSurface.diagnostics],
    dataStatus:
      diagnostics.length || hasUnsupportedOptionScoped || choiceSurface.choices.some((choice) => choice.status === "unsupported")
        ? "partial"
        : "complete",
  };
}
