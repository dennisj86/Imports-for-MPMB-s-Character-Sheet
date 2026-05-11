import { toSlug } from "../../lib/slug";
import type { AppliedCharacterRules } from "../../domain/appliedRules";
import type { CharacterDraft } from "../../domain/character";
import type {
  ClassDefinition,
  FeatureDefinition,
  RulesMode,
  SpellDefinition,
  SubclassDefinition,
} from "../../domain/content";
import type { DerivedCharacterStats, DerivedDataStatus } from "../../domain/derivedStats";
import type {
  AsiOrFeatChoice,
  LevelProgressionResult,
  PendingLevelChoice,
  ProgressionFeatureEntry,
  SpellProgressionState,
  SpellSlotProgression,
  SubclassSelectionRequirement,
} from "../../domain/progression";
import { getClassProgressionRule, getDefaultSubclassUnlockLevel } from "./mappings/classProgressionRules";
import {
  FULL_CASTER_SLOT_TABLE,
  HALF_CASTER_SLOT_TABLE,
  THIRD_CASTER_SLOT_TABLE,
  WARLOCK_PACT_SLOTS_BY_LEVEL,
} from "./mappings/spellProgressionTables";

type ProgressionResolverContext = {
  classDef?: ClassDefinition;
  subclassDef?: SubclassDefinition;
  availableSubclasses?: SubclassDefinition[];
  selectedSpells?: SpellDefinition[];
  targetLevel?: number;
};

type SpellcastingKnownLike = {
  cantrips?: number[];
  spells?: string | number[];
  prepared?: boolean | number[];
};

const ASI_OR_FEAT_OPTIONS = ["ability-score-improvement", "feat"] as const;

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

function classCanonicalKey(classDef: ClassDefinition | undefined): string {
  if (!classDef) {
    return "unknown-class";
  }
  return normalizeToken(classDef.compatibility?.canonicalKey ?? classDef.canonicalClassKey ?? classDef.key ?? classDef.name);
}

function combineStatuses(statuses: DerivedDataStatus[]): DerivedDataStatus {
  if (statuses.includes("manual")) {
    return "manual";
  }
  if (statuses.includes("partial")) {
    return "partial";
  }
  if (statuses.includes("pending")) {
    return "pending";
  }
  return "complete";
}

function asProgressionFeature(feature: FeatureDefinition, source: "class" | "subclass"): ProgressionFeatureEntry {
  return {
    id: feature.id,
    key: feature.key,
    name: feature.name,
    minLevel: feature.minLevel,
    description: feature.description,
    source,
  };
}

function getFeatureUnlocks(features: FeatureDefinition[], level: number, source: "class" | "subclass"): ProgressionFeatureEntry[] {
  return features
    .filter((feature) => feature.minLevel <= level)
    .map((feature) => asProgressionFeature(feature, source))
    .sort((left, right) => left.minLevel - right.minLevel || left.name.localeCompare(right.name));
}

function inferSubclassUnlockFromFeatures(features: FeatureDefinition[]): number | undefined {
  const hit = features.find((feature) => /\bsubclass\b|archetype|domain|oath|tradition|college|patron|circle|mystic arcanum/i.test(feature.name));
  return hit?.minLevel;
}

function resolveSubclassUnlockLevel(classDef: ClassDefinition | undefined, rulesMode: RulesMode): number {
  const canonical = classCanonicalKey(classDef);
  const progressionRule = getClassProgressionRule(canonical);
  const fromRule = progressionRule?.subclassUnlockByRulesMode[rulesMode];
  if (fromRule !== undefined) {
    return fromRule;
  }
  const fromFeatures = classDef ? inferSubclassUnlockFromFeatures(classDef.features) : undefined;
  return fromFeatures ?? getDefaultSubclassUnlockLevel(rulesMode);
}

function parseAsiLevelsFromFeatures(features: FeatureDefinition[]): number[] {
  const levels = new Set<number>();
  for (const feature of features) {
    const text = `${feature.name} ${feature.description ?? ""}`.toLowerCase();
    if (text.includes("ability score improvement") || /\basi\b/.test(text) || /feat/.test(feature.name.toLowerCase())) {
      levels.add(feature.minLevel);
    }
  }
  return Array.from(levels).sort((a, b) => a - b);
}

function findChoice(draft: CharacterDraft, id: string): string | undefined {
  return draft.featureChoices.find((entry) => entry.featureId === id)?.optionId;
}

