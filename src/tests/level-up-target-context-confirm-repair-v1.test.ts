import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import { buildProgressionViewModel } from "../features/character/viewModels";
import { resolveSpellManagementViewState } from "../features/spellManagement";
import { resolveWizardV2ViewState } from "../features/wizardV2";
import { resolveBuilderDeepLinkTarget, buildBuilderDeepLinkHref } from "../services/builderDeepLinks";
import { resolveCharacterEngineState } from "../services/characterEngine";
import { contentSnapshot } from "../services/data/content";
import { resolveBackgrounds, resolveClasses, resolveSpecies } from "../services/data/rulesModeResolver";
import { applyLevelUpWithSnapshot, buildLevelUpPreviewDiff } from "../services/levelUp";

const CONTEXT = { provider: "mpmb", rulesMode: "2024" } as const;

function allActiveSourceKeys(): string[] {
  return contentSnapshot.sources.map((source) => source.key);
}

function includesText(value: string | undefined, needle: string): boolean {
  return String(value ?? "").toLowerCase().includes(needle.toLowerCase());
}

function buildLevelOnePaladin() {
  const classes = resolveClasses(contentSnapshot.classes, CONTEXT);
  const species = resolveSpecies(contentSnapshot.species, CONTEXT);
  const backgrounds = resolveBackgrounds(contentSnapshot.backgrounds, CONTEXT);
  const paladin = classes.find((entry) => includesText(`${entry.name} ${entry.key}`, "paladin")) ?? classes[0];
  const human = species.find((entry) => includesText(`${entry.name} ${entry.key}`, "human")) ?? species[0];
  const background = backgrounds.find((entry) => includesText(`${entry.name} ${entry.key}`, "soldier")) ?? backgrounds[0];
  const draft = createCharacterDraft("level-up-target-context", "Level-Up Target Context");
  draft.provider = CONTEXT.provider;
  draft.rulesMode = CONTEXT.rulesMode;
  draft.classSelection.classId = paladin.id;
  draft.classSelection.level = 1;
  draft.speciesSelection.speciesId = human?.id;
  draft.backgroundSelection.backgroundId = background?.id;
  draft.abilityScores.str = 16;
  draft.abilityScores.con = 14;
  return draft;
}

function previewContext(targetLevel: number) {
  return {
    ...CONTEXT,
    levelUpTargetContext: {
      currentLevel: 1,
      targetLevel,
      source: "level-up-preview" as const,
      pendingChoiceId: "rule-choice:fighting-style",
    },
  };
}

