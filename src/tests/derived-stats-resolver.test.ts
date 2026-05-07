import { beforeEach, describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import {
  getAvailableSources,
  getBackgrounds,
  getClasses,
  getDerivedCharacterStats,
  getSpecies,
  regenerateContentForSelectedSources,
} from "../services/data/adapter";

function includesText(value: string | undefined, search: string): boolean {
  return (value ?? "").toLowerCase().includes(search.toLowerCase());
}

function buildDraft(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  const draft = createCharacterDraft(`derived-${provider}-${rulesMode}`, `Derived ${provider}/${rulesMode}`);
  draft.provider = provider;
  draft.rulesMode = rulesMode;
  draft.classSelection.level = 1;
  return draft;
}

function pickPaladin(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  return getClasses({ provider, rulesMode }).find((entry) => entry.key === "paladin");
}

function pickHalfElf(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  return getSpecies({ provider, rulesMode }).find((entry) => includesText(`${entry.name} ${entry.key}`, "half-elf"));
}

function pickBackground(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  const options = getBackgrounds({ provider, rulesMode });
  return (
    options.find((entry) => includesText(`${entry.name} ${entry.key}`, "outlander")) ??
    options.find((entry) => includesText(`${entry.name} ${entry.key}`, "acolyte")) ??
    options[0]
  );
}

describe("derived stats resolver", () => {
  beforeEach(() => {
    regenerateContentForSelectedSources(getAvailableSources().map((source) => source.key));
  });

  it("computes deterministic baseline modifiers, saves, skills, passives, initiative, hp, and ac", () => {
    const draft = buildDraft("mpmb", "2014");
    const paladin = pickPaladin("mpmb", "2014");
    const halfElf = pickHalfElf("mpmb", "2014");
    const background = pickBackground("mpmb", "2014");
    expect(paladin).toBeDefined();
    expect(halfElf).toBeDefined();
    expect(background).toBeDefined();
    if (!paladin || !halfElf || !background) {
      return;
    }
    draft.classSelection.classId = paladin.id;
    draft.speciesSelection.speciesId = halfElf.id;
    draft.backgroundSelection.backgroundId = background.id;

    const derived = getDerivedCharacterStats(draft, { provider: "mpmb", rulesMode: "2014" });

    expect(derived.proficiencyBonus).toBe(2);
    expect(derived.savingThrows.wis.proficient).toBe(true);
    expect(derived.savingThrows.cha.proficient).toBe(true);
    expect(derived.savingThrows.wis.total).toBe(2);
    expect(derived.savingThrows.cha.total).toBeGreaterThanOrEqual(3);
    expect(derived.initiative).toBe(0);
    expect(derived.passivePerception).toBe(10 + derived.skills.perception.total);
    expect(derived.hitPoints.max).toBe(10);
    expect(derived.armorClass.value).toBeGreaterThanOrEqual(10);
  });

  it("validates half-elf + outlander/paladin level 1 across provider/rulesMode matrix", () => {
    const matrix: Array<{ provider: "open5e" | "mpmb"; rulesMode: "2014" | "2024" }> = [
      { provider: "open5e", rulesMode: "2014" },
      { provider: "open5e", rulesMode: "2024" },
      { provider: "mpmb", rulesMode: "2014" },
      { provider: "mpmb", rulesMode: "2024" },
    ];

    for (const { provider, rulesMode } of matrix) {
      const draft = buildDraft(provider, rulesMode);
      const paladin = pickPaladin(provider, rulesMode);
      const halfElf = pickHalfElf(provider, rulesMode);
      const background = pickBackground(provider, rulesMode);
      expect(paladin, `${provider}/${rulesMode}: paladin missing`).toBeDefined();
      expect(halfElf, `${provider}/${rulesMode}: half-elf missing`).toBeDefined();
      expect(background, `${provider}/${rulesMode}: background missing`).toBeDefined();
      if (!paladin || !halfElf || !background) {
        continue;
      }
      draft.classSelection.classId = paladin.id;
      draft.speciesSelection.speciesId = halfElf.id;
      draft.backgroundSelection.backgroundId = background.id;

      const derived = getDerivedCharacterStats(draft, { provider, rulesMode });

      expect(derived.savingThrows.wis.proficient).toBe(true);
      expect(derived.savingThrows.cha.proficient).toBe(true);
      expect(derived.initiative).toBe(0);
      expect(derived.hitPoints.max).toBe(10);
      expect(derived.armorClass.value).toBeGreaterThanOrEqual(10);

      if (rulesMode === "2014") {
        expect(derived.abilityScores.cha.finalScore).toBeGreaterThanOrEqual(12);
        expect(derived.spellcasting.available).toBe(false);
      } else {
        expect(derived.abilityScores.cha.finalScore).toBe(10);
        expect(derived.abilityScores.cha.appliedBonus).toBe(0);
        if (includesText(`${background.name} ${background.key}`, "outlander")) {
          expect(derived.pending.some((entry) => entry.kind === "origin-feat")).toBe(true);
        }
      }
    }
  });

  it("keeps provider-independent paladin baseline consistent where comparable", () => {
    const open5eDraft = buildDraft("open5e", "2024");
    const mpmbDraft = buildDraft("mpmb", "2024");
    const open5ePaladin = pickPaladin("open5e", "2024");
    const mpmbPaladin = pickPaladin("mpmb", "2024");
    expect(open5ePaladin).toBeDefined();
    expect(mpmbPaladin).toBeDefined();
    if (!open5ePaladin || !mpmbPaladin) {
      return;
    }
    open5eDraft.classSelection.classId = open5ePaladin.id;
    mpmbDraft.classSelection.classId = mpmbPaladin.id;

    const open5e = getDerivedCharacterStats(open5eDraft, { provider: "open5e", rulesMode: "2024" });
    const mpmb = getDerivedCharacterStats(mpmbDraft, { provider: "mpmb", rulesMode: "2024" });
    expect(open5e.proficiencyBonus).toBe(mpmb.proficiencyBonus);
    expect(open5e.savingThrows.wis.proficient).toBe(mpmb.savingThrows.wis.proficient);
    expect(open5e.savingThrows.cha.proficient).toBe(mpmb.savingThrows.cha.proficient);
  });

  it("marks incomplete inputs as pending/partial instead of inventing values", () => {
    const draft = buildDraft("mpmb", "2024");
    const derived = getDerivedCharacterStats(draft, { provider: "mpmb", rulesMode: "2024" });
    expect(derived.speed.dataStatus === "pending" || derived.speed.dataStatus === "partial").toBe(true);
    expect(derived.hitPoints.dataStatus).toBe("pending");
    expect(derived.dataStatus === "pending" || derived.dataStatus === "partial").toBe(true);
  });
});

