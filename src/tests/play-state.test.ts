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
  recordDeathSave,
  replaceTempHp,
  restoreResource,
  restoreSpellSlot,
  setTempHp,
  spendResource,
  spendSpellSlot,
  startConcentration,
  type PlayStateRuntimeContext,
} from "../services/playState";

function createRuntime(maxHp = 20): PlayStateRuntimeContext {
  return {
    maxHp,
    resourceMaxByKey: {
      "resource:test": 3,
    },
    spellSlotMaxByKey: {
      "1": 2,
      "2": 1,
    },
    restPlan: {
      shortRest: {
        resourceKeys: ["resource:test"],
        spellSlotKeys: ["1"],
        notes: [],
      },
      longRest: {
        resourceKeys: ["resource:test"],
        spellSlotKeys: ["1", "2"],
        notes: [],
      },
    },
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
    expect(Object.keys(playState.spentResources).length).toBeGreaterThanOrEqual(0);
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
  });

  it("applies short/long rest updates to play state without touching build data", () => {
    const runtime = createRuntime(20);
    const draft = createCharacterDraft("rest-test", "Rest Test");
    const baselineClassId = draft.classSelection.classId;
    let playState = startConcentration(draft.playState, { name: "Bless" }, "2026-05-08T00:12:00.000Z");
    playState = spendResource(playState, runtime, "resource:test", 2, "Test Resource", "2026-05-08T00:13:00.000Z");
    playState = spendSpellSlot(playState, runtime, "1", 1, "2026-05-08T00:14:00.000Z");
    playState = spendSpellSlot(playState, runtime, "2", 1, "2026-05-08T00:15:00.000Z");
    playState = applyDamage(playState, 6, "2026-05-08T00:16:00.000Z");
    playState = recordDeathSave(playState, "failure", "2026-05-08T00:17:00.000Z");

    const afterShort = applyShortRest(playState, runtime, "2026-05-08T00:18:00.000Z");
    expect(afterShort.spentResources["resource:test"]).toBe(0);
    expect(afterShort.spellSlots["1"]).toBe(0);
    expect(afterShort.spellSlots["2"]).toBe(1);
    expect(afterShort.currentHp).toBeLessThan(20);

    const afterLong = applyLongRest(afterShort, runtime, "2026-05-08T00:19:00.000Z");
    expect(afterLong.currentHp).toBe(20);
    expect(afterLong.spellSlots["2"]).toBe(0);
    expect(afterLong.concentration).toBeNull();
    expect(afterLong.deathSaves.failures).toBe(0);
    expect(draft.classSelection.classId).toBe(baselineClassId);
  });

  it("keeps play state schema in persistence roundtrip", () => {
    const character = createCharacterDraft("persist-play", "Persist Play");
    character.playState.currentHp = 7;
    character.playState.tempHp = 3;
    const payload = serializeCharacters([character]);
    const loaded = deserializeCharacters(payload);
    expect(loaded[0]?.playState.schemaVersion).toBe(1);
    expect(loaded[0]?.playState.currentHp).toBe(7);
    expect(loaded[0]?.playState.tempHp).toBe(3);
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
  });

  it("keeps sheet route on character engine hook and without direct adapter import", () => {
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    expect(sheetSource).toContain("useCharacterEngine");
    expect(sheetSource).not.toContain("../services/data/adapter");
  });
});