function toSpellSlotsRecord(slotArray: number[]): SpellSlotProgression {
  const record: SpellSlotProgression = {};
  for (const [index, value] of slotArray.entries()) {
    if (value <= 0) {
      continue;
    }
    const slotLevel = index + 1;
    record[slotLevel as keyof SpellSlotProgression] = value;
  }
  return record;
}

function getTableRow(table: number[][], level: number): number[] {
  const safeLevel = Math.min(20, Math.max(1, level));
  return table[safeLevel - 1] ?? [];
}

function detectSpellcastingUnlockLevel(classDef: ClassDefinition | undefined, subclassDef: SubclassDefinition | undefined): number | undefined {
  const classHits = (classDef?.features ?? []).filter((feature) => /spellcasting|pact magic|cantrip|spells known|prepared spells/i.test(feature.name));
  const subclassHits = (subclassDef?.features ?? []).filter((feature) => /spellcasting|pact magic|cantrip|spells known|prepared spells/i.test(feature.name));
  const min = [...classHits, ...subclassHits].map((entry) => entry.minLevel).sort((a, b) => a - b)[0];
  return min;
}

function asAbilityKey(
  value: string | undefined,
): "str" | "dex" | "con" | "int" | "wis" | "cha" | undefined {
  switch ((value ?? "").toLowerCase()) {
    case "strength":
    case "str":
      return "str";
    case "dexterity":
    case "dex":
      return "dex";
    case "constitution":
    case "con":
      return "con";
    case "intelligence":
    case "int":
      return "int";
    case "wisdom":
    case "wis":
      return "wis";
    case "charisma":
    case "cha":
      return "cha";
    default:
      return undefined;
  }
}

function resolveSpellcastingAbility(classDef: ClassDefinition | undefined): "str" | "dex" | "con" | "int" | "wis" | "cha" | undefined {
  const canonical = classCanonicalKey(classDef);
  const byClass: Record<string, "str" | "dex" | "con" | "int" | "wis" | "cha"> = {
    artificer: "int",
    bard: "cha",
    cleric: "wis",
    druid: "wis",
    paladin: "cha",
    ranger: "wis",
    sorcerer: "cha",
    warlock: "cha",
    wizard: "int",
  };
  const mapped = byClass[canonical];
  if (mapped) {
    return mapped;
  }
  for (const feature of classDef?.features ?? []) {
    const match = `${feature.name}\n${feature.description ?? ""}`.match(
      /spellcasting ability (?:is|modifier is)\s+(strength|dexterity|constitution|intelligence|wisdom|charisma)/i,
    );
    if (match) {
      return asAbilityKey(match[1]);
    }
  }
  return undefined;
}

function detectSpellMode(classDef: ClassDefinition | undefined): SpellProgressionState["mode"] {
  const known =
    classDef?.spellcastingKnown && typeof classDef.spellcastingKnown === "object"
      ? (classDef.spellcastingKnown as SpellcastingKnownLike)
      : undefined;
  if (!known) {
    return classDef?.spellcastingFactor ? "table-pending" : "none";
  }
  const knownSpells = Array.isArray(known.spells);
  const prepared = known.prepared;
  if (typeof classDef?.spellcastingFactor === "string" && String(classDef.spellcastingFactor).toLowerCase().includes("warlock")) {
    return "pact";
  }
  if (knownSpells && (prepared === true || Array.isArray(prepared))) {
    return "mixed";
  }
  if (knownSpells) {
    return "known";
  }
  if (prepared === true || Array.isArray(prepared)) {
    return "prepared";
  }
  return "table-pending";
}

export function getUnlockedClassFeatures(classDef: ClassDefinition | undefined, level: number): ProgressionFeatureEntry[] {
  return getFeatureUnlocks(classDef?.features ?? [], level, "class");
}

export function getUnlockedSubclassFeatures(subclassDef: SubclassDefinition | undefined, level: number): ProgressionFeatureEntry[] {
  return getFeatureUnlocks(subclassDef?.features ?? [], level, "subclass");
}

export function buildAsiOrFeatChoiceId(classCanonical: string, level: number, index: number): string {
  return `progression:asi-or-feat:${classCanonical}:level-${level}:index-${index}`;
}

