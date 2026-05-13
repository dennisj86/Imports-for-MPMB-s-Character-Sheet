import type { CharacterDraft, FeatureChoice } from "../../domain/character";
import type { CanonicalRuleChoice } from "../../domain/rules";
import type { CharacterWizardState } from "../../services/characterEngine";
import type { WeaponAttackProfile } from "../../services/rules";
import type { HitDicePool } from "../../domain/playState";
import { createCharacterDraft } from "../../domain/defaults";
import { resolveCharacterEngineState, resolveCharacterWizardState, type CharacterEngineState } from "../../services/characterEngine";
import { contentSnapshot } from "../../services/data/content";
import { resolveBackgrounds, resolveClasses, resolveEquipment, resolveFeats, resolveSpecies } from "../../services/data/rulesModeResolver";
import { setAbilityScoreIncreaseChoice, setAsiOrFeatOption } from "../../services/levelUp";
import { buildPlayStateRuntimeContext } from "../../services/playState";
import { buildWeaponAttackProfiles, resolveCombinedRuleProficiencies, setRuleChoiceSelection } from "../../services/rules";

export const PHB_TEST_CONTEXT = { provider: "mpmb", rulesMode: "2024" } as const;

const classes = resolveClasses(contentSnapshot.classes, PHB_TEST_CONTEXT);
const species = resolveSpecies(contentSnapshot.species, PHB_TEST_CONTEXT);
const backgrounds = resolveBackgrounds(contentSnapshot.backgrounds, PHB_TEST_CONTEXT);
const equipmentCatalog = resolveEquipment(contentSnapshot.equipment, PHB_TEST_CONTEXT);
const featCatalog = resolveFeats(contentSnapshot.feats, PHB_TEST_CONTEXT);
const weaponNameSet = new Set(equipmentCatalog.filter((entry) => entry.category === "weapon").map((entry) => entry.name));

export interface PhbFixtureState {
  id: string;
  draft: CharacterDraft;
  engine: CharacterEngineState;
  wizard: CharacterWizardState;
  proficiencies: ReturnType<typeof resolveCombinedRuleProficiencies>;
  weaponProfiles: WeaponAttackProfile[];
  hitDicePools: HitDicePool[];
}

export interface CoverageMatrixFixtureEntry {
  fixtureId: string;
  classKey: string;
  choiceTypes: string[];
  applyPaths: string[];
  modifierTypes: string[];
  notes?: string[];
}

export interface CoverageMatrixGapEntry {
  id: string;
  scope: string;
  reason: string;
}

export const RULES_COVERAGE_FOCUS_CLASS_KEYS = [
  "paladin",
  "ranger",
  "barbarian",
  "bard",
  "monk",
  "warlock",
  "wizard",
] as const;

export type RulesCoverageFocusClassKey = (typeof RULES_COVERAGE_FOCUS_CLASS_KEYS)[number];
export type RulesCoverageLevel = 1 | 2 | 3 | 4 | 5;

export interface RulesCoverageFixtureEntry {
  classKey: RulesCoverageFocusClassKey;
  level: RulesCoverageLevel;
  state: PhbFixtureState;
}

export interface CoverageMatrixV2LevelEntry {
  classKey: RulesCoverageFocusClassKey;
  level: RulesCoverageLevel;
  testedFeatures: string[];
  automated: string[];
  partial: string[];
  manual: string[];
  unsupported: string[];
  openKnownGaps: string[];
}

export interface CoverageMatrixV2 {
  entries: CoverageMatrixV2LevelEntry[];
  knownGaps: CoverageMatrixGapEntry[];
}

