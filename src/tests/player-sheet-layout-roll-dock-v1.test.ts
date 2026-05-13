import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("player sheet layout + roll dock v1", () => {
  it("renders a persistent roll dock in desktop and mobile layouts", () => {
    const source = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    expect(source).toContain("PersistentRollDock");
    expect(source).toContain("lg:grid-cols-[minmax(0,1fr),minmax(300px,360px)]");
    expect(source).toContain("sticky top-3");
    expect(source).toContain("hidden min-w-0 lg:block");
    expect(source).toContain("fixed inset-x-0 bottom-0");
    expect(source).toContain("backdrop-blur lg:hidden");
  });

  it("keeps free roller, last roll, buffs and collapsible log in the dock", () => {
    const source = readFileSync("src/features/character/components/sheet/PersistentRollDock.tsx", "utf8");
    expect(source).toContain("Free Dice Roller");
    expect(source).toContain("RollResultCard");
    expect(source).toContain("Active Buffs");
    expect(source).toContain("Optional Buffs");
    expect(source).toContain("Play Log");
    expect(source).toContain("Show Log");
    expect(source).toContain("Death Save");
  });

  it("groups action surfaces into tactical sections with collapse controls", () => {
    const source = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    expect(source).toContain("Attacks");
    expect(source).toContain("Actions");
    expect(source).toContain("Bonus Actions");
    expect(source).toContain("Reactions");
    expect(source).toContain("Resources");
    expect(source).toContain("Ability Checks");
    expect(source).toContain("Saving Throws");
    expect(source).toContain("Skill Checks");
    expect(source).toContain("Collapse");
    expect(source).toContain("Expand");
  });

  it("keeps selected buff application in the roll pipeline", () => {
    const source = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    expect(source).toContain("activeEffectsForRollType");
    expect(source).toContain("selectedActiveEffectIds");
    expect(source).toContain("selectedActiveEffects");
    expect(source).toContain("rollWithSelectedEffects");
  });

  it("keeps custom buff editor collapsed and diagnostics hidden by default", () => {
    const actionSource = readFileSync("src/features/character/components/sheet/ActionRollPanel.tsx", "utf8");
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    expect(actionSource).toMatch(/showCustomBuffEditor,\s*setShowCustomBuffEditor\]\s*=\s*useState\(false\)/);
    expect(sheetSource).toContain("DiagnosticsDrawer");
    expect(sheetSource).toContain("Show Diagnostics");
  });
});
