import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import type { RollRequest } from "../domain/rolls";
import { deserializeCharacters, serializeCharacters } from "../services/persistence/characterPersistence";
import { activeEffectsForRollType } from "../services/rules";
import {
  addCustomActiveEffect,
  applyDamage,
  rollAndRecord,
  setAutomationSettings,
  startConcentration,
  type PlayStateRuntimeContext,
} from "../services/playState";

function runtime(): PlayStateRuntimeContext {
  return {
    maxHp: 25,
    constitutionModifier: 2,
    hitDicePools: [],
    resourceMaxByKey: {
      "resource:bardic": 3,
      "resource:smite": 2,
    },
    resourceRechargeByKey: {
      "resource:bardic": "long-rest",
      "resource:smite": "long-rest",
    },
    resourceNameByKey: {
      "resource:bardic": "Bardic Inspiration",
      "resource:smite": "Divine Smite",
    },
    spellSlotMaxByKey: {},
    spellSlotRechargeByKey: {},
    restPlan: {
      shortRest: { resourceKeys: [], spellSlotKeys: [], skipped: [], notes: [] },
      longRest: { resourceKeys: [], spellSlotKeys: [], skipped: [], notes: [] },
    },
  };
}

function d20Request(id: string, label: string, type: RollRequest["type"] = "attack-roll"): RollRequest {
  return {
    id,
    type,
    label,
    sourceType: "custom",
    sourceId: "test",
    modifier: 5,
    baseModifier: 3,
    diceExpression: "1d20",
    rollMode: "normal",
    metadata: {
      abilityModifier: 3,
      proficiencyBonus: 2,
    },
  };
}

function rngFrom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? 0;
    index += 1;
    return value;
  };
}

