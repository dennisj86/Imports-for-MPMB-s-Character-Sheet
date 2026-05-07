import { toSlug } from "../../lib/slug";
import type { AppliedCharacterRules } from "../../domain/appliedRules";
import type { CharacterDraft, InventoryState } from "../../domain/character";
import type {
  BackgroundDefinition,
  ClassDefinition,
  EquipmentDefinition,
  FeatDefinition,
  RulesMode,
  SpellDefinition,
  SubclassDefinition,
} from "../../domain/content";
import type { DerivedCharacterStats, DerivedDataStatus } from "../../domain/derivedStats";
import type {
  ClassSkillChoiceState,
  FeatSubchoice,
  FeatChoiceContext,
  SkillChoiceState,
  StartingEquipmentChoiceContext,
  SpellChoiceContext,
  WizardCompletionState,
  WizardEligibilitySnapshot,
  WizardStepId,
  WizardStepValidation,
} from "../../domain/builderWizard";
import type { LevelProgressionResult } from "../../domain/progression";
import { getClassStartingEquipmentRule } from "./mappings/classStartingEquipmentRules";

type BuilderWizardResolverInput = {
  draft: CharacterDraft;
  rulesMode: RulesMode;
  classDef?: ClassDefinition;
  subclassDef?: SubclassDefinition;
  backgroundDef?: BackgroundDefinition;
  feats: FeatDefinition[];
  spells: SpellDefinition[];
  appliedRules: AppliedCharacterRules;
  progression: LevelProgressionResult;
  derivedStats: DerivedCharacterStats;
};

type FeatPrerequisiteEvaluation = {
  satisfied: boolean;
  deterministic: boolean;
  reason?: string;
};

type BaseSpellChoiceContext = {
  id: string;
  kind: SpellChoiceContext["kind"];
  title: string;
  description: string;
  source: "class" | "feat";
  sourceId?: string;
  classKeys: string[];
  requiredCount: number;
  maxSelections?: number;
  minSpellLevel: number;
  maxSpellLevel: number;
  notes: string[];
};

const ALL_SKILLS = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
] as const;

const ORIGIN_FEAT_KEYS = new Set([
  "alert",
  "magic-initiate",
  "magic-initiate-cleric",
  "magic-initiate-druid",
  "magic-initiate-wizard",
  "savage-attacker",
  "skilled",
]);

const CLASS_NAME_TOKENS = new Set([
  "artificer",
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
]);

function normalizeToken(value: string | undefined): string {
  return toSlug(value ?? "")
    .replace(/^srd-2024-/, "")
    .replace(/^srd-2014-/, "")
    .replace(/^srd-/, "")
    .replace(/^open5e-2024-/, "")
    .replace(/^open5e-2014-/, "")
    .replace(/^open5e-/, "")
    .replace(/-legacy$/, "");
}

function normalizeClassKey(classDef: ClassDefinition | undefined): string {
  if (!classDef) {
    return "";
  }
  return normalizeToken(classDef.compatibility?.canonicalKey ?? classDef.canonicalClassKey ?? classDef.key ?? classDef.name);
}

function normalizeSkillToken(value: string): string {
  return normalizeToken(value).replace(/-skill$/, "");
}

function resolveClassSkillOptions(options: string[]): string[] {
  const hasAnySkill = options.some((entry) => normalizeSkillToken(entry) === "any-skill");
  const resolved = hasAnySkill ? [...ALL_SKILLS] : [...options];
  return Array.from(new Set(resolved));
}

function getFeatureChoiceValue(draft: CharacterDraft, id: string): string | undefined {
  return draft.featureChoices.find((entry) => entry.featureId === id)?.optionId;
}

