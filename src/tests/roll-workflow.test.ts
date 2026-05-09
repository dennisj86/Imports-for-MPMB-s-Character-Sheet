import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CharacterActionResourceState } from "../domain/actionResources";
import { createCharacterDraft } from "../domain/defaults";
import type { AbilityKey, DerivedCharacterStats, SkillKey } from "../domain/derivedStats";
import type { CharacterPlayEvent } from "../domain/playState";
import type { RollRequest } from "../domain/rolls";
import type { CharacterEngineState } from "../services/characterEngine";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";
import { createPlayEvent, rollAndRecord, type PlayStateRuntimeContext } from "../services/playState";
import {
  buildAbilityCheckRequests,
  buildCharacterRollView,
  buildSavingThrowRequests,
  buildSkillCheckRequests,
  executeRollRequest,
  getLatestRollResult,
} from "../services/rolls";

const abilityKeys: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

function rngFrom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? 0;
    index += 1;
    return value;
  };
}

function rollRequest(overrides: Partial<RollRequest> = {}): RollRequest {
  return {
    id: "roll:test",
    type: "ability-check",
    label: "Test Roll",
    modifier: 3,
    diceExpression: "1d20",
    rollMode: "normal",
    ...overrides,
  };
}

function createDerivedStats(): DerivedCharacterStats {
  const abilityScores = Object.fromEntries(
    abilityKeys.map((ability, index) => [
      ability,
      {
        ability,
        baseScore: 10 + index,
        appliedBonus: 0,
        finalScore: 10 + index,
        modifier: index - 1,
        notes: [],
      },
    ]),
  ) as unknown as DerivedCharacterStats["abilityScores"];
  return {
    abilityScores,
    proficiencyBonus: 2,
    savingThrows: Object.fromEntries(
      abilityKeys.map((ability, index) => [
        ability,
        {
          ability,
          proficient: ability === "dex",
          abilityModifier: index - 1,
          proficiencyBonus: ability === "dex" ? 2 : 0,
          total: index - 1 + (ability === "dex" ? 2 : 0),
        },
      ]),
    ) as DerivedCharacterStats["savingThrows"],
    skills: {
      stealth: {
        key: "stealth",
        label: "Stealth",
        ability: "dex",
        proficient: true,
        expertise: true,
        abilityModifier: 2,
        proficiencyBonus: 2,
        total: 6,
      },
      athletics: {
        key: "athletics",
        label: "Athletics",
        ability: "str",
        proficient: false,
        expertise: false,
        abilityModifier: -1,
        proficiencyBonus: 0,
        total: -1,
      },
    } as Record<SkillKey, DerivedCharacterStats["skills"][SkillKey]>,
    passivePerception: 10,
    passiveInvestigation: 10,
    passiveInsight: 10,
    initiative: 2,
    speed: { walking: 30, notes: [], dataStatus: "complete" },
    armorClass: { value: 15, calculation: "unarmored", dexApplied: 2, notes: [], dataStatus: "complete" },
    hitPoints: { max: 12, formula: "fixed", mode: "fixed-average", notes: [], dataStatus: "complete" },
    spellcasting: {
      available: true,
      ability: "cha",
      abilityModifier: 3,
      proficiencyBonus: 2,
      spellSaveDC: 13,
      spellAttackModifier: 5,
      preparationBasis: { mode: "known", notes: [] },
      slotBasis: { mode: "none", notes: [] },
      notes: [],
      dataStatus: "complete",
    },
    notes: [],
    pending: [],
    dataStatus: "complete",
  };
}

