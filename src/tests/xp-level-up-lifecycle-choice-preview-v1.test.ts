import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CharacterEngineState } from "../services/characterEngine";
import { createCharacterDraft } from "../domain/defaults";
import { contentSnapshot } from "../services/data/content";
import { resolveClasses } from "../services/data/rulesModeResolver";
import { resolveCharacterEngineState } from "../services/characterEngine";
import {
  addCharacterXp,
  applyLevelUpWithSnapshot,
  buildCharacterXpProgressState,
  buildLevelUpPreviewDiff,
  setCharacterXp,
  setHpGainMethod,
  undoLastLevelUp,
} from "../services/levelUp";

function mockEngine(overrides: {
  level: number;
  hp: number;
  proficiencyBonus: number;
  [key: string]: unknown;
}): CharacterEngineState {
  const { level, hp, proficiencyBonus, ...rest } = overrides as {
    level: number;
    hp: number;
    proficiencyBonus: number;
    [key: string]: unknown;
  };
  const base = {
    progression: {
      currentLevel: level,
      unlockedFeatures: [],
      spellProgression: {
        spellSlots: {},
        pendingChoices: [],
        notes: [],
      },
      pendingChoices: [],
    },
    derivedStats: {
      hitPoints: { max: hp },
      proficiencyBonus,
    },
    classDef: { name: "Test Class", hitDie: 10 },
    actionResources: {
      resourceSet: {
        resources: [],
      },
    },
    ruleEngine: {
      choiceSurface: {
        choices: [],
      },
    },
  } as unknown as CharacterEngineState;
  return { ...base, ...rest } as CharacterEngineState;
}

function createLevelThreePaladin() {
  const context = { provider: "mpmb", rulesMode: "2024" } as const;
  const classes = resolveClasses(contentSnapshot.classes, context);
  const paladin = classes.find((entry) => /paladin/i.test(`${entry.key} ${entry.name}`)) ?? classes[0];
  const draft = createCharacterDraft("xp-levelup-paladin", "XP Levelup Paladin");
  draft.provider = context.provider;
  draft.rulesMode = context.rulesMode;
  draft.classSelection.classId = paladin.id;
  draft.classSelection.level = 3;
  draft.abilityScores.con = 14;
  return { draft, context };
}

