import { describe, expect, it } from "vitest";
import { buildCombatViewModel } from "../features/character/viewModels";
import { contentSnapshot } from "../services/data/content";
import {
  addActiveEffectFromSpell,
  addResolvedActiveEffect,
  buildPlayStateRuntimeContext,
  castSpell,
  rollAndRecord,
} from "../services/playState";
import { buildActiveEffectCatalog } from "../services/rules";
import {
  allWeaponChoiceOptionsResolveToWeapons,
  buildBarbarianFixture,
  buildBardFixture,
  buildClericFixture,
  buildFighterFixture,
  buildPaladinFixture,
  buildRangerFixture,
  buildRogueFixture,
  buildWizardFixture,
  findRuleChoice,
  findSpellByName,
  findSpellContext,
  findWeaponProfile,
  PHB_GOLDEN_COVERAGE_MATRIX,
} from "./support/phbGoldenFixtures";

function containsToken(values: string[], token: string): boolean {
  return values.some((entry) => entry.toLowerCase() === token.toLowerCase());
}

function rngFrom(values: number[]) {
  let index = 0;
  return () => {
    const next = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return next;
  };
}

describe("PHB golden character fixtures v1", () => {
  it("keeps fighter core stats, defense style, hit dice, and versatile weapon output stable", () => {
    const state = buildFighterFixture();
    const longsword = findWeaponProfile(state, "Longsword");
    const longbow = findWeaponProfile(state, "Longbow");
    const fightingStyle = findRuleChoice(state, "Fighting Style - Fighter");

    expect(state.engine.derivedStats.abilityScores.str.finalScore).toBe(18);
    expect(state.engine.derivedStats.abilityScores.con.finalScore).toBe(15);
    expect(state.engine.derivedStats.hitPoints.max).toBe(12);
    expect(state.hitDicePools).toEqual([expect.objectContaining({ die: 10, max: 1, sourceClassName: "Fighter" })]);
    expect(state.engine.derivedStats.armorClass.value).toBe(17);
    expect(state.engine.derivedStats.savingThrows.str.total).toBe(6);
    expect(state.engine.derivedStats.savingThrows.con.total).toBe(4);
    expect(state.engine.derivedStats.skills.athletics.total).toBe(6);
    expect(state.engine.derivedStats.skills.perception.total).toBe(2);
    expect(state.proficiencies.weapons).toEqual(expect.arrayContaining(["Martial weapons", "Simple weapons"]));
    expect(state.proficiencies.armor).toEqual(expect.arrayContaining(["All armor", "Shields"]));
    expect(fightingStyle.status).toBe("complete");
    expect(longsword.attackBonus).toBe(6);
    expect(longsword.damageModifier).toBe(4);
    expect(longsword.versatileDamageDice).toBe("1d10");
    expect(longbow.attackAbility).toBe("dex");
    expect(longbow.attackBonus).toBe(3);
    expect(state.engine.actionResources.resourceSet.resources.some((entry) => entry.name === "Second Wind" && entry.usesMax === 2)).toBe(true);
  });

  it("keeps paladin fighting style, mastery, spells, and self-only Shield of Faith behavior stable", () => {
    const state = buildPaladinFixture();
    const longsword = findWeaponProfile(state, "Longsword");
    const masteryChoice = findRuleChoice(state, "Weapon Mastery - Paladin");
    const shieldOfFaith = state.engine.selectedSpells.find((entry) => entry.name === "Shield of Faith");

    expect(state.engine.derivedStats.abilityScores.str.finalScore).toBe(18);
    expect(state.engine.derivedStats.abilityScores.cha.finalScore).toBe(17);
    expect(state.engine.derivedStats.hitPoints.max).toBe(20);
    expect(state.hitDicePools).toEqual([expect.objectContaining({ die: 10, max: 2, sourceClassName: "Paladin" })]);
    expect(state.engine.derivedStats.armorClass.value).toBe(16);
    expect(state.engine.derivedStats.savingThrows.str.total).toBe(4);
    expect(state.engine.derivedStats.savingThrows.cha.total).toBe(5);
    expect(state.engine.derivedStats.spellcasting.spellAttackModifier).toBe(5);
    expect(state.engine.derivedStats.spellcasting.spellSaveDC).toBe(13);
    expect(state.engine.selectedSpells.map((entry) => entry.name)).toEqual(expect.arrayContaining(["Bless", "Shield of Faith", "Cure Wounds"]));
    expect(masteryChoice.requiredCount).toBe(2);
    expect(masteryChoice.status).toBe("complete");
    expect(allWeaponChoiceOptionsResolveToWeapons(masteryChoice)).toBe(true);
    expect(longsword.attackBonus).toBe(6);
    expect(longsword.damageModifier).toBe(6);
    expect(longsword.breakdown.damage).toContain("Paladin: Fighting Style +2");
    expect(longsword.masteryBadges).toContain("Mastery selected");
    expect(state.engine.ruleEngine.modifiers.some((entry) => entry.sourceName === "Shield of Faith" && entry.target === "armor-class")).toBe(false);
    expect(shieldOfFaith).toBeDefined();
    if (!shieldOfFaith) {
      return;
    }

    const runtime = buildPlayStateRuntimeContext(state.engine);
    const playState = castSpell(
      state.draft.playState,
      runtime,
      shieldOfFaith,
      {
        activeEffectTarget: "self",
      },
      "2026-05-11T10:00:00.000Z",
    );
    const combat = buildCombatViewModel({
      draft: state.draft,
      engine: state.engine,
      playState,
      maxHp: state.engine.derivedStats.hitPoints.max,
      hitDicePools: state.hitDicePools,
    });

    expect(combat.armorClass.total).toBe(18);
    expect(combat.armorClass.modifierSources).toContain("Shield of Faith +2");
  });

  it("keeps cleric divine order, spellcasting, prepared cantrip pool, and PHB roll-bonus spells stable", () => {
    const state = buildClericFixture();
    const divineOrder = findRuleChoice(state, "Divine Order");
    const catalog = buildActiveEffectCatalog(contentSnapshot);

    expect(state.engine.derivedStats.abilityScores.wis.finalScore).toBe(18);
    expect(state.engine.derivedStats.abilityScores.con.finalScore).toBe(15);
    expect(state.engine.derivedStats.hitPoints.max).toBe(10);
    expect(state.hitDicePools).toEqual([expect.objectContaining({ die: 8, max: 1, sourceClassName: "Cleric" })]);
    expect(state.engine.derivedStats.armorClass.value).toBe(16);
    expect(state.engine.derivedStats.savingThrows.wis.total).toBe(6);
    expect(state.engine.derivedStats.savingThrows.cha.total).toBe(2);
    expect(state.engine.derivedStats.skills.insight.total).toBe(6);
    expect(state.engine.derivedStats.spellcasting.spellAttackModifier).toBe(6);
    expect(state.engine.derivedStats.spellcasting.spellSaveDC).toBe(14);
    expect(divineOrder.status).toBe("complete");
    expect(state.proficiencies.weapons).toEqual(expect.arrayContaining(["martial weapons", "Simple weapons"]));
    expect(state.proficiencies.armor).toEqual(expect.arrayContaining(["heavy armor", "Light armor", "Medium armor", "Shields"]));
    expect(state.engine.selectedSpells.map((entry) => entry.name)).toEqual(expect.arrayContaining(["Guidance", "Resistance", "Light", "Bless", "Shield of Faith"]));
    expect(catalog.some((entry) => entry.sourceName === "Bless" && entry.effectType === "roll-bonus")).toBe(true);
    expect(catalog.some((entry) => entry.sourceName === "Guidance" && entry.effectType === "roll-bonus")).toBe(true);
    expect(catalog.some((entry) => entry.sourceName === "Resistance" && entry.effectType === "roll-bonus")).toBe(true);
  });

  it("keeps bard class-skill any-skill resolution, Bardic Inspiration resources, and rapier proficiency stable", () => {
    const state = buildBardFixture();
    const rapier = findWeaponProfile(state, "Rapier");

    expect(state.engine.derivedStats.abilityScores.cha.finalScore).toBe(18);
    expect(state.engine.derivedStats.abilityScores.dex.finalScore).toBe(15);
    expect(state.engine.derivedStats.hitPoints.max).toBe(9);
    expect(state.hitDicePools).toEqual([expect.objectContaining({ die: 8, max: 1, sourceClassName: "Bard" })]);
    expect(state.engine.derivedStats.armorClass.value).toBe(12);
    expect(state.engine.derivedStats.savingThrows.dex.total).toBe(4);
    expect(state.engine.derivedStats.savingThrows.cha.total).toBe(6);
    expect(state.engine.derivedStats.skills.performance.total).toBe(6);
    expect(state.engine.derivedStats.skills.persuasion.total).toBe(6);
    expect(state.engine.derivedStats.skills.stealth.total).toBe(4);
    expect(state.wizard.skillChoiceStates[0]?.dataStatus).toBe("complete");
    expect(state.wizard.skillChoiceStates[0]?.selectedOptions).toEqual(["Performance", "Persuasion", "Stealth"]);
    expect(state.engine.derivedStats.spellcasting.spellAttackModifier).toBe(6);
    expect(state.engine.derivedStats.spellcasting.spellSaveDC).toBe(14);
    expect(state.engine.actionResources.resourceSet.resources.some((entry) => entry.name === "Bardic Inspiration" && entry.usesMax === 4)).toBe(true);
    expect(state.engine.actionResources.actionSet.bonusActions.some((entry) => entry.name.includes("Bardic Inspiration"))).toBe(true);
    expect(rapier.proficiencyApplied).toBe(true);
    expect(rapier.attackBonus).toBe(4);
  });

  it("keeps rogue language/tool/mastery paths and dagger attack profile stable", () => {
    const state = buildRogueFixture();
    const dagger = findWeaponProfile(state, "Dagger");
    const thievesCant = findRuleChoice(state, "Thieves' Cant");
    const masteryChoice = findRuleChoice(state, "Weapon Mastery - Rogue");

    expect(state.engine.derivedStats.abilityScores.dex.finalScore).toBe(18);
    expect(state.engine.derivedStats.abilityScores.int.finalScore).toBe(15);
    expect(state.hitDicePools).toEqual([expect.objectContaining({ die: 8, max: 1, sourceClassName: "Rogue" })]);
    expect(state.engine.derivedStats.savingThrows.dex.total).toBe(6);
    expect(state.engine.derivedStats.savingThrows.int.total).toBe(4);
    expect(state.engine.derivedStats.skills.stealth.total).toBe(6);
    expect(state.engine.derivedStats.skills.investigation.total).toBe(4);
    expect(containsToken(state.proficiencies.languages, "Dwarvish")).toBe(true);
    expect(state.proficiencies.languages.some((entry) => entry.includes("Thieves' Cant"))).toBe(true);
    expect(state.proficiencies.tools.some((entry) => entry.toLowerCase().includes("thieves' tools") || entry.toLowerCase().includes("thieves' tools"))).toBe(true);
    expect(thievesCant.status).toBe("complete");
    expect(masteryChoice.requiredCount).toBe(2);
    expect(masteryChoice.status).toBe("complete");
    expect(allWeaponChoiceOptionsResolveToWeapons(masteryChoice)).toBe(true);
    expect(dagger.proficiencyApplied).toBe(true);
    expect(dagger.attackBonus).toBe(6);
    expect(dagger.masteryBadges).toContain("Mastery selected");
  });

  it("keeps wizard class spellcasting and Magic Initiate cleric filtering stable", () => {
    const state = buildWizardFixture();
    const magicInitiate = state.engine.selectedFeats.find((entry) => entry.key === "magic initiate");

    expect(state.engine.derivedStats.abilityScores.int.finalScore).toBe(18);
    expect(state.engine.derivedStats.abilityScores.dex.finalScore).toBe(15);
    expect(state.engine.derivedStats.hitPoints.max).toBe(7);
    expect(state.hitDicePools).toEqual([expect.objectContaining({ die: 6, max: 1, sourceClassName: "Wizard" })]);
    expect(state.engine.derivedStats.spellcasting.spellAttackModifier).toBe(6);
    expect(state.engine.derivedStats.spellcasting.spellSaveDC).toBe(14);
    expect(state.engine.actionResources.resourceSet.resources.some((entry) => entry.name === "Arcane Recovery" && entry.usesMax === 1)).toBe(true);
    expect(state.wizard.featContexts.find((entry) => entry.id === "feat-choice:origin")?.satisfied).toBe(true);
    expect(magicInitiate).toBeDefined();
    if (!magicInitiate) {
      return;
    }

    const featCantrips = findSpellContext(state, `spell-context:${magicInitiate.id}:cantrip`);
    const featLeveled = findSpellContext(state, `spell-context:${magicInitiate.id}:level1`);
    expect(featCantrips.eligibleSpells.every((entry) => entry.classes.includes("cleric"))).toBe(true);
    expect(featLeveled.eligibleSpells.every((entry) => entry.classes.includes("cleric"))).toBe(true);
    expect(featCantrips.selectedSpellNames).toEqual(["Guidance", "Resistance"]);
    expect(featLeveled.selectedSpellNames).toEqual(["Bless"]);
    expect(state.engine.selectedSpells.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(["Fire Bolt", "Mage Hand", "Light", "Burning Hands", "Magic Missile", "Shield", "Detect Magic", "Guidance", "Resistance", "Bless"]),
    );
  });

  it("documents the current barbarian actual-content gap while keeping rage, hit dice, and attack stats stable", () => {
    const state = buildBarbarianFixture();
    const handaxe = findWeaponProfile(state, "Handaxe");

    expect(state.engine.derivedStats.abilityScores.str.finalScore).toBe(18);
    expect(state.engine.derivedStats.abilityScores.con.finalScore).toBe(17);
    expect(state.engine.derivedStats.hitPoints.max).toBe(15);
    expect(state.hitDicePools).toEqual([expect.objectContaining({ die: 12, max: 1, sourceClassName: "Barbarian" })]);
    expect(state.engine.derivedStats.savingThrows.str.total).toBe(6);
    expect(state.engine.derivedStats.savingThrows.con.total).toBe(5);
    expect(state.engine.derivedStats.skills.athletics.total).toBe(6);
    expect(state.engine.derivedStats.skills.survival.total).toBe(2);
    expect(state.engine.actionResources.resourceSet.resources.some((entry) => entry.name === "Rage" && entry.usesMax === 2)).toBe(true);
    expect(handaxe.proficiencyApplied).toBe(true);
    expect(handaxe.attackBonus).toBe(6);
    expect(state.engine.derivedStats.armorClass.value).toBe(12);
    expect(PHB_GOLDEN_COVERAGE_MATRIX.knownGaps.some((entry) => entry.id === "barbarian-unarmored-defense-actual-content")).toBe(true);
  });

  it("keeps ranger archery, deft explorer languages, mastery selection, and longbow attack math stable", () => {
    const state = buildRangerFixture();
    const longbow = findWeaponProfile(state, "Longbow");
    const masteryChoice = findRuleChoice(state, "Weapon Mastery - Ranger");
    const languageChoice = findRuleChoice(state, "Deft Explorer");

    expect(state.engine.derivedStats.abilityScores.dex.finalScore).toBe(18);
    expect(state.engine.derivedStats.abilityScores.wis.finalScore).toBe(15);
    expect(state.engine.derivedStats.hitPoints.max).toBe(18);
    expect(state.hitDicePools).toEqual([expect.objectContaining({ die: 10, max: 2, sourceClassName: "Ranger" })]);
    expect(state.engine.derivedStats.armorClass.value).toBe(14);
    expect(state.engine.derivedStats.skills.perception.total).toBe(4);
    expect(state.engine.derivedStats.skills.stealth.total).toBe(6);
    expect(state.engine.derivedStats.spellcasting.spellAttackModifier).toBe(4);
    expect(state.engine.derivedStats.spellcasting.spellSaveDC).toBe(12);
    expect(state.proficiencies.languages).toEqual(expect.arrayContaining(["Elvish", "Giant"]));
    expect(languageChoice.status).toBe("complete");
    expect(masteryChoice.requiredCount).toBe(2);
    expect(masteryChoice.status).toBe("complete");
    expect(allWeaponChoiceOptionsResolveToWeapons(masteryChoice)).toBe(true);
    expect(longbow.proficiencyApplied).toBe(true);
    expect(longbow.attackAbility).toBe("dex");
    expect(longbow.attackBonus).toBe(8);
    expect(longbow.damageModifier).toBe(4);
    expect(longbow.breakdown.attack).toContain("Ranger: Fighting Style +2");
    expect(state.engine.selectedSpells.map((entry) => entry.name)).toEqual(expect.arrayContaining(["Hunter's Mark", "Goodberry", "Cure Wounds"]));
  });

  it("keeps PHB external buffs and optional roll application working on real fixture paths", () => {
    const fighter = buildFighterFixture();
    const paladin = buildPaladinFixture();
    const bard = buildBardFixture();
    const catalog = buildActiveEffectCatalog(contentSnapshot);
    const bless = findSpellByName("Bless");
    const guidance = findSpellByName("Guidance");
    const shieldOfFaith = paladin.engine.selectedSpells.find((entry) => entry.name === "Shield of Faith");
    const bardic = catalog.find((entry) => entry.sourceName === "Bardic Inspiration");

    expect(catalog.some((entry) => entry.sourceName === "Bless" && entry.effectType === "roll-bonus")).toBe(true);
    expect(catalog.some((entry) => entry.sourceName === "Guidance" && entry.effectType === "roll-bonus")).toBe(true);
    expect(catalog.some((entry) => entry.sourceName === "Resistance" && entry.effectType === "roll-bonus")).toBe(true);
    expect(bardic).toBeDefined();
    expect(shieldOfFaith).toBeDefined();
    if (!bardic || !shieldOfFaith) {
      return;
    }

    const afterBless = addActiveEffectFromSpell(fighter.draft.playState, bless, {
      target: "self",
      external: true,
      now: "2026-05-11T11:00:00.000Z",
    });
    const afterGuidance = addActiveEffectFromSpell(afterBless, guidance, {
      target: "self",
      external: true,
      now: "2026-05-11T11:01:00.000Z",
    });
    expect(afterGuidance.activeEffects.some((entry) => entry.sourceName === "Bless" && entry.status === "active")).toBe(true);
    expect(afterGuidance.activeEffects.some((entry) => entry.sourceName === "Guidance" && entry.status === "active")).toBe(true);

    const activatedBardic = addResolvedActiveEffect(bard.draft.playState, bardic.effect, {
      target: "self",
      external: true,
      diceExpression: "1d8",
      sourceCasterName: "Lyra",
      now: "2026-05-11T11:02:00.000Z",
    });
    const activeBardic = activatedBardic.activeEffects.find((entry) => entry.sourceName === "Bardic Inspiration" && entry.status === "active");
    expect(activeBardic?.modifierSummary?.dice).toBe("1d8");
    if (!activeBardic) {
      return;
    }

    const runtime = buildPlayStateRuntimeContext(bard.engine);
    const withoutSelection = rollAndRecord(
      activatedBardic,
      runtime,
      {
        id: "roll:bardic:none",
        type: "saving-throw",
        label: "Wis Save",
        modifier: bard.engine.derivedStats.savingThrows.wis.total,
        diceExpression: "1d20",
        rollMode: "normal",
      },
      { rng: rngFrom([0.45]), now: "2026-05-11T11:03:00.000Z" },
    );
    expect(withoutSelection.result.bonusDice).toEqual([]);
    expect(withoutSelection.playState.activeEffects.find((entry) => entry.id === activeBardic.id)?.status).toBe("active");

    const withSelection = rollAndRecord(
      activatedBardic,
      runtime,
      {
        id: "roll:bardic:selected",
        type: "saving-throw",
        label: "Wis Save",
        modifier: bard.engine.derivedStats.savingThrows.wis.total,
        diceExpression: "1d20",
        rollMode: "normal",
        temporaryModifiers: activeBardic.modifiers,
        selectedActiveEffectIds: [activeBardic.id],
        selectedActiveEffects: [{ id: activeBardic.id, label: activeBardic.label, sourceName: activeBardic.sourceName }],
      },
      { rng: rngFrom([0.45, 0.5]), now: "2026-05-11T11:04:00.000Z" },
    );
    expect(withSelection.result.bonusDice?.[0]?.expression).toBe("1d8");
    expect(withSelection.result.bonusDice?.[0]?.sourceName).toContain("Lyra");
    expect(withSelection.playState.activeEffects.find((entry) => entry.id === activeBardic.id)?.status).toBe("dismissed");
    expect(String(withSelection.playState.playEvents.find((entry) => entry.type === "roll")?.payload.summary)).toContain("Bardic Inspiration");

    const selfShield = castSpell(
      paladin.draft.playState,
      buildPlayStateRuntimeContext(paladin.engine),
      shieldOfFaith,
      {
        activeEffectTarget: "self",
      },
      "2026-05-11T11:05:00.000Z",
    );
    const combat = buildCombatViewModel({
      draft: paladin.draft,
      engine: paladin.engine,
      playState: selfShield,
      maxHp: paladin.engine.derivedStats.hitPoints.max,
      hitDicePools: paladin.hitDicePools,
    });
    expect(combat.armorClass.total).toBe(18);
    expect(combat.armorClass.modifierSources).toContain("Shield of Faith +2");
  });
});
