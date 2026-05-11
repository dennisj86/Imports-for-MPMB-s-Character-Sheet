import { beforeEach, describe, expect, it } from "vitest";
import { createCharacterDraft } from "../domain/defaults";
import {
  getAppliedCharacterRules,
  getAvailableSources,
  getBackgrounds,
  getClasses,
  getSpecies,
  regenerateContentForSelectedSources,
} from "../services/data/adapter";

function includesText(value: string | undefined, search: string): boolean {
  return (value ?? "").toLowerCase().includes(search.toLowerCase());
}

function buildBaseDraft(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  const draft = createCharacterDraft(`draft-${provider}-${rulesMode}`, `Draft ${provider} ${rulesMode}`);
  draft.provider = provider;
  draft.rulesMode = rulesMode;
  draft.classSelection.level = 1;
  return draft;
}

function pickPaladin(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  return getClasses({ provider, rulesMode }).find((entry) => entry.key === "paladin");
}

function pickHalfElf(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  const options = getSpecies({ provider, rulesMode }).filter((entry) => includesText(`${entry.name} ${entry.key}`, "half-elf"));
  return (
    options.find((entry) => normalize(entry.key) === "half-elf") ??
    options.find((entry) => normalize(entry.name) === "half-elf") ??
    options[0]
  );
}

function pickBackground(provider: "open5e" | "mpmb", rulesMode: "2014" | "2024") {
  const backgrounds = getBackgrounds({ provider, rulesMode });
  return (
    backgrounds.find((entry) => includesText(`${entry.name} ${entry.key}`, "outlander")) ??
    backgrounds.find((entry) => includesText(`${entry.name} ${entry.key}`, "acolyte")) ??
    backgrounds[0]
  );
}

