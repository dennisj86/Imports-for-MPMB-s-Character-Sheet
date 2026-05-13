import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CharacterActionResourceState } from "../domain/actionResources";
import type { DerivedCharacterStats } from "../domain/derivedStats";
import type { RollActionDescriptor, RollRequest } from "../domain/rolls";
import type { CharacterEngineState } from "../services/characterEngine";
import { createCharacterDraft } from "../domain/defaults";
import { detectOnHitRiders, resolveSafeRiderSpends, riderDiceModifiers, type OnHitRiderOption } from "../features/character/components/sheet/ActionRollPanel";
import { rollAndRecord, recordAttackResolution, type PlayStateRuntimeContext } from "../services/playState";
import { dedupeActionDescriptors, buildCharacterRollView, executeRollRequest } from "../services/rolls";

function createRuntime(): PlayStateRuntimeContext {
  return {
    maxHp: 20,
    constitutionModifier: 2,
    hitDicePools: [],
    resourceMaxByKey: {
      "resource:smite-safe": 2,
    },
    resourceRechargeByKey: {
      "resource:smite-safe": "long-rest",
    },
    resourceNameByKey: {
      "resource:smite-safe": "Divine Smite",
    },
    spellSlotMaxByKey: {},
    spellSlotRechargeByKey: {},
    restPlan: {
      shortRest: { resourceKeys: [], spellSlotKeys: [], skipped: [], notes: [] },
      longRest: { resourceKeys: [], spellSlotKeys: [], skipped: [], notes: [] },
    },
  };
}

function createDerivedStats(): DerivedCharacterStats {
  return {
    abilityScores: {
      str: { modifier: 2 },
      dex: { modifier: 1 },
      con: { modifier: 2 },
      int: { modifier: 0 },
      wis: { modifier: 0 },
      cha: { modifier: 3 },
    },
    savingThrows: {
      str: { total: 2, proficient: false, abilityModifier: 2, proficiencyBonus: 0 },
      dex: { total: 1, proficient: false, abilityModifier: 1, proficiencyBonus: 0 },
      con: { total: 2, proficient: false, abilityModifier: 2, proficiencyBonus: 0 },
      int: { total: 0, proficient: false, abilityModifier: 0, proficiencyBonus: 0 },
      wis: { total: 0, proficient: false, abilityModifier: 0, proficiencyBonus: 0 },
      cha: { total: 3, proficient: false, abilityModifier: 3, proficiencyBonus: 0 },
    },
    skills: {},
    proficiencyBonus: 2,
    passivePerception: 10,
    passiveInvestigation: 10,
    passiveInsight: 10,
    initiative: 1,
    speed: { walking: 30, notes: [], dataStatus: "complete" },
    armorClass: { value: 15, calculation: "test", dexApplied: 1, notes: [], dataStatus: "complete" },
    hitPoints: { max: 20, formula: "fixed", mode: "fixed-average", notes: [], dataStatus: "complete" },
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
  } as unknown as DerivedCharacterStats;
}

