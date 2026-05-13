import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import type { RollRequest } from "../domain/rolls";
import { adjustCurrencyAmount, currencyTotalInGp, normalizeCurrencyState, setCurrencyAmount } from "../services/equipment";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";
import { addCustomActiveEffect, rollAndRecord, type PlayStateRuntimeContext } from "../services/playState";

function createRuntime(): PlayStateRuntimeContext {
  return {
    maxHp: 20,
    constitutionModifier: 2,
    hitDicePools: [],
    resourceMaxByKey: {},
    resourceRechargeByKey: {},
    resourceNameByKey: {},
    spellSlotMaxByKey: {},
    spellSlotRechargeByKey: {},
    restPlan: {
      shortRest: { resourceKeys: [], spellSlotKeys: [], skipped: [], notes: [] },
      longRest: { resourceKeys: [], spellSlotKeys: [], skipped: [], notes: [] },
    },
  };
}

function rngFrom(values: number[]): () => number {
  let index = 0;
  return () => {
    const next = values[index] ?? 0;
    index += 1;
    return next;
  };
}

describe("tabletop utility ux v1", () => {
  it("persists currency state and computes total gp conversion", () => {
    const draft = createCharacterDraft("currency-persist", "Currency Persist");
    draft.inventory = setCurrencyAmount(draft.inventory, "gp", 12);
    draft.inventory = setCurrencyAmount(draft.inventory, "sp", 7);
    draft.inventory = setCurrencyAmount(draft.inventory, "cp", 35);
    draft.inventory = setCurrencyAmount(draft.inventory, "pp", 1);
    const [roundTrip] = deserializeCharacters(serializeCharacters([draft]));
    const currency = normalizeCurrencyState(roundTrip?.inventory.currency);

    expect(currency).toEqual({ cp: 35, sp: 7, ep: 0, gp: 12, pp: 1 });
    expect(currencyTotalInGp(currency)).toBeCloseTo(23.05, 4);
  });

  it("supports currency add/subtract with non-negative clamps", () => {
    const draft = createCharacterDraft("currency-adjust", "Currency Adjust");
    const plus = adjustCurrencyAmount(draft.inventory, "sp", 8);
    const minus = adjustCurrencyAmount(plus, "sp", -3);
    const clamped = adjustCurrencyAmount(minus, "sp", -50);
    expect(normalizeCurrencyState(plus.currency).sp).toBe(8);
    expect(normalizeCurrencyState(minus.currency).sp).toBe(5);
    expect(normalizeCurrencyState(clamped.currency).sp).toBe(0);
  });

  it("rolls free d20 requests through the existing roll pipeline", () => {
    const draft = createCharacterDraft("free-d20", "Free D20");
    const request: RollRequest = {
      id: "roll:free:d20",
      type: "custom",
      label: "Free D20",
      sourceType: "custom",
      sourceId: "free-dice",
      modifier: 0,
      diceExpression: "1d20",
      rollMode: "normal",
    };
    const { result, playState } = rollAndRecord(draft.playState, createRuntime(), request, {
      rng: rngFrom([0.45]),
      now: "2026-05-12T10:00:00.000Z",
    });

    expect(result.total).toBe(10);
    expect(result.dice.keptRoll).toBe(10);
    expect(playState.playEvents.at(-1)?.type).toBe("roll");
  });

  it("rolls free formula requests like 1d20+5", () => {
    const draft = createCharacterDraft("free-formula", "Free Formula");
    const request: RollRequest = {
      id: "roll:free:formula",
      type: "custom",
      label: "Free Formula",
      sourceType: "custom",
      sourceId: "free-dice",
      modifier: 0,
      diceExpression: "1d20+5",
      rollMode: "normal",
    };
    const { result } = rollAndRecord(draft.playState, createRuntime(), request, {
      rng: rngFrom([0.45]),
      now: "2026-05-12T10:01:00.000Z",
    });

    expect(result.total).toBe(15);
    expect(result.dice.rawRolls).toEqual([10]);
  });

  it("supports death save shortcut requests and logs them", () => {
    const draft = createCharacterDraft("free-death-save", "Free Death Save");
    const request: RollRequest = {
      id: "roll:free:death-save",
      type: "death-save",
      label: "Death Save",
      sourceType: "custom",
      sourceId: "free-dice",
      modifier: 0,
      diceExpression: "1d20",
      rollMode: "normal",
    };
    const { result, playState } = rollAndRecord(draft.playState, createRuntime(), request, {
      rng: rngFrom([0.7]),
      now: "2026-05-12T10:02:00.000Z",
    });
    const event = playState.playEvents.at(-1);
    const payload = event?.payload?.rollResult as { type?: string } | undefined;

    expect(result.type).toBe("death-save");
    expect(event?.type).toBe("roll");
    expect(payload?.type).toBe("death-save");
  });

  it("keeps custom buff creation functional while editor defaults to collapsed", () => {
    const source = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    expect(source).toMatch(/showCustomBuffEditor,\s*setShowCustomBuffEditor\]\s*=\s*useState\(false\)/);
    expect(source).toContain("Create Custom Buff");

    const draft = createCharacterDraft("custom-buff", "Custom Buff");
    const next = addCustomActiveEffect(draft.playState, {
      name: "Table Blessing",
      applicableRollTypes: ["ability-check"],
      dice: "1d4",
      durationType: "one-roll",
    });
    expect(next.activeEffects.some((effect) => effect.label === "Table Blessing" && effect.status === "active")).toBe(true);
  });

  it("wires condition, spell-tag, and weapon tooltip/popover surfaces", () => {
    const conditionSource = readFileSync("src/features/character/components/sheet/ConditionTray.tsx", "utf8");
    const spellSource = readFileSync("src/features/character/components/sheet/SpellbookPanel.tsx", "utf8");
    const actionSource = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    const inventorySource = readFileSync("src/features/character/components/sheet/InventoryPanel.tsx", "utf8");

    expect(conditionSource).toContain("InfoPopover");
    expect(spellSource).toContain("spellTagInfo");
    expect(spellSource).toContain("effect mapped");
    expect(actionSource).toContain("weaponProperties");
    expect(actionSource).toContain("ruleInfo(\"weapon-mastery\")");
    expect(inventorySource).toContain("Currency");
  });

  it("keeps tooltip/popover interactions keyboard-accessible", () => {
    const source = readFileSync("src/features/character/components/sheet/SheetDesignSystem.tsx", "utf8");
    expect(source).toContain("role=\"tooltip\"");
    expect(source).toContain("aria-controls");
    expect(source).toContain("aria-expanded");
    expect(source).toContain("onFocus");
    expect(source).toContain("onBlur");
  });
});

