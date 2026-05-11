import type { CharacterDraft, FeatureChoice } from "../../domain/character";
import type { CanonicalRuleChoice } from "../../domain/rules";
import type { CharacterWizardState } from "../../services/characterEngine";
import type { WeaponAttackProfile } from "../../services/rules";
import type { HitDicePool } from "../../domain/playState";
import { createCharacterDraft } from "../../domain/defaults";
import { resolveCharacterEngineState, resolveCharacterWizardState, type CharacterEngineState } from "../../services/characterEngine";
import { contentSnapshot } from "../../services/data/content";
import { resolveBackgrounds, resolveClasses, resolveEquipment, resolveFeats, resolveSpecies } from "../../services/data/rulesModeResolver";
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