function normalize(value: string | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

describe("applied rules resolver", () => {
  beforeEach(() => {
    regenerateContentForSelectedSources(getAvailableSources().map((source) => source.key));
  });

  it("materializes half-elf + outlander/paladin baseline across provider/rulesMode matrix", () => {
    const matrix: Array<{ provider: "open5e" | "mpmb"; rulesMode: "2014" | "2024" }> = [
      { provider: "open5e", rulesMode: "2014" },
      { provider: "open5e", rulesMode: "2024" },
      { provider: "mpmb", rulesMode: "2014" },
      { provider: "mpmb", rulesMode: "2024" },
    ];

    for (const { provider, rulesMode } of matrix) {
      const paladin = pickPaladin(provider, rulesMode);
      const halfElf = pickHalfElf(provider, rulesMode);
      const background = pickBackground(provider, rulesMode);
      expect(paladin, `${provider}/${rulesMode}: missing paladin`).toBeDefined();
      expect(halfElf, `${provider}/${rulesMode}: missing half-elf`).toBeDefined();
      expect(background, `${provider}/${rulesMode}: missing baseline background`).toBeDefined();
      if (!paladin || !halfElf || !background) {
        continue;
      }

      const draft = buildBaseDraft(provider, rulesMode);
      draft.classSelection.classId = paladin.id;
      draft.speciesSelection.speciesId = halfElf.id;
      draft.backgroundSelection.backgroundId = background.id;

      const applied = getAppliedCharacterRules(draft, { provider, rulesMode });

      expect(applied.classResult.proficiencyBonus).toBe(2);
      expect(applied.proficiencies.savingThrows).toContain("wis");
      expect(applied.proficiencies.savingThrows).toContain("cha");

      if (rulesMode === "2014") {
        expect(applied.abilityScoreAdjustments.fixed.cha ?? 0).toBeGreaterThanOrEqual(2);
        expect(applied.abilityScoreAdjustments.ignored.length).toBe(0);
      } else {
        expect(applied.abilityScoreAdjustments.fixed.cha ?? 0).toBe(0);
        expect(applied.abilityScoreAdjustments.ignored.some((entry) => entry.source === "species")).toBe(true);
        expect(applied.backgroundResult.abilityScoreRule).toBe("background-2024");
        if (includesText(`${background.name} ${background.key}`, "outlander")) {
          expect(applied.backgroundResult.originFeatRequirement?.required).toBe(true);
        }
      }
    }
  });

  it("uses explicit background feat mapping before fallback matching", () => {
    const background = getBackgrounds({ provider: "open5e", rulesMode: "2024" }).find((entry) => includesText(`${entry.name} ${entry.key}`, "acolyte"));
    const paladin = pickPaladin("open5e", "2024");
    const species = pickHalfElf("open5e", "2024");
    expect(background).toBeDefined();
    expect(paladin).toBeDefined();
    expect(species).toBeDefined();
    if (!background || !paladin || !species) {
      return;
    }

    const draft = buildBaseDraft("open5e", "2024");
    draft.classSelection.classId = paladin.id;
    draft.speciesSelection.speciesId = species.id;
    draft.backgroundSelection.backgroundId = background.id;

    const applied = getAppliedCharacterRules(draft, { provider: "open5e", rulesMode: "2024" });
    expect(applied.backgroundResult.grantedFeatNames.length + applied.backgroundResult.unresolvedGrantedFeatNames.length).toBeGreaterThan(0);
    expect(
      applied.backgroundResult.grantedFeatNames.some((entry) => includesText(entry, "magic initiate")) ||
        applied.backgroundResult.unresolvedGrantedFeatNames.some((entry) => includesText(entry, "magic initiate")),
    ).toBe(true);
  });

  it("keeps legacy species traits in 2024 while removing legacy ASI application", () => {
    const draft = buildBaseDraft("mpmb", "2024");
    const paladin = pickPaladin("mpmb", "2024");
    const halfElf = pickHalfElf("mpmb", "2024");
    const outlander = pickBackground("mpmb", "2024");
    expect(paladin).toBeDefined();
    expect(halfElf).toBeDefined();
    expect(outlander).toBeDefined();
    if (!paladin || !halfElf || !outlander) {
      return;
    }
    draft.classSelection.classId = paladin.id;
    draft.speciesSelection.speciesId = halfElf.id;
    draft.backgroundSelection.backgroundId = outlander.id;

    const applied = getAppliedCharacterRules(draft, { provider: "mpmb", rulesMode: "2024" });
    expect(applied.speciesResult.traits.length).toBeGreaterThan(0);
    expect(applied.abilityScoreAdjustments.fixed.cha ?? 0).toBe(0);
    expect(applied.abilityScoreAdjustments.ignored.some((entry) => entry.reason.toLowerCase().includes("legacy species asi"))).toBe(true);
    expect(applied.conversionSummary.speciesConverted).toBe(true);
  });

  it("keeps class applied output consistent across providers where data exists", () => {
    const open5ePaladin = pickPaladin("open5e", "2024");
    const mpmbPaladin = pickPaladin("mpmb", "2024");
    expect(open5ePaladin).toBeDefined();
    expect(mpmbPaladin).toBeDefined();
    if (!open5ePaladin || !mpmbPaladin) {
      return;
    }

    const open5eDraft = buildBaseDraft("open5e", "2024");
    open5eDraft.classSelection.classId = open5ePaladin.id;
    const mpmbDraft = buildBaseDraft("mpmb", "2024");
    mpmbDraft.classSelection.classId = mpmbPaladin.id;

    const open5eApplied = getAppliedCharacterRules(open5eDraft, { provider: "open5e", rulesMode: "2024" });
    const mpmbApplied = getAppliedCharacterRules(mpmbDraft, { provider: "mpmb", rulesMode: "2024" });

    expect(open5eApplied.classResult.proficiencyBonus).toBe(mpmbApplied.classResult.proficiencyBonus);
    expect(open5eApplied.proficiencies.savingThrows).toEqual(mpmbApplied.proficiencies.savingThrows);
  });
});
