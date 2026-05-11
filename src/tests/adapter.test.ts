import { beforeEach, describe, expect, it } from "vitest";
import {
  getAvailableSources,
  getBackgrounds,
  getClasses,
  getEquipmentCatalog,
  getFeats,
  getSpecies,
  getSpellById,
  getSpells,
  findFeatByNameLike,
  regenerateContentForSelectedSources,
  getSubclassesForClass,
} from "../services/data/adapter";
import { sourceKeysForProvider } from "../services/data/sourceProvider";

describe("data adapters", () => {
  beforeEach(() => {
    const allSourceKeys = getAvailableSources().map((source) => source.key);
    regenerateContentForSelectedSources(allSourceKeys);
  });

  it("loads core content categories", () => {
    expect(getClasses().length).toBeGreaterThan(0);
    expect(getSpecies().length).toBeGreaterThan(0);
    expect(getBackgrounds().length).toBeGreaterThan(0);
    expect(getFeats().length).toBeGreaterThan(0);
    expect(getSpells().length).toBeGreaterThan(0);
  });

  it("filters subclasses by class id", () => {
    const classWithSubclass = getClasses().find((entry) => getSubclassesForClass(entry.id).length > 0);
    expect(classWithSubclass).toBeDefined();
    if (!classWithSubclass) {
      return;
    }
    const subclasses = getSubclassesForClass(classWithSubclass.id);
    expect(subclasses.length).toBeGreaterThan(0);
    const canonicalClassKey = classWithSubclass.canonicalClassKey ?? classWithSubclass.key.toLowerCase();
    expect(
      subclasses.every((entry) => {
        if (entry.classId === classWithSubclass.id) {
          return true;
        }
        const subclassCanonical = entry.canonicalClassKey ?? entry.classKey.toLowerCase();
        return subclassCanonical === canonicalClassKey;
      }),
    ).toBe(true);
  });

  it("links local subclasses to imported classes via canonical class key", () => {
    const fighterClass = getClasses().find((entry) => entry.key === "fighter");
    if (!fighterClass) {
      // Open5e classes may not be imported in every environment.
      expect(true).toBe(true);
      return;
    }
    const subclasses = getSubclassesForClass(fighterClass.id);
    expect(subclasses.some((entry) => (entry.classKey ?? "").toLowerCase() === "fighter")).toBe(true);
  });

  it("links local subclasses to mpmb-pdf classes via canonical class key", () => {
    const mpmbPdfFighter = getClasses().find(
      (entry) => entry.key === "fighter" && entry.sourceMeta?.sourceSystem === "mpmb" && entry.sourceMeta?.importPreset === "mpmb-pdf",
    );
    if (!mpmbPdfFighter) {
      // MPMB PDF import may not be present in every environment.
      expect(true).toBe(true);
      return;
    }

    const subclasses = getSubclassesForClass(mpmbPdfFighter.id);
    expect(subclasses.some((entry) => entry.sourceMeta?.importPreset === "mpmb-local")).toBe(true);
  });

  it("filters spells and resolves spell by id", () => {
    const cantrips = getSpells({ level: 0 });
    expect(cantrips.length).toBeGreaterThan(0);
    const first = cantrips[0];
    const resolved = getSpellById(first.id);
    expect(resolved?.id).toBe(first.id);
  });

  it("filters equipment by category", () => {
    const weapons = getEquipmentCatalog({ category: "weapon" });
    expect(weapons.length).toBeGreaterThan(0);
    expect(weapons.every((item) => item.category === "weapon")).toBe(true);
  });

  it("keeps adapter APIs usable with mpmb-only source selection", () => {
    const sources = getAvailableSources();
    const allSourceKeys = sources.map((source) => source.key);
    const mpmbSourceKeys = sourceKeysForProvider(sources, "mpmb");
    expect(mpmbSourceKeys.length).toBeGreaterThan(0);

    const stats = regenerateContentForSelectedSources(mpmbSourceKeys);
    expect(stats.classCount).toBeGreaterThan(0);
    expect(stats.spellCount).toBeGreaterThan(0);
    expect(getClasses().every((entry) => entry.sourceMeta?.sourceSystem === "mpmb")).toBe(true);

    regenerateContentForSelectedSources(allSourceKeys);
  });

  it("contains an outlander/wanderer background and only uses manual fallback when missing", () => {
    const backgrounds = getBackgrounds();
    const nativeOutlander = backgrounds.find((entry) => /outlander|wanderer/i.test(`${entry.name} ${entry.key}`));
    expect(nativeOutlander).toBeDefined();

    const manualFallback = backgrounds.find((entry) => entry.key === "outlander-wanderer-custom");
    if (!nativeOutlander) {
      expect(manualFallback).toBeDefined();
      if (!manualFallback) {
        return;
      }
      expect(manualFallback.bonusFeat).toBe("Magic Initiate (Cleric)");
      expect(findFeatByNameLike(manualFallback.bonusFeat ?? "")).toBeDefined();
      return;
    }
    expect(manualFallback).toBeUndefined();
  });
});