describe("level-up target context + confirm handler repair v1", () => {
  it("resolves targetLevel 2 without persisting the character level", () => {
    const draft = buildLevelOnePaladin();

    const engine = resolveCharacterEngineState(contentSnapshot, draft, previewContext(2));

    expect(engine.persistedLevel).toBe(1);
    expect(engine.effectiveLevel).toBe(2);
    expect(engine.draft.classSelection.level).toBe(1);
    expect(engine.resolutionDraft.classSelection.level).toBe(2);
    expect(engine.progression.currentLevel).toBe(2);
    expect(engine.progression.targetLevel).toBe(2);
  });

  it("shows level-2 fighting-style choices in the builder while the persisted draft remains level 1", () => {
    const draft = buildLevelOnePaladin();

    const wizardView = resolveWizardV2ViewState(draft, allActiveSourceKeys(), previewContext(2));

    expect(wizardView).toBeDefined();
    if (!wizardView) {
      return;
    }

    const fightingStyle = wizardView.engine.ruleEngine.choiceSurface.choices.find((choice) => /fighting style/i.test(choice.label));
    expect(wizardView.engine.persistedLevel).toBe(1);
    expect(wizardView.engine.effectiveLevel).toBe(2);
    expect(wizardView.wizard.input.draft.classSelection.level).toBe(2);
    expect(wizardView.engine.draft.classSelection.level).toBe(1);
    expect(wizardView.wizardUi.steps.some((step) => step.id === "feats")).toBe(true);
    expect(fightingStyle).toBeDefined();
    expect(fightingStyle?.status).not.toBe("complete");
  });

  it("builds spell or cantrip pending links with preview target params", () => {
    const builderTarget = resolveBuilderDeepLinkTarget({
      id: "progression:spell-selection:cantrip",
      label: "Choose additional cantrip",
      kind: "spell-selection",
    });

    expect(builderTarget?.stepId).toBe("spells");
    if (!builderTarget) {
      return;
    }

    const href = buildBuilderDeepLinkHref("character-1", {
      ...builderTarget,
      levelUpTarget: 2,
      mode: "level-up-preview",
      pendingChoiceId: "progression:spell-selection:cantrip",
    });

    expect(href).toContain("/builder/character-1?");
    expect(href).toContain("step=spells");
    expect(href).toContain("levelUpTarget=2");
    expect(href).toContain("mode=level-up-preview");
    expect(href).toContain("pendingChoiceId=progression%3Aspell-selection%3Acantrip");
  });

  it("applies the preview target level on confirm and keeps pending choices visible afterward", () => {
    const draft = buildLevelOnePaladin();
    const beforeEngine = resolveCharacterEngineState(contentSnapshot, draft, CONTEXT);
    const afterEngine = resolveCharacterEngineState(contentSnapshot, draft, previewContext(2));
    const preview = buildLevelUpPreviewDiff(beforeEngine, afterEngine);

    const confirmed = applyLevelUpWithSnapshot(draft, { targetLevel: preview.toLevel });
    const committedEngine = resolveCharacterEngineState(contentSnapshot, confirmed, CONTEXT);
    const progression = buildProgressionViewModel(confirmed, committedEngine);

    expect(preview.canConfirm).toBe(true);
    expect(confirmed.classSelection.level).toBe(2);
    expect(progression.pendingChoiceCount).toBeGreaterThan(0);
    expect(progression.ruleChoices.some((choice) => /fighting style/i.test(choice.label))).toBe(true);
  });

  it("keeps committed pending links in the normal builder context after confirm", () => {
    const draft = applyLevelUpWithSnapshot(buildLevelOnePaladin(), { targetLevel: 2 });
    const engine = resolveCharacterEngineState(contentSnapshot, draft, CONTEXT);
    const progression = buildProgressionViewModel(draft, engine);
    const fightingStyle = progression.ruleChoices.find((choice) => /fighting style/i.test(choice.label));

    expect(fightingStyle?.builderTarget).toBeDefined();
    if (!fightingStyle?.builderTarget) {
      return;
    }

    const href = buildBuilderDeepLinkHref(draft.id, fightingStyle.builderTarget);
    expect(href).not.toContain("mode=level-up-preview");
    expect(href).not.toContain("levelUpTarget=");
  });

  it("threads preview context through builder, spell management, and confirm handler sources", () => {
    const builderSource = readFileSync("src/pages/CharacterBuilderPage.tsx", "utf8");
    const helperSource = readFileSync("src/services/levelUp/levelUpTargetContext.ts", "utf8");
    const sheetSource = readFileSync("src/pages/CharacterSheetPage.tsx", "utf8");
    const deepLinkSource = readFileSync("src/services/builderDeepLinks.ts", "utf8");
    const spellSource = readFileSync("src/features/spellManagement/useSpellManagement.ts", "utf8");

    expect(builderSource).toContain("parseLevelUpTargetContextFromSearchParams");
    expect(builderSource).toContain("effectiveBuilderLevel");
    expect(helperSource).toContain('searchParams.get("levelUpTarget")');
    expect(helperSource).toContain('searchParams.get("mode")');
    expect(sheetSource).toContain("targetLevel: levelUpPreview.toLevel");
    expect(sheetSource).toContain("\"Resolve now\"");
    expect(deepLinkSource).toContain('params.set("levelUpTarget"');
    expect(deepLinkSource).toContain('params.set("mode"');
    expect(spellSource).toContain("levelUpTargetContext");
  });

  it("keeps existing spell-management view resolution alive under preview context", () => {
    const draft = buildLevelOnePaladin();

    const normalView = resolveSpellManagementViewState(draft, allActiveSourceKeys(), CONTEXT);
    const previewView = resolveSpellManagementViewState(draft, allActiveSourceKeys(), previewContext(2));

    expect(normalView).toBeDefined();
    expect(previewView).toBeDefined();
    expect(previewView?.context.levelUpTargetContext?.targetLevel).toBe(2);
  });
});