export function getAsiOrFeatChoices(
  draft: CharacterDraft,
  classDef: ClassDefinition | undefined,
  rulesMode: RulesMode,
  level: number,
): AsiOrFeatChoice[] {
  if (!classDef) {
    return [];
  }
  const canonical = classCanonicalKey(classDef);
  const mappedLevels = getClassProgressionRule(canonical)?.asiOrFeatLevelsByRulesMode[rulesMode] ?? [];
  const parsedLevels = parseAsiLevelsFromFeatures(classDef.features);
  const levels = Array.from(new Set([...mappedLevels, ...parsedLevels]))
    .filter((entry) => entry <= level)
    .sort((a, b) => a - b);

  return levels.map((asiLevel, index) => {
    const id = buildAsiOrFeatChoiceId(canonical, asiLevel, index);
    const selectedOption = findChoice(draft, id);
    const normalizedOption = selectedOption === "feat" ? "feat" : selectedOption === "ability-score-improvement" ? "ability-score-improvement" : undefined;
    const asiState = draft.levelUp?.abilityScoreIncreases?.[id];
    const selectedFeatId = findChoice(draft, `feat-choice:asi:${id}`);
    const notes: string[] = [];
    if (!mappedLevels.includes(asiLevel) && parsedLevels.includes(asiLevel)) {
      notes.push("ASI/Feat level inferred from class feature text.");
    }
    if (normalizedOption === "ability-score-improvement" && asiState?.status !== "complete") {
      notes.push("Ability Score Improvement allocation is not complete.");
    }
    if (normalizedOption === "feat" && !selectedFeatId) {
      notes.push("Feat option selected, but no exact feat is selected yet.");
    }
    return {
      id,
      level: asiLevel,
      source: "class",
      options: [...ASI_OR_FEAT_OPTIONS],
      selectedOption: normalizedOption,
      satisfied:
        normalizedOption === "ability-score-improvement"
          ? asiState?.status === "complete"
          : normalizedOption === "feat"
            ? Boolean(selectedFeatId)
            : false,
      notes,
    };
  });
}

export function getSubclassRequirement(
  draft: CharacterDraft,
  classDef: ClassDefinition | undefined,
  subclassDef: SubclassDefinition | undefined,
  availableSubclasses: SubclassDefinition[],
): SubclassSelectionRequirement | undefined {
  if (!classDef) {
    return undefined;
  }
  const unlockLevel = resolveSubclassUnlockLevel(classDef, draft.rulesMode);
  const required = draft.classSelection.level >= unlockLevel && availableSubclasses.length > 0;
  const satisfied = !required || Boolean(subclassDef);
  const notes: string[] = [];
  if (required && !subclassDef) {
    notes.push(`Subclass selection required at level ${unlockLevel}.`);
  }
  if (subclassDef?.compatibility?.conversionMode === "2024-converted") {
    notes.push("Selected subclass is a legacy subclass converted for 2024 progression.");
  }
  return {
    required,
    unlockLevel,
    selectedSubclassId: subclassDef?.id,
    selectedSubclassName: subclassDef?.name,
    satisfied,
    notes,
  };
}