describe("roll trust + automation settings v1", () => {
  it("persists automation settings in play state payloads", () => {
    const draft = createCharacterDraft("automation-settings", "Automation Settings");
    draft.playState = setAutomationSettings(draft.playState, {
      rollBonuses: "autoApply",
      activeEffects: "autoApply",
      resourceSpending: "autoSpendWhenSafe",
      onHitRiders: "manualOnly",
      concentration: "autoPromptOnDamage",
      deathSaves: "autoApplyResult",
    }, "2026-05-13T10:00:00.000Z");

    const [loaded] = deserializeCharacters(serializeCharacters([draft]));
    expect(loaded?.playState.automationSettings).toMatchObject({
      rollBonuses: "autoApply",
      activeEffects: "autoApply",
      resourceSpending: "autoSpendWhenSafe",
      onHitRiders: "manualOnly",
      concentration: "autoPromptOnDamage",
      deathSaves: "autoApplyResult",
    });
  });

  it("adds a full roll trust breakdown to roll results", () => {
    const draft = createCharacterDraft("roll-breakdown", "Roll Breakdown");
    const request: RollRequest = {
      ...d20Request("roll:trust:full", "Trust Attack"),
      temporaryModifiers: [
        {
          id: "rule:buff:bless",
          sourceDescriptorId: "rule-source:test:bless",
          sourceName: "Bless",
          sourceType: "spell",
          target: "other",
          valueType: "dice",
          value: "1d4",
          condition: "manual",
          diagnostics: [],
        },
      ],
      selectedActiveEffectIds: ["effect:bless"],
      selectedActiveEffects: [{ id: "effect:bless", label: "Bless", sourceName: "Bless", origin: "manual" }],
    };
    const { result } = rollAndRecord(draft.playState, runtime(), request, {
      rng: rngFrom([0.49, 0.75]),
      now: "2026-05-13T10:05:00.000Z",
      spendResourceKey: "resource:bardic",
      resourceLabel: "Bardic Inspiration",
      spendResourceMode: "manual",
    });

    expect(result.trustBreakdown).toBeDefined();
    expect(result.trustBreakdown?.baseDice).toBe("1d20");
    expect(result.trustBreakdown?.abilityModifier).toBe("+3");
    expect(result.trustBreakdown?.proficiencyModifier).toBe("+2");
    expect(result.trustBreakdown?.activeEffects.join(" ")).toContain("Bless");
    expect(result.trustBreakdown?.resourcesSpent.join(" ")).toContain("Bardic Inspiration");
    expect(result.trustBreakdown?.finalTotal).toBe(result.total);
  });

  it("keeps suggest/auto-apply effect wiring for Bless and similar buffs", () => {
    const source = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    expect(source).toContain("resolveRollEffectStrategy(playStateView.automationSettings)");
    expect(source).toContain("effectStrategy === \"autoApply\"");
    expect(source).toContain("suggestedActiveEffects");
  });

  it("consumes Bardic Inspiration style until-used effects only when applied", () => {
    const draft = createCharacterDraft("bardic-consume", "Bardic Consume");
    const withEffect = addCustomActiveEffect(draft.playState, {
      name: "Bardic Inspiration",
      applicableRollTypes: ["attack-roll"],
      dice: "1d8",
      durationType: "until-used",
    });
    const effectId = withEffect.activeEffects[0]?.id;
    expect(effectId).toBeTruthy();
    if (!effectId) {
      return;
    }

    const withoutSelection = rollAndRecord(withEffect, runtime(), d20Request("roll:bardic:none", "Attack No Bardic"), {
      rng: rngFrom([0.5]),
      now: "2026-05-13T10:10:00.000Z",
    });
    expect(withoutSelection.playState.activeEffects.find((entry) => entry.id === effectId)?.status).toBe("active");

    const withSelection = rollAndRecord(withEffect, runtime(), {
      ...d20Request("roll:bardic:use", "Attack With Bardic"),
      selectedActiveEffectIds: [effectId],
      selectedActiveEffects: [{ id: effectId, label: "Bardic Inspiration", sourceName: "Bardic Inspiration", origin: "manual" }],
    }, {
      rng: rngFrom([0.5, 0.8]),
      now: "2026-05-13T10:11:00.000Z",
    });
    expect(withSelection.playState.activeEffects.find((entry) => entry.id === effectId)?.status).toBe("dismissed");
  });

  it("does not surface optional effects for non-matching roll types", () => {
    const draft = createCharacterDraft("effect-match", "Effect Match");
    const withGuidance = addCustomActiveEffect(draft.playState, {
      name: "Guidance",
      applicableRollTypes: ["ability-check"],
      dice: "1d4",
      durationType: "one-roll",
    });
    const applicableForDamage = activeEffectsForRollType(withGuidance.activeEffects, "damage-roll");
    expect(applicableForDamage).toHaveLength(0);
  });

  it("does not auto spend resources for unsafe paths", () => {
    const draft = createCharacterDraft("unsafe-spend", "Unsafe Spend");
    const { playState } = rollAndRecord(draft.playState, runtime(), d20Request("roll:unsafe", "Unsafe Spend"), {
      rng: rngFrom([0.4]),
      now: "2026-05-13T10:15:00.000Z",
      spendResourceKey: "resource:smite",
      resourceLabel: "Divine Smite",
      spendResourceMode: "auto-unsafe",
      automationSettings: {
        ...draft.playState.automationSettings,
        resourceSpending: "autoSpendWhenSafe",
      },
    });
    expect(playState.spentResources["resource:smite"] ?? 0).toBe(0);
    expect(playState.playEvents.at(-1)?.type).toBe("resource-spend-blocked");
    expect(playState.playEvents.at(-1)?.payload.reason).toBe("unsafe-path");
  });

  it("auto spends resources for safe paths when setting allows it", () => {
    const draft = createCharacterDraft("safe-spend", "Safe Spend");
    const { playState } = rollAndRecord(draft.playState, runtime(), d20Request("roll:safe", "Safe Spend"), {
      rng: rngFrom([0.4]),
      now: "2026-05-13T10:16:00.000Z",
      spendResourceKey: "resource:smite",
      resourceLabel: "Divine Smite",
      spendResourceMode: "auto-safe",
      automationSettings: {
        ...draft.playState.automationSettings,
        resourceSpending: "autoSpendWhenSafe",
      },
    });
    expect(playState.spentResources["resource:smite"]).toBe(1);
    expect(playState.playEvents.at(-1)?.type).toBe("resource-spend");
  });

  it("writes auto/manual/suggested effect origins into the play log roll summary", () => {
    const draft = createCharacterDraft("log-origin", "Log Origin");
    const { playState } = rollAndRecord(draft.playState, runtime(), {
      ...d20Request("roll:origins", "Origin Roll"),
      selectedActiveEffects: [
        { id: "effect:manual", label: "Bless", sourceName: "Bless", origin: "manual" },
        { id: "effect:auto", label: "Guidance", sourceName: "Guidance", origin: "auto" },
        { id: "effect:suggested", label: "Bardic Inspiration", sourceName: "Bardic Inspiration", origin: "suggested" },
      ],
    }, {
      rng: rngFrom([0.6]),
      now: "2026-05-13T10:17:00.000Z",
    });
    const payload = playState.playEvents.at(-1)?.payload as { summary?: string } | undefined;
    expect(payload?.summary).toContain("(manual)");
    expect(payload?.summary).toContain("(auto)");
    expect(payload?.summary).toContain("(suggested)");
  });

  it("keeps death save auto-apply branch wired in sheet logic", () => {
    const source = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    expect(source).toContain("automationSettings.deathSaves === \"autoApplyResult\"");
    expect(source).toContain("playStateView.recordDeathSave(resolution)");
  });

  it("emits concentration prompt events after damage while concentration is active", () => {
    const draft = createCharacterDraft("concentration-prompt", "Concentration Prompt");
    const concentrating = startConcentration(draft.playState, { name: "Bless", sourceId: "spell:bless" }, "2026-05-13T10:20:00.000Z");
    const damaged = applyDamage(concentrating, 17, {
      now: "2026-05-13T10:21:00.000Z",
      concentrationBehavior: "autoPromptOnDamage",
    });
    const prompt = damaged.playEvents.find((event) => event.type === "concentration-check-prompt");
    expect(prompt).toBeDefined();
    expect(prompt?.payload.dc).toBe(10);
  });

  it("retains attack flow controls in action cards", () => {
    const source = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    expect(source).toContain("Attack Flow");
    expect(source).toContain("resolveAttackDecision(\"hit\")");
    expect(source).toContain("resolveAttackDecision(\"miss\")");
    expect(source).toContain("rollDamageFromConfirmedHit");
  });

  it("retains active effect dock surfaces and detail drawer integration", () => {
    const source = readFileSync("src/features/character/components/sheet/PersistentRollDock.tsx", "utf8");
    expect(source).toContain("Active Buffs");
    expect(source).toContain("Optional Buffs");
    expect(source).toContain("heading=\"Active Effect Details\"");
  });
});
