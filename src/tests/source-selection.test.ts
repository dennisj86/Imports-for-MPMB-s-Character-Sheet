import { describe, expect, it } from "vitest";
import { getAvailableSources, getClasses, getSpells, regenerateContentForSelectedSources } from "../services/data/adapter";
import { sourceKeysForProvider } from "../services/data/sourceProvider";

describe("source selection and regeneration", () => {
  it("supports loading all sources and clearing source selection", () => {
    const allSourceKeys = getAvailableSources().map((source) => source.key);
    expect(allSourceKeys.length).toBeGreaterThan(0);

    const allStats = regenerateContentForSelectedSources(allSourceKeys);
    expect(allStats.sourceCount).toBe(allSourceKeys.length);
    expect(getClasses().length).toBeGreaterThan(0);
    expect(getSpells().length).toBeGreaterThan(0);

    const noneStats = regenerateContentForSelectedSources([]);
    expect(noneStats.sourceCount).toBe(0);
    expect(getClasses().length).toBe(0);
    expect(getSpells().length).toBe(0);

    regenerateContentForSelectedSources(allSourceKeys);
  });

  it("can regenerate with a subset of selected sources", () => {
    const allSourceKeys = getAvailableSources().map((source) => source.key);
    const subset = allSourceKeys.slice(0, Math.min(3, allSourceKeys.length));
    const stats = regenerateContentForSelectedSources(subset);
    expect(stats.sourceCount).toBe(subset.length);
    expect(getAvailableSources().length).toBe(allSourceKeys.length);

    regenerateContentForSelectedSources(allSourceKeys);
  });

  it("supports provider-level selection (mpmb | open5e)", () => {
    const availableSources = getAvailableSources();
    const allSourceKeys = availableSources.map((source) => source.key);
    const mpmbKeys = sourceKeysForProvider(availableSources, "mpmb");
    const open5eKeys = sourceKeysForProvider(availableSources, "open5e");

    expect(mpmbKeys.length).toBeGreaterThan(0);
    const mpmbStats = regenerateContentForSelectedSources(mpmbKeys);
    expect(mpmbStats.sourceCount).toBe(mpmbKeys.length);
    expect(getClasses().some((entry) => entry.sourceMeta?.sourceSystem === "mpmb")).toBe(true);

    if (open5eKeys.length > 0) {
      const open5eStats = regenerateContentForSelectedSources(open5eKeys);
      expect(open5eStats.sourceCount).toBe(open5eKeys.length);
      expect(getClasses().some((entry) => entry.sourceMeta?.sourceSystem === "open5e")).toBe(true);
    }

    regenerateContentForSelectedSources(allSourceKeys);
  });
});
