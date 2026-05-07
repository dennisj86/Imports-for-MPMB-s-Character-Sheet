import { toSlug } from "../../lib/slug";
import type {
  AbilityKey,
  AbilityScoreChoiceState,
  AbilityScoreChoiceRequirement,
  AppliedAbilityScoreAdjustments,
  AppliedBackgroundResult,
  AppliedCharacterRules,
  AppliedChoiceRequirement,
  AppliedClassResult,
  AppliedDataStatus,
  AppliedEntityRef,
  AppliedFeatResult,
  AppliedProficienciesResult,
  AppliedSpeciesResult,
  AppliedSpellcastingResult,
  OriginAbilityMode,
} from "../../domain/appliedRules";
import type { CharacterDraft } from "../../domain/character";
import type {
  BackgroundDefinition,
  ClassDefinition,
  FeatDefinition,
  FeatureDefinition,
  SpeciesDefinition,
  SpellDefinition,
  SubclassDefinition,
} from "../../domain/content";
import { BACKGROUND_CONVERSION_RULES } from "./mappings/backgroundRules";
import { CLASS_BASE_RULES } from "./mappings/classBaseRules";
import { FEAT_NAME_ALIASES } from "./mappings/featNameAliases";
import { SPECIES_ABILITY_RULES } from "./mappings/speciesRules";

type AppliedResolverInput = {
  draft: CharacterDraft;
  classDef?: ClassDefinition;
  subclassDef?: SubclassDefinition;
  speciesDef?: SpeciesDefinition;
  backgroundDef?: BackgroundDefinition;
  featCatalog: FeatDefinition[];
  selectedSpells: SpellDefinition[];
  levelFeatures: FeatureDefinition[];
};

const ABILITY_ALIASES: Record<string, AbilityKey> = {
  strength: "str",
  str: "str",
  dexterity: "dex",
  dex: "dex",
  constitution: "con",
  con: "con",
  intelligence: "int",
  int: "int",
  wisdom: "wis",
  wis: "wis",
  charisma: "cha",
  cha: "cha",
};

const CORE_ORIGIN_FEAT_TOKENS = new Set([
  "alert",
  "crafter",
  "healer",
  "lucky",
  "musician",
  "savage-attacker",
  "skilled",
  "tavern-brawler",
  "tough",
]);

function normalizeToken(value: string | undefined): string {
  return toSlug(value ?? "")
    .replace(/srd-2024-/, "")
    .replace(/srd-2014-/, "")
    .replace(/srd-/, "")
    .replace(/open5e-2024-/, "")
    .replace(/open5e-2014-/, "")
    .replace(/open5e-/, "")
    .replace(/-legacy$/, "");
}

function canonicalEntityKey(entry: { compatibility?: { canonicalKey?: string }; key?: string; name?: string }): string {
  return normalizeToken(entry.compatibility?.canonicalKey ?? entry.key ?? entry.name);
}