export function getSpellProgression(
  draft: CharacterDraft,
  appliedRules: AppliedCharacterRules,
  classDef: ClassDefinition | undefined,
  subclassDef: SubclassDefinition | undefined,
  selectedSpells: SpellDefinition[],
): SpellProgressionState {
  const notes: string[] = [];
  const pendingChoices: PendingLevelChoice[] = [];
  const unlockLevel = detectSpellcastingUnlockLevel(classDef, subclassDef) ?? (appliedRules.spellcasting.available ? 1 : undefined);
  const available = Boolean(appliedRules.spellcasting.available && unlockLevel !== undefined && draft.classSelection.level >= unlockLevel);

  if (!available) {
    return {
      available: false,
      mode: "none",
      spellSlots: {},
      pendingChoices,
      notes: unlockLevel ? [`Spellcasting unlocks at level ${unlockLevel}.`] : ["No declarative spellcasting progression detected."],
      dataStatus: "complete",
    };
  }

  const mode = detectSpellMode(classDef);
  const spellcastingAbility = resolveSpellcastingAbility(classDef);
  const spellcastingKnown =
    classDef?.spellcastingKnown && typeof classDef.spellcastingKnown === "object"
      ? (classDef.spellcastingKnown as SpellcastingKnownLike)
      : undefined;
  const levelIndex = Math.max(1, Math.min(20, draft.classSelection.level)) - 1;
  const spellSlots: SpellSlotProgression = {};
  let dataStatus: DerivedDataStatus = "complete";

  if (spellcastingKnown && Array.isArray(spellcastingKnown.cantrips)) {
    const cantripsKnown = spellcastingKnown.cantrips[levelIndex];
    if (typeof cantripsKnown === "number" && cantripsKnown > 0) {
      const selectedCantrips = selectedSpells.filter((entry) => entry.level === 0).length;
      if (selectedCantrips < cantripsKnown) {
        pendingChoices.push({
          id: "progression:spell-selection:cantrip",
          kind: "spell-selection",
          level: draft.classSelection.level,
          description: `Select ${cantripsKnown - selectedCantrips} additional cantrip(s).`,
          required: true,
          satisfied: false,
          source: "spellcasting",
          notes: [],
        });
      }
    }
  }

  const knownSpellsArray = spellcastingKnown && Array.isArray(spellcastingKnown.spells) ? spellcastingKnown.spells : undefined;
  const preparedSpellsArray = spellcastingKnown && Array.isArray(spellcastingKnown.prepared) ? spellcastingKnown.prepared : undefined;

  const spellsKnownLimit = knownSpellsArray?.[levelIndex];
  const preparedSpellsLimit = preparedSpellsArray?.[levelIndex];

  if (typeof spellsKnownLimit === "number" && spellsKnownLimit > 0) {
    const selectedLeveledSpells = selectedSpells.filter((entry) => entry.level > 0).length;
    if (selectedLeveledSpells < spellsKnownLimit) {
      pendingChoices.push({
        id: "progression:spell-selection:known",
        kind: "spell-selection",
        level: draft.classSelection.level,
        description: `Select ${spellsKnownLimit - selectedLeveledSpells} additional known spell(s).`,
        required: true,
        satisfied: false,
        source: "spellcasting",
        notes: [],
      });
    }
  }

  const spellcastingFactor = classDef?.spellcastingFactor;
  if (typeof spellcastingFactor === "number") {
    if (spellcastingFactor === 1) {
      Object.assign(spellSlots, toSpellSlotsRecord(getTableRow(FULL_CASTER_SLOT_TABLE, draft.classSelection.level)));
    } else if (spellcastingFactor === 2) {
      if (unlockLevel === 1) {
        const adjustedLevel = Math.min(20, draft.classSelection.level + 1);
        Object.assign(spellSlots, toSpellSlotsRecord(getTableRow(HALF_CASTER_SLOT_TABLE, adjustedLevel)));
        dataStatus = combineStatuses([dataStatus, "partial"]);
        notes.push("Applied adjusted half-caster slot baseline for level-1 spellcasting unlock.");
      } else {
        Object.assign(spellSlots, toSpellSlotsRecord(getTableRow(HALF_CASTER_SLOT_TABLE, draft.classSelection.level)));
      }
    } else if (spellcastingFactor === 3) {
      Object.assign(spellSlots, toSpellSlotsRecord(getTableRow(THIRD_CASTER_SLOT_TABLE, draft.classSelection.level)));
    } else {
      dataStatus = "partial";
      notes.push(`Unsupported spellcasting factor '${spellcastingFactor}'.`);
    }
  } else if (typeof spellcastingFactor === "string" && spellcastingFactor.toLowerCase().includes("warlock")) {
    const pactRow = WARLOCK_PACT_SLOTS_BY_LEVEL[levelIndex];
    if (pactRow) {
      spellSlots[pactRow.slotLevel as keyof SpellSlotProgression] = pactRow.slots;
    } else {
      dataStatus = "partial";
      notes.push("Warlock pact slot progression could not be resolved.");
    }
  } else {
    dataStatus = "partial";
    notes.push("Spell slot progression is pending: no supported declarative factor.");
  }

  if (spellcastingKnown?.prepared === true && !preparedSpellsArray) {
    dataStatus = combineStatuses([dataStatus, "pending"]);
    notes.push("Prepared spell count formula is pending explicit ability-based calculation.");
  }

  if (spellcastingAbility === undefined) {
    dataStatus = combineStatuses([dataStatus, "partial"]);
    notes.push("Spellcasting ability is not yet deterministic for this class.");
  }

  if (Object.keys(spellSlots).length === 0) {
    dataStatus = combineStatuses([dataStatus, "pending"]);
  }

  return {
    available: true,
    mode,
    spellcastingAbility,
    spellSlots,
    cantripsKnown: spellcastingKnown && Array.isArray(spellcastingKnown.cantrips) ? spellcastingKnown.cantrips[levelIndex] : undefined,
    spellsKnownLimit: typeof spellsKnownLimit === "number" ? spellsKnownLimit : undefined,
    preparedSpellsLimit: typeof preparedSpellsLimit === "number" ? preparedSpellsLimit : undefined,
    pendingChoices,
    notes,
    dataStatus,
  };
}