function actionState(actions: CharacterActionResourceState["actionSet"]["actions"]): CharacterActionResourceState {
  return {
    provider: "mpmb",
    rulesMode: "2024",
    level: 3,
    actionSet: {
      actions,
      bonusActions: [],
      reactions: [],
      freeActions: [],
      utilityActions: [],
    },
    resourceSet: {
      resources: [],
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

function rollRequest(id: string, label: string, type: RollRequest["type"]): RollRequest {
  return {
    id,
    label,
    type,
    sourceType: "custom",
    sourceId: "test",
    modifier: 5,
    diceExpression: type === "damage-roll" ? "1d8+3" : "1d20",
    rollMode: "normal",
  };
}

describe("attack resolution + action details v1", () => {
  it("keeps attack flow action-first with explicit hit confirmation controls", () => {
    const source = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    expect(source).toContain("Attack Flow");
    expect(source).toContain("resolveAttackDecision(\"hit\")");
    expect(source).toContain("resolveAttackDecision(\"miss\")");
    expect(source).toContain("resolveAttackDecision(\"cancel\")");
  });

  it("keeps miss path without automatic damage execution", () => {
    const source = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    expect(source).toContain("Damage roll skipped.");
    expect(source).toContain("rollDamageFromConfirmedHit");
  });

  it("logs attack confirmation separately and links follow-up damage rolls", () => {
    const runtime = createRuntime();
    const draft = createCharacterDraft("attack-flow-log", "Attack Flow Log");
    const attack = rollAndRecord(draft.playState, runtime, {
      ...rollRequest("roll:attack:test", "Rapier Attack", "attack-roll"),
      metadata: { attackFlowId: "flow:test", flowStep: "attack-roll" },
    });
    const afterDecision = recordAttackResolution(attack.playState, "Rapier Attack", "hit", {
      actionId: "action:item-weapon:rapier",
      attackRequestId: "roll:attack:test",
      attackRollResultId: attack.result.id,
      flowId: "flow:test",
      weaponMasteryName: "Vex",
    });
    const damage = rollAndRecord(afterDecision, runtime, {
      ...rollRequest("roll:damage:test", "Rapier Damage", "damage-roll"),
      metadata: {
        attackFlowId: "flow:test",
        attackRollResultId: attack.result.id,
        attackResolution: "hit",
        onHitRiderLabels: ["Divine Smite"],
      },
    });
    expect(damage.playState.playEvents.map((event) => event.type)).toEqual(["roll", "attack-resolution", "roll"]);
    const lastPayload = damage.playState.playEvents.at(-1)?.payload.rollResult as { metadata?: Record<string, unknown> } | undefined;
    expect(lastPayload?.metadata?.attackRollResultId).toBe(attack.result.id);
  });

  it("detects divine smite and sneak attack on-hit riders when present", () => {
    const resourceById = new Map([
      ["resource:smite-safe", { id: "resource:smite-safe", name: "Divine Smite", max: 2, spent: 0, remaining: 2, rechargeType: "long-rest", rechargeLabel: "Long Rest", dataStatus: "complete" }],
    ] as const);
    const candidates: RollActionDescriptor[] = [
      {
        id: "action:feature:divine-smite",
        label: "Divine Smite",
        sourceType: "feature",
        sourceDetailType: "class",
        resourceIds: ["resource:smite-safe"],
        notes: [],
        description: "When you hit, add 2d8 radiant damage.",
      },
      {
        id: "action:feature:sneak-attack",
        label: "Sneak Attack",
        sourceType: "feature",
        sourceDetailType: "class",
        resourceIds: [],
        notes: [],
        description: "Once per turn, add 1d6 extra damage on a hit.",
      },
    ];
    const riders = detectOnHitRiders(candidates, resourceById as unknown as Map<string, any>);
    expect(riders.map((entry) => entry.id)).toEqual(expect.arrayContaining(["rider:divine-smite", "rider:sneak-attack"]));
  });

  it("adds selected on-hit rider dice as bonus damage modifiers", () => {
    const modifiers = riderDiceModifiers([
      {
        id: "rider:divine-smite",
        label: "Divine Smite",
        diceExpression: "2d8",
        automationStatus: "partial",
      },
    ] as OnHitRiderOption[]);
    const result = executeRollRequest(
      {
        id: "roll:damage:rider",
        type: "damage-roll",
        label: "Rapier Damage",
        sourceType: "custom",
        sourceId: "test",
        modifier: 0,
        diceExpression: "1d8",
        rollMode: "normal",
        temporaryModifiers: modifiers,
      },
      {
        rng: () => 0.5,
        now: "2026-05-13T00:00:00.000Z",
      },
    );
    expect(result.bonusDice?.[0]?.expression).toBe("2d8");
    expect(result.bonusDice?.[0]?.sourceName).toBe("Divine Smite");
  });

  it("only marks deterministic rider resource spends as safe", () => {
    const riders: OnHitRiderOption[] = [
      {
        id: "rider:divine-smite",
        label: "Divine Smite",
        diceExpression: "2d8",
        automationStatus: "partial",
        safeResourceId: "resource:smite-safe",
        safeResourceLabel: "Divine Smite",
      },
      {
        id: "rider:manual-slot",
        label: "Paladin's Smite",
        diceExpression: "2d8",
        automationStatus: "manual",
      },
    ];
    const safe = resolveSafeRiderSpends(riders);
    expect(safe).toEqual([{ resourceId: "resource:smite-safe", label: "Divine Smite" }]);
  });

  it("surfaces divine sense and lay on hands action descriptions in roll descriptors", () => {
    const engine = {
      derivedStats: createDerivedStats(),
      actionResources: actionState([
        {
          id: "action:feature:divine-sense",
          name: "Divine Sense",
          activationType: "bonus-action",
          source: { sourceType: "class", sourceId: "class:paladin", sourceName: "Paladin" },
          sourceType: "class",
          sourceId: "class:paladin",
          description: "As a bonus action, detect celestials, fiends, and undead.",
          requiresResourceIds: [],
          prerequisites: [],
          notes: [],
          dataStatus: "complete",
        },
        {
          id: "action:feature:lay-on-hands",
          name: "Lay on Hands",
          activationType: "action",
          source: { sourceType: "class", sourceId: "class:paladin", sourceName: "Paladin" },
          sourceType: "class",
          sourceId: "class:paladin",
          description: "As an action, restore hit points from your pool.",
          requiresResourceIds: [],
          prerequisites: [],
          notes: [],
          dataStatus: "complete",
        },
      ]),
      selectedSpells: [],
    } as unknown as CharacterEngineState;
    const view = buildCharacterRollView(engine);
    const divineSense = view.actionRolls.find((entry) => entry.label === "Divine Sense");
    const layOnHands = view.actionRolls.find((entry) => entry.label === "Lay on Hands");
    expect(divineSense?.description).toContain("bonus action");
    expect(layOnHands?.description).toContain("restore hit points");
  });

  it("deduplicates prefixed paladin action aliases and records hidden duplicates", () => {
    const deduped = dedupeActionDescriptors([
      {
        id: "action:feature:divine-sense",
        label: "Divine Sense",
        activationType: "bonus-action",
        sourceType: "feature",
        sourceDetailType: "class",
        sourceSummary: "Paladin",
        sourceSummaries: ["Paladin"],
        resourceIds: [],
        notes: [],
      },
      {
        id: "option-scoped-action:divine-sense",
        label: "Paladin: Divine Sense",
        activationType: "bonus-action",
        sourceType: "feature",
        sourceDetailType: "class",
        sourceSummary: "Paladin",
        sourceSummaries: ["Paladin"],
        resourceIds: [],
        notes: [],
      },
    ]);
    expect(deduped.descriptors).toHaveLength(1);
    expect(deduped.descriptors[0]?.label).toBe("Divine Sense");
    expect(deduped.hiddenDuplicates).toHaveLength(1);
  });

  it("keeps detail drawer + mastery hint surfaces and diagnostics wiring", () => {
    const actionPanelSource = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    const diagnosticsSource = readFileSync("src/features/character/components/sheet/DiagnosticsPanel.tsx", "utf8");
    expect(actionPanelSource).toContain("Action Details");
    expect(actionPanelSource).toContain("Automation Status");
    expect(actionPanelSource).toContain("Mastery Hint:");
    expect(diagnosticsSource).toContain("Action Card Dedupe");
  });

  it("preserves roll dock and play-state regression anchors", () => {
    const rollDockSource = readFileSync("src/features/character/components/sheet/PersistentRollDock.tsx", "utf8");
    const playStateServiceSource = readFileSync("src/services/playState/playStateService.ts", "utf8");
    expect(rollDockSource).toContain("Death Save");
    expect(rollDockSource).toContain("Active Buffs");
    expect(playStateServiceSource).toContain("spendHitDie");
    expect(playStateServiceSource).toContain("recordAttackResolution");
  });
});