function extractLines(value: string | undefined): string[] {
  return String(value ?? "")
    .split(/\r?\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractList(value: string | undefined): string[] {
  return String(value ?? "")
    .replace(/\r?\n+/g, ", ")
    .split(/,|;|\band\b/gi)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseLanguages(value: string | undefined): string[] {
  const text = String(value ?? "");
  const match = text.match(/languages?\s*[:\-]\s*([^\n]+)/i);
  if (!match) {
    return [];
  }
  return extractList(match[1]).map((entry) => entry.replace(/^[+*-]\s*/, ""));
}

function parseAbilityList(value: string | undefined): AbilityKey[] {
  if (!value) {
    return [];
  }
  const tokens = value.toLowerCase().split(/[^a-z]+/g).filter(Boolean);
  const abilities = new Set<AbilityKey>();
  for (const token of tokens) {
    const mapped = ABILITY_ALIASES[token];
    if (mapped) {
      abilities.add(mapped);
    }
  }
  return Array.from(abilities);
}

function getFeatureChoiceValue(draft: CharacterDraft, featureId: string): string | undefined {
  return draft.featureChoices.find((entry) => entry.featureId === featureId)?.optionId;
}

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

function normalizeSkillToken(value: string): string {
  return normalizeToken(value).replace(/-skill$/, "");
}

function resolveClassSkillOptions(options: string[]): string[] {
  const hasAnySkill = options.some((entry) => normalizeSkillToken(entry) === "any-skill");
  const resolved = hasAnySkill ? [...ALL_SKILLS] : [...options];
  return Array.from(new Set(resolved));
}

function getClassSkillChoiceIds(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => `skill-choice:class:${index}`);
}

function getSelectedClassSkills(
  draft: CharacterDraft,
  classResult: AppliedClassResult,
): {
  selectedSkills: string[];
  missingCount: number;
} {
  const resolvedOptions = resolveClassSkillOptions(classResult.skillChoices.options);
  const allowedTokens = new Set(resolvedOptions.map((entry) => normalizeSkillToken(entry)));
  const selectedSkills: string[] = [];
  for (const choiceId of getClassSkillChoiceIds(classResult.skillChoices.count)) {
    const selected = draft.featureChoices.find((entry) => entry.featureId === choiceId)?.optionId;
    if (!selected) {
      continue;
    }
    if (!allowedTokens.has(normalizeSkillToken(selected))) {
      continue;
    }
    selectedSkills.push(selected);
  }
  const uniqueSelected = Array.from(new Set(selectedSkills));
  const missingCount = Math.max(0, classResult.skillChoices.count - uniqueSelected.length);
  return {
    selectedSkills: uniqueSelected,
    missingCount,
  };
}

function proficiencyBonusForLevel(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

function toEntityRef(entry: { id: string; key: string; name: string; compatibility?: { contentVersion?: AppliedEntityRef["contentVersion"]; conversionMode?: AppliedEntityRef["conversionMode"]; notes?: string[] } } | undefined): AppliedEntityRef | undefined {
  if (!entry) {
    return undefined;
  }
  return {
    id: entry.id,
    key: entry.key,
    name: entry.name,
    contentVersion: entry.compatibility?.contentVersion,
    conversionMode: entry.compatibility?.conversionMode,
    notes: entry.compatibility?.notes ?? [],
  };
}

function emptyAbilityAdjustments(): AppliedAbilityScoreAdjustments {
  return {
    fixed: {},
    pendingChoices: [],
    ignored: [],
    choiceStates: [],
    notes: [],
  };
}

function mergeAbilityAdjustments(base: AppliedAbilityScoreAdjustments, patch: AppliedAbilityScoreAdjustments): AppliedAbilityScoreAdjustments {
  const fixed = { ...base.fixed };
  for (const [ability, value] of Object.entries(patch.fixed) as Array<[AbilityKey, number]>) {
    fixed[ability] = (fixed[ability] ?? 0) + value;
  }
  return {
    fixed,
    pendingChoices: [...base.pendingChoices, ...patch.pendingChoices],
    ignored: [...base.ignored, ...patch.ignored],
    choiceStates: [...base.choiceStates, ...patch.choiceStates],
    originModeChoiceId: patch.originModeChoiceId ?? base.originModeChoiceId,
    originMode: patch.originMode ?? base.originMode,
    availableOriginModes: patch.availableOriginModes ?? base.availableOriginModes,
    notes: [...base.notes, ...patch.notes],
  };
}

function buildAbilityChoiceId(source: AbilityScoreChoiceRequirement["source"], requirementIndex: number, slotIndex: number): string {
  return `ability-choice:${source}:${requirementIndex}:${slotIndex}`;
}

function parseSpeciesSkillChoiceFromTraits(traits: string | undefined): { count: number; options: string[]; reason: string } | undefined {
  const text = String(traits ?? "").toLowerCase();
  const choiceMatch = text.match(/proficien(?:cy|t)\s+in\s+(one|two|three|[0-9]+)\s+skills?\s+of\s+your\s+choice/);
  if (!choiceMatch) {
    return undefined;
  }
  const raw = choiceMatch[1];
  const count = raw === "one" ? 1 : raw === "two" ? 2 : raw === "three" ? 3 : Number(raw);
  if (!Number.isFinite(count) || count <= 0) {
    return undefined;
  }
  return {
    count,
    options: [...ALL_SKILLS],
    reason: "Species flexible skill choices (parsed fallback)",
  };
}

function findFeatByNameDeterministic(name: string, feats: FeatDefinition[]) {
  const token = normalizeToken(name);
  const aliasToken = Object.entries(FEAT_NAME_ALIASES).find(([, aliases]) => aliases.some((alias) => normalizeToken(alias) === token))?.[0] ?? token;

  const exact = feats.find((entry) => normalizeToken(entry.name) === aliasToken || normalizeToken(entry.key) === aliasToken);
  if (exact) {
    return {
      feat: exact,
      resolution: "mapping" as const,
    };
  }

  const prefix = feats.find((entry) => normalizeToken(entry.name).startsWith(aliasToken) || normalizeToken(entry.key).startsWith(aliasToken));
  if (prefix) {
    return {
      feat: prefix,
      resolution: "fallback" as const,
    };
  }

  return {
    resolution: "unresolved" as const,
  };
}

function parseSpeciesAbilityRuleFromTraits(traits: string | undefined): {
  fixed: Partial<Record<AbilityKey, number>>;
  choices: AbilityScoreChoiceRequirement[];
  confidence: "low";
} | undefined {
  if (!traits) {
    return undefined;
  }
  const text = traits.toLowerCase();
  const fixed: Partial<Record<AbilityKey, number>> = {};
  const choiceRequirements: AbilityScoreChoiceRequirement[] = [];

  const fixedRegex = /\+([0-9])\s*(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)/g;
  let fixedMatch: RegExpExecArray | null = fixedRegex.exec(text);
  while (fixedMatch) {
    const amount = Number(fixedMatch[1]);
    const ability = ABILITY_ALIASES[fixedMatch[2]];
    if (ability && Number.isFinite(amount)) {
      fixed[ability] = Math.max(fixed[ability] ?? 0, amount);
    }
    fixedMatch = fixedRegex.exec(text);
  }

  const choiceRegex = /\+1\s+to\s+(one|two)\s+other ability scores?/i;
  const choiceMatch = text.match(choiceRegex);
  if (choiceMatch) {
    choiceRequirements.push({
      source: "species",
      amount: 1,
      count: choiceMatch[1] === "two" ? 2 : 1,
      allowedAbilities: ["str", "dex", "con", "int", "wis", "cha"],
      reason: "Species flexible ability increase (parsed fallback)",
    });
  }

  if (Object.keys(fixed).length === 0 && choiceRequirements.length === 0) {
    return undefined;
  }
  return {
    fixed,
    choices: choiceRequirements,
    confidence: "low",
  };
}

export function applySpeciesRules(
  species: SpeciesDefinition | undefined,
  rulesMode: CharacterDraft["rulesMode"],
  options: {
    useLegacyAbilityIn2024?: boolean;
  } = {},
): AppliedSpeciesResult {
  if (!species) {
    return {
      entity: undefined,
      traits: [],
      abilityAdjustments: emptyAbilityAdjustments(),
      skillProficiencies: [],
      dataStatus: "pending",
    };
  }

  const entity = toEntityRef(species);
  const conversionMode = entity?.conversionMode ?? "native";
  const isConvertedIn2024 = rulesMode === "2024" && conversionMode === "2024-converted";
  const shouldIgnoreLegacyAbility = isConvertedIn2024 && !options.useLegacyAbilityIn2024;
  const canonicalKey = canonicalEntityKey(species);

  const explicitRule =
    SPECIES_ABILITY_RULES[canonicalKey] ??
    (canonicalKey.startsWith("half-elf") ? SPECIES_ABILITY_RULES["half-elf"] : undefined);
  const parsedRule = explicitRule ? undefined : parseSpeciesAbilityRuleFromTraits(species.traits);
  const parsedSkillChoice = explicitRule ? undefined : parseSpeciesSkillChoiceFromTraits(species.traits);
  const adjustments = emptyAbilityAdjustments();
  const notes = [...(entity?.notes ?? [])];

  const applyRule = explicitRule ?? (parsedRule ? { fixed: parsedRule.fixed, choices: parsedRule.choices } : undefined);
  const skillChoice = explicitRule?.skillChoices ?? parsedSkillChoice;
  const skillProficiencies = explicitRule?.grantedSkills ?? [];

  if (shouldIgnoreLegacyAbility) {
    if (applyRule) {
      adjustments.ignored.push({
        source: "species",
        reason: "Legacy species ASI ignored in 2024 rules mode",
        details: `Species: ${species.name}`,
      });
    }
  } else if (applyRule) {
    for (const [ability, value] of Object.entries(applyRule.fixed ?? {}) as Array<[AbilityKey, number]>) {
      adjustments.fixed[ability] = (adjustments.fixed[ability] ?? 0) + value;
    }
    for (const choice of applyRule.choices ?? []) {
      adjustments.pendingChoices.push({
        source: "species",
        amount: choice.amount,
        count: choice.count,
        allowedAbilities: [...choice.allowedAbilities],
        reason: choice.reason,
      });
    }
  }
  if (isConvertedIn2024 && options.useLegacyAbilityIn2024 && applyRule) {
    notes.push("Legacy species ASI is manually enabled in 2024 mode.");
    adjustments.notes.push("Using species ability adjustments in 2024 mode (manual override).");
  }

  if (!explicitRule && parsedRule) {
    notes.push("Species ability adjustments resolved via fallback parser.");
  }
  if (!explicitRule && parsedSkillChoice) {
    notes.push("Species skill choices resolved via fallback parser.");
  }

  return {
    entity: {
      ...entity,
      notes,
    },
    traits: extractLines(species.traits),
    abilityAdjustments: adjustments,
    skillProficiencies,
    skillChoice,
    dataStatus: !explicitRule && !parsedRule && !isConvertedIn2024 ? "partial" : "complete",
  };
}

export function applyBackgroundRules(
  background: BackgroundDefinition | undefined,
  rulesMode: CharacterDraft["rulesMode"],
  featCatalog: FeatDefinition[],
  selectedFeatIds: string[],
  selectedOriginFeatId?: string,
): AppliedBackgroundResult {
  if (!background) {
    return {
      entity: undefined,
      abilityScoreRule: rulesMode === "2024" ? "background-2024" : "native",
      skillProficiencies: [],
      toolProficiencies: [],
      languagesGranted: [],
      grantedFeatIds: [],
      grantedFeatNames: [],
      unresolvedGrantedFeatNames: [],
      notes: [],
      dataStatus: "pending",
    };
  }

  const entity = toEntityRef(background);
  const canonicalKey = canonicalEntityKey(background);
  const mapping = BACKGROUND_CONVERSION_RULES[canonicalKey];
  const conversionMode = entity?.conversionMode ?? "native";
  const isConvertedIn2024 = rulesMode === "2024" && conversionMode === "2024-converted";
  const notes = [...(entity?.notes ?? [])];

  const hasPlaceholder = /select origin feat/i.test(background.bonusFeat ?? "");
  const nativeBonusFeatName = background.bonusFeat && !hasPlaceholder ? background.bonusFeat : undefined;
  const mappedFeatName = rulesMode === "2024" ? mapping?.defaultFeatNameIn2024 : undefined;
  const candidateFeatNames = [nativeBonusFeatName, mappedFeatName].filter(Boolean) as string[];
  const uniqueFeatNames = Array.from(new Set(candidateFeatNames));

  const grantedFeatIds: string[] = [];
  const grantedFeatNames: string[] = [];
  const unresolvedGrantedFeatNames: string[] = [];
  for (const featName of uniqueFeatNames) {
    const resolved = findFeatByNameDeterministic(featName, featCatalog);
    if (resolved.feat) {
      grantedFeatIds.push(resolved.feat.id);
      grantedFeatNames.push(resolved.feat.name);
      if (resolved.resolution === "fallback") {
        notes.push(`Background feat '${featName}' resolved via fallback name matching.`);
      }
      continue;
    }
    unresolvedGrantedFeatNames.push(featName);
    notes.push(`Background feat '${featName}' could not be resolved to a feat id.`);
  }

  const requiresOriginFeat = rulesMode === "2024" && (mapping?.requiresOriginFeatIn2024 === true || (isConvertedIn2024 && uniqueFeatNames.length === 0));
  const selectedOriginFeatFromContext =
    selectedOriginFeatId &&
    featCatalog.some((entry) => entry.id === selectedOriginFeatId) &&
    selectedFeatIds.includes(selectedOriginFeatId);
  const selectedOriginFeat = selectedFeatIds.some((idValue) => {
    const feat = featCatalog.find((entry) => entry.id === idValue);
    if (!feat) {
      return false;
    }
    const token = normalizeToken(feat.compatibility?.canonicalKey ?? feat.key ?? feat.name);
    return CORE_ORIGIN_FEAT_TOKENS.has(token) || token.startsWith("magic-initiate");
  });
  const originFeatRequirement =
    requiresOriginFeat
      ? {
          kind: "origin-feat" as const,
          required: true,
          satisfied: Boolean(selectedOriginFeatFromContext) || selectedOriginFeat || grantedFeatIds.length > 0,
          reason: "Legacy background in 2024 mode without deterministic native feat grant.",
        }
      : undefined;

  return {
    entity: {
      ...entity,
      notes,
    },
    abilityScoreRule: rulesMode === "2024" ? "background-2024" : "native",
    skillProficiencies: extractList(background.skillText),
    toolProficiencies: extractList(background.toolText),
    languagesGranted: parseLanguages(`${background.traitText ?? ""}\n${background.toolText ?? ""}`),
    grantedFeatIds,
    grantedFeatNames,
    unresolvedGrantedFeatNames,
    originFeatRequirement,
    notes,
    dataStatus: unresolvedGrantedFeatNames.length > 0 ? "partial" : "complete",
  };
}

function parseClassProficienciesFromFeatures(features: FeatureDefinition[]) {
  const descriptions = features.map((entry) => entry.description ?? "").filter(Boolean);
  const combined = descriptions.join("\n");
  const savingThrowMatch =
    combined.match(/\*\*Saving Throws?:\*\*\s*([^\n]+)/i) ||
    combined.match(/Saving Throw Proficiencies\|([^|]+)\|/i);
  const skillMatch =
    combined.match(/\*\*Skills?:\*\*\s*Choose\s*([0-9]+)\s*from\s*([^\n]+)/i) ||
    combined.match(/Skill Proficiencies\|Choose\s*([0-9]+):\s*([^|]+)\|/i);
  const armorMatch = combined.match(/\*\*Armor:\*\*\s*([^\n]+)/i);
  const weaponMatch = combined.match(/\*\*Weapons:\*\*\s*([^\n]+)/i);
  const toolMatch = combined.match(/\*\*Tools:\*\*\s*([^\n]+)/i);

  return {
    savingThrows: parseAbilityList(savingThrowMatch?.[1]),
    armor: extractList(armorMatch?.[1]),
    weapons: extractList(weaponMatch?.[1]),
    tools: extractList(toolMatch?.[1]).filter((entry) => !/^none$/i.test(entry)),
    skillChoices: {
      count: Number(skillMatch?.[1] ?? 0),
      options: extractList(skillMatch?.[2]),
    },
  };
}

export function applyClassRules(
  classDef: ClassDefinition | undefined,
  subclassDef: SubclassDefinition | undefined,
  level: number,
): AppliedClassResult {
  const classEntity = toEntityRef(classDef);
  const subclassEntity = toEntityRef(subclassDef);
  const classCanonical = classDef ? canonicalEntityKey(classDef) : "";
  const explicitRule = classCanonical ? CLASS_BASE_RULES[classCanonical] : undefined;
  const parsedRule = classDef ? parseClassProficienciesFromFeatures(classDef.features) : undefined;
  const notes: string[] = [];

  if (!explicitRule && classDef) {
    notes.push("Class proficiencies resolved from feature text fallback.");
  }

  const rule = explicitRule ?? {
    savingThrows: parsedRule?.savingThrows ?? [],
    armor: parsedRule?.armor ?? [],
    weapons: parsedRule?.weapons ?? [],
    tools: parsedRule?.tools ?? [],
    skillChoices: parsedRule?.skillChoices ?? { count: 0, options: [] },
  };

  return {
    class: classEntity,
    subclass: subclassEntity,
    level,
    proficiencyBonus: proficiencyBonusForLevel(level),
    savingThrowProficiencies: [...rule.savingThrows],
    armorProficiencies: [...rule.armor],
    weaponProficiencies: [...rule.weapons],
    toolProficiencies: [...rule.tools],
    skillChoices: {
      count: rule.skillChoices.count,
      options: [...rule.skillChoices.options],
      source: "class",
    },
    notes,
    dataStatus: classDef ? (explicitRule || (parsedRule && rule.savingThrows.length > 0) ? "complete" : "partial") : "pending",
  };
}

export function applySubclassRules(subclassDef: SubclassDefinition | undefined): AppliedEntityRef | undefined {
  return toEntityRef(subclassDef);
}

export function applyFeatRules(
  draft: CharacterDraft,
  featCatalog: FeatDefinition[],
  backgroundResult: AppliedBackgroundResult,
): AppliedFeatResult {
  const selectedFeats = draft.featIds.map((idValue) => featCatalog.find((entry) => entry.id === idValue)).filter((entry): entry is FeatDefinition => Boolean(entry));
  return {
    selectedFeatIds: selectedFeats.map((entry) => entry.id),
    selectedFeatNames: selectedFeats.map((entry) => entry.name),
    grantedFeatIds: backgroundResult.grantedFeatIds,
    grantedFeatNames: backgroundResult.grantedFeatNames,
    unresolvedGrantedFeatNames: backgroundResult.unresolvedGrantedFeatNames,
  };
}

export function applyBaseProficiencies(
  draft: CharacterDraft,
  classResult: AppliedClassResult,
  backgroundResult: AppliedBackgroundResult,
  speciesResult: AppliedSpeciesResult,
): AppliedProficienciesResult {
  const classSkillChoice = getSelectedClassSkills(draft, classResult);
  const speciesSelectedSkills: string[] = [];
  let speciesMissingCount = 0;
  if (speciesResult.skillChoice && speciesResult.skillChoice.count > 0) {
    const allowedTokens = new Set(speciesResult.skillChoice.options.map((entry) => normalizeSkillToken(entry)));
    const selectedForSpecies: string[] = [];
    for (let index = 0; index < speciesResult.skillChoice.count; index += 1) {
      const selected = getFeatureChoiceValue(draft, `skill-choice:species:${index}`);
      if (!selected || !allowedTokens.has(normalizeSkillToken(selected))) {
        continue;
      }
      selectedForSpecies.push(selected);
    }
    speciesSelectedSkills.push(...Array.from(new Set(selectedForSpecies)));
    speciesMissingCount = Math.max(0, speciesResult.skillChoice.count - speciesSelectedSkills.length);
  }

  const languageSet = new Set<string>(backgroundResult.languagesGranted);
  for (const traitLine of speciesResult.traits) {
    for (const language of parseLanguages(traitLine)) {
      languageSet.add(language);
    }
  }

  return {
    savingThrows: [...classResult.savingThrowProficiencies],
    skills: [...new Set([...backgroundResult.skillProficiencies, ...speciesResult.skillProficiencies, ...classSkillChoice.selectedSkills, ...speciesSelectedSkills])],
    tools: [...new Set([...classResult.toolProficiencies, ...backgroundResult.toolProficiencies])],
    languages: Array.from(languageSet),
    pendingSkillChoices: [
      ...(classSkillChoice.missingCount > 0
        ? [
            {
              source: "class" as const,
              count: classSkillChoice.missingCount,
              options: resolveClassSkillOptions(classResult.skillChoices.options),
              choiceKeyPrefix: "skill-choice:class",
              reason: "Class skill proficiency choices",
            },
          ]
        : []),
      ...(speciesMissingCount > 0 && speciesResult.skillChoice
        ? [
            {
              source: "species" as const,
              count: speciesMissingCount,
              options: [...speciesResult.skillChoice.options],
              choiceKeyPrefix: "skill-choice:species",
              reason: speciesResult.skillChoice.reason,
            },
          ]
        : []),
    ],
  };
}

export function applySpellPreparationBasis(
  classDef: ClassDefinition | undefined,
  subclassDef: SubclassDefinition | undefined,
): AppliedSpellcastingResult {
  const classSignal = Boolean(classDef?.spellcastingFactor || classDef?.spellcastingKnown || classDef?.features.some((entry) => /spellcasting/i.test(entry.name)));
  const subclassSignal = Boolean(
    subclassDef?.spellcastingFactor || subclassDef?.spellcastingKnown || subclassDef?.features.some((entry) => /spellcasting/i.test(entry.name)),
  );
  const available = classSignal || subclassSignal;
  let source: AppliedSpellcastingResult["source"] = "none";
  if (classSignal && subclassSignal) {
    source = "class+subclass";
  } else if (classSignal) {
    source = "class";
  } else if (subclassSignal) {
    source = "subclass";
  }

  return {
    available,
    basis: available ? "declarative" : "none",
    source,
    notes: available ? ["Declarative spellcasting basis detected; full slot/preparation engine remains pending."] : ["No declarative spellcasting basis detected."],
    dataStatus: "complete",
  };
}

function hasSpeciesAbilityRule(result: AppliedSpeciesResult): boolean {
  return (
    Object.keys(result.abilityAdjustments.fixed).length > 0 ||
    result.abilityAdjustments.pendingChoices.length > 0 ||
    result.abilityAdjustments.ignored.length > 0
  );
}

function resolveOriginAbilityMode(
  draft: CharacterDraft,
  speciesRuleAvailable: boolean,
  backgroundRuleAvailable: boolean,
): {
  selectedMode?: OriginAbilityMode;
  availableModes: OriginAbilityMode[];
  notes: string[];
} {
  const availableModes: OriginAbilityMode[] = [];
  if (speciesRuleAvailable) {
    availableModes.push("species");
  }
  if (backgroundRuleAvailable) {
    availableModes.push("background-2024");
  }
  if (availableModes.length === 0) {
    return {
      selectedMode: undefined,
      availableModes,
      notes: [],
    };
  }

  const explicitMode = getFeatureChoiceValue(draft, "ability-choice:origin-mode");
  if ((explicitMode === "species" || explicitMode === "background-2024") && availableModes.includes(explicitMode)) {
    return {
      selectedMode: explicitMode,
      availableModes,
      notes: [],
    };
  }

  const defaultMode: OriginAbilityMode = draft.rulesMode === "2024" && backgroundRuleAvailable ? "background-2024" : availableModes[0];
  const notes: string[] = [];
  if (draft.rulesMode === "2024" && defaultMode === "background-2024") {
    notes.push("Using 2024 background ability allocation by default.");
  }
  return {
    selectedMode: defaultMode,
    availableModes,
    notes,
  };
}

function materializeAbilityScoreChoices(
  draft: CharacterDraft,
  baseAdjustments: AppliedAbilityScoreAdjustments,
): AppliedAbilityScoreAdjustments {
  const fixed: Partial<Record<AbilityKey, number>> = { ...baseAdjustments.fixed };
  const pendingChoices: AbilityScoreChoiceRequirement[] = [];
  const choiceStates: AbilityScoreChoiceState[] = [];
  const usedBySource = new Map<AbilityScoreChoiceRequirement["source"], Set<AbilityKey>>();

  for (const [requirementIndex, requirement] of baseAdjustments.pendingChoices.entries()) {
    let unresolvedCount = 0;
    for (let slotIndex = 0; slotIndex < requirement.count; slotIndex += 1) {
      const id = buildAbilityChoiceId(requirement.source, requirementIndex, slotIndex);
      const selectedRaw = getFeatureChoiceValue(draft, id);
      const selectedAbility = selectedRaw && ABILITY_ALIASES[selectedRaw.toLowerCase()] ? ABILITY_ALIASES[selectedRaw.toLowerCase()] : undefined;
      const used = usedBySource.get(requirement.source) ?? new Set<AbilityKey>();
      const valid =
        Boolean(selectedAbility) &&
        requirement.allowedAbilities.includes(selectedAbility as AbilityKey) &&
        !used.has(selectedAbility as AbilityKey);

      if (valid && selectedAbility) {
        fixed[selectedAbility] = (fixed[selectedAbility] ?? 0) + requirement.amount;
        used.add(selectedAbility);
        usedBySource.set(requirement.source, used);
      } else {
        unresolvedCount += 1;
      }

      choiceStates.push({
        id,
        source: requirement.source,
        amount: requirement.amount,
        allowedAbilities: [...requirement.allowedAbilities],
        reason: requirement.reason,
        selectedAbility,
        satisfied: valid,
      });
    }

    if (unresolvedCount > 0) {
      pendingChoices.push({
        ...requirement,
        count: unresolvedCount,
      });
    }
  }

  return {
    ...baseAdjustments,
    fixed,
    pendingChoices,
    choiceStates,
  };
}

function backgroundAbilityChoiceRequirement(rulesMode: CharacterDraft["rulesMode"]): AbilityScoreChoiceRequirement[] {
  if (rulesMode !== "2024") {
    return [];
  }
  return [
    {
      source: "background",
      amount: 2,
      count: 1,
      allowedAbilities: ["str", "dex", "con", "int", "wis", "cha"],
      reason: "2024 background ability allocation (+2 to one ability).",
    },
    {
      source: "background",
      amount: 1,
      count: 1,
      allowedAbilities: ["str", "dex", "con", "int", "wis", "cha"],
      reason: "2024 background ability allocation (+1 to a different ability).",
    },
  ];
}

function buildPendingChoices(
  abilityAdjustments: AppliedAbilityScoreAdjustments,
  backgroundResult: AppliedBackgroundResult,
  proficiencies: AppliedProficienciesResult,
): AppliedChoiceRequirement[] {
  const pending: AppliedChoiceRequirement[] = [];
  for (const [index, choice] of abilityAdjustments.pendingChoices.entries()) {
    pending.push({
      id: `ability-${choice.source}-${index}`,
      kind: "ability-score-choice",
      description: `${choice.reason}: choose ${choice.count} ability score(s) to increase by +${choice.amount}.`,
      source: choice.source,
      status: "pending",
    });
  }
  for (const pendingSkillChoice of proficiencies.pendingSkillChoices) {
    pending.push({
      id: `skill-${pendingSkillChoice.source}`,
      kind: "skill-choice",
      description: `Choose ${pendingSkillChoice.count} ${pendingSkillChoice.source} skill proficiency option(s).`,
      source: pendingSkillChoice.source,
      status: "pending",
    });
  }
  if (backgroundResult.originFeatRequirement?.required && !backgroundResult.originFeatRequirement.satisfied) {
    pending.push({
      id: "feat-origin",
      kind: "origin-feat",
      description: "Select an Origin Feat for 2024 background compatibility.",
      source: "background",
      status: "required",
    });
  }
  return pending;
}

export function resolveAppliedCharacterRules(input: AppliedResolverInput): AppliedCharacterRules {
  const { draft, classDef, subclassDef, speciesDef, backgroundDef, featCatalog } = input;

  const speciesPreview = applySpeciesRules(speciesDef, draft.rulesMode, {
    useLegacyAbilityIn2024: true,
  });
  const selectedOriginFeatId = getFeatureChoiceValue(draft, "feat-choice:origin");
  const backgroundResult = applyBackgroundRules(backgroundDef, draft.rulesMode, featCatalog, draft.featIds, selectedOriginFeatId);
  const originModeResolution = resolveOriginAbilityMode(
    draft,
    hasSpeciesAbilityRule(speciesPreview),
    Boolean(backgroundResult.entity && draft.rulesMode === "2024"),
  );
  const speciesResult = applySpeciesRules(speciesDef, draft.rulesMode, {
    useLegacyAbilityIn2024: originModeResolution.selectedMode === "species",
  });
  const classResult = applyClassRules(classDef, subclassDef, draft.classSelection.level);
  const featResult = applyFeatRules(draft, featCatalog, backgroundResult);
  const spellcasting = applySpellPreparationBasis(classDef, subclassDef);
  const backgroundAbilityChoices =
    backgroundResult.entity && originModeResolution.selectedMode === "background-2024"
      ? backgroundAbilityChoiceRequirement(draft.rulesMode)
      : [];
  const baseAbilityAdjustments = mergeAbilityAdjustments(
    speciesResult.abilityAdjustments,
    {
      fixed: {},
      pendingChoices: backgroundAbilityChoices,
      ignored: [],
      choiceStates: [],
      originModeChoiceId: originModeResolution.availableModes.length > 1 ? "ability-choice:origin-mode" : undefined,
      originMode: originModeResolution.selectedMode,
      availableOriginModes: originModeResolution.availableModes,
      notes: [...originModeResolution.notes],
    },
  );
  const abilityScoreAdjustments = materializeAbilityScoreChoices(draft, baseAbilityAdjustments);
  const proficiencies = applyBaseProficiencies(draft, classResult, backgroundResult, speciesResult);
  const pendingChoices = buildPendingChoices(abilityScoreAdjustments, backgroundResult, proficiencies);

  const speciesConverted = speciesResult.entity?.conversionMode === "2024-converted";
  const backgroundConverted = backgroundResult.entity?.conversionMode === "2024-converted";
  const legacySubclassIn2024 = draft.rulesMode === "2024" && classResult.subclass?.conversionMode === "2024-converted";
  const notes = [
    ...speciesResult.entity?.notes ?? [],
    ...backgroundResult.notes,
    ...classResult.notes,
    ...spellcasting.notes,
    ...abilityScoreAdjustments.notes,
  ];

  const statuses: AppliedDataStatus[] = [
    speciesResult.dataStatus,
    backgroundResult.dataStatus,
    classResult.dataStatus,
    spellcasting.dataStatus,
    pendingChoices.length > 0 ? "pending" : "complete",
  ];
  const dataStatus: AppliedDataStatus = statuses.includes("partial")
    ? "partial"
    : statuses.includes("pending")
      ? "pending"
      : statuses.includes("manual")
        ? "manual"
        : "complete";

  return {
    draftRef: {
      id: draft.id,
      name: draft.name,
      provider: draft.provider,
      rulesMode: draft.rulesMode,
    },
    provider: draft.provider,
    rulesMode: draft.rulesMode,
    level: draft.classSelection.level,
    abilityScoreAdjustments,
    classResult,
    speciesResult,
    backgroundResult,
    featResult,
    proficiencies,
    spellcasting,
    pendingChoices,
    conversionSummary: {
      speciesConverted,
      backgroundConverted,
      legacySubclassIn2024,
      notes: [
        speciesConverted ? "Species converted to 2024 compatibility." : "",
        backgroundConverted ? "Background converted to 2024 compatibility." : "",
        legacySubclassIn2024 ? "Legacy subclass uses 2024 class progression." : "",
      ].filter(Boolean),
    },
    dataStatus,
    notes,
  };
}