export const PHB_GOLDEN_COVERAGE_MATRIX: {
  fixtures: CoverageMatrixFixtureEntry[];
  knownGaps: CoverageMatrixGapEntry[];
} = {
  fixtures: [
    {
      fixtureId: "fighter",
      classKey: "fighter",
      choiceTypes: ["background-ability-choice", "class-skill-choice", "fighting-style"],
      applyPaths: ["ability-score-adjustments", "skill-proficiencies", "tool-proficiencies", "weapon-proficiencies", "armor-proficiencies", "action-resources"],
      modifierTypes: ["ac-flat", "weapon-attack-profile", "versatile-damage"],
    },
    {
      fixtureId: "paladin",
      classKey: "paladin",
      choiceTypes: ["background-ability-choice", "class-skill-choice", "fighting-style", "weapon-mastery", "spell-selection"],
      applyPaths: ["ability-score-adjustments", "skill-proficiencies", "weapon-proficiencies", "armor-proficiencies", "spell-selection", "active-effects"],
      modifierTypes: ["weapon-damage-flat", "ac-active-effect"],
    },
    {
      fixtureId: "cleric",
      classKey: "cleric",
      choiceTypes: ["background-ability-choice", "class-skill-choice", "feature-option", "cantrip-selection", "spell-selection"],
      applyPaths: ["ability-score-adjustments", "skill-proficiencies", "tool-proficiencies", "weapon-proficiencies", "armor-proficiencies", "spell-selection", "active-effects"],
      modifierTypes: ["roll-bonus-dice", "ac-active-effect"],
    },
    {
      fixtureId: "bard",
      classKey: "bard",
      choiceTypes: ["background-ability-choice", "class-skill-choice", "cantrip-selection", "spell-selection"],
      applyPaths: ["ability-score-adjustments", "skill-proficiencies", "tool-proficiencies", "spell-selection", "action-resources", "active-effects"],
      modifierTypes: ["roll-bonus-dice"],
    },
    {
      fixtureId: "rogue",
      classKey: "rogue",
      choiceTypes: ["background-ability-choice", "class-skill-choice", "language-choice", "weapon-mastery"],
      applyPaths: ["ability-score-adjustments", "skill-proficiencies", "tool-proficiencies", "language-proficiencies", "weapon-proficiencies"],
      modifierTypes: ["weapon-attack-profile"],
    },
    {
      fixtureId: "wizard",
      classKey: "wizard",
      choiceTypes: ["background-ability-choice", "class-skill-choice", "origin-feat-choice", "feat-subchoice", "cantrip-selection", "spell-selection"],
      applyPaths: ["ability-score-adjustments", "skill-proficiencies", "tool-proficiencies", "spell-selection", "active-effects"],
      modifierTypes: ["roll-bonus-dice"],
      notes: ["Magic Initiate completion is asserted through builder feat/spell contexts and canonical rule-choice status."],
    },
    {
      fixtureId: "barbarian",
      classKey: "barbarian",
      choiceTypes: ["background-ability-choice", "class-skill-choice"],
      applyPaths: ["ability-score-adjustments", "skill-proficiencies", "tool-proficiencies", "weapon-proficiencies", "armor-proficiencies", "action-resources"],
      modifierTypes: ["weapon-attack-profile"],
    },
    {
      fixtureId: "ranger",
      classKey: "ranger",
      choiceTypes: ["background-ability-choice", "class-skill-choice", "fighting-style", "language-choice", "weapon-mastery", "spell-selection"],
      applyPaths: ["ability-score-adjustments", "skill-proficiencies", "tool-proficiencies", "language-proficiencies", "weapon-proficiencies", "armor-proficiencies", "spell-selection"],
      modifierTypes: ["weapon-attack-flat", "weapon-attack-profile"],
    },
  ],
  knownGaps: [],
};

function requireClass(key: string) {
  const found = classes.find((entry) => entry.key === key);
  if (!found) {
    throw new Error(`Expected class ${key} in resolved 2024 snapshot.`);
  }
  return found;
}

function requireSpecies(key: string) {
  const found = species.find((entry) => entry.key === key);
  if (!found) {
    throw new Error(`Expected species ${key} in resolved 2024 snapshot.`);
  }
  return found;
}

function requireBackground(key: string) {
  const found = backgrounds.find((entry) => entry.key === key);
  if (!found) {
    throw new Error(`Expected background ${key} in resolved 2024 snapshot.`);
  }
  return found;
}

