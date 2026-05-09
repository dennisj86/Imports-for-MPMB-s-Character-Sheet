import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import { contentSnapshot } from "../services/data/content";
import { resolveBackgrounds, resolveClasses, resolveSpecies } from "../services/data/rulesModeResolver";
import { resolveCharacterEngineState } from "../services/characterEngine";
import { createMpmbCoreRegistry, resolveSnapshotForCoreContext } from "../services/mpmbCore";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";
import {
  applyDamage,
  applyHealing,
  applyLongRest,
  applyShortRest,
  castSpell,
  createPlayStateFromEngine,
  ensureCharacterPlayState,
  recordDeathSave,
  replaceTempHp,
  resolveHitDiceCounters,
  resolveResourceCounters,
  resolveRestRecoveryPlan,
  restoreResource,
  restoreSpellSlot,
  setTempHp,
  spendHitDie,
  spendResource,
  spendSpellSlot,
  STANDARD_CONDITION_DEFINITIONS,
  startConcentration,
  toggleCondition,
  type PlayStateRuntimeContext,
} from "../services/playState";
import type { CharacterActionResourceState } from "../domain/actionResources";

function createRuntime(maxHp = 20): PlayStateRuntimeContext {
  return {
    maxHp,
    constitutionModifier: 2,
    hitDicePools: [
      {
        id: "hit-dice:test-class:d10",
        die: 10,
        sourceClassId: "test-class",
        sourceClassName: "Test Class",
        max: 4,
        remaining: 4,
        spent: 0,
        label: "Test Class d10",
      },
    ],
    resourceMaxByKey: {
      "resource:test": 3,
      "resource:long": 2,
      "resource:manual": 1,
    },
    resourceRechargeByKey: {
      "resource:test": "short-rest",
      "resource:long": "long-rest",
      "resource:manual": "manual",
    },
    resourceNameByKey: {
      "resource:test": "Test Resource",
      "resource:long": "Long Resource",
      "resource:manual": "Manual Resource",
    },
    spellSlotMaxByKey: {
      "1": 2,
      "2": 1,
    },
    spellSlotRechargeByKey: {
      "1": "long-rest",
      "2": "long-rest",
    },
    restPlan: {
      shortRest: {
        resourceKeys: ["resource:test"],
        spellSlotKeys: [],
        skipped: [{ key: "resource:manual", name: "Manual Resource", rechargeType: "manual", rechargeLabel: "Manual", kind: "resource" }],
        notes: ["Manual Resource uses Manual; automatic rest restore is skipped."],
      },
      longRest: {
        resourceKeys: ["resource:test", "resource:long"],
        spellSlotKeys: ["1", "2"],
        skipped: [{ key: "resource:manual", name: "Manual Resource", rechargeType: "manual", rechargeLabel: "Manual", kind: "resource" }],
        notes: ["Manual Resource uses Manual; automatic rest restore is skipped."],
      },
    },
  };
}