function createActionResources(): CharacterActionResourceState {
  return {
    provider: "mpmb",
    rulesMode: "2024",
    level: 1,
    actionSet: {
      actions: [
        {
          id: "action:item-weapon:rapier",
          name: "Rapier Attack",
          activationType: "action",
          source: { sourceType: "item", sourceId: "equipment:rapier", sourceName: "Rapier" },
          sourceType: "item",
          sourceId: "equipment:rapier",
          description: "Hit: 1d8 + 3 piercing damage.",
          requiresResourceIds: [],
          prerequisites: [],
          notes: [],
          dataStatus: "partial",
        },
        {
          id: "action:item-weapon:club",
          name: "Club Attack",
          activationType: "action",
          source: { sourceType: "item", sourceId: "equipment:club", sourceName: "Club" },
          sourceType: "item",
          sourceId: "equipment:club",
          description: "Weapon attack baseline.",
          requiresResourceIds: [],
          prerequisites: [],
          notes: [],
          dataStatus: "partial",
        },
        {
          id: "action:feature:second-wind",
          name: "Second Wind",
          activationType: "bonus-action",
          source: { sourceType: "class", sourceId: "class:fighter", sourceName: "Fighter" },
          sourceType: "class",
          sourceId: "class:fighter",
          requiresResourceIds: ["resource:feature:second-wind"],
          prerequisites: [],
          notes: [],
          dataStatus: "complete",
        },
      ],
      bonusActions: [],
      reactions: [],
      freeActions: [],
      utilityActions: [],
    },
    resourceSet: {
      resources: [
        {
          id: "resource:feature:second-wind",
          name: "Second Wind",
          sourceType: "class",
          sourceId: "class:fighter",
          usesMax: 1,
          recharge: { type: "short-rest", label: "Short Rest", notes: [] },
          notes: [],
          dataStatus: "complete",
        },
      ],
      limitedUseFeatures: [],
      spellcasting: {
        available: true,
        spellSaveDC: 13,
        spellAttackModifier: 5,
        slotResources: [],
        cantripActions: [],
        spellActions: [],
        notes: [],
        dataStatus: "complete",
      },
    },
    pending: [],
    notes: [],
    dataStatus: "complete",
  };
}

function createEngine(): CharacterEngineState {
  return {
    derivedStats: createDerivedStats(),
    actionResources: createActionResources(),
    selectedSpells: [
      {
        id: "spell:fire-bolt",
        key: "fire bolt",
        name: "Fire Bolt",
        sourceRefs: [],
        level: 0,
        concentration: false,
        ritual: false,
        classes: ["wizard"],
        description: "Make a ranged spell attack. Hit: 1d10 fire damage.",
      },
      {
        id: "spell:burning-hands",
        key: "burning hands",
        name: "Burning Hands",
        sourceRefs: [],
        level: 1,
        concentration: false,
        ritual: false,
        classes: ["wizard"],
        description: "Each creature makes a Dexterity saving throw. It takes 3d6 fire damage on a failed save.",
      },
    ],
  } as unknown as CharacterEngineState;
}

function createRuntime(): PlayStateRuntimeContext {
  return {
    maxHp: 12,
    constitutionModifier: 1,
    hitDicePools: [
      {
        id: "hit-dice:roll-class:d8",
        die: 8,
        sourceClassId: "roll-class",
        sourceClassName: "Roll Class",
        max: 1,
        remaining: 1,
        spent: 0,
        label: "Roll Class d8",
      },
    ],
    resourceMaxByKey: { "resource:feature:second-wind": 1 },
    resourceRechargeByKey: { "resource:feature:second-wind": "short-rest" },
    resourceNameByKey: { "resource:feature:second-wind": "Second Wind" },
    spellSlotMaxByKey: { "1": 2 },
    spellSlotRechargeByKey: { "1": "long-rest" },
    restPlan: {
      shortRest: { resourceKeys: ["resource:feature:second-wind"], spellSlotKeys: [], skipped: [], notes: [] },
      longRest: { resourceKeys: ["resource:feature:second-wind"], spellSlotKeys: ["1"], skipped: [], notes: [] },
    },
  };
}