export function getPendingLevelChoices(
  appliedRules: AppliedCharacterRules,
  subclassRequirement: SubclassSelectionRequirement | undefined,
  asiOrFeatChoices: AsiOrFeatChoice[],
  spellProgression: SpellProgressionState,
): PendingLevelChoice[] {
  const pending: PendingLevelChoice[] = [];

  if (subclassRequirement?.required && !subclassRequirement.satisfied) {
    pending.push({
      id: "progression:subclass-selection",
      kind: "subclass-selection",
      level: subclassRequirement.unlockLevel,
      description: `Select a subclass (required from level ${subclassRequirement.unlockLevel}).`,
      required: true,
      satisfied: false,
      source: "class",
      notes: [...subclassRequirement.notes],
    });
  }

  for (const choice of asiOrFeatChoices) {
    if (choice.satisfied) {
      continue;
    }
    pending.push({
      id: choice.id,
      kind: "asi-or-feat",
      level: choice.level,
      description: `Choose Ability Score Improvement or Feat for level ${choice.level}.`,
      required: true,
      satisfied: false,
      options: [...choice.options],
      selectedOptionId: choice.selectedOption,
      source: "class",
      notes: [...choice.notes],
    });
  }

  for (const choice of spellProgression.pendingChoices) {
    pending.push(choice);
  }

  for (const choice of appliedRules.pendingChoices) {
    pending.push({
      id: `applied:${choice.id}`,
      kind:
        choice.kind === "origin-feat" ? "feature-choice" : choice.kind === "skill-choice" ? "feature-choice" : "feature-choice",
      level: appliedRules.level,
      description: choice.description,
      required: choice.status === "required",
      satisfied: choice.status === "satisfied",
      source: choice.source === "background" ? "background" : "class",
      notes: [],
    });
  }

  return pending;
}

export function resolveLevelProgression(
  draft: CharacterDraft,
  appliedRules: AppliedCharacterRules,
  derivedStats: DerivedCharacterStats,
  context: ProgressionResolverContext = {},
): LevelProgressionResult {
  const classDef = context.classDef;
  const subclassDef = context.subclassDef;
  const currentLevel = draft.classSelection.level;
  const targetLevel = Math.max(currentLevel, context.targetLevel ?? currentLevel);
  const availableSubclasses = context.availableSubclasses ?? [];
  const selectedSpells = context.selectedSpells ?? [];

  const unlockedClassFeatures = getUnlockedClassFeatures(classDef, targetLevel);
  const unlockedSubclassFeatures = getUnlockedSubclassFeatures(subclassDef, targetLevel);
  const unlockedFeatures = [...unlockedClassFeatures, ...unlockedSubclassFeatures].sort(
    (left, right) => left.minLevel - right.minLevel || left.name.localeCompare(right.name),
  );
  const subclassRequirement = getSubclassRequirement(draft, classDef, subclassDef, availableSubclasses);
  const asiOrFeatChoices = getAsiOrFeatChoices(draft, classDef, draft.rulesMode, targetLevel);
  const spellProgression = getSpellProgression(draft, appliedRules, classDef, subclassDef, selectedSpells);
  const pendingChoices = getPendingLevelChoices(appliedRules, subclassRequirement, asiOrFeatChoices, spellProgression);

  const notes: string[] = [];
  if (!classDef) {
    notes.push("No class selected. Progression is pending.");
  }
  notes.push(...spellProgression.notes);
  if (subclassRequirement?.notes.length) {
    notes.push(...subclassRequirement.notes);
  }
  for (const choice of asiOrFeatChoices) {
    if (choice.notes.length) {
      notes.push(...choice.notes);
    }
  }

  const dataStatus = combineStatuses([
    classDef ? "complete" : "pending",
    spellProgression.dataStatus,
    derivedStats.dataStatus === "manual" ? "manual" : derivedStats.dataStatus === "partial" ? "partial" : "complete",
    pendingChoices.length > 0 ? "pending" : "complete",
  ]);

  return {
    provider: draft.provider,
    rulesMode: draft.rulesMode,
    classId: classDef?.id,
    className: classDef?.name,
    subclassId: subclassDef?.id,
    subclassName: subclassDef?.name,
    currentLevel,
    targetLevel,
    unlockedClassFeatures,
    unlockedSubclassFeatures,
    unlockedFeatures,
    subclassRequirement,
    asiOrFeatChoices,
    spellProgression,
    pendingChoices,
    notes,
    dataStatus,
  };
}
