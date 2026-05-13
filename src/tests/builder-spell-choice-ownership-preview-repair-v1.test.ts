import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import { buildProgressionViewModel } from "../features/character/viewModels";
import { resolveCharacterEngineState, resolveCharacterWizardState } from "../services/characterEngine";
import { contentSnapshot } from "../services/data/content";
import { resolveBackgrounds, resolveClasses, resolveFeats, resolveSpecies } from "../services/data/rulesModeResolver";
import { applySpellSelectionToDraft, buildSpellManagementState } from "../features/spellManagement";
import { buildLevelUpPreviewDiff } from "../services/levelUp";

const CONTEXT = { provider: "mpmb", rulesMode: "2024" } as const;

function includesText(value: string | undefined, token: string): boolean {
  return String(value ?? "").toLowerCase().includes(token.toLowerCase());
}

function buildMagicInitiateDraft() {
  const classes = resolveClasses(contentSnapshot.classes, CONTEXT);
  const species = resolveSpecies(contentSnapshot.species, CONTEXT);
  const backgrounds = resolveBackgrounds(contentSnapshot.backgrounds, CONTEXT);
  const feats = resolveFeats(contentSnapshot.feats, CONTEXT);
  const paladin = classes.find((entry) => includesText(`${entry.name} ${entry.key}`, "paladin")) ?? classes[0];
  const halfElf = species.find((entry) => includesText(`${entry.name} ${entry.key}`, "half-elf")) ?? species[0];
  const outlander = backgrounds.find((entry) => includesText(`${entry.name} ${entry.key}`, "outlander")) ?? backgrounds[0];
  const magicInitiate = feats.find((entry) => includesText(`${entry.name} ${entry.key}`, "magic initiate")) ?? feats[0];
  const draft = createCharacterDraft("builder-spell-ownership", "Builder Spell Ownership");
  draft.provider = CONTEXT.provider;
  draft.rulesMode = CONTEXT.rulesMode;
  draft.classSelection.classId = paladin.id;
  draft.classSelection.level = 1;
  draft.speciesSelection.speciesId = halfElf.id;
  draft.backgroundSelection.backgroundId = outlander.id;
  draft.featureChoices = [
    { featureId: "feat-choice:origin", optionId: magicInitiate.id },
    { featureId: `feat-choice:${magicInitiate.id}:spell-list`, optionId: "cleric" },
    { featureId: `feat-choice:${magicInitiate.id}:spell-ability`, optionId: "wis" },
  ];
  draft.featIds = [magicInitiate.id];
  return { draft, magicInitiate };
}

function magicInitiateParentStatus(draft: ReturnType<typeof buildMagicInitiateDraft>["draft"]): "complete" | "pending" | "unsupported" | "blocked" {
  const engine = resolveCharacterEngineState(contentSnapshot, draft, CONTEXT);
  const parent = engine.ruleEngine.choiceSurface.choices.find((choice) => choice.sourceName === "Magic Initiate" && choice.choiceType === "feature-option");
  return (parent?.status ?? "pending") as "complete" | "pending" | "unsupported" | "blocked";
}

