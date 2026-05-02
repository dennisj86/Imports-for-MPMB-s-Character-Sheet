import { toSlug } from "../../lib/slug";
import type {
  AbilityKey,
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

const CORE_ORIGIN_FEAT_TOKENS = new Set(["alert", "magic-initiate-cleric", "magic-initiate-wizard", "savage-attacker"]);

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

export function applySpeciesRules(species: SpeciesDefinition | undefined, rulesMode: CharacterDraft["rulesMode"]): AppliedSpeciesResult {
  if (!species) {
    return {
      entity: undefined,
      traits: [],
      abilityAdjustments: emptyAbilityAdjustments(),
      dataStatus: "pending",
    };
  }

  const entity = toEntityRef(species);
  const conversionMode = entity?.conversionMode ?? "native";
  const isConvertedIn2024 = rulesMode === "2024" && conversionMode === "2024-converted";
  const canonicalKey = canonicalEntityKey(species);

  const explicitRule =
    SPECIES_ABILITY_RULES[canonicalKey] ??
    (canonicalKey.startsWith("half-elf") ? SPECIES_ABILITY_RULES["half-elf"] : undefined);
  const parsedRule = explicitRule ? undefined : parseSpeciesAbilityRuleFromTraits(species.traits);
  const adjustments = emptyAbilityAdjustments();
  const notes = [...(entity?.notes ?? [])];

  const applyRule = explicitRule ?? (parsedRule ? { fixed: parsedRule.fixed, choices: parsedRule.choices } : undefined);

  if (isConvertedIn2024) {
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

  if (!explicitRule && parsedRule) {
    notes.push("Species ability adjustments resolved via fallback parser.");
  }

  return {
    entity: {
      ...entity,
      notes,
    },
    traits: extractLines(species.traits),
    abilityAdjustments: adjustments,
    dataStatus: !explicitRule && !parsedRule && !isConvertedIn2024 ? "partial" : "complete",
  };
}

export function applyBackgroundRules(
  background: BackgroundDefinition | undefined,
  rulesMode: CharacterDraft["rulesMode"],
  featCatalog: FeatDefinition[],
  selectedFeatIds: string[],
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
  const selectedOriginFeat = selectedFeatIds.some((idValue) => {
    const feat = featCatalog.find((entry) => entry.id === idValue);
    if (!feat) {
      return false;
    }
    const token = normalizeToken(feat.compatibility?.canonicalKey ?? feat.key ?? feat.name);
    return CORE_ORIGIN_FEAT_TOKENS.has(token);
  });
  const originFeatRequirement =
    requiresOriginFeat
      ? {
          kind: "origin-feat" as const,
          required: true,
          satisfied: selectedOriginFeat || grantedFeatIds.length > 0,
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
  classResult: AppliedClassResult,
  backgroundResult: AppliedBackgroundResult,
  speciesResult: AppliedSpeciesResult,
): AppliedProficienciesResult {
  const languageSet = new Set<string>(backgroundResult.languagesGranted);
  for (const traitLine of speciesResult.traits) {
    for (const language of parseLanguages(traitLine)) {
      languageSet.add(language);
    }
  }

  return {
    savingThrows: [...classResult.savingThrowProficiencies],
    skills: [...new Set(backgroundResult.skillProficiencies)],
    tools: [...new Set([...classResult.toolProficiencies, ...backgroundResult.toolProficiencies])],
    languages: Array.from(languageSet),
    pendingSkillChoices:
      classResult.skillChoices.count > 0
        ? [
            {
              source: "class",
              count: classResult.skillChoices.count,
              options: classResult.skillChoices.options,
            },
          ]
        : [],
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
  classResult: AppliedClassResult,
  backgroundResult: AppliedBackgroundResult,
): AppliedChoiceRequirement[] {
  const pending: AppliedChoiceRequirement[] = [];
  for (const [index, choice] of abilityAdjustments.pendingChoices.entries()) {
    pending.push({
      id: `ability-species-${index}`,
      kind: "ability-score-choice",
      description: `${choice.reason}: choose ${choice.count} ability score(s) to increase by +${choice.amount}.`,
      source: "species",
      status: "pending",
    });
  }
  if (classResult.skillChoices.count > 0) {
    pending.push({
      id: "skill-class",
      kind: "skill-choice",
      description: `Choose ${classResult.skillChoices.count} class skill proficiency option(s).`,
      source: "class",
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

  const speciesResult = applySpeciesRules(speciesDef, draft.rulesMode);
  const backgroundResult = applyBackgroundRules(backgroundDef, draft.rulesMode, featCatalog, draft.featIds);
  const classResult = applyClassRules(classDef, subclassDef, draft.classSelection.level);
  const featResult = applyFeatRules(draft, featCatalog, backgroundResult);
  const spellcasting = applySpellPreparationBasis(classDef, subclassDef);
  const backgroundAbilityChoices = backgroundResult.entity ? backgroundAbilityChoiceRequirement(draft.rulesMode) : [];
  const abilityScoreAdjustments = mergeAbilityAdjustments(
    speciesResult.abilityAdjustments,
    {
      fixed: {},
      pendingChoices: backgroundAbilityChoices,
      ignored: [],
    },
  );
  const proficiencies = applyBaseProficiencies(classResult, backgroundResult, speciesResult);
  const pendingChoices = buildPendingChoices(abilityScoreAdjustments, classResult, backgroundResult);

  const speciesConverted = speciesResult.entity?.conversionMode === "2024-converted";
  const backgroundConverted = backgroundResult.entity?.conversionMode === "2024-converted";
  const legacySubclassIn2024 = draft.rulesMode === "2024" && classResult.subclass?.conversionMode === "2024-converted";
  const notes = [
    ...speciesResult.entity?.notes ?? [],
    ...backgroundResult.notes,
    ...classResult.notes,
    ...spellcasting.notes,
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