function parseRequiredCount(description: string | undefined, fallback = 1): number {
  const match = String(description ?? "").match(/select\s+([0-9]+)/i);
  if (!match) {
    return fallback;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function maxSpellLevelFromSlots(progression: LevelProgressionResult): number {
  const levels = Object.keys(progression.spellProgression.spellSlots).map((entry) => Number(entry));
  const values = levels.filter((entry) => Number.isFinite(entry) && entry > 0);
  if (values.length === 0) {
    return 0;
  }
  return Math.max(...values);
}

function isOriginFeat(feat: FeatDefinition): boolean {
  const canonical = normalizeToken(feat.compatibility?.canonicalKey ?? feat.key ?? feat.name);
  if (ORIGIN_FEAT_KEYS.has(canonical)) {
    return true;
  }
  return canonical.startsWith("magic-initiate");
}

function evaluateFeatPrerequisite(
  feat: FeatDefinition,
  draft: CharacterDraft,
  classDef: ClassDefinition | undefined,
  appliedRules: AppliedCharacterRules,
  derivedStats: DerivedCharacterStats,
): FeatPrerequisiteEvaluation {
  const prerequisite = feat.prerequisite?.trim();
  if (!prerequisite) {
    return {
      satisfied: true,
      deterministic: true,
    };
  }

  const text = prerequisite.toLowerCase();
  const classToken = normalizeClassKey(classDef);

  const levelMatch = text.match(/(?:level|lvl)\s*([0-9]+)/i) ?? text.match(/([0-9]+)(?:st|nd|rd|th)-level/i);
  if (levelMatch) {
    const requiredLevel = Number(levelMatch[1]);
    if (Number.isFinite(requiredLevel) && draft.classSelection.level < requiredLevel) {
      return {
        satisfied: false,
        deterministic: true,
        reason: `Requires level ${requiredLevel}.`,
      };
    }
  }

  const abilityMatches = Array.from(text.matchAll(/(strength|dexterity|constitution|intelligence|wisdom|charisma)\s*(?:score)?\s*(?:of\s*)?([0-9]{1,2})/gi));
  if (abilityMatches.length > 0) {
    const abilityChecks = abilityMatches.map((match) => {
      const abilityName = match[1].toLowerCase();
      const required = Number(match[2]);
      const key =
        abilityName.startsWith("str") ? "str" :
          abilityName.startsWith("dex") ? "dex" :
            abilityName.startsWith("con") ? "con" :
              abilityName.startsWith("int") ? "int" :
                abilityName.startsWith("wis") ? "wis" : "cha";
      return {
        key,
        required,
        current: derivedStats.abilityScores[key].finalScore,
      };
    });
    const hasOr = text.includes(" or ");
    const satisfied = hasOr
      ? abilityChecks.some((entry) => entry.current >= entry.required)
      : abilityChecks.every((entry) => entry.current >= entry.required);
    if (!satisfied) {
      return {
        satisfied: false,
        deterministic: true,
        reason: "Ability score prerequisite not met.",
      };
    }
  }

  if (text.includes("spellcasting") && !appliedRules.spellcasting.available) {
    return {
      satisfied: false,
      deterministic: true,
      reason: "Requires spellcasting.",
    };
  }

  if (text.includes("martial weapon proficiency")) {
    const hasMartial = appliedRules.classResult.weaponProficiencies.some((entry) => entry.toLowerCase().includes("martial"));
    if (!hasMartial) {
      return {
        satisfied: false,
        deterministic: true,
        reason: "Requires martial weapon proficiency.",
      };
    }
  }

  const matchedClassToken = Array.from(CLASS_NAME_TOKENS).find((token) => text.includes(token));
  if (matchedClassToken && matchedClassToken !== classToken) {
    return {
      satisfied: false,
      deterministic: true,
      reason: `Requires ${matchedClassToken}.`,
    };
  }

  const unsupportedSignals = [
    "species",
    "race",
    "lineage",
    "size",
    "background",
    "proficiency with",
    "feat:",
    "eldritch invocation",
  ];
  if (unsupportedSignals.some((token) => text.includes(token))) {
    return {
      satisfied: false,
      deterministic: false,
      reason: `Prerequisite '${prerequisite}' cannot be fully verified yet.`,
    };
  }

  return {
    satisfied: true,
    deterministic: true,
  };
}

function parseMagicInitiateListKey(
  feat: FeatDefinition,
  draft: CharacterDraft,
): { listKey?: "cleric" | "druid" | "wizard"; notes: string[] } {
  const canonical = normalizeToken(feat.compatibility?.canonicalKey ?? feat.key ?? feat.name);
  const notes: string[] = [];
  if (canonical.includes("magic-initiate-cleric")) {
    return { listKey: "cleric", notes };
  }
  if (canonical.includes("magic-initiate-druid")) {
    return { listKey: "druid", notes };
  }
  if (canonical.includes("magic-initiate-wizard")) {
    return { listKey: "wizard", notes };
  }

  const explicitChoice = getFeatureChoiceValue(draft, `feat-choice:${feat.id}:spell-list`);
  if (explicitChoice === "cleric" || explicitChoice === "druid" || explicitChoice === "wizard") {
    return { listKey: explicitChoice, notes };
  }

  notes.push("Magic Initiate spell list is not selected yet (cleric/druid/wizard).");
  return { listKey: undefined, notes };
}

function parseMagicInitiateAbilityChoice(
  feat: FeatDefinition,
  draft: CharacterDraft,
): { ability?: "int" | "wis" | "cha"; notes: string[] } {
  const notes: string[] = [];
  const explicitChoice = getFeatureChoiceValue(draft, `feat-choice:${feat.id}:spell-ability`);
  if (explicitChoice === "int" || explicitChoice === "wis" || explicitChoice === "cha") {
    return { ability: explicitChoice, notes };
  }
  notes.push("Magic Initiate spellcasting ability is not selected yet (INT/WIS/CHA).");
  return { ability: undefined, notes };
}

function buildFeatSubchoices(
  feat: FeatDefinition | undefined,
  draft: CharacterDraft,
): FeatSubchoice[] {
  if (!feat) {
    return [];
  }
  const canonical = normalizeToken(feat.compatibility?.canonicalKey ?? feat.key ?? feat.name);
  if (!canonical.startsWith("magic-initiate")) {
    return [];
  }

  const listResolution = parseMagicInitiateListKey(feat, draft);
  const abilityResolution = parseMagicInitiateAbilityChoice(feat, draft);
  const subchoices: FeatSubchoice[] = [];
  const isFixedList = canonical.includes("magic-initiate-cleric") || canonical.includes("magic-initiate-druid") || canonical.includes("magic-initiate-wizard");

  if (!isFixedList) {
    subchoices.push({
      id: `feat-choice:${feat.id}:spell-list`,
      title: "Spell List",
      description: "Select the spell list used by this feat.",
      required: true,
      selectedOptionId: listResolution.listKey,
      options: [
        { id: "cleric", label: "Cleric" },
        { id: "druid", label: "Druid" },
        { id: "wizard", label: "Wizard" },
      ],
      satisfied: Boolean(listResolution.listKey),
      notes: [...listResolution.notes],
    });
  }

  subchoices.push({
    id: `feat-choice:${feat.id}:spell-ability`,
    title: "Spellcasting Ability",
    description: "Select the ability used for spells gained by this feat.",
    required: true,
    selectedOptionId: abilityResolution.ability,
    options: [
      { id: "int", label: "Intelligence" },
      { id: "wis", label: "Wisdom" },
      { id: "cha", label: "Charisma" },
    ],
    satisfied: Boolean(abilityResolution.ability),
    notes: [...abilityResolution.notes],
  });

  return subchoices;
}

function getSkillOptions(options: string[]): string[] {
  return resolveClassSkillOptions(options);
}

function resolveSkillChoiceState(
  draft: CharacterDraft,
  source: "class" | "species" | "background",
  requiredCount: number,
  options: string[],
  reason: string,
): SkillChoiceState {
  const normalizedOptions = getSkillOptions(options);
  const optionTokens = new Set(normalizedOptions.map((entry) => normalizeSkillToken(entry)));
  const selectedOptions: string[] = [];
  for (let index = 0; index < requiredCount; index += 1) {
    const selected = getFeatureChoiceValue(draft, `skill-choice:${source}:${index}`);
    if (!selected || !optionTokens.has(normalizeSkillToken(selected))) {
      continue;
    }
    selectedOptions.push(selected);
  }
  const uniqueSelected = Array.from(new Set(selectedOptions));
  const missingCount = Math.max(0, requiredCount - uniqueSelected.length);
  return {
    id: `skill-choice:${source}`,
    source,
    title: `${source.charAt(0).toUpperCase()}${source.slice(1)} Skill Choices`,
    requiredCount,
    missingCount,
    options: normalizedOptions,
    selectedOptions: uniqueSelected,
    choiceKeyPrefix: `skill-choice:${source}`,
    reason,
    dataStatus: requiredCount === 0 ? "complete" : missingCount === 0 ? "complete" : "pending",
  };
}

export function getClassSkillChoiceState(
  draft: CharacterDraft,
  appliedRules: AppliedCharacterRules,
): ClassSkillChoiceState {
  return (
    getSkillChoiceStates(draft, appliedRules).find((entry) => entry.source === "class") ??
    {
      id: "skill-choice:class",
      source: "class",
      title: "Class Skill Choices",
      requiredCount: 0,
      missingCount: 0,
      options: [],
      selectedOptions: [],
      choiceKeyPrefix: "skill-choice:class",
      reason: "No class skill choices required.",
      dataStatus: "complete",
    }
  );
}

export function getSkillChoiceStates(
  draft: CharacterDraft,
  appliedRules: AppliedCharacterRules,
): SkillChoiceState[] {
  const states: SkillChoiceState[] = [];
  if (appliedRules.classResult.skillChoices.count > 0) {
    states.push(
      resolveSkillChoiceState(
        draft,
        "class",
        appliedRules.classResult.skillChoices.count,
        appliedRules.classResult.skillChoices.options,
        "Class skill proficiency choices",
      ),
    );
  }

  if (appliedRules.speciesResult.skillChoice && appliedRules.speciesResult.skillChoice.count > 0) {
    states.push(
      resolveSkillChoiceState(
        draft,
        "species",
        appliedRules.speciesResult.skillChoice.count,
        appliedRules.speciesResult.skillChoice.options,
        appliedRules.speciesResult.skillChoice.reason,
      ),
    );
  }

  for (const pending of appliedRules.proficiencies.pendingSkillChoices) {
    if (pending.source === "class" || pending.source === "species") {
      continue;
    }
    states.push(resolveSkillChoiceState(draft, pending.source, pending.count, pending.options, pending.reason));
  }
  return states;
}

export function resolveFeatEligibility(input: BuilderWizardResolverInput): FeatChoiceContext[] {
  const { draft, appliedRules, progression, feats, classDef, derivedStats } = input;
  const contexts: FeatChoiceContext[] = [];
  const selectedFeatIds = new Set(draft.featIds);

  if (appliedRules.backgroundResult.originFeatRequirement?.required) {
    const contextId = "feat-choice:origin";
    const explicitSelection = getFeatureChoiceValue(draft, contextId);
    const fallbackSelection =
      explicitSelection ??
      draft.featIds.find((featId) => {
        const feat = feats.find((entry) => entry.id === featId);
        return feat ? isOriginFeat(feat) : false;
      });
    const eligibleFeats = feats.filter((feat) => isOriginFeat(feat));
    const selectedFeat = fallbackSelection ? feats.find((entry) => entry.id === fallbackSelection) : undefined;
    const subchoices = buildFeatSubchoices(selectedFeat, draft);
    const subchoicePending = subchoices.some((entry) => entry.required && !entry.satisfied);
    const contextNotes = appliedRules.backgroundResult.originFeatRequirement.reason ? [appliedRules.backgroundResult.originFeatRequirement.reason] : [];
    for (const subchoice of subchoices) {
      contextNotes.push(...subchoice.notes);
    }
    contexts.push({
      id: contextId,
      kind: "origin-feat",
      title: "Origin Feat",
      description: "Select one legal Origin Feat for background compatibility.",
      requiredCount: 1,
      selectedFeatId: selectedFeat?.id,
      selectedFeatName: selectedFeat?.name,
      eligibleFeats,
      subchoices,
      notes: contextNotes,
      satisfied: Boolean(selectedFeat) && !subchoicePending,
      dataStatus: selectedFeat && !subchoicePending ? "complete" : "pending",
    });
    if (selectedFeat?.id) {
      selectedFeatIds.add(selectedFeat.id);
    }
  }

  for (const asiChoice of progression.asiOrFeatChoices) {
    if (asiChoice.selectedOption !== "feat") {
      continue;
    }
    const contextId = `feat-choice:asi:${asiChoice.id}`;
    const selectedFeatId = getFeatureChoiceValue(draft, contextId);
    const selectedFeat = selectedFeatId ? feats.find((entry) => entry.id === selectedFeatId) : undefined;
    const subchoices = buildFeatSubchoices(selectedFeat, draft);
    const subchoicePending = subchoices.some((entry) => entry.required && !entry.satisfied);
    const contextNotes: string[] = [];
    const rejectedUnknownPrereq: string[] = [];
    const eligibleFeats = feats.filter((feat) => {
      if (selectedFeatIds.has(feat.id) && feat.id !== selectedFeat?.id) {
        return false;
      }
      const evaluation = evaluateFeatPrerequisite(feat, draft, classDef, appliedRules, derivedStats);
      if (!evaluation.deterministic) {
        rejectedUnknownPrereq.push(feat.name);
      }
      return evaluation.satisfied && evaluation.deterministic;
    });

    if (rejectedUnknownPrereq.length > 0) {
      contextNotes.push("Some feats are hidden because prerequisites are not deterministic yet.");
    }
    if (asiChoice.notes.length > 0) {
      contextNotes.push(...asiChoice.notes);
    }
    for (const subchoice of subchoices) {
      contextNotes.push(...subchoice.notes);
    }

    contexts.push({
      id: contextId,
      kind: "asi-feat",
      title: `ASI/Feat Choice (Level ${asiChoice.level})`,
      description: "Choose one feat for this ASI/Feat opportunity.",
      requiredCount: 1,
      selectedFeatId: selectedFeat?.id,
      selectedFeatName: selectedFeat?.name,
      eligibleFeats,
      subchoices,
      notes: contextNotes,
      satisfied: Boolean(selectedFeat) && !subchoicePending,
      dataStatus: selectedFeat && !subchoicePending ? "complete" : "pending",
    });
    if (selectedFeat?.id) {
      selectedFeatIds.add(selectedFeat.id);
    }
  }

  return contexts;
}

function spellChoiceFeaturePrefix(contextId: string): string {
  return `spell-choice:${contextId}:`;
}

function getScopedSelectedSpellIds(draft: CharacterDraft, contextId: string): string[] {
  const prefix = spellChoiceFeaturePrefix(contextId);
  const selected = draft.featureChoices
    .filter((entry) => entry.featureId.startsWith(prefix))
    .map((entry) => entry.featureId.slice(prefix.length))
    .filter(Boolean);
  return Array.from(new Set(selected));
}

function hasAnyScopedSpellSelections(draft: CharacterDraft): boolean {
  return draft.featureChoices.some((entry) => entry.featureId.startsWith("spell-choice:"));
}

function buildBaseSpellChoiceContexts(input: BuilderWizardResolverInput): BaseSpellChoiceContext[] {
  const { draft, classDef, progression, feats } = input;
  const contexts: BaseSpellChoiceContext[] = [];
  const classKey = normalizeToken(classDef?.key ?? classDef?.name);
  let maxSlotLevel = maxSpellLevelFromSlots(progression);
  if (maxSlotLevel === 0 && progression.spellProgression.available) {
    const mode = progression.spellProgression.mode;
    if (mode === "prepared" || mode === "known" || mode === "mixed" || mode === "table-pending") {
      maxSlotLevel = 1;
    }
  }

  for (const pendingChoice of progression.pendingChoices) {
    if (pendingChoice.kind !== "spell-selection") {
      continue;
    }
    const requiredCount = parseRequiredCount(pendingChoice.description, 1);
    if (pendingChoice.id.includes("cantrip")) {
      contexts.push({
        id: pendingChoice.id,
        kind: "class-cantrip",
        title: "Class Cantrip Choices",
        description: pendingChoice.description,
        source: "class",
        classKeys: classKey ? [classKey] : [],
        requiredCount,
        maxSelections: requiredCount,
        minSpellLevel: 0,
        maxSpellLevel: 0,
        notes: [...pendingChoice.notes],
      });
      continue;
    }
    contexts.push({
      id: pendingChoice.id,
      kind: "class-leveled",
      title: "Class Spell Choices",
      description: pendingChoice.description,
      source: "class",
      classKeys: classKey ? [classKey] : [],
      requiredCount,
      maxSelections: requiredCount,
      minSpellLevel: 1,
      maxSpellLevel: Math.max(1, maxSlotLevel),
      notes: [...pendingChoice.notes],
    });
  }

  if (progression.spellProgression.available && classKey) {
    const hasExplicitLeveledPending = contexts.some((entry) => entry.source === "class" && entry.requiredCount > 0 && entry.minSpellLevel > 0);
    const mode = progression.spellProgression.mode;
    const preparedLike = mode === "prepared" || mode === "mixed" || mode === "table-pending";
    let requiredCount = 0;
    let maxSelections: number | undefined;
    const notes: string[] = [];
    if (!hasExplicitLeveledPending && preparedLike && maxSlotLevel > 0) {
      requiredCount = progression.spellProgression.preparedSpellsLimit ?? 1;
      if (requiredCount < 1) {
        requiredCount = 1;
      }
      maxSelections = progression.spellProgression.preparedSpellsLimit;
      if (progression.spellProgression.preparedSpellsLimit === undefined) {
        notes.push("Prepared spell limit is not deterministic yet; selecting at least one legal spell is required.");
      }
    }
    contexts.push({
      id: "spell-context:class-prepared-pool",
      kind: "class-prepared-pool",
      title: "Class Spell Pool",
      description: "Selectable spells from the current class list and spell level.",
      source: "class",
      classKeys: [classKey],
      requiredCount,
      maxSelections,
      minSpellLevel: 0,
      maxSpellLevel: Math.max(0, maxSlotLevel),
      notes,
    });
  }

  for (const featId of draft.featIds) {
    const feat = feats.find((entry) => entry.id === featId);
    if (!feat) {
      continue;
    }
    const canonical = normalizeToken(feat.compatibility?.canonicalKey ?? feat.key ?? feat.name);
    if (!canonical.startsWith("magic-initiate")) {
      continue;
    }
    const listResolution = parseMagicInitiateListKey(feat, draft);
    contexts.push({
      id: `spell-context:${feat.id}:cantrip`,
      kind: "feat-cantrip",
      title: `${feat.name} Cantrips`,
      description: "Select two cantrips from the chosen Magic Initiate spell list.",
      source: "feat",
      sourceId: feat.id,
      classKeys: listResolution.listKey ? [listResolution.listKey] : [],
      requiredCount: 2,
      maxSelections: 2,
      minSpellLevel: 0,
      maxSpellLevel: 0,
      notes: [...listResolution.notes],
    });
    contexts.push({
      id: `spell-context:${feat.id}:level1`,
      kind: "feat-leveled",
      title: `${feat.name} Level 1 Spell`,
      description: "Select one 1st-level spell from the chosen Magic Initiate spell list.",
      source: "feat",
      sourceId: feat.id,
      classKeys: listResolution.listKey ? [listResolution.listKey] : [],
      requiredCount: 1,
      maxSelections: 1,
      minSpellLevel: 1,
      maxSpellLevel: 1,
      notes: [...listResolution.notes],
    });
  }

  return contexts;
}

export function resolveSpellEligibility(input: BuilderWizardResolverInput): SpellChoiceContext[] {
  const { draft, spells } = input;
  const baseContexts = buildBaseSpellChoiceContexts(input);
  const hasScopedSelections = hasAnyScopedSpellSelections(draft);
  const useLegacyFallback = !hasScopedSelections && baseContexts.length === 1;

  return baseContexts.map((context) => {
    const notes = [...context.notes];
    let eligibleSpells = spells.filter((spell) => {
      if (context.classKeys.length > 0 && !context.classKeys.some((classKey) => spell.classes.includes(classKey))) {
        return false;
      }
      if (spell.level < context.minSpellLevel || spell.level > context.maxSpellLevel) {
        return false;
      }
      return true;
    });
    if (context.classKeys.length === 0) {
      eligibleSpells = [];
      notes.push("No deterministic spell list could be resolved for this choice.");
    }
    const eligibleIds = new Set(eligibleSpells.map((spell) => spell.id));
    const scopedSelectedSpellIds = getScopedSelectedSpellIds(draft, context.id).filter((idValue) => eligibleIds.has(idValue));
    const legacySelectedSpellIds = draft.spellSelection.selectedSpellIds.filter((idValue) => eligibleIds.has(idValue));
    const selectedSpellIds = useLegacyFallback ? legacySelectedSpellIds : scopedSelectedSpellIds;
    if (!useLegacyFallback && !hasScopedSelections && legacySelectedSpellIds.length > 0) {
      notes.push("Legacy global spell selections are ignored here; re-select spells per spell choice section.");
    }
    const selectedSpellNames = selectedSpellIds
      .map((idValue) => eligibleSpells.find((spell) => spell.id === idValue)?.name)
      .filter((entry): entry is string => Boolean(entry));
    const satisfied = context.requiredCount === 0 ? true : selectedSpellIds.length >= context.requiredCount;
    const dataStatus: DerivedDataStatus = context.requiredCount > 0 && !satisfied ? "pending" : notes.length > 0 ? "partial" : "complete";
    return {
      ...context,
      eligibleSpells,
      selectedSpellIds,
      selectedSpellNames,
      satisfied,
      dataStatus,
    };
  });
}

function cleanEquipmentText(value: string): string {
  return value
    .replace(/\(\*[a-z]\*\)/gi, "")
    .replace(/\([a-z]\)/gi, "")
    .replace(/^\*+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEquipmentItems(label: string): string[] {
  return label
    .split(/\s+\+\s+|,\s+/g)
    .map((entry) => cleanEquipmentText(entry))
    .filter(Boolean);
}

function parseGpAmount(value: string): number | undefined {
  const match = value.match(/([0-9]{1,4})\s*gp/i);
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : undefined;
}

function buildFallbackClassStartingEquipmentContext(
  classKey: string,
  draft: CharacterDraft,
  fallbackRule: ReturnType<typeof getClassStartingEquipmentRule>,
): StartingEquipmentChoiceContext {
  const contextId = `class-starting-equipment:fallback:${classKey}`;
  const options: StartingEquipmentChoiceContext["options"] = [];
  for (const [index, packageOption] of (fallbackRule?.packageOptions ?? []).entries()) {
    options.push({
      id: packageOption.id || `option-package-${index}`,
      label: packageOption.label,
      itemNames: packageOption.items.map((entry) => entry.name),
      itemEntries: packageOption.items.map((entry) => ({ name: entry.name, quantity: entry.quantity })),
      notes: packageOption.notes ?? [],
    });
  }
  if (fallbackRule?.gpAlternative) {
    const gpLabel =
      fallbackRule.gpAlternative.amount !== undefined
        ? `Take ${fallbackRule.gpAlternative.amount} gp instead of class/background starting equipment`
        : fallbackRule.gpAlternative.formula
          ? `Roll ${fallbackRule.gpAlternative.formula} instead of class/background starting equipment`
          : "Take starting gold instead of class/background starting equipment";
    const gpItemName = fallbackRule.gpAlternative.formula
      ? `Starting Gold (${fallbackRule.gpAlternative.formula}, roll manually)`
      : "Gold Pieces (GP)";
    options.push({
      id: "option-gp",
      label: gpLabel,
      itemNames: fallbackRule.gpAlternative.amount !== undefined ? [] : [gpItemName],
      gpAmount: fallbackRule.gpAlternative.amount,
      notes:
        fallbackRule.gpAlternative.amount !== undefined
          ? []
          : ["Starting gold uses a dice formula and must be rolled manually."],
    });
  }
  const selectedOptionId = getFeatureChoiceValue(draft, `equipment-choice:${contextId}`);
  return {
    id: contextId,
    title: "Class Starting Equipment",
    description: "Choose starting equipment package or gold alternative.",
    source: "class",
    options,
    selectedOptionId,
    satisfied: options.length <= 1 ? true : Boolean(selectedOptionId),
    notes: ["Fallback rule from MPMB class core data (edition-aware)."],
    dataStatus: options.some((entry) => entry.itemEntries && entry.itemEntries.length > 0) ? "complete" : "partial",
  };
}

function parseClassStartingEquipment(classDef: ClassDefinition | undefined, draft: CharacterDraft): StartingEquipmentChoiceContext[] {
  if (!classDef) {
    return [];
  }
  const classKey = normalizeToken(classDef.compatibility?.canonicalKey ?? classDef.canonicalClassKey ?? classDef.key ?? classDef.name);
  const edition = classDef.sourceMeta?.edition === "2014" || classDef.sourceMeta?.edition === "2024" ? classDef.sourceMeta.edition : "unknown";
  const equipmentFeature = classDef.features.find((feature) => {
    const text = `${feature.name}\n${feature.description ?? ""}`.toLowerCase();
    return feature.name.toLowerCase().includes("equipment") || text.includes("you start with the following equipment");
  });
  if (!equipmentFeature?.description) {
    const fallbackRule = getClassStartingEquipmentRule(classKey, edition);
    if (!fallbackRule) {
      return [];
    }
    return [buildFallbackClassStartingEquipmentContext(classKey, draft, fallbackRule)];
  }

  const bulletLines = equipmentFeature.description
    .split(/\r?\n/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("*"));
  if (bulletLines.length === 0) {
    const fallbackRule = getClassStartingEquipmentRule(classKey, edition);
    if (!fallbackRule) {
      return [];
    }
    return [buildFallbackClassStartingEquipmentContext(classKey, draft, fallbackRule)];
  }

  return bulletLines.map((line, groupIndex) => {
    const cleaned = cleanEquipmentText(line);
    const parts = cleaned.split(/\s+or\s+/i).map((entry) => cleanEquipmentText(entry)).filter(Boolean);
    const options = (parts.length > 0 ? parts : [cleaned]).map((part, optionIndex) => ({
      id: `option-${optionIndex}`,
      label: part,
      itemNames: parseEquipmentItems(part),
      gpAmount: parseGpAmount(part),
      notes: [],
    }));
    const id = `class-starting-equipment:${groupIndex}`;
    const selectedOptionId = getFeatureChoiceValue(draft, `equipment-choice:${id}`) ?? (options.length === 1 ? options[0]?.id : undefined);
    return {
      id,
      title: `Class Starting Equipment ${groupIndex + 1}`,
      description: "Select one of the class starting equipment options.",
      source: "class" as const,
      options,
      selectedOptionId,
      satisfied: options.length <= 1 ? true : Boolean(selectedOptionId),
      notes: ["Parsed from class equipment text."],
      dataStatus: options.length > 0 ? "complete" : "partial",
    };
  });
}

function parseBackgroundStartingEquipment(backgroundDef: BackgroundDefinition | undefined, draft: CharacterDraft): StartingEquipmentChoiceContext[] {
  if (!backgroundDef?.equipmentText) {
    return [];
  }
  const itemNames = backgroundDef.equipmentText
    .split(/\r?\n+/g)
    .map((entry) => cleanEquipmentText(entry))
    .filter(Boolean)
    .filter((entry) => !/^starting equipment/i.test(entry));
  if (itemNames.length === 0) {
    return [];
  }
  const contextId = "background-starting-equipment";
  const gpFromText = parseGpAmount(backgroundDef.equipmentText);
  const notes: string[] = ["Parsed from background equipment text."];
  if (!gpFromText && /coins?/i.test(backgroundDef.equipmentText)) {
    notes.push("Background mentions coins, but no deterministic GP amount was found.");
  }
  return [
    {
      id: contextId,
      title: "Background Starting Equipment",
      description: "Apply the background starting equipment package.",
      source: "background",
      options: [
        {
          id: "option-0",
          label: "Apply background package",
          itemNames,
          gpAmount: gpFromText,
          notes,
        },
      ],
      selectedOptionId: getFeatureChoiceValue(draft, `equipment-choice:${contextId}`) ?? "option-0",
      satisfied: true,
      notes,
      dataStatus: "complete",
    },
  ];
}

export function resolveStartingEquipmentChoices(input: BuilderWizardResolverInput): StartingEquipmentChoiceContext[] {
  const classContexts = parseClassStartingEquipment(input.classDef, input.draft);
  const backgroundContexts = parseBackgroundStartingEquipment(input.backgroundDef, input.draft);
  return [...classContexts, ...backgroundContexts];
}

function normalizeItemToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(a|an|the|with|of|or|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCatalogMatch(catalog: EquipmentDefinition[], itemName: string): EquipmentDefinition | undefined {
  const needle = normalizeItemToken(itemName);
  if (!needle) {
    return undefined;
  }
  return (
    catalog.find((entry) => normalizeItemToken(entry.name) === needle || normalizeItemToken(entry.key) === needle) ??
    catalog.find((entry) => normalizeItemToken(entry.name).includes(needle) || needle.includes(normalizeItemToken(entry.name)))
  );
}

export function applyStartingEquipmentChoiceToInventory(
  inventory: InventoryState,
  contextId: string,
  option: StartingEquipmentChoiceContext["options"][number],
  equipmentCatalog: EquipmentDefinition[],
): InventoryState {
  const retained = inventory.items.filter(
    (entry) => !entry.id.startsWith(`starting:${contextId}:`) && entry.id !== `currency:gp:${contextId}`,
  );
  const requestedItems =
    option.itemEntries && option.itemEntries.length > 0
      ? option.itemEntries
      : option.itemNames.map((itemName) => ({ name: itemName, quantity: 1 }));
  const collapsedRequested = new Map<string, number>();
  for (const entry of requestedItems) {
    const quantity = Number.isFinite(entry.quantity) && entry.quantity > 0 ? Math.round(entry.quantity) : 1;
    collapsedRequested.set(entry.name, (collapsedRequested.get(entry.name) ?? 0) + quantity);
  }
  const additions = Array.from(collapsedRequested.entries()).map(([itemName, quantity], index) => {
    const matched = findCatalogMatch(equipmentCatalog, itemName);
    if (matched) {
      return {
        id: `starting:${contextId}:catalog:${matched.id}`,
        name: matched.name,
        quantity,
      };
    }
    return {
      id: `starting:${contextId}:custom:${index}`,
      name: itemName,
      quantity,
    };
  });

  if (option.gpAmount && option.gpAmount > 0) {
    additions.push({
      id: `currency:gp:${contextId}`,
      name: "Gold Pieces (GP)",
      quantity: option.gpAmount,
    });
  }

  return {
    items: [...retained, ...additions],
  };
}

export function getEligibleFeatsForChoice(
  contexts: FeatChoiceContext[],
  contextId: string,
): FeatDefinition[] {
  return contexts.find((entry) => entry.id === contextId)?.eligibleFeats ?? [];
}

export function getEligibleSpellsForChoice(
  contexts: SpellChoiceContext[],
  contextId: string,
): SpellDefinition[] {
  return contexts.find((entry) => entry.id === contextId)?.eligibleSpells ?? [];
}

export function getRequiredBuilderChoices(
  appliedRules: AppliedCharacterRules,
  progression: LevelProgressionResult,
): Array<{
  id: string;
  kind: "origin-feat" | "ability-score-choice" | "skill-choice" | "subclass-selection" | "asi-or-feat" | "spell-selection" | "feature-choice";
  description: string;
  source: string;
  required: boolean;
}> {
  const merged: Array<{
    id: string;
    kind: "origin-feat" | "ability-score-choice" | "skill-choice" | "subclass-selection" | "asi-or-feat" | "spell-selection" | "feature-choice";
    description: string;
    source: string;
    required: boolean;
  }> = [];

  for (const choice of appliedRules.pendingChoices) {
    merged.push({
      id: `applied:${choice.id}`,
      kind: choice.kind,
      description: choice.description,
      source: choice.source,
      required: choice.status === "required" || choice.status === "pending",
    });
  }

  for (const choice of progression.pendingChoices) {
    merged.push({
      id: `progression:${choice.id}`,
      kind: choice.kind === "subclass-selection" || choice.kind === "asi-or-feat" || choice.kind === "spell-selection" ? choice.kind : "feature-choice",
      description: choice.description,
      source: choice.source,
      required: choice.required,
    });
  }

  return merged;
}

export function validateBuilderStep(
  stepId: WizardStepId,
  input: BuilderWizardResolverInput,
  featContexts: FeatChoiceContext[],
  spellContexts: SpellChoiceContext[],
  skillChoices: SkillChoiceState[],
  equipmentChoices: StartingEquipmentChoiceContext[],
): WizardStepValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { draft, classDef, subclassDef, appliedRules, progression } = input;

  if (stepId === "class") {
    if (!draft.name.trim()) {
      errors.push("Character name is required.");
    }
    if (!classDef) {
      errors.push("Class selection is required.");
    }
    if (progression.subclassRequirement?.required && !subclassDef) {
      errors.push(`Subclass selection is required from level ${progression.subclassRequirement.unlockLevel}.`);
    }
  }

  if (stepId === "species" && !draft.speciesSelection.speciesId) {
    errors.push("Species selection is required.");
  }

  if (stepId === "background") {
    if (!draft.backgroundSelection.backgroundId) {
      errors.push("Background selection is required.");
    }
  }

  if (stepId === "abilities") {
    const values = Object.values(draft.abilityScores);
    if (values.some((entry) => !Number.isFinite(entry))) {
      errors.push("All ability scores must be numeric.");
    }
    if (values.some((entry) => entry < 1 || entry > 30)) {
      errors.push("Ability scores must stay in range 1-30.");
    }
    if (appliedRules.abilityScoreAdjustments.pendingChoices.length > 0) {
      warnings.push("Some ability score choice rules are still pending manual resolution.");
    }
  }

  if (stepId === "feats") {
    for (const context of featContexts) {
      if (!context.satisfied) {
        errors.push(`${context.title}: select a legal feat.`);
      }
    }
  }

  if (stepId === "skills") {
    for (const choice of skillChoices) {
      if (choice.requiredCount > 0 && choice.missingCount > 0) {
        errors.push(`Select ${choice.missingCount} additional ${choice.source} skill option(s).`);
      }
    }
  }

  if (stepId === "spells") {
    for (const context of spellContexts) {
      if (context.requiredCount > 0 && !context.satisfied) {
        errors.push(`${context.title}: selection is incomplete.`);
      }
    }
  }

  if (stepId === "equipment") {
    for (const context of equipmentChoices) {
      if (context.options.length > 1 && !context.satisfied) {
        errors.push(`${context.title}: select one starting equipment option.`);
      }
    }
  }

  if (stepId === "review") {
    if (!classDef) {
      errors.push("Class is missing.");
    }
    if (!draft.speciesSelection.speciesId) {
      errors.push("Species is missing.");
    }
    if (!draft.backgroundSelection.backgroundId) {
      errors.push("Background is missing.");
    }
    if (progression.subclassRequirement?.required && !subclassDef) {
      errors.push("Subclass requirement is not satisfied.");
    }
    if (skillChoices.some((entry) => entry.requiredCount > 0 && entry.missingCount > 0)) {
      errors.push("Skill choices are incomplete.");
    }
    if (featContexts.some((entry) => !entry.satisfied)) {
      errors.push("Feat choices are incomplete.");
    }
    if (spellContexts.some((entry) => entry.requiredCount > 0 && !entry.satisfied)) {
      errors.push("Spell choices are incomplete.");
    }
    if (equipmentChoices.some((entry) => entry.options.length > 1 && !entry.satisfied)) {
      errors.push("Starting equipment choices are incomplete.");
    }
    if (appliedRules.abilityScoreAdjustments.pendingChoices.length > 0) {
      warnings.push("Some ability-score choice rules remain unresolved.");
    }
  }

  const completed = errors.length === 0 && warnings.length === 0;
  const blocked = errors.length > 0;
  const pending = !blocked && warnings.length > 0;
  return {
    stepId,
    completed,
    blocked,
    pending,
    errors,
    warnings,
  };
}

export function isCharacterCreationComplete(
  validations: WizardStepValidation[],
): WizardCompletionState {
  const blockingSteps: WizardStepId[] = [];
  const pendingSteps: WizardStepId[] = [];
  for (const validation of validations) {
    if (validation.blocked) {
      blockingSteps.push(validation.stepId);
    } else if (validation.pending) {
      pendingSteps.push(validation.stepId);
    }
  }
  const complete = blockingSteps.length === 0 && pendingSteps.length === 0;
  const notes: string[] = [];
  if (blockingSteps.length > 0) {
    notes.push(`Blocking steps: ${blockingSteps.join(", ")}`);
  }
  if (pendingSteps.length > 0) {
    notes.push(`Pending steps: ${pendingSteps.join(", ")}`);
  }
  return {
    complete,
    blockingSteps,
    pendingSteps,
    notes,
  };
}

export function resolveWizardEligibilitySnapshot(input: BuilderWizardResolverInput): WizardEligibilitySnapshot {
  const skillChoices = getSkillChoiceStates(input.draft, input.appliedRules);
  const featChoices = resolveFeatEligibility(input);
  const spellChoices = resolveSpellEligibility(input);
  const equipmentChoices = resolveStartingEquipmentChoices(input);
  return {
    draftRef: {
      id: input.draft.id,
      provider: input.draft.provider,
      rulesMode: input.draft.rulesMode,
    },
    classDef: input.classDef
      ? {
          id: input.classDef.id,
          key: input.classDef.key,
          name: input.classDef.name,
        }
      : undefined,
    skillChoices,
    featChoices,
    spellChoices,
    equipmentChoices,
  };
}