describe("xp + level-up lifecycle + choice preview v1", () => {
  it("sets and increments XP in character state", () => {
    const draft = createCharacterDraft("xp-set-add", "XP Set Add");
    const withSet = setCharacterXp(draft, 500);
    const withAdd = addCharacterXp(withSet, 250);
    expect(withSet.xp?.currentXp).toBe(500);
    expect(withAdd.xp?.currentXp).toBe(750);
  });

  it("computes next-level progress and threshold from XP state", () => {
    const draft = createCharacterDraft("xp-progress", "XP Progress");
    draft.classSelection.level = 2;
    draft.xp = { currentXp: 600, levelSource: "xp", milestoneMode: false };
    const progress = buildCharacterXpProgressState(draft);
    expect(progress.nextLevel).toBe(3);
    expect(progress.nextLevelThreshold).toBe(900);
    expect(progress.remainingToNextLevel).toBe(300);
    expect(progress.progressToNextLevel).toBeGreaterThan(0);
  });

  it("detects when level-up is available from XP thresholds", () => {
    const draft = createCharacterDraft("xp-available", "XP Available");
    draft.classSelection.level = 1;
    draft.xp = { currentXp: 1200, levelSource: "xp", milestoneMode: false };
    const progress = buildCharacterXpProgressState(draft);
    expect(progress.levelFromXp).toBeGreaterThan(1);
    expect(progress.levelUpAvailable).toBe(true);
  });

  it("builds a level-up preview diff with features, resources, spell slots and choices", () => {
    const before = mockEngine({
      level: 4,
      hp: 32,
      proficiencyBonus: 2,
      progression: {
        currentLevel: 4,
        unlockedFeatures: [{ id: "feature:a", name: "Feature A" }],
        spellProgression: {
          spellSlots: { 1: 4, 2: 2 },
          pendingChoices: [],
          notes: [],
        },
        pendingChoices: [],
      },
      actionResources: {
        resourceSet: {
          resources: [{ id: "resource:lay-on-hands", name: "Lay on Hands", usesMax: 20, recharge: { label: "Long Rest" } }],
        },
      },
      ruleEngine: {
        choiceSurface: {
          choices: [{ id: "choice:fighting-style", label: "Fighting Style", status: "pending", playerVisible: true, selectedCount: 0, requiredCount: 1, options: [] }],
        },
      },
    });
    const after = mockEngine({
      level: 5,
      hp: 40,
      proficiencyBonus: 3,
      progression: {
        currentLevel: 5,
        unlockedFeatures: [{ id: "feature:a", name: "Feature A" }, { id: "feature:b", name: "Feature B" }],
        spellProgression: {
          spellSlots: { 1: 4, 2: 3 },
          pendingChoices: [{ id: "pending:spell", required: true, satisfied: false, description: "Choose a spell", source: "spellcasting", level: 5, notes: [] }],
          notes: [],
        },
        pendingChoices: [{ id: "pending:spell", required: true, satisfied: false, description: "Choose a spell", source: "spellcasting", level: 5, notes: [] }],
      },
      actionResources: {
        resourceSet: {
          resources: [{ id: "resource:lay-on-hands", name: "Lay on Hands", usesMax: 25, recharge: { label: "Long Rest" } }],
        },
      },
      ruleEngine: {
        choiceSurface: {
          choices: [{ id: "choice:fighting-style", label: "Fighting Style", status: "pending", playerVisible: true, selectedCount: 0, requiredCount: 1, options: [] }],
        },
      },
    });

    const diff = buildLevelUpPreviewDiff(before, after);
    expect(diff.fromLevel).toBe(4);
    expect(diff.toLevel).toBe(5);
    expect(diff.newFeatures).toContain("Feature B");
    expect(diff.resourceChanges.some((entry) => entry.name === "Lay on Hands" && entry.before === 20 && entry.after === 25)).toBe(true);
    expect(diff.spellSlotChanges.some((entry) => entry.level === 2 && entry.before === 2 && entry.after === 3)).toBe(true);
    expect(diff.choiceStatuses.some((entry) => entry.label === "Fighting Style")).toBe(true);
  });

  it("applies a level-up step with snapshot capture", () => {
    const draft = createCharacterDraft("apply-levelup", "Apply Levelup");
    draft.classSelection.level = 3;
    const next = applyLevelUpWithSnapshot(draft);
    expect(next.classSelection.level).toBe(4);
    expect(next.xp?.lastLevelUpSnapshot?.fromLevel).toBe(3);
    expect(next.xp?.lastLevelUpSnapshot?.toLevel).toBe(4);
  });

  it("undoes last level-up and restores snapshot state", () => {
    const draft = createCharacterDraft("undo-levelup", "Undo Levelup");
    draft.classSelection.level = 3;
    draft.abilityScores.str = 12;
    const leveled = applyLevelUpWithSnapshot(draft);
    leveled.abilityScores.str = 16;
    const restored = undoLastLevelUp(leveled);
    expect(restored.classSelection.level).toBe(3);
    expect(restored.abilityScores.str).toBe(12);
    expect(restored.xp?.lastLevelUpSnapshot).toBeUndefined();
  });

  it("keeps HP gain progression deterministic after level-up step", () => {
    const { draft, context } = createLevelThreePaladin();
    const configured = setHpGainMethod(setHpGainMethod(draft, 2, "fixed/default"), 3, "rolled", 4);
    const before = resolveCharacterEngineState(contentSnapshot, configured, context);
    const leveled = applyLevelUpWithSnapshot(configured, { targetLevel: 4 });
    const after = resolveCharacterEngineState(contentSnapshot, leveled, context);
    expect(after.derivedStats.hitPoints.max).toBeGreaterThanOrEqual(before.derivedStats.hitPoints.max);
    expect(after.derivedStats.hitPoints.formula).toContain("L3 rolled 4 + CON");
  });

  it("includes spell slot changes in preview output", () => {
    const before = mockEngine({
      level: 2,
      hp: 18,
      proficiencyBonus: 2,
      progression: {
        currentLevel: 2,
        unlockedFeatures: [],
        spellProgression: {
          spellSlots: { 1: 2 },
          pendingChoices: [],
          notes: [],
        },
        pendingChoices: [],
      },
    });
    const after = mockEngine({
      level: 3,
      hp: 24,
      proficiencyBonus: 2,
      progression: {
        currentLevel: 3,
        unlockedFeatures: [],
        spellProgression: {
          spellSlots: { 1: 3, 2: 2 },
          pendingChoices: [],
          notes: [],
        },
        pendingChoices: [],
      },
    });
    const diff = buildLevelUpPreviewDiff(before, after);
    expect(diff.spellSlotChanges.length).toBeGreaterThan(0);
    expect(diff.spellSlotChanges.some((entry) => entry.level === 1)).toBe(true);
  });

  it("uses the reusable choice picker for magic-initiate and cantrip/spell style rule choices", () => {
    const source = readFileSync("src/pages/CharacterBuilderPage.tsx", "utf8");
    expect(source).toContain("ChoiceOptionPicker");
    expect(source).toContain("choice.choiceType === \"spell\" || choice.choiceType === \"cantrip\"");
  });

  it("keeps spell choice preview hover/focus interactions for keyboard and pointer flows", () => {
    const source = readFileSync("src/features/character-builder/wizard/components/ChoiceOptionPicker.tsx", "utf8");
    expect(source).toContain("onMouseEnter");
    expect(source).toContain("onFocus");
    expect(source).toContain("Hover, focus, or tap an option to update preview.");
  });

  it("shows casting time, range, duration and description in spell choice preview details", () => {
    const source = readFileSync("src/pages/CharacterBuilderPage.tsx", "utf8");
    expect(source).toContain("Casting Time");
    expect(source).toContain("Range");
    expect(source).toContain("Duration");
    expect(source).toContain("description: spell.description");
  });

  it("keeps fighting style choice details with description and automation status", () => {
    const source = readFileSync("src/pages/CharacterBuilderPage.tsx", "utf8");
    expect(source).toContain("automationStatus: choice.status === \"unsupported\" ? \"unsupported\" : \"partial\"");
    expect(source).toContain("description: source?.sourceText");
  });

  it("shows weapon mastery choice effect previews", () => {
    const source = readFileSync("src/pages/CharacterBuilderPage.tsx", "utf8");
    expect(source).toContain("weaponMasteryInfoForToken");
    expect(source).toContain("masteryInfo?.summary");
  });

  it("keeps pending/complete/unsupported/blocked status wiring aligned across manage and preview", () => {
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    const lifecycleSource = readFileSync("src/services/levelUp/levelUpLifecycle.ts", "utf8");
    expect(sheetSource).toContain("previewChoiceTone");
    expect(sheetSource).toContain("StatusBadge label={choice.status}");
    expect(lifecycleSource).toContain("toChoiceStatus");
    expect(lifecycleSource).toContain("\"unsupported\"");
    expect(lifecycleSource).toContain("\"blocked\"");
  });

  it("retains existing roll-trust, attack-flow and rule-detail drawer anchors", () => {
    const actionSource = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    const dockSource = readFileSync("src/features/character/components/sheet/PersistentRollDock.tsx", "utf8");
    const drawerSource = readFileSync("src/features/character/components/sheet/RuleDetailDrawer.tsx", "utf8");
    expect(actionSource).toContain("Attack Flow");
    expect(dockSource).toContain("Active Buffs");
    expect(drawerSource).toContain("Automation Status");
  });
});
