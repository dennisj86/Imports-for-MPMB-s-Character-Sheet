import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import type { RollRequest } from "../domain/rolls";
import { buildOverviewResourceHighlights, resolveDeathSaveRollResolution } from "../features/character/viewModels";
import { applyHealing, recordDeathSave, rollAndRecord, setCurrentHp, type PlayResourceCounter, type PlaySpellSlotCounter, type PlayStateRuntimeContext } from "../services/playState";

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
    const value = values[index] ?? 0;
    index += 1;
    return value;
  };
}

function deathSaveRequest(id: string): RollRequest {
  return {
    id,
    type: "death-save",
    label: "Death Save",
    sourceType: "custom",
    sourceId: "test",
    modifier: 0,
    diceExpression: "1d20",
    rollMode: "normal",
  };
}

describe("sheet layout repair + play interaction semantics v1", () => {
  it("keeps overview layout sections explicit and ordered for play", () => {
    const source = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    expect(source).toContain("title=\"Vitals / HP\"");
    expect(source).toContain("title=\"AC & Combat Summary\"");
    expect(source).toContain("title=\"Conditions & Concentration\"");
    expect(source).toContain("title=\"Resource Highlights\"");
    expect(source).toContain("ProficiencySummary");
    expect(source).toContain("onRollDeathSave={rollDeathSaveFromOverview}");
  });

  it("deduplicates resource highlights and aggregates spell slots", () => {
    const resources: PlayResourceCounter[] = [
      {
        id: "resource:lay-on-hands",
        name: "Lay on Hands",
        max: 20,
        spent: 5,
        remaining: 15,
        rechargeType: "long-rest",
        rechargeLabel: "Long Rest",
        sourceType: "class",
        sourceId: "paladin",
        sourceName: "Paladin",
        dataStatus: "complete",
      },
      {
        id: "resource:channel-divinity-primary",
        name: "Channel Divinity",
        max: 2,
        spent: 1,
        remaining: 1,
        rechargeType: "short-rest",
        rechargeLabel: "Short Rest",
        sourceType: "class",
        sourceId: "paladin",
        sourceName: "Paladin",
        dataStatus: "complete",
      },
      {
        id: "resource:channel-divinity-alias",
        name: "Channel Divinity (Paladin)",
        max: 1,
        spent: 0,
        remaining: 1,
        rechargeType: "short-rest",
        rechargeLabel: "Short Rest",
        sourceType: "class",
        sourceId: "paladin",
        sourceName: "Paladin",
        dataStatus: "complete",
      },
    ];
    const spellSlots: PlaySpellSlotCounter[] = [
      { slotKey: "1", level: 1, max: 4, used: 1, remaining: 3, rechargeType: "long-rest", rechargeLabel: "Long Rest" },
      { slotKey: "2", level: 2, max: 2, used: 1, remaining: 1, rechargeType: "long-rest", rechargeLabel: "Long Rest" },
    ];

    const highlights = buildOverviewResourceHighlights(resources, spellSlots, 5);
    const labels = highlights.map((entry) => entry.label);
    const channelDivinityCount = labels.filter((label) => label.toLowerCase().includes("channel divinity")).length;

    expect(channelDivinityCount).toBe(1);
    expect(labels).toContain("Spell Slots");
    expect(highlights.find((entry) => entry.label === "Spell Slots")?.remaining).toBe(4);
    expect(highlights.find((entry) => entry.label === "Spell Slots")?.max).toBe(6);
  });

  it("applies death save semantics for success, natural 1, and natural 20", () => {
    const draft = createCharacterDraft("death-save-layout-repair", "Death Save Layout Repair");
    const runtime = createRuntime();
    const atZeroHp = setCurrentHp(draft.playState, 0, runtime, "2026-05-13T10:00:00.000Z");

    const successRoll = rollAndRecord(atZeroHp, runtime, deathSaveRequest("roll:death-save:success"), {
      now: "2026-05-13T10:01:00.000Z",
      rng: rngFrom([0.49]),
    });
    const successResolution = resolveDeathSaveRollResolution(successRoll.result);
    const afterSuccess = recordDeathSave(successRoll.playState, successResolution, "2026-05-13T10:01:10.000Z");
    expect(successResolution).toBe("success");
    expect(afterSuccess.deathSaves.successes).toBe(1);
    expect(afterSuccess.playEvents.at(-1)?.type).toBe("death-save");

    const natOneRoll = rollAndRecord(atZeroHp, runtime, deathSaveRequest("roll:death-save:nat1"), {
      now: "2026-05-13T10:02:00.000Z",
      rng: rngFrom([0]),
    });
    const natOneResolution = resolveDeathSaveRollResolution(natOneRoll.result);
    const afterNatOne = recordDeathSave(natOneRoll.playState, natOneResolution, "2026-05-13T10:02:10.000Z");
    expect(natOneResolution).toBe("critical-failure");
    expect(afterNatOne.deathSaves.failures).toBe(2);

    const natTwentyRoll = rollAndRecord(atZeroHp, runtime, deathSaveRequest("roll:death-save:nat20"), {
      now: "2026-05-13T10:03:00.000Z",
      rng: rngFrom([0.999]),
    });
    const natTwentyResolution = resolveDeathSaveRollResolution(natTwentyRoll.result);
    const afterNatTwenty = recordDeathSave(natTwentyRoll.playState, natTwentyResolution, "2026-05-13T10:03:10.000Z");
    const healedFromNatTwenty = applyHealing(afterNatTwenty, 1, runtime, "2026-05-13T10:03:20.000Z");
    expect(natTwentyResolution).toBe("critical-success");
    expect(healedFromNatTwenty.currentHp).toBe(1);
    expect(healedFromNatTwenty.deathSaves.successes).toBe(0);
    expect(healedFromNatTwenty.deathSaves.failures).toBe(0);
  });

  it("keeps weapon action cards action-first with mastery and structured last result snippets", () => {
    const source = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    expect(source).toContain("Attack Roll");
    expect(source).toContain("Damage Roll");
    expect(source).toContain("Attack Flow");
    expect(source).toContain("Hit Confirmed");
    expect(source).toContain("Roll Damage");
    expect(source).toContain("Mastery Hint:");
    expect(source).toContain("Weapon Mastery:");
    expect(source).toContain("Manual: remember this effect when resolving the attack.");
    expect(source).toContain("Mastery selected, details unavailable.");
    expect(source).toContain("Action Details");
    expect(source).toContain("Automation Status");
    expect(source).toContain("Last Result:");
    expect(source).toContain(">d20<");
    expect(source).toContain(">Modifier<");
    expect(source).toContain(">Effects<");
    expect(source).toContain(">Total<");
    expect(source).not.toContain("lastRollSummary(");
  });

  it("keeps the roll dock reachable without covering desktop/tablet content", () => {
    const source = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    expect(source).toContain("pb-44 lg:pb-0");
    expect(source).toContain("hidden min-w-0 lg:block");
    expect(source).toContain("fixed inset-x-0 bottom-0");
    expect(source).toContain("backdrop-blur lg:hidden");
  });
});