describe("builder spell choice ownership + preview repair v1", () => {
  it("keeps one active preview region in ChoiceOptionPicker and replaces state on hover/focus", () => {
    const source = readFileSync("src/features/character-builder/wizard/components/ChoiceOptionPicker.tsx", "utf8");
    expect(source).toContain("id={`choice-preview-${choiceId}`}");
    expect(source).toContain("const [previewOptionId, setPreviewOptionId]");
    expect(source).toContain("onMouseEnter={() => setPreviewOptionId(option.id)}");
    expect(source).toContain("onFocus={() => setPreviewOptionId(option.id)}");
  });

  it("prevents repeated detail drawer accumulation in ChoiceOptionPicker", () => {
    const source = readFileSync("src/features/character-builder/wizard/components/ChoiceOptionPicker.tsx", "utf8");
    expect(source).toContain("const [detailOptionId, setDetailOptionId]");
    expect(source).toContain("const detailOpen = detailOptionId === option.id");
    expect(source).toContain("setDetailOptionId((current) => (current === option.id ? undefined : option.id))");
  });

  it("uses stable detail entry keys to avoid duplicate duration/description row growth", () => {
    const source = readFileSync("src/features/character/components/sheet/RuleDetailDrawer.tsx", "utf8");
    expect(source).toContain("entries.map((entry, index)");
    expect(source).toContain("`${detail.name}-${entry.label}-${index}`");
  });

  it("shows spell description preview renderer in Builder Spells step", () => {
    const source = readFileSync("src/features/character-builder/wizard/components/SpellChoiceSection.tsx", "utf8");
    expect(source).toContain("SpellOptionPreview");
    expect(source).toContain("heading=\"Spell Choice Preview\"");
  });

  it("routes Magic Initiate cantrip selection through spell contexts in Spells step", () => {
    const { draft, magicInitiate } = buildMagicInitiateDraft();
    const management = buildSpellManagementState(contentSnapshot, draft, CONTEXT);
    const cantripContext = management.contexts.find((entry) => entry.id === `spell-context:${magicInitiate.id}:cantrip`);
    expect(cantripContext).toBeDefined();
    expect(cantripContext?.requiredCount).toBe(2);
    expect(cantripContext?.eligibleSpells.length).toBeGreaterThan(0);
  });

  it("routes Magic Initiate level-1 spell selection through spell contexts in Spells step", () => {
    const { draft, magicInitiate } = buildMagicInitiateDraft();
    const management = buildSpellManagementState(contentSnapshot, draft, CONTEXT);
    const levelOneContext = management.contexts.find((entry) => entry.id === `spell-context:${magicInitiate.id}:level1`);
    expect(levelOneContext).toBeDefined();
    expect(levelOneContext?.requiredCount).toBe(1);
    expect(levelOneContext?.eligibleSpells.some((spell) => spell.level === 1)).toBe(true);
  });

  it("shows feat-tab summary/link for magic-initiate spell choices instead of inline spell lists", () => {
    const source = readFileSync("src/features/character-builder/wizard/components/FeatChoiceSection.tsx", "utf8");
    expect(source).toContain("Spell Choices Owned By Spells Tab");
    expect(source).toContain("Complete spell choices in Spells");
    expect(source).toContain("entry.source === \"feat\" && entry.sourceId === context.selectedFeatId");
  });

  it("updates feat-step completion path after selections are made in Spells step", () => {
    const { draft, magicInitiate } = buildMagicInitiateDraft();
    const beforeWizard = resolveCharacterWizardState(contentSnapshot, draft, CONTEXT);
    expect(beforeWizard.validations.feats.errors.some((entry) => entry.includes("Magic Initiate"))).toBe(true);

    const management = buildSpellManagementState(contentSnapshot, draft, CONTEXT);
    const cantripContext = management.spellChoices.find((entry) => entry.id === `spell-context:${magicInitiate.id}:cantrip`);
    const levelOneContext = management.spellChoices.find((entry) => entry.id === `spell-context:${magicInitiate.id}:level1`);
    expect(cantripContext).toBeDefined();
    expect(levelOneContext).toBeDefined();
    if (!cantripContext || !levelOneContext) {
      return;
    }
    const cantripA = cantripContext.eligibleSpells[0]?.id;
    const cantripB = cantripContext.eligibleSpells[1]?.id;
    const levelOne = levelOneContext.eligibleSpells[0]?.id;
    expect(cantripA && cantripB && levelOne).toBeTruthy();
    if (!cantripA || !cantripB || !levelOne) {
      return;
    }

    const afterCantripA = applySpellSelectionToDraft(draft, management, cantripContext.id, cantripA, true);
    const afterCantripB = applySpellSelectionToDraft(afterCantripA, management, cantripContext.id, cantripB, true);
    const afterLevelOne = applySpellSelectionToDraft(afterCantripB, management, levelOneContext.id, levelOne, true);
    const afterWizard = resolveCharacterWizardState(contentSnapshot, afterLevelOne, CONTEXT);
    expect(afterWizard.validations.feats.errors.some((entry) => entry.includes("Magic Initiate"))).toBe(false);
  });

  it("updates manage progression rule-choice status after spell-tab selections", () => {
    const { draft, magicInitiate } = buildMagicInitiateDraft();
    const management = buildSpellManagementState(contentSnapshot, draft, CONTEXT);
    const cantripContext = management.spellChoices.find((entry) => entry.id === `spell-context:${magicInitiate.id}:cantrip`);
    const levelOneContext = management.spellChoices.find((entry) => entry.id === `spell-context:${magicInitiate.id}:level1`);
    if (!cantripContext || !levelOneContext) {
      return;
    }
    const cantripA = cantripContext.eligibleSpells[0]?.id;
    const cantripB = cantripContext.eligibleSpells[1]?.id;
    const levelOne = levelOneContext.eligibleSpells[0]?.id;
    if (!cantripA || !cantripB || !levelOne) {
      return;
    }
    const filled = applySpellSelectionToDraft(
      applySpellSelectionToDraft(
        applySpellSelectionToDraft(draft, management, cantripContext.id, cantripA, true),
        management,
        cantripContext.id,
        cantripB,
        true,
      ),
      management,
      levelOneContext.id,
      levelOne,
      true,
    );
    const engine = resolveCharacterEngineState(contentSnapshot, filled, CONTEXT);
    const progression = buildProgressionViewModel(filled, engine);
    const parentChoice = progression.ruleChoices.find((entry) => /Magic Initiate/i.test(entry.label));
    expect(parentChoice?.status).toBe("complete");
  });

  it("updates level-up preview choice states from spell-tab-driven selection state", () => {
    const { draft, magicInitiate } = buildMagicInitiateDraft();
    const management = buildSpellManagementState(contentSnapshot, draft, CONTEXT);
    const cantripContext = management.spellChoices.find((entry) => entry.id === `spell-context:${magicInitiate.id}:cantrip`);
    const levelOneContext = management.spellChoices.find((entry) => entry.id === `spell-context:${magicInitiate.id}:level1`);
    if (!cantripContext || !levelOneContext) {
      return;
    }
    const cantripA = cantripContext.eligibleSpells[0]?.id;
    const cantripB = cantripContext.eligibleSpells[1]?.id;
    const levelOne = levelOneContext.eligibleSpells[0]?.id;
    if (!cantripA || !cantripB || !levelOne) {
      return;
    }
    const filled = applySpellSelectionToDraft(
      applySpellSelectionToDraft(
        applySpellSelectionToDraft(draft, management, cantripContext.id, cantripA, true),
        management,
        cantripContext.id,
        cantripB,
        true,
      ),
      management,
      levelOneContext.id,
      levelOne,
      true,
    );
    const beforeEngine = resolveCharacterEngineState(contentSnapshot, filled, CONTEXT);
    const nextLevelDraft = { ...filled, classSelection: { ...filled.classSelection, level: 2 } };
    const afterEngine = resolveCharacterEngineState(contentSnapshot, nextLevelDraft, CONTEXT);
    const preview = buildLevelUpPreviewDiff(beforeEngine, afterEngine);
    expect(preview.choiceStatuses.some((entry) => /Magic Initiate/i.test(entry.label) && entry.status === "complete")).toBe(true);
  });

  it("marks Magic Initiate complete only when list, ability, two cantrips, and one level-1 spell are set", () => {
    const { draft, magicInitiate } = buildMagicInitiateDraft();
    expect(magicInitiateParentStatus(draft)).toBe("pending");
    const management = buildSpellManagementState(contentSnapshot, draft, CONTEXT);
    const cantripContext = management.spellChoices.find((entry) => entry.id === `spell-context:${magicInitiate.id}:cantrip`);
    const levelOneContext = management.spellChoices.find((entry) => entry.id === `spell-context:${magicInitiate.id}:level1`);
    if (!cantripContext || !levelOneContext) {
      return;
    }
    const cantripA = cantripContext.eligibleSpells[0]?.id;
    const cantripB = cantripContext.eligibleSpells[1]?.id;
    const levelOne = levelOneContext.eligibleSpells[0]?.id;
    if (!cantripA || !cantripB || !levelOne) {
      return;
    }
    const filled = applySpellSelectionToDraft(
      applySpellSelectionToDraft(
        applySpellSelectionToDraft(draft, management, cantripContext.id, cantripA, true),
        management,
        cantripContext.id,
        cantripB,
        true,
      ),
      management,
      levelOneContext.id,
      levelOne,
      true,
    );
    expect(magicInitiateParentStatus(filled)).toBe("complete");
  });

  it("keeps one canonical spell-choice source via scoped feature choices and derived spellSelection mirror", () => {
    const source = readFileSync("src/features/spellManagement/spellManagementService.ts", "utf8");
    expect(source).toContain("spell-choice:");
    expect(source).toContain("collectScopedSelectedSpellIds");
    expect(source).toContain("selectedSpellIds: Array.from(new Set([...retainedLegacy, ...scopedSelected]))");
  });

  it("keeps XP/Level-Up lifecycle suite active", () => {
    const source = readFileSync("src/tests/xp-level-up-lifecycle-choice-preview-v1.test.ts", "utf8");
    expect(source).toContain("xp + level-up lifecycle + choice preview v1");
  });

  it("keeps rule detail drawer automation coverage suite active", () => {
    const source = readFileSync("src/tests/rule-detail-drawer-automation-status-v1.test.ts", "utf8");
    expect(source).toContain("rule detail drawer + automation status coverage v1");
  });

  it("keeps roll trust automation settings suite active", () => {
    const source = readFileSync("src/tests/roll-trust-automation-settings-v1.test.ts", "utf8");
    expect(source).toContain("roll trust + automation settings v1");
  });
});