describe("action roll workflow v1", () => {
  it("executes normal, advantage, and disadvantage d20 rolls with modifiers", () => {
    const normal = executeRollRequest(rollRequest({ modifier: 4 }), { rng: rngFrom([0.45]), now: "2026-05-08T00:00:00.000Z" });
    expect(normal.dice.rawRolls).toEqual([10]);
    expect(normal.total).toBe(14);
    expect(normal.timestamp).toBe("2026-05-08T00:00:00.000Z");

    const advantage = executeRollRequest(rollRequest({ rollMode: "advantage", modifier: 1 }), { rng: rngFrom([0.05, 0.95]) });
    expect(advantage.dice.rawRolls).toEqual([2, 20]);
    expect(advantage.dice.keptRoll).toBe(20);
    expect(advantage.total).toBe(21);

    const disadvantage = executeRollRequest(rollRequest({ rollMode: "disadvantage", modifier: 1 }), { rng: rngFrom([0.05, 0.95]) });
    expect(disadvantage.dice.rawRolls).toEqual([2, 20]);
    expect(disadvantage.dice.keptRoll).toBe(2);
    expect(disadvantage.total).toBe(3);
  });

  it("marks natural 20 and natural 1 on attack rolls", () => {
    const natural20 = executeRollRequest(rollRequest({ type: "attack-roll", modifier: 5 }), { rng: rngFrom([0.99]) });
    expect(natural20.naturalRoll).toBe(20);
    expect(natural20.outcomeLabel).toBe("natural-20");

    const natural1 = executeRollRequest(rollRequest({ type: "spell-attack", modifier: 5 }), { rng: rngFrom([0]) });
    expect(natural1.naturalRoll).toBe(1);
    expect(natural1.outcomeLabel).toBe("natural-1");
  });

  it("builds ability, save, and skill requests from derived stats", () => {
    const derived = createDerivedStats();
    const abilities = buildAbilityCheckRequests(derived);
    const saves = buildSavingThrowRequests(derived);
    const skills = buildSkillCheckRequests(derived);

    expect(abilities.find((entry) => entry.ability === "str")?.modifier).toBe(-1);
    expect(saves.find((entry) => entry.ability === "dex")?.modifier).toBe(2);
    const stealth = skills.find((entry) => entry.skill === "stealth");
    expect(stealth?.modifier).toBe(6);
    expect(stealth?.proficiencyApplied).toBe(true);
    expect(stealth?.metadata?.expertise).toBe(true);
  });

  it("builds attack and spell roll actions from engine outputs without requiring target automation", () => {
    const view = buildCharacterRollView(createEngine());
    const rapier = view.actionRolls.find((entry) => entry.id === "action:item-weapon:rapier");
    expect(rapier?.rollRequest?.modifier).toBe(2);
    expect(rapier?.damageRequest?.diceExpression).toBe("1d8+3");

    const club = view.actionRolls.find((entry) => entry.id === "action:item-weapon:club");
    expect(club?.rollRequest).toBeDefined();
    expect(club?.damageRequest).toBeUndefined();

    const fireBolt = view.spellRolls.find((entry) => entry.id === "spell-roll:spell:fire-bolt");
    expect(fireBolt?.rollRequest?.modifier).toBe(5);
    expect(fireBolt?.damageRequest?.diceExpression).toBe("1d10");

    const burningHands = view.spellRolls.find((entry) => entry.id === "spell-roll:spell:burning-hands");
    expect(burningHands?.spellSaveDc).toBe(13);
    expect(burningHands?.spellSaveAbility).toBe("dex");
    expect(burningHands?.damageRequest?.diceExpression).toBe("3d6");
    expect(burningHands?.rollRequest).toBeUndefined();
  });

  it("records roll events in playEvents and keeps spell slot state unchanged", () => {
    const character = createCharacterDraft("roll-character", "Roll Character");
    character.playState.spellSlots = { "1": 1 };
    const request = rollRequest({ type: "spell-attack", label: "Fire Bolt Spell Attack", modifier: 5 });
    const { playState, result } = rollAndRecord(character.playState, createRuntime(), request, {
      rng: rngFrom([0.5]),
      now: "2026-05-08T00:01:00.000Z",
    });
    expect(result.total).toBe(16);
    expect(playState.spellSlots["1"]).toBe(1);
    expect(playState.playEvents.at(-1)?.type).toBe("roll");
    expect(getLatestRollResult(playState.playEvents)?.total).toBe(16);
  });

  it("persists roll events and still loads old drafts without them", () => {
    const character = createCharacterDraft("persist-roll", "Persist Roll");
    const next = rollAndRecord(character.playState, createRuntime(), rollRequest(), {
      rng: rngFrom([0.5]),
      now: "2026-05-08T00:02:00.000Z",
    }).playState;
    character.playState = next;
    const [loaded] = deserializeCharacters(serializeCharacters([character]));
    expect(loaded?.playState.playEvents.at(-1)?.type).toBe("roll");
    expect(getLatestRollResult(loaded?.playState.playEvents ?? [])?.total).toBe(14);

    const legacyPayload = JSON.stringify({
      version: 1,
      characters: [
        {
          id: "legacy-no-rolls",
          version: 1,
          name: "Legacy No Rolls",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
          abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          classSelection: { level: 1 },
          subclassSelection: {},
          speciesSelection: {},
          backgroundSelection: {},
          featIds: [],
          spellSelection: { selectedSpellIds: [] },
          featureChoices: [],
          inventory: { items: [] },
        },
      ],
    });
    expect(deserializeCharacters(legacyPayload)[0]?.playState.playEvents).toEqual([]);
  });

  it("keeps the bounded play log capped when adding roll events", () => {
    const character = createCharacterDraft("bounded-rolls", "Bounded Rolls");
    const oldEvents: CharacterPlayEvent[] = Array.from({ length: 205 }, (_, index) =>
      createPlayEvent({
        id: `old-${index}`,
        timestamp: `2026-05-08T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
        type: "hp-set",
        shortLabel: `Old ${index}`,
        payload: { index },
      }),
    );
    character.playState.playEvents = oldEvents;
    const next = rollAndRecord(character.playState, createRuntime(), rollRequest(), { rng: rngFrom([0.5]) }).playState;
    expect(next.playEvents).toHaveLength(200);
    expect(next.playEvents.at(-1)?.type).toBe("roll");
  });

  it("supports explicit resource-linked roll spending and blocked spend events", () => {
    const runtime = createRuntime();
    const character = createCharacterDraft("resource-roll", "Resource Roll");
    const spent = rollAndRecord(character.playState, runtime, rollRequest({ type: "attack-roll" }), {
      rng: rngFrom([0.5]),
      spendResourceKey: "resource:feature:second-wind",
      resourceLabel: "Second Wind",
    }).playState;
    expect(spent.spentResources["resource:feature:second-wind"]).toBe(1);
    expect(spent.playEvents.map((event) => event.type)).toContain("resource-spend");

    const blocked = rollAndRecord(spent, runtime, rollRequest({ type: "attack-roll" }), {
      rng: rngFrom([0.5]),
      spendResourceKey: "resource:feature:second-wind",
      resourceLabel: "Second Wind",
    }).playState;
    expect(blocked.spentResources["resource:feature:second-wind"]).toBe(1);
    expect(blocked.playEvents.at(-1)?.type).toBe("resource-spend-blocked");

    const ambiguous = rollAndRecord(character.playState, runtime, rollRequest({ type: "attack-roll" }), { rng: rngFrom([0.5]) }).playState;
    expect(ambiguous.spentResources["resource:feature:second-wind"] ?? 0).toBe(0);
  });

  it("keeps v2 guardrails around roll workflow", () => {
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    const builderSource = readFileSync("src/pages/CharacterBuilderPage.tsx", "utf8");
    const contentSource = readFileSync("src/pages/ContentBrowserPage.tsx", "utf8");
    const rollPanelSource = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    const rollServiceSource = readFileSync("src/services/rolls/rollService.ts", "utf8");

    expect(sheetSource).toContain("useCharacterEngine");
    expect(sheetSource).toContain("useCharacterPlayState");
    expect(`${sheetSource}\n${builderSource}\n${contentSource}`).not.toContain("../services/data/adapter");
    expect(`${sheetSource}\n${builderSource}\n${contentSource}`).not.toMatch(/\b(eval|removeeval|changeeval|calcChanges)\b/);
    expect(rollPanelSource).not.toContain("Math.random");
    expect(rollPanelSource).not.toContain("rollDiceExpression");
    expect(rollServiceSource).toContain("rollDiceExpression");
  });
});