function requireEquipment(id: string) {
  const found = equipmentCatalog.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Expected equipment ${id} in resolved 2024 snapshot.`);
  }
  return found;
}

function requireFeat(key: string) {
  const found = featCatalog.find((entry) => entry.key === key);
  if (!found) {
    throw new Error(`Expected feat ${key} in resolved 2024 snapshot.`);
  }
  return found;
}

function upsertFeatureChoice(featureChoices: FeatureChoice[], featureId: string, optionId: string): FeatureChoice[] {
  const next = featureChoices.filter((entry) => entry.featureId !== featureId);
  next.push({ featureId, optionId });
  return next;
}

function withFeatureChoices(draft: CharacterDraft, choices: FeatureChoice[]): CharacterDraft {
  let next = draft;
  for (const choice of choices) {
    next = {
      ...next,
      featureChoices: upsertFeatureChoice(next.featureChoices, choice.featureId, choice.optionId),
    };
  }
  return next;
}

function withBackgroundAbilityChoices(
  draft: CharacterDraft,
  plusTwoAbility: "str" | "dex" | "con" | "int" | "wis" | "cha",
  plusOneAbility: "str" | "dex" | "con" | "int" | "wis" | "cha",
): CharacterDraft {
  return withFeatureChoices(draft, [
    { featureId: "ability-choice:background:0:0", optionId: plusTwoAbility },
    { featureId: "ability-choice:background:1:0", optionId: plusOneAbility },
  ]);
}

function withClassSkillChoices(draft: CharacterDraft, skills: string[]): CharacterDraft {
  return withFeatureChoices(
    draft,
    skills.map((skill, index) => ({ featureId: `skill-choice:class:${index}`, optionId: skill })),
  );
}

function withOriginMagicInitiateChoices(
  draft: CharacterDraft,
  spellList: "cleric" | "druid" | "wizard",
  spellAbility: "int" | "wis" | "cha",
): CharacterDraft {
  const feat = requireFeat("magic initiate");
  const next = withFeatureChoices(draft, [
    { featureId: "feat-choice:origin", optionId: feat.id },
    { featureId: `feat-choice:${feat.id}:spell-list`, optionId: spellList },
    { featureId: `feat-choice:${feat.id}:spell-ability`, optionId: spellAbility },
  ]);
  return {
    ...next,
    featIds: Array.from(new Set([...next.featIds, feat.id])),
  };
}

function withInventory(draft: CharacterDraft, equipmentIds: string[]): CharacterDraft {
  return {
    ...draft,
    inventory: {
      items: equipmentIds.map((equipmentId, index) => {
        const item = requireEquipment(equipmentId);
        return {
          id: `fixture:${draft.id}:item:${index}`,
          itemDefinitionId: item.id,
          name: item.name,
          quantity: 1,
          equipped: true,
        };
      }),
    },
  };
}

function resolveFixtureState(id: string, draft: CharacterDraft): PhbFixtureState {
  const engine = resolveCharacterEngineState(contentSnapshot, draft, PHB_TEST_CONTEXT);
  const wizard = resolveCharacterWizardState(contentSnapshot, draft, PHB_TEST_CONTEXT);
  const proficiencies = resolveCombinedRuleProficiencies(engine.appliedRules, engine.ruleEngine.optionScoped);
  const hitDicePools = buildPlayStateRuntimeContext(engine).hitDicePools;
  const weaponProfiles = buildWeaponAttackProfiles({
    draft,
    equipmentCatalog,
    derivedStats: engine.derivedStats,
    modifiers: engine.ruleEngine.modifiers,
    weaponProficiencies: proficiencies.weapons,
  });
  return {
    id,
    draft,
    engine,
    wizard,
    proficiencies,
    hitDicePools,
    weaponProfiles,
  };
}

function chooseRuleOptions(draft: CharacterDraft, labelContains: string, optionLabels: string[]): CharacterDraft {
  const state = resolveFixtureState(`choose:${draft.id}:${labelContains}`, draft);
  const choice = findRuleChoice(state, labelContains);
  const optionIds = optionLabels.map((label) => {
    const option = choice.options.find((entry) => entry.label === label);
    if (!option) {
      throw new Error(`Expected option ${label} on choice ${choice.label}.`);
    }
    return option.id;
  });
  return setRuleChoiceSelection(draft, choice.choice, optionIds);
}

function chooseRuleOptionsIfAvailable(draft: CharacterDraft, labelContains: string, optionLabels: string[]): CharacterDraft {
  const state = resolveFixtureState(`choose-if:${draft.id}:${labelContains}`, draft);
  const choice = state.engine.ruleEngine.choiceSurface.choices.find((entry) => entry.label.includes(labelContains));
  if (!choice || choice.options.length === 0 || choice.requiredCount === 0) {
    return draft;
  }
  const resolved = optionLabels
    .map((label) => choice.options.find((entry) => entry.label === label)?.id)
    .filter((entry): entry is string => Boolean(entry));
  if (resolved.length === 0) {
    return draft;
  }
  return setRuleChoiceSelection(draft, choice.choice, resolved.slice(0, choice.choice.maxCount));
}

function chooseFirstRuleOptionsIfAvailable(
  draft: CharacterDraft,
  labelContains: string,
  count?: number,
): CharacterDraft {
  const state = resolveFixtureState(`choose-first:${draft.id}:${labelContains}`, draft);
  const choice = state.engine.ruleEngine.choiceSurface.choices.find((entry) => entry.label.includes(labelContains));
  if (!choice || choice.options.length === 0 || choice.requiredCount === 0) {
    return draft;
  }
  const selectionCount = Math.max(choice.choice.minCount, Math.min(choice.choice.maxCount, count ?? choice.requiredCount));
  const optionIds = choice.options.slice(0, selectionCount).map((entry) => entry.id);
  if (optionIds.length < choice.choice.minCount) {
    return draft;
  }
  return setRuleChoiceSelection(draft, choice.choice, optionIds);
}

function chooseSpellsFromContext(draft: CharacterDraft, contextId: string, spellNames: string[]): CharacterDraft {
  const wizard = resolveCharacterWizardState(contentSnapshot, draft, PHB_TEST_CONTEXT);
  const spellContext = wizard.spellContexts.find((entry) => entry.id === contextId);
  if (!spellContext) {
    throw new Error(`Expected spell context ${contextId} on draft ${draft.id}.`);
  }
  const selectedSpellIds: string[] = [];
  let featureChoices = [...draft.featureChoices];
  for (const spellName of spellNames) {
    const spell = spellContext.eligibleSpells.find((entry) => entry.name === spellName);
    if (!spell) {
      throw new Error(`Expected spell ${spellName} in spell context ${contextId}.`);
    }
    selectedSpellIds.push(spell.id);
    featureChoices = upsertFeatureChoice(featureChoices, `spell-choice:${contextId}:${spell.id}`, "selected");
  }
  return {
    ...draft,
    featureChoices,
    spellSelection: {
      selectedSpellIds: Array.from(new Set([...draft.spellSelection.selectedSpellIds, ...selectedSpellIds])),
    },
  };
}

function chooseSpellsFromContextPreferred(
  draft: CharacterDraft,
  contextId: string,
  preferredSpellNames: string[],
  targetCount?: number,
): CharacterDraft {
  const wizard = resolveCharacterWizardState(contentSnapshot, draft, PHB_TEST_CONTEXT);
  const spellContext = wizard.spellContexts.find((entry) => entry.id === contextId);
  if (!spellContext) {
    return draft;
  }
  const currentCount = spellContext.selectedSpellIds.length;
  const maxSelections = typeof spellContext.maxSelections === "number" ? spellContext.maxSelections : undefined;
  const desiredCount = Math.max(
    currentCount,
    Math.min(maxSelections ?? Number.POSITIVE_INFINITY, targetCount ?? maxSelections ?? preferredSpellNames.length),
  );
  if (desiredCount <= currentCount) {
    return draft;
  }
  const selected = new Set(spellContext.selectedSpellIds);
  const eligibleByName = new Map(spellContext.eligibleSpells.map((spell) => [spell.name, spell]));
  const pickedNames: string[] = [];
  for (const name of preferredSpellNames) {
    const spell = eligibleByName.get(name);
    if (!spell || selected.has(spell.id)) {
      continue;
    }
    selected.add(spell.id);
    pickedNames.push(spell.name);
    if (currentCount + pickedNames.length >= desiredCount) {
      break;
    }
  }
  if (currentCount + pickedNames.length < desiredCount) {
    const filler = spellContext.eligibleSpells
      .filter((entry) => !selected.has(entry.id))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const spell of filler) {
      selected.add(spell.id);
      pickedNames.push(spell.name);
      if (currentCount + pickedNames.length >= desiredCount) {
        break;
      }
    }
  }
  if (pickedNames.length === 0) {
    return draft;
  }
  return chooseSpellsFromContext(draft, contextId, pickedNames);
}

function createBaseDraft(
  id: string,
  classKey: string,
  level: number,
  speciesKey: string,
  backgroundKey: string,
  abilityScores: CharacterDraft["abilityScores"],
): CharacterDraft {
  const draft = createCharacterDraft(id, id);
  draft.provider = "mpmb";
  draft.rulesMode = "2024";
  draft.classSelection = { classId: requireClass(classKey).id, level };
  draft.speciesSelection = { speciesId: requireSpecies(speciesKey).id };
  draft.backgroundSelection = { backgroundId: requireBackground(backgroundKey).id };
  draft.abilityScores = { ...draft.abilityScores, ...abilityScores };
  return draft;
}

interface RulesCoverageBuilderConfig {
  classKey: RulesCoverageFocusClassKey;
  speciesKey: string;
  backgroundKey: string;
  abilityScores: CharacterDraft["abilityScores"];
  backgroundAbilityBonus: { plusTwo: "str" | "dex" | "con" | "int" | "wis" | "cha"; plusOne: "str" | "dex" | "con" | "int" | "wis" | "cha" };
  classSkills: string[];
  equipmentIds: string[];
  levelPrimaryAbility: "str" | "dex" | "con" | "int" | "wis" | "cha";
  spellPreferencesByContext: Record<string, string[]>;
}

const RULES_COVERAGE_CONFIG_BY_CLASS: Record<RulesCoverageFocusClassKey, RulesCoverageBuilderConfig> = {
  paladin: {
    classKey: "paladin",
    speciesKey: "dwarf",
    backgroundKey: "criminal",
    abilityScores: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 16 },
    backgroundAbilityBonus: { plusTwo: "str", plusOne: "cha" },
    classSkills: ["Athletics", "Persuasion"],
    equipmentIds: ["equipment:armor-chain-mail", "equipment:weapon-longsword", "equipment:weapon-handaxe"],
    levelPrimaryAbility: "str",
    spellPreferencesByContext: {
      "spell-context:class-prepared-pool": ["Bless", "Shield of Faith", "Cure Wounds", "Heroism", "Searing Smite", "Wrathful Smite"],
    },
  },
  ranger: {
    classKey: "ranger",
    speciesKey: "elf",
    backgroundKey: "guide",
    abilityScores: { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 8 },
    backgroundAbilityBonus: { plusTwo: "dex", plusOne: "wis" },
    classSkills: ["Perception", "Stealth", "Survival"],
    equipmentIds: ["equipment:weapon-longbow", "equipment:weapon-handaxe"],
    levelPrimaryAbility: "dex",
    spellPreferencesByContext: {
      "spell-context:class-prepared-pool": ["Hunter's Mark", "Goodberry", "Cure Wounds", "Ensnaring Strike", "Hail of Thorns"],
    },
  },
  barbarian: {
    classKey: "barbarian",
    speciesKey: "dwarf",
    backgroundKey: "criminal",
    abilityScores: { str: 16, dex: 14, con: 16, int: 8, wis: 10, cha: 8 },
    backgroundAbilityBonus: { plusTwo: "str", plusOne: "con" },
    classSkills: ["Athletics", "Survival"],
    equipmentIds: ["equipment:weapon-handaxe"],
    levelPrimaryAbility: "str",
    spellPreferencesByContext: {},
  },
  bard: {
    classKey: "bard",
    speciesKey: "dwarf",
    backgroundKey: "entertainer",
    abilityScores: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
    backgroundAbilityBonus: { plusTwo: "cha", plusOne: "dex" },
    classSkills: ["Performance", "Persuasion", "Stealth"],
    equipmentIds: ["equipment:weapon-rapier"],
    levelPrimaryAbility: "cha",
    spellPreferencesByContext: {
      "progression:spell-selection:cantrip": ["Light", "Mage Hand", "Vicious Mockery"],
      "progression:spell-selection:known": ["Healing Word", "Cure Wounds", "Dissonant Whispers", "Heroism", "Charm Person", "Faerie Fire"],
    },
  },
  monk: {
    classKey: "monk",
    speciesKey: "elf",
    backgroundKey: "criminal",
    abilityScores: { str: 10, dex: 16, con: 12, int: 10, wis: 16, cha: 8 },
    backgroundAbilityBonus: { plusTwo: "dex", plusOne: "wis" },
    classSkills: ["Acrobatics", "Insight"],
    equipmentIds: ["equipment:weapon-quarterstaff"],
    levelPrimaryAbility: "dex",
    spellPreferencesByContext: {},
  },
  warlock: {
    classKey: "warlock",
    speciesKey: "elf",
    backgroundKey: "criminal",
    abilityScores: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
    backgroundAbilityBonus: { plusTwo: "cha", plusOne: "dex" },
    classSkills: ["Arcana", "Intimidation"],
    equipmentIds: ["equipment:weapon-dagger"],
    levelPrimaryAbility: "cha",
    spellPreferencesByContext: {
      "progression:spell-selection:cantrip": ["Eldritch Blast", "Mage Hand", "Minor Illusion"],
      "progression:spell-selection:known": ["Hex", "Armor of Agathys", "Hellish Rebuke", "Charm Person", "Misty Step"],
    },
  },
  wizard: {
    classKey: "wizard",
    speciesKey: "elf",
    backgroundKey: "criminal",
    abilityScores: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 },
    backgroundAbilityBonus: { plusTwo: "int", plusOne: "dex" },
    classSkills: ["Arcana", "Investigation"],
    equipmentIds: ["equipment:weapon-quarterstaff"],
    levelPrimaryAbility: "int",
    spellPreferencesByContext: {
      "progression:spell-selection:cantrip": ["Fire Bolt", "Mage Hand", "Light", "Ray of Frost"],
      "spell-context:class-prepared-pool": ["Magic Missile", "Shield", "Detect Magic", "Burning Hands", "Mage Armor", "Sleep"],
    },
  },
};

function normalizeToken(value: string | undefined): string {
  return String(value ?? "").toLowerCase();
}

function withFirstAvailableSubclass(draft: CharacterDraft): CharacterDraft {
  const state = resolveFixtureState(`subclass:${draft.id}`, draft);
  const firstSubclass = state.engine.availableSubclasses[0];
  if (!firstSubclass) {
    return draft;
  }
  return {
    ...draft,
    subclassSelection: {
      ...draft.subclassSelection,
      subclassId: firstSubclass.id,
    },
  };
}

function withLevelFourAsi(draft: CharacterDraft, primaryAbility: RulesCoverageBuilderConfig["levelPrimaryAbility"]): CharacterDraft {
  if (draft.classSelection.level < 4) {
    return draft;
  }
  const state = resolveFixtureState(`asi:${draft.id}`, draft);
  const asiChoice = state.engine.progression.asiOrFeatChoices.find((entry) => entry.level === 4);
  if (!asiChoice) {
    return draft;
  }
  const withChoice = setAsiOrFeatOption(draft, asiChoice.id, "ability-score-improvement");
  return setAbilityScoreIncreaseChoice(withChoice, asiChoice.id, asiChoice.level, { [primaryAbility]: 2 });
}

function withSpellSelectionsForCoverage(
  draft: CharacterDraft,
  config: RulesCoverageBuilderConfig,
): CharacterDraft {
  let next = draft;
  const wizard = resolveCharacterWizardState(contentSnapshot, next, PHB_TEST_CONTEXT);
  for (const context of wizard.spellContexts) {
    const preferred = Object.entries(config.spellPreferencesByContext)
      .find(([prefix]) => context.id.startsWith(prefix))
      ?.[1] ?? [];
    const targetCount =
      typeof context.maxSelections === "number"
        ? context.maxSelections
        : (context.id.startsWith("spell-context:class-prepared-pool") ? Math.min(3, context.eligibleSpells.length) : undefined);
    next = chooseSpellsFromContextPreferred(next, context.id, preferred, targetCount);
  }
  return next;
}

export function findRuleChoice(state: PhbFixtureState, labelContains: string): CanonicalRuleChoice {
  const found = state.engine.ruleEngine.choiceSurface.choices.find((entry) => entry.label.includes(labelContains));
  if (!found) {
    throw new Error(`Expected rule choice containing ${labelContains} on fixture ${state.id}.`);
  }
  return found;
}

export function findWeaponProfile(state: PhbFixtureState, weaponName: string): WeaponAttackProfile {
  const found = state.weaponProfiles.find((entry) => entry.weaponName === weaponName);
  if (!found) {
    throw new Error(`Expected weapon profile ${weaponName} on fixture ${state.id}.`);
  }
  return found;
}

export function allWeaponChoiceOptionsResolveToWeapons(choice: CanonicalRuleChoice): boolean {
  return choice.options.every((entry) => weaponNameSet.has(entry.label));
}

export function findSpellContext(state: PhbFixtureState, contextId: string) {
  const found = state.wizard.spellContexts.find((entry) => entry.id === contextId);
  if (!found) {
    throw new Error(`Expected spell context ${contextId} on fixture ${state.id}.`);
  }
  return found;
}

export function findSpellByName(name: string) {
  const found = contentSnapshot.spells.find((entry) => entry.name === name);
  if (!found) {
    throw new Error(`Expected spell ${name} in full content snapshot.`);
  }
  return found;
}

export function buildFighterFixture(): PhbFixtureState {
  let draft = createBaseDraft(
    "fighter",
    "fighter",
    1,
    "dwarf",
    "criminal",
    { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
  );
  draft = withBackgroundAbilityChoices(draft, "str", "con");
  draft = withClassSkillChoices(draft, ["Athletics", "Perception"]);
  draft = withInventory(draft, ["equipment:armor-chain-mail", "equipment:weapon-longsword", "equipment:weapon-longbow"]);
  draft = chooseRuleOptions(draft, "Fighting Style - Fighter", ["Defense"]);
  return resolveFixtureState("fighter", draft);
}

export function buildPaladinFixture(): PhbFixtureState {
  let draft = createBaseDraft(
    "paladin",
    "paladin",
    2,
    "dwarf",
    "criminal",
    { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 16 },
  );
  draft = withBackgroundAbilityChoices(draft, "str", "cha");
  draft = withClassSkillChoices(draft, ["Athletics", "Persuasion"]);
  draft = withInventory(draft, ["equipment:armor-chain-mail", "equipment:weapon-longsword", "equipment:weapon-handaxe"]);
  draft = chooseRuleOptions(draft, "Fighting Style - Paladin", ["Dueling"]);
  draft = chooseRuleOptions(draft, "Weapon Mastery - Paladin", ["Longsword", "Handaxe"]);
  draft = chooseSpellsFromContext(draft, "spell-context:class-prepared-pool", ["Bless", "Shield of Faith", "Cure Wounds"]);
  return resolveFixtureState("paladin", draft);
}

export function buildClericFixture(): PhbFixtureState {
  let draft = createBaseDraft(
    "cleric",
    "cleric",
    1,
    "dwarf",
    "criminal",
    { str: 12, dex: 10, con: 14, int: 8, wis: 16, cha: 10 },
  );
  draft = withBackgroundAbilityChoices(draft, "wis", "con");
  draft = withClassSkillChoices(draft, ["Insight", "Religion"]);
  draft = withInventory(draft, ["equipment:armor-chain-mail", "equipment:weapon-quarterstaff"]);
  draft = chooseRuleOptions(draft, "Divine Order", ["Protector"]);
  draft = chooseSpellsFromContext(draft, "progression:spell-selection:cantrip", ["Guidance", "Resistance", "Light"]);
  draft = chooseSpellsFromContext(draft, "spell-context:class-prepared-pool", ["Bless", "Shield of Faith", "Guidance", "Resistance"]);
  return resolveFixtureState("cleric", draft);
}

export function buildBardFixture(): PhbFixtureState {
  let draft = createBaseDraft(
    "bard",
    "bard",
    1,
    "dwarf",
    "entertainer",
    { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
  );
  draft = withBackgroundAbilityChoices(draft, "cha", "dex");
  draft = withClassSkillChoices(draft, ["Performance", "Persuasion", "Stealth"]);
  draft = withInventory(draft, ["equipment:weapon-rapier"]);
  draft = chooseSpellsFromContext(draft, "progression:spell-selection:cantrip", ["Light", "Mage Hand"]);
  draft = chooseSpellsFromContext(draft, "progression:spell-selection:known", ["Cure Wounds", "Healing Word", "Dissonant Whispers", "Heroism"]);
  return resolveFixtureState("bard", draft);
}

export function buildRogueFixture(): PhbFixtureState {
  let draft = createBaseDraft(
    "rogue",
    "rogue",
    1,
    "elf",
    "criminal",
    { str: 8, dex: 16, con: 12, int: 14, wis: 10, cha: 12 },
  );
  draft = withBackgroundAbilityChoices(draft, "dex", "int");
  draft = withClassSkillChoices(draft, ["Stealth", "Perception", "Acrobatics", "Investigation"]);
  draft = withInventory(draft, ["equipment:weapon-dagger"]);
  draft = chooseRuleOptions(draft, "Thieves' Cant", ["Dwarvish"]);
  draft = chooseRuleOptions(draft, "Weapon Mastery - Rogue", ["Dagger", "Shortsword"]);
  return resolveFixtureState("rogue", draft);
}

export function buildWizardFixture(): PhbFixtureState {
  let draft = createBaseDraft(
    "wizard",
    "wizard",
    1,
    "elf",
    "outlander",
    { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 },
  );
  draft = withBackgroundAbilityChoices(draft, "int", "dex");
  draft = withClassSkillChoices(draft, ["Arcana", "Investigation"]);
  draft = withOriginMagicInitiateChoices(draft, "cleric", "wis");
  draft = withInventory(draft, ["equipment:weapon-quarterstaff"]);
  const magicInitiateId = requireFeat("magic initiate").id;
  draft = chooseSpellsFromContext(draft, "progression:spell-selection:cantrip", ["Fire Bolt", "Light", "Mage Hand"]);
  draft = chooseSpellsFromContext(draft, "spell-context:class-prepared-pool", ["Burning Hands", "Magic Missile", "Shield", "Detect Magic"]);
  draft = chooseSpellsFromContext(draft, `spell-context:${magicInitiateId}:cantrip`, ["Guidance", "Resistance"]);
  draft = chooseSpellsFromContext(draft, `spell-context:${magicInitiateId}:level1`, ["Bless"]);
  return resolveFixtureState("wizard", draft);
}

export function buildBarbarianFixture(): PhbFixtureState {
  let draft = createBaseDraft(
    "barbarian",
    "barbarian",
    1,
    "dwarf",
    "criminal",
    { str: 16, dex: 14, con: 16, int: 8, wis: 10, cha: 8 },
  );
  draft = withBackgroundAbilityChoices(draft, "str", "con");
  draft = withClassSkillChoices(draft, ["Athletics", "Survival"]);
  draft = withInventory(draft, ["equipment:weapon-handaxe"]);
  return resolveFixtureState("barbarian", draft);
}

export function buildRangerFixture(): PhbFixtureState {
  let draft = createBaseDraft(
    "ranger",
    "ranger",
    2,
    "elf",
    "guide",
    { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 8 },
  );
  draft = withBackgroundAbilityChoices(draft, "dex", "wis");
  draft = withClassSkillChoices(draft, ["Perception", "Stealth", "Survival"]);
  draft = withInventory(draft, ["equipment:weapon-longbow", "equipment:weapon-handaxe"]);
  draft = chooseRuleOptions(draft, "Fighting Style - Ranger", ["Archery"]);
  draft = chooseRuleOptions(draft, "Deft Explorer", ["Elvish", "Giant"]);
  draft = chooseRuleOptions(draft, "Weapon Mastery - Ranger", ["Longbow", "Handaxe"]);
  draft = chooseSpellsFromContext(draft, "spell-context:class-prepared-pool", ["Hunter's Mark", "Goodberry", "Cure Wounds"]);
  return resolveFixtureState("ranger", draft);
}

export function buildFocusClassFixtureAtLevel(
  classKey: RulesCoverageFocusClassKey,
  level: RulesCoverageLevel,
): PhbFixtureState {
  const config = RULES_COVERAGE_CONFIG_BY_CLASS[classKey];
  let draft = createBaseDraft(
    `${classKey}-l${level}`,
    config.classKey,
    level,
    config.speciesKey,
    config.backgroundKey,
    config.abilityScores,
  );
  draft = withBackgroundAbilityChoices(draft, config.backgroundAbilityBonus.plusTwo, config.backgroundAbilityBonus.plusOne);
  draft = withClassSkillChoices(draft, config.classSkills);
  draft = withInventory(draft, config.equipmentIds);

  if (level >= 2 && classKey === "paladin") {
    draft = chooseRuleOptionsIfAvailable(draft, "Fighting Style - Paladin", ["Dueling"]);
    draft = chooseRuleOptionsIfAvailable(draft, "Weapon Mastery - Paladin", ["Longsword", "Handaxe"]);
  }
  if (level >= 1 && classKey === "paladin") {
    draft = chooseRuleOptionsIfAvailable(draft, "Weapon Mastery - Paladin", ["Longsword", "Handaxe"]);
  }
  if (level >= 1 && classKey === "ranger") {
    draft = chooseRuleOptionsIfAvailable(draft, "Weapon Mastery - Ranger", ["Longbow", "Handaxe"]);
  }
  if (level >= 2 && classKey === "ranger") {
    draft = chooseRuleOptionsIfAvailable(draft, "Fighting Style - Ranger", ["Archery"]);
    draft = chooseRuleOptionsIfAvailable(draft, "Deft Explorer", ["Elvish", "Giant"]);
  }
  if (level >= 3 && classKey === "barbarian") {
    draft = chooseFirstRuleOptionsIfAvailable(draft, "Primal Knowledge");
  }
  if (level >= 2 && classKey === "wizard") {
    draft = chooseFirstRuleOptionsIfAvailable(draft, "Feature Option - Wizard: Scholar");
  }

  if (level >= 3) {
    draft = withFirstAvailableSubclass(draft);
  }
  draft = withLevelFourAsi(draft, config.levelPrimaryAbility);
  draft = withSpellSelectionsForCoverage(draft, config);
  return resolveFixtureState(`${classKey}-l${level}`, draft);
}

export function buildPaladinFixtureAtLevel(level: RulesCoverageLevel): PhbFixtureState {
  return buildFocusClassFixtureAtLevel("paladin", level);
}

export function buildRangerFixtureAtLevel(level: RulesCoverageLevel): PhbFixtureState {
  return buildFocusClassFixtureAtLevel("ranger", level);
}

export function buildBarbarianFixtureAtLevel(level: RulesCoverageLevel): PhbFixtureState {
  return buildFocusClassFixtureAtLevel("barbarian", level);
}

export function buildBardFixtureAtLevel(level: RulesCoverageLevel): PhbFixtureState {
  return buildFocusClassFixtureAtLevel("bard", level);
}

export function buildMonkFixtureAtLevel(level: RulesCoverageLevel): PhbFixtureState {
  return buildFocusClassFixtureAtLevel("monk", level);
}

export function buildWarlockFixtureAtLevel(level: RulesCoverageLevel): PhbFixtureState {
  return buildFocusClassFixtureAtLevel("warlock", level);
}

export function buildWizardFixtureAtLevel(level: RulesCoverageLevel): PhbFixtureState {
  return buildFocusClassFixtureAtLevel("wizard", level);
}

export function buildRulesCoverageFixturesL1To5(): RulesCoverageFixtureEntry[] {
  const output: RulesCoverageFixtureEntry[] = [];
  for (const classKey of RULES_COVERAGE_FOCUS_CLASS_KEYS) {
    for (const level of [1, 2, 3, 4, 5] as const) {
      output.push({
        classKey,
        level,
        state: buildFocusClassFixtureAtLevel(classKey, level),
      });
    }
  }
  return output;
}

function labelsWithPrefix(state: PhbFixtureState, prefix: string): string[] {
  return state.engine.ruleEngine.choiceSurface.choices
    .filter((entry) => entry.status === "unsupported" && normalizeToken(entry.label).includes(prefix))
    .map((entry) => entry.label);
}

function classifyCoverageForFixture(state: PhbFixtureState, classKey: RulesCoverageFocusClassKey, level: RulesCoverageLevel): CoverageMatrixV2LevelEntry {
  const classFeatures = state.engine.progression.unlockedClassFeatures.map((entry) => entry.name);
  const subclassFeatures = state.engine.progression.unlockedSubclassFeatures.map((entry) => entry.name);
  const testedFeatures = Array.from(new Set([...classFeatures, ...subclassFeatures])).sort((left, right) => left.localeCompare(right));
  const actions = [
    ...state.engine.actionResources.actionSet.actions,
    ...state.engine.actionResources.actionSet.bonusActions,
    ...state.engine.actionResources.actionSet.reactions,
    ...state.engine.actionResources.actionSet.freeActions,
    ...state.engine.actionResources.actionSet.utilityActions,
  ];
  const resources = state.engine.actionResources.resourceSet.resources;
  const unsupportedChoices = state.engine.ruleEngine.choiceSurface.choices
    .filter((entry) => entry.status === "unsupported")
    .map((entry) => entry.label);
  const automated = [
    "Ability scores/modifiers",
    "HP and hit dice",
    "Armor class",
    "Saving throws",
    "Skills",
    "Proficiencies",
    "Weapon attack profiles",
    ...(state.engine.actionResources.resourceSet.spellcasting.available ? ["Spell slot progression"] : []),
    ...(level >= 4 ? ["ASI/Feat progression detection"] : []),
    ...(level >= 5 ? ["Level 5 progression detection"] : []),
  ];
  const partial: string[] = [];
  const manual: string[] = [];
  for (const featureName of testedFeatures) {
    const token = normalizeToken(featureName);
    const hasAction = actions.some((entry) => normalizeToken(entry.name).includes(token) || token.includes(normalizeToken(entry.name)));
    const hasResource = resources.some((entry) => normalizeToken(entry.name).includes(token) || token.includes(normalizeToken(entry.name)));
    const isSpellcasting = token.includes("spellcasting") && state.engine.actionResources.resourceSet.spellcasting.available;
    const isUnsupported = unsupportedChoices.some((entry) => normalizeToken(entry).includes(token));
    if (isUnsupported) {
      continue;
    }
    if (hasAction || hasResource || isSpellcasting) {
      partial.push(featureName);
      continue;
    }
    manual.push(featureName);
  }
  const openKnownGaps = Array.from(new Set([
    ...unsupportedChoices,
    ...(level >= 5 && classKey === "paladin" && !testedFeatures.some((entry) => /extra attack/i.test(entry))
      ? ["Extra Attack is not present in current local Paladin class feature data (L5)."]
      : []),
    ...(level >= 5 && classKey === "ranger" && !testedFeatures.some((entry) => /extra attack/i.test(entry))
      ? ["Extra Attack is not present in current local Ranger class feature data (L5)."]
      : []),
    ...(level >= 5 && classKey === "monk" && !testedFeatures.some((entry) => /extra attack/i.test(entry))
      ? ["Extra Attack is not present in current local Monk class feature data (L5)."]
      : []),
    ...(classKey === "barbarian" ? ["Rage damage bonus is not auto-injected into every damage roll path."] : []),
    ...(classKey === "warlock" && labelsWithPrefix(state, "feature option - warlock: eldritch invocations").length > 0
      ? ["Eldritch Invocation option resolution remains partially unsupported in canonical choices."]
      : []),
  ]));
  return {
    classKey,
    level,
    testedFeatures,
    automated,
    partial: Array.from(new Set(partial)).sort((left, right) => left.localeCompare(right)),
    manual: Array.from(new Set(manual)).sort((left, right) => left.localeCompare(right)),
    unsupported: Array.from(new Set(unsupportedChoices)).sort((left, right) => left.localeCompare(right)),
    openKnownGaps,
  };
}

export function buildCoverageMatrixV2(fixtures: RulesCoverageFixtureEntry[] = buildRulesCoverageFixturesL1To5()): CoverageMatrixV2 {
  const entries = fixtures.map((entry) => classifyCoverageForFixture(entry.state, entry.classKey, entry.level));
  const knownGaps: CoverageMatrixGapEntry[] = [];
  for (const entry of entries) {
    for (const gap of entry.openKnownGaps) {
      knownGaps.push({
        id: `${entry.classKey}:l${entry.level}:${knownGaps.length}`,
        scope: `${entry.classKey.toUpperCase()} L${entry.level}`,
        reason: gap,
      });
    }
  }
  return {
    entries,
    knownGaps,
  };
}
