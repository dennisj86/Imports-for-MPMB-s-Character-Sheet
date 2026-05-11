import { beforeEach, describe, expect, it } from "vitest";
import {
  getBackgrounds,
  getClasses,
  getConvertedBackgroundBenefits,
  getConvertedSpeciesTraits,
  getSpecies,
  getSpells,
  getSubclassesForClass,
  regenerateContentForSelectedSources,
  getAvailableSources,
} from "../services/data/adapter";

function includesText(value: string | undefined, search: string): boolean {
  return (value ?? "").toLowerCase().includes(search.toLowerCase());
}

describe("rules mode conversion", () => {
  beforeEach(() => {
    regenerateContentForSelectedSources(getAvailableSources().map((source) => source.key));
  });

  it("handles Half-Elf + Outlander + Paladin L1 in 2014 vs 2024", () => {
    const halfElf2014 = getSpecies({ provider: "mpmb", rulesMode: "2014" }).find((entry) => includesText(`${entry.name} ${entry.key}`, "half-elf"));
    const halfElf2024 = getSpecies({ provider: "mpmb", rulesMode: "2024" }).find((entry) => includesText(`${entry.name} ${entry.key}`, "half-elf"));
    expect(halfElf2014).toBeDefined();
    expect(halfElf2024).toBeDefined();
    if (!halfElf2014 || !halfElf2024) {
      return;
    }

    const species2014 = getConvertedSpeciesTraits(halfElf2014, "2014");
    const species2024 = getConvertedSpeciesTraits(halfElf2024, "2024");
    expect(species2014.ignoresLegacyAbilityScoreIncrease).toBe(false);
    expect(species2024.ignoresLegacyAbilityScoreIncrease).toBe(true);
    expect(species2024.conversionMode).toBe("2024-converted");

    const outlander2014 = getBackgrounds({ provider: "mpmb", rulesMode: "2014" }).find((entry) =>
      includesText(`${entry.name} ${entry.key}`, "outlander"),
    );
    const outlander2024 = getBackgrounds({ provider: "mpmb", rulesMode: "2024" }).find((entry) =>
      includesText(`${entry.name} ${entry.key}`, "outlander"),
    );
    expect(outlander2014).toBeDefined();
    expect(outlander2024).toBeDefined();
    if (!outlander2014 || !outlander2024) {
      return;
    }

    const background2014 = getConvertedBackgroundBenefits(outlander2014, "2014");
    const background2024 = getConvertedBackgroundBenefits(outlander2024, "2024");
    expect(background2014.abilityScoreMode).toBe("native");
    expect(background2014.abilityScoreRule).toBe("native");
    expect(background2024.abilityScoreMode).toBe("background-2024");
    expect(background2024.abilityScoreRule).toBe("background-2024");
    expect(background2024.requiresOriginFeat).toBe(true);
    expect(background2024.requiresOriginFeatSelection).toBe(true);
    expect(background2024.bonusFeat).toContain("Origin Feat");

    const paladin2024 = getClasses({ provider: "open5e", rulesMode: "2024" }).find((entry) => entry.key === "paladin");
    expect(paladin2024).toBeDefined();
    if (!paladin2024) {
      return;
    }
    expect(paladin2024.sourceMeta?.edition).toBe("2024");
  });

  it("applies Half-Elf / Paladin conversion behavior for open5e and mpmb", () => {
    for (const provider of ["open5e", "mpmb"] as const) {
      const species2014 = getSpecies({ provider, rulesMode: "2014" }).find((entry) => includesText(`${entry.name} ${entry.key}`, "half-elf"));
      const species2024 = getSpecies({ provider, rulesMode: "2024" }).find((entry) => includesText(`${entry.name} ${entry.key}`, "half-elf"));
      expect(species2014, `${provider} should expose a half-elf variant in 2014`).toBeDefined();
      expect(species2024, `${provider} should expose a half-elf variant in 2024`).toBeDefined();
      if (!species2014 || !species2024) {
        continue;
      }
      expect(getConvertedSpeciesTraits(species2014, "2014").ignoresLegacyAbilityScoreIncrease).toBe(false);
      expect(getConvertedSpeciesTraits(species2024, "2024").ignoresLegacyAbilityScoreIncrease).toBe(true);

      const paladin2024 = getClasses({ provider, rulesMode: "2024" }).find((entry) => entry.key === "paladin");
      expect(paladin2024, `${provider} should resolve a paladin in 2024`).toBeDefined();
      if (provider === "open5e" && paladin2024) {
        expect(paladin2024.sourceMeta?.edition).toBe("2024");
      }
    }
  });

  it("allows legacy subclasses in 2024 only when no 2024 replacement exists", () => {
    const paladin2024 = getClasses({ provider: "open5e", rulesMode: "2024" }).find((entry) => entry.key === "paladin");
    expect(paladin2024).toBeDefined();
    if (!paladin2024) {
      return;
    }

    const subclassesLevel1 = getSubclassesForClass(paladin2024.id, {
      provider: "all",
      rulesMode: "2024",
      classLevel: 1,
    });
    expect(subclassesLevel1.length).toBe(0);

    const subclassesLevel3 = getSubclassesForClass(paladin2024.id, {
      provider: "all",
      rulesMode: "2024",
      classLevel: 3,
    });
    expect(subclassesLevel3.length).toBeGreaterThan(0);

    const conquest = subclassesLevel3.find((entry) => includesText(entry.name, "conquest"));
    expect(conquest).toBeDefined();
    if (conquest) {
      expect(conquest.compatibility?.conversionMode === "2024-converted" || conquest.sourceMeta?.edition !== "2024").toBe(true);
    }

    const devotion = subclassesLevel3.filter((entry) => includesText(entry.name, "devotion"));
    expect(devotion.length).toBeGreaterThan(0);
    expect(devotion.every((entry) => entry.sourceMeta?.edition === "2024")).toBe(true);
  });

  it("prefers 2024 spell versions in 2024 rules mode", () => {
    const spells2024 = getSpells({ query: "magic missile" }, { provider: "open5e", rulesMode: "2024" }).filter((entry) =>
      includesText(entry.name, "magic missile"),
    );
    const spells2014 = getSpells({ query: "magic missile" }, { provider: "open5e", rulesMode: "2014" }).filter((entry) =>
      includesText(entry.name, "magic missile"),
    );
    expect(spells2024.length).toBeGreaterThan(0);
    expect(spells2014.length).toBeGreaterThan(0);
    expect(spells2024.every((entry) => entry.sourceMeta?.edition === "2024")).toBe(true);
    expect(spells2014.every((entry) => entry.sourceMeta?.edition === "2014")).toBe(true);
  });

  it("applies same conversion rules for open5e and mpmb providers", () => {
    const open5eConvertedSpecies = getSpecies({ provider: "open5e", rulesMode: "2024" }).find(
      (entry) => entry.compatibility?.conversionMode === "2024-converted",
    );
    const mpmbConvertedSpecies = getSpecies({ provider: "mpmb", rulesMode: "2024" }).find(
      (entry) => entry.compatibility?.conversionMode === "2024-converted",
    );
    expect(open5eConvertedSpecies).toBeDefined();
    expect(mpmbConvertedSpecies).toBeDefined();
    if (open5eConvertedSpecies) {
      const converted = getConvertedSpeciesTraits(open5eConvertedSpecies, "2024");
      expect(converted.ignoresLegacyAbilityScoreIncrease).toBe(true);
    }
    if (mpmbConvertedSpecies) {
      const converted = getConvertedSpeciesTraits(mpmbConvertedSpecies, "2024");
      expect(converted.ignoresLegacyAbilityScoreIncrease).toBe(true);
    }

    const open5eConvertedBackground = getBackgrounds({ provider: "open5e", rulesMode: "2024" }).find(
      (entry) => entry.compatibility?.conversionMode === "2024-converted",
    );
    const mpmbConvertedBackground = getBackgrounds({ provider: "mpmb", rulesMode: "2024" }).find(
      (entry) => entry.compatibility?.conversionMode === "2024-converted",
    );
    expect(open5eConvertedBackground).toBeDefined();
    expect(mpmbConvertedBackground).toBeDefined();
    if (open5eConvertedBackground) {
      const converted = getConvertedBackgroundBenefits(open5eConvertedBackground, "2024");
      expect(converted.abilityScoreMode).toBe("background-2024");
      expect(converted.abilityScoreRule).toBe("background-2024");
    }
    if (mpmbConvertedBackground) {
      const converted = getConvertedBackgroundBenefits(mpmbConvertedBackground, "2024");
      expect(converted.abilityScoreMode).toBe("background-2024");
      expect(converted.abilityScoreRule).toBe("background-2024");
    }
  });
});