function createActionResourcesForRest(): CharacterActionResourceState {
  return {
    provider: "mpmb",
    rulesMode: "2024",
    level: 3,
    actionSet: {
      actions: [],
      bonusActions: [],
      reactions: [],
      freeActions: [],
      utilityActions: [],
    },
    resourceSet: {
      resources: [
        {
          id: "resource:short",
          name: "Ki",
          usesMax: 3,
          recharge: { type: "short-rest", label: "Short Rest", notes: [] },
          notes: [],
          dataStatus: "complete",
          sourceType: "class",
          sourceId: "class:monk",
        },
        {
          id: "resource:long",
          name: "Lay on Hands",
          usesMax: 5,
          recharge: { type: "long-rest", label: "Long Rest", notes: [] },
          notes: [],
          dataStatus: "complete",
          sourceType: "class",
          sourceId: "class:paladin",
        },
        {
          id: "resource:manual",
          name: "Manual Charge",
          usesMax: 1,
          recharge: { type: "manual", label: "Manual", notes: [] },
          notes: [],
          dataStatus: "manual",
          sourceType: "item",
          sourceId: "item:manual-charge",
        },
        {
          id: "resource:special",
          name: "Special Charge",
          usesMax: 1,
          recharge: { type: "special", label: "Dawn", notes: [] },
          notes: [],
          dataStatus: "partial",
          sourceType: "item",
          sourceId: "item:special-charge",
        },
        {
          id: "resource:spell-slot:1",
          name: "Spell Slot L1",
          usesMax: 2,
          recharge: { type: "long-rest", label: "Long Rest", notes: [] },
          notes: [],
          dataStatus: "complete",
          sourceType: "system",
        },
        {
          id: "resource:spell-slot:2",
          name: "Pact Slot L2",
          usesMax: 1,
          recharge: { type: "short-rest", label: "Short Rest", notes: [] },
          notes: [],
          dataStatus: "complete",
          sourceType: "system",
        },
      ],
      limitedUseFeatures: [],
      spellcasting: {
        available: true,
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

function createActionResourcesWithSameLabel(): CharacterActionResourceState {
  const state = createActionResourcesForRest();
  state.resourceSet.resources = [
    {
      id: "resource:feature:class-a:channel",
      name: "Channel",
      usesMax: 1,
      recharge: { type: "short-rest", label: "Short Rest", notes: [] },
      notes: [],
      dataStatus: "complete",
      sourceType: "class",
      sourceId: "class-a",
    },
    {
      id: "resource:feature:class-b:channel",
      name: "Channel",
      usesMax: 1,
      recharge: { type: "long-rest", label: "Long Rest", notes: [] },
      notes: [],
      dataStatus: "complete",
      sourceType: "class",
      sourceId: "class-b",
    },
  ];
  state.resourceSet.spellcasting.slotResources = [];
  return state;
}

function rngFrom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? 0;
    index += 1;
    return value;
  };
}

function createBaselinePlayState(maxHp = 20) {
  const draft = createCharacterDraft("play-test", "Play Test");
  draft.playState.currentHp = maxHp;
  return draft.playState;
}

function buildEngineForInitialization() {
  const draft = createCharacterDraft("play-init", "Play Init");
  draft.provider = "mpmb";
  draft.rulesMode = "2024";
  draft.classSelection.level = 1;
  const registry = createMpmbCoreRegistry(contentSnapshot);
  const snapshot = resolveSnapshotForCoreContext(registry, { provider: "mpmb", rulesMode: "2024" });
  const classes = resolveClasses(snapshot.classes, { provider: "mpmb", rulesMode: "2024" });
  const species = resolveSpecies(snapshot.species, { provider: "mpmb", rulesMode: "2024" });
  const backgrounds = resolveBackgrounds(snapshot.backgrounds, { provider: "mpmb", rulesMode: "2024" });
  draft.classSelection.classId = classes.find((entry) => entry.key === "paladin")?.id ?? classes[0]?.id;
  draft.speciesSelection.speciesId = species[0]?.id;
  draft.backgroundSelection.backgroundId = backgrounds[0]?.id;
  const engine = resolveCharacterEngineState(snapshot, draft, { provider: "mpmb", rulesMode: "2024" });
  return {
    draft,
    engine,
  };
}

describe("play state v1", () => {
  it("initializes default play state from character engine output", () => {
    const { draft, engine } = buildEngineForInitialization();
    const playState = createPlayStateFromEngine(draft.id, engine, "2026-05-08T00:00:00.000Z");
    expect(playState.characterId).toBe(draft.id);
    expect(playState.schemaVersion).toBe(1);
    expect(playState.currentHp).toBe(engine.derivedStats.hitPoints.max);
    expect(playState.updatedAt).toBe("2026-05-08T00:00:00.000Z");
    expect(playState.hitDice.pools[0]).toMatchObject({
      die: engine.classDef?.hitDie,
      max: engine.progression.currentLevel,
      remaining: engine.progression.currentLevel,
      spent: 0,
    });
    expect(resolveHitDiceCounters(playState)[0]?.remaining).toBe(engine.progression.currentLevel);
    expect(Object.keys(playState.spentResources).length).toBeGreaterThanOrEqual(0);
  });

  it("initializes and normalizes hit dice pools from runtime source data", () => {
    const playState = createBaselinePlayState(20);
    const multiPool = ensureCharacterPlayState(
      {
        ...playState,
        hitDice: { pools: [], updatedAt: "2026-05-08T00:00:00.000Z" },
      },
      "play-test",
      {
        maxHp: 20,
        hitDicePools: [
          {
            id: "hit-dice:fighter:d10",
            die: 10,
            sourceClassId: "fighter",
            sourceClassName: "Fighter",
            max: 2,
            remaining: 2,
            spent: 0,
            label: "Fighter d10",
          },
          {
            id: "hit-dice:cleric:d8",
            die: 8,
            sourceClassId: "cleric",
            sourceClassName: "Cleric",
            max: 3,
            remaining: 3,
            spent: 0,
            label: "Cleric d8",
          },
        ],
      },
    );
    expect(multiPool.hitDice.pools.map((pool) => pool.id)).toEqual(["hit-dice:fighter:d10", "hit-dice:cleric:d8"]);

    const inconsistent = ensureCharacterPlayState(
      {
        ...playState,
        hitDice: {
          pools: [
            {
              id: "hit-dice:test-class:d10",
              die: 10,
              sourceClassId: "test-class",
              sourceClassName: "Test Class",
              max: 1,
              remaining: 99,
              spent: 1,
              label: "Test Class d10",
            },
          ],
        },
      },
      "play-test",
      {
        maxHp: 20,
        hitDicePools: createRuntime(20).hitDicePools,
      },
    );
    expect(inconsistent.hitDice.pools[0]?.max).toBe(4);
    expect(inconsistent.hitDice.pools[0]?.spent).toBe(1);
    expect(inconsistent.hitDice.pools[0]?.remaining).toBe(3);
  });

  it("applies damage to temp hp before current hp", () => {
    const playState = createBaselinePlayState(20);
    playState.tempHp = 5;
    const next = applyDamage(playState, 8, "2026-05-08T00:01:00.000Z");
    expect(next.tempHp).toBe(0);
    expect(next.currentHp).toBe(17);
  });

  it("clamps healing to max hp", () => {
    const runtime = createRuntime(20);
    const playState = createBaselinePlayState(20);
    playState.currentHp = 19;
    const next = applyHealing(playState, 5, runtime, "2026-05-08T00:02:00.000Z");
    expect(next.currentHp).toBe(20);
  });

  it("spends hit dice for short-rest healing with constitution modifier and HP clamp", () => {
    const runtime = createRuntime(20);
    const playState = createBaselinePlayState(20);
    playState.currentHp = 10;
    const next = spendHitDie(playState, runtime, "hit-dice:test-class:d10", {
      rng: rngFrom([0.4]),
      now: "2026-05-08T00:02:30.000Z",
    });
    expect(next.currentHp).toBe(17);
    expect(next.hitDice.pools[0]?.remaining).toBe(3);
    expect(next.hitDice.pools[0]?.spent).toBe(1);
    expect(next.playEvents.at(-1)?.type).toBe("hit-die-spent");
    expect(next.playEvents.at(-1)?.payload.result).toMatchObject({
      rawRoll: 5,
      constitutionModifier: 2,
      healingTotal: 7,
      appliedHealing: 7,
    });

    const clamped = spendHitDie({ ...playState, currentHp: 18 }, runtime, "hit-dice:test-class:d10", {
      rng: rngFrom([0.99]),
      now: "2026-05-08T00:02:45.000Z",
    });
    expect(clamped.currentHp).toBe(20);
    expect(clamped.playEvents.at(-1)?.payload.result).toMatchObject({
      healingTotal: 12,
      appliedHealing: 2,
    });
  });

  it("blocks hit die spending when depleted or already at full HP", () => {
    const runtime = createRuntime(20);
    const playState = createBaselinePlayState(20);
    playState.currentHp = 8;
    playState.hitDice = {
      pools: [
        {
          ...runtime.hitDicePools[0],
          remaining: 0,
          spent: 4,
        },
      ],
    };
    const depleted = spendHitDie(playState, runtime, "hit-dice:test-class:d10", {
      rng: rngFrom([0.4]),
      now: "2026-05-08T00:02:50.000Z",
    });
    expect(depleted.currentHp).toBe(8);
    expect(depleted.playEvents.at(-1)?.type).toBe("hit-die-spend-blocked");
    expect(depleted.playEvents.at(-1)?.payload.reason).toBe("depleted");

    const full = spendHitDie(createBaselinePlayState(20), runtime, "hit-dice:test-class:d10", {
      rng: rngFrom([0.4]),
      now: "2026-05-08T00:02:55.000Z",
    });
    expect(full.playEvents.at(-1)?.type).toBe("hit-die-spend-blocked");
    expect(full.playEvents.at(-1)?.payload.reason).toBe("hp-full");
  });

  it("spends multiple hit dice sequentially", () => {
    const runtime = createRuntime(20);
    const playState = createBaselinePlayState(20);
    playState.currentHp = 1;
    const first = spendHitDie(playState, runtime, "hit-dice:test-class:d10", {
      rng: rngFrom([0]),
      now: "2026-05-08T00:02:56.000Z",
    });
    const second = spendHitDie(first, runtime, "hit-dice:test-class:d10", {
      rng: rngFrom([0]),
      now: "2026-05-08T00:02:57.000Z",
    });
    expect(second.currentHp).toBe(7);
    expect(second.hitDice.pools[0]?.remaining).toBe(2);
    expect(second.hitDice.pools[0]?.spent).toBe(2);
  });

  it("keeps temp hp on set below current and allows explicit replacement", () => {
    const playState = createBaselinePlayState(20);
    playState.tempHp = 5;
    const setAttempt = setTempHp(playState, 3, "2026-05-08T00:03:00.000Z");
    expect(setAttempt.tempHp).toBe(5);
    const replaced = replaceTempHp(setAttempt, 3, "2026-05-08T00:04:00.000Z");
    expect(replaced.tempHp).toBe(3);
  });

  it("spends and restores resource counters with clamp and event log entries", () => {
    const runtime = createRuntime(20);
    const playState = createBaselinePlayState(20);
    const spent = spendResource(playState, runtime, "resource:test", 5, "Test Resource", "2026-05-08T00:05:00.000Z");
    expect(spent.spentResources["resource:test"]).toBe(3);
    expect(spent.playEvents.at(-1)?.type).toBe("resource-spend");
    const restored = restoreResource(spent, runtime, "resource:test", 2, "Test Resource", "2026-05-08T00:06:00.000Z");
    expect(restored.spentResources["resource:test"]).toBe(1);
    expect(restored.playEvents.at(-1)?.type).toBe("resource-restore");
  });

  it("spends and restores spell slots with clamp and events", () => {
    const runtime = createRuntime(20);
    const playState = createBaselinePlayState(20);
    const spent = spendSpellSlot(playState, runtime, "1", 3, "2026-05-08T00:07:00.000Z");
    expect(spent.spellSlots["1"]).toBe(2);
    expect(spent.playEvents.at(-1)?.type).toBe("spell-slot-spend");
    const restored = restoreSpellSlot(spent, runtime, "1", 1, "2026-05-08T00:08:00.000Z");
    expect(restored.spellSlots["1"]).toBe(1);
    expect(restored.playEvents.at(-1)?.type).toBe("spell-slot-restore");
  });

  it("casts cantrips without consuming spell slots", () => {
    const runtime = createRuntime(20);
    const playState = createBaselinePlayState(20);
    const next = castSpell(
      playState,
      runtime,
      {
        id: "spell:cantrip",
        name: "Light",
        level: 0,
        ritual: false,
        concentration: false,
      },
      {},
      "2026-05-08T00:08:30.000Z",
    );
    expect(next.spellSlots["1"] ?? 0).toBe(0);
    expect(next.playEvents.at(-1)?.payload.castMode).toBe("cantrip");
  });

  it("casts ritual spells without consuming slots", () => {
    const runtime = createRuntime(20);
    const playState = createBaselinePlayState(20);
    const next = castSpell(
      playState,
      runtime,
      {
        id: "spell:ritual",
        name: "Detect Magic",
        level: 1,
        ritual: true,
        concentration: false,
      },
      {
        ritualCast: true,
      },
      "2026-05-08T00:09:00.000Z",
    );
    expect(next.spellSlots["1"] ?? 0).toBe(0);
    expect(next.playEvents.at(-1)?.type).toBe("spell-cast");
    expect(next.playEvents.at(-1)?.payload.castMode).toBe("ritual");
  });

  it("casts slot spells only when a matching slot is available", () => {
    const runtime = createRuntime(20);
    const playState = createBaselinePlayState(20);
    const castWithSlot = castSpell(
      playState,
      runtime,
      {
        id: "spell:magic-missile",
        name: "Magic Missile",
        level: 1,
        ritual: false,
        concentration: false,
      },
      { slotLevel: 2 },
      "2026-05-08T00:09:30.000Z",
    );
    expect(castWithSlot.spellSlots["2"]).toBe(1);
    expect(castWithSlot.playEvents.at(-1)?.payload.slotLevel).toBe(2);

    const depleted = {
      ...playState,
      spellSlots: { ...playState.spellSlots, "1": 2 },
    };
    const blocked = castSpell(
      depleted,
      runtime,
      {
        id: "spell:shield",
        name: "Shield",
        level: 1,
        ritual: false,
        concentration: false,
      },
      { slotLevel: 1 },
      "2026-05-08T00:09:45.000Z",
    );
    expect(blocked.spellSlots["1"]).toBe(2);
    expect(blocked.playEvents.at(-1)?.type).toBe("spell-cast-blocked");
    expect(blocked.playEvents.at(-1)?.payload.reason).toBe("slot-depleted");
  });

  it("sets and replaces concentration when casting concentration spells", () => {
    const runtime = createRuntime(20);
    const playState = createBaselinePlayState(20);
    const first = castSpell(
      playState,
      runtime,
      {
        id: "spell:bless",
        name: "Bless",
        level: 1,
        ritual: false,
        concentration: true,
      },
      {},
      "2026-05-08T00:10:00.000Z",
    );
    expect(first.concentration?.name).toBe("Bless");

    const second = castSpell(
      first,
      runtime,
      {
        id: "spell:hex",
        name: "Hex",
        level: 1,
        ritual: false,
        concentration: true,
      },
      {},
      "2026-05-08T00:11:00.000Z",
    );
    expect(second.concentration?.name).toBe("Hex");
    expect(second.playEvents.map((event) => event.type)).toContain("concentration-replace");
    expect(second.playEvents.filter((event) => event.type === "spell-cast").at(-1)?.payload.concentrationChange).toBe("replace");
    expect(second.playEvents.at(-1)?.type).toBe("concentration-replace");
  });

  it("derives rest recovery from recharge metadata and skips manual/special resources", () => {
    const plan = resolveRestRecoveryPlan(createActionResourcesForRest());
    expect(plan.shortRest.resourceKeys).toEqual(["resource:short"]);
    expect(plan.shortRest.spellSlotKeys).toEqual(["2"]);
    expect(plan.longRest.resourceKeys).toEqual(["resource:short", "resource:long"]);
    expect(plan.longRest.spellSlotKeys).toEqual(["1", "2"]);
    expect(plan.shortRest.skipped.map((entry) => entry.key)).toEqual(["resource:manual", "resource:special"]);
    expect(plan.longRest.notes.length).toBe(2);
  });

  it("applies short/long rest updates to play state without touching build data", () => {
    const runtime = createRuntime(20);
    const draft = createCharacterDraft("rest-test", "Rest Test");
    const baselineClassId = draft.classSelection.classId;
    let playState = startConcentration(draft.playState, { name: "Bless" }, "2026-05-08T00:12:00.000Z");
    playState = spendResource(playState, runtime, "resource:test", 2, "Test Resource", "2026-05-08T00:13:00.000Z");
    playState = spendResource(playState, runtime, "resource:long", 1, "Long Resource", "2026-05-08T00:13:30.000Z");
    playState = spendResource(playState, runtime, "resource:manual", 1, "Manual Resource", "2026-05-08T00:13:45.000Z");
    playState = spendSpellSlot(playState, runtime, "1", 1, "2026-05-08T00:14:00.000Z");
    playState = spendSpellSlot(playState, runtime, "2", 1, "2026-05-08T00:15:00.000Z");
    playState = applyDamage(playState, 30, "2026-05-08T00:16:00.000Z");
    playState = recordDeathSave(playState, "failure", "2026-05-08T00:17:00.000Z");

    const afterShort = applyShortRest(playState, runtime, "2026-05-08T00:18:00.000Z");
    expect(afterShort.spentResources["resource:test"]).toBe(0);
    expect(afterShort.spentResources["resource:long"]).toBe(1);
    expect(afterShort.spentResources["resource:manual"]).toBe(1);
    expect(afterShort.spellSlots["1"]).toBe(1);
    expect(afterShort.spellSlots["2"]).toBe(1);
    expect(afterShort.currentHp).toBeLessThan(20);
    expect(afterShort.deathSaves.failures).toBe(1);

    const afterLong = applyLongRest(afterShort, runtime, "2026-05-08T00:19:00.000Z");
    expect(afterLong.currentHp).toBe(20);
    expect(afterLong.spentResources["resource:long"]).toBe(0);
    expect(afterLong.spentResources["resource:manual"]).toBe(1);
    expect(afterLong.spellSlots["1"]).toBe(0);
    expect(afterLong.spellSlots["2"]).toBe(0);
    expect(afterLong.concentration).toBeNull();
    expect(afterLong.deathSaves.failures).toBe(0);
    expect(afterLong.playEvents.at(-1)?.payload.skipped).toHaveLength(1);
    expect(draft.classSelection.classId).toBe(baselineClassId);
  });

  it("summarizes hit dice healing on short rest and recovers hit dice on long rest", () => {
    const runtime = createRuntime(20);
    const playState = createBaselinePlayState(20);
    playState.currentHp = 5;
    const healed = spendHitDie(playState, runtime, "hit-dice:test-class:d10", {
      rng: rngFrom([0.4]),
      now: "2026-05-08T00:18:10.000Z",
    });
    const afterShort = applyShortRest(healed, runtime, "2026-05-08T00:18:20.000Z");
    expect(afterShort.playEvents.at(-1)?.payload.hitDiceAvailable).toBe(3);
    expect(afterShort.playEvents.at(-1)?.payload.hitDiceSpentDuringRest).toBe(1);
    expect(afterShort.playEvents.at(-1)?.payload.hitDiceAppliedHealing).toBe(7);

    const afterLong = applyLongRest(afterShort, runtime, "2026-05-08T00:18:30.000Z");
    expect(afterLong.hitDice.pools[0]?.remaining).toBe(4);
    expect(afterLong.hitDice.pools[0]?.spent).toBe(0);
    expect(afterLong.playEvents.map((event) => event.type)).toContain("hit-dice-recovered");
    expect(afterLong.playEvents.find((event) => event.type === "rest-long")?.payload.hitDiceRecovered).toBe(1);
  });

  it("recovers long-rest hit dice deterministically across multiple pools", () => {
    const runtime = {
      ...createRuntime(20),
      hitDicePools: [
        {
          id: "hit-dice:fighter:d10",
          die: 10 as const,
          sourceClassId: "fighter",
          sourceClassName: "Fighter",
          max: 4,
          remaining: 4,
          spent: 0,
          label: "Fighter d10",
        },
        {
          id: "hit-dice:cleric:d8",
          die: 8 as const,
          sourceClassId: "cleric",
          sourceClassName: "Cleric",
          max: 2,
          remaining: 2,
          spent: 0,
          label: "Cleric d8",
        },
      ],
    };
    const playState = createBaselinePlayState(20);
    playState.currentHp = 3;
    playState.hitDice = {
      pools: [
        { ...runtime.hitDicePools[0], remaining: 3, spent: 1 },
        { ...runtime.hitDicePools[1], remaining: 0, spent: 2 },
      ],
    };
    const afterLong = applyLongRest(playState, runtime, "2026-05-08T00:18:40.000Z");
    expect(afterLong.hitDice.pools.find((pool) => pool.id === "hit-dice:cleric:d8")?.spent).toBe(0);
    expect(afterLong.hitDice.pools.find((pool) => pool.id === "hit-dice:fighter:d10")?.spent).toBe(0);
    expect(afterLong.playEvents.find((event) => event.type === "rest-long")?.payload.hitDiceRecovered).toBe(3);
  });

  it("keeps same-label resources from different sources isolated by key", () => {
    const actionResources = createActionResourcesWithSameLabel();
    const playState = createBaselinePlayState(20);
    const counters = resolveResourceCounters(playState, actionResources);
    expect(counters.map((entry) => entry.name)).toEqual(["Channel", "Channel"]);
    expect(new Set(counters.map((entry) => entry.id)).size).toBe(2);

    const runtime = {
      ...createRuntime(20),
      resourceMaxByKey: {
        "resource:feature:class-a:channel": 1,
        "resource:feature:class-b:channel": 1,
      },
    };
    const next = spendResource(playState, runtime, "resource:feature:class-a:channel", 1, "Channel", "2026-05-08T00:19:30.000Z");
    expect(next.spentResources["resource:feature:class-a:channel"]).toBe(1);
    expect(next.spentResources["resource:feature:class-b:channel"] ?? 0).toBe(0);
  });

  it("uses stable condition definitions and normalizes legacy condition state", () => {
    expect(STANDARD_CONDITION_DEFINITIONS.map((entry) => entry.id)).toContain("condition:blinded");

    const playState = createBaselinePlayState(20);
    const toggled = toggleCondition(playState, { id: "condition:blinded", name: "condition:blinded" }, "2026-05-08T00:20:00.000Z");
    expect(toggled.activeConditions[0]?.id).toBe("condition:blinded");
    expect(toggled.activeConditions[0]?.name).toBe("Blinded");
    expect(toggled.playEvents.at(-1)?.type).toBe("condition-toggle");

    const legacy = ensureCharacterPlayState(
      {
        ...playState,
        activeConditions: [
          { id: "condition:Blinded", name: "Blinded", addedAt: "2026-05-08T00:20:30.000Z" },
          { id: "condition:custom:sickened", name: "Sickened", source: "manual", addedAt: "2026-05-08T00:20:31.000Z" },
        ],
      },
      "play-test",
      { maxHp: 20 },
    );
    expect(legacy.activeConditions[0]?.id).toBe("condition:blinded");
    expect(legacy.activeConditions[1]?.id).toBe("condition:custom:sickened");
  });

  it("keeps play state schema in persistence roundtrip", () => {
    const character = createCharacterDraft("persist-play", "Persist Play");
    character.playState.currentHp = 7;
    character.playState.tempHp = 3;
    character.playState.hitDice = {
      pools: [
        {
          id: "hit-dice:persist:d8",
          die: 8,
          sourceClassId: "persist",
          sourceClassName: "Persist Class",
          max: 3,
          remaining: 1,
          spent: 2,
          label: "Persist Class d8",
        },
      ],
      updatedAt: "2026-05-08T00:21:00.000Z",
    };
    character.playState.activeConditions = [{ id: "condition:poisoned", name: "Poisoned", addedAt: "2026-05-08T00:21:00.000Z" }];
    const payload = serializeCharacters([character]);
    const loaded = deserializeCharacters(payload);
    expect(loaded[0]?.playState.schemaVersion).toBe(1);
    expect(loaded[0]?.playState.currentHp).toBe(7);
    expect(loaded[0]?.playState.tempHp).toBe(3);
    expect(loaded[0]?.playState.hitDice.pools[0]).toMatchObject({
      id: "hit-dice:persist:d8",
      remaining: 1,
      spent: 2,
    });
    expect(loaded[0]?.playState.activeConditions[0]?.id).toBe("condition:poisoned");
  });

  it("initializes play state when migrating legacy payloads", () => {
    const payload = JSON.stringify({
      version: 1,
      characters: [
        {
          id: "legacy-play",
          version: 1,
          name: "Legacy Play",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
          abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          classSelection: { classId: undefined, level: 1 },
          subclassSelection: { subclassId: undefined },
          speciesSelection: { speciesId: undefined },
          backgroundSelection: { backgroundId: undefined },
          featIds: [],
          spellSelection: { selectedSpellIds: [] },
          featureChoices: [],
          inventory: { items: [] },
        },
      ],
    });
    const [loaded] = deserializeCharacters(payload);
    expect(loaded).toBeDefined();
    if (!loaded) {
      return;
    }
    expect(loaded.playState.schemaVersion).toBe(1);
    expect(loaded.playState.characterId).toBe("legacy-play");
    expect(loaded.playState.hitDice.pools).toEqual([]);
  });

  it("loads old v2 drafts without hit dice and normalizes corrupted hit dice fields", () => {
    const character = createCharacterDraft("persist-hit-dice-legacy", "Persist Hit Dice Legacy");
    const raw = JSON.parse(serializeCharacters([character]));
    delete raw.characters[0].playState.hitDice;
    const [loadedWithoutHitDice] = deserializeCharacters(JSON.stringify(raw));
    expect(loadedWithoutHitDice?.playState.hitDice.pools).toEqual([]);

    raw.characters[0].playState.hitDice = {
      pools: [
        {
          id: "hit-dice:bad:d10",
          die: "d10",
          max: 2,
          remaining: 99,
          spent: -1,
          label: "Bad d10",
        },
      ],
    };
    const [loadedCorrupt] = deserializeCharacters(JSON.stringify(raw));
    const normalized = ensureCharacterPlayState(loadedCorrupt?.playState, "persist-hit-dice-legacy", {
      maxHp: 1,
      hitDicePools: [
        {
          id: "hit-dice:bad:d10",
          die: 10,
          max: 2,
          remaining: 2,
          spent: 0,
          label: "Bad d10",
        },
      ],
    });
    expect(normalized.hitDice.pools[0]?.remaining).toBe(2);
    expect(normalized.hitDice.pools[0]?.spent).toBe(0);
  });

  it("normalizes persisted freeform conditions during load", () => {
    const character = createCharacterDraft("persist-legacy-condition", "Persist Legacy Condition");
    const raw = JSON.parse(serializeCharacters([character]));
    raw.characters[0].playState.activeConditions = ["Blinded", { name: "Sickened", source: "manual" }];
    const [loaded] = deserializeCharacters(JSON.stringify(raw));
    expect(loaded?.playState.activeConditions[0]?.id).toBe("condition:blinded");
    expect(loaded?.playState.activeConditions[1]?.id).toBe("condition:custom:sickened");
  });

  it("keeps v2 play routes on engine/play hooks and away from legacy/runtime shortcuts", () => {
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    const builderSource = readFileSync("src/pages/CharacterBuilderPage.tsx", "utf8");
    const contentSource = readFileSync("src/pages/ContentBrowserPage.tsx", "utf8");
    const playHookSource = readFileSync("src/features/character/hooks/useCharacterPlayState.ts", "utf8");
    const restControlsSource = readFileSync("src/features/character/components/sheet/RestControls.tsx", "utf8");
    const hitDicePanelSource = readFileSync("src/features/character/components/sheet/HitDiceRestPanel.tsx", "utf8");
    const playStateServiceSource = readFileSync("src/services/playState/playStateService.ts", "utf8");
    expect(sheetSource).toContain("useCharacterEngine");
    expect(sheetSource).toContain("useCharacterPlayState");
    expect(sheetSource).not.toContain("../services/data/adapter");
    expect(builderSource).not.toContain("../services/data/adapter");
    expect(contentSource).not.toContain("../services/data/adapter");
    expect(`${sheetSource}\n${builderSource}\n${contentSource}`).not.toMatch(/\b(eval|removeeval|changeeval|calcChanges)\b/);
    expect(sheetSource).not.toContain("reduceCharacterPlayState");
    expect(playHookSource).toContain("../../../services/playState");
    expect(`${restControlsSource}\n${hitDicePanelSource}`).not.toContain("rollDiceExpression");
    expect(`${restControlsSource}\n${hitDicePanelSource}`).not.toContain("Math.random");
    expect(playStateServiceSource).toContain("rollDiceExpression");
    expect(`${restControlsSource}\n${hitDicePanelSource}\n${playStateServiceSource}`).not.toMatch(/Nach Beenden einer (kurzen|langen) Rast/);
  });
});
