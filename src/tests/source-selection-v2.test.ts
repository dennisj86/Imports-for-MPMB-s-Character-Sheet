import { describe, expect, it } from "vitest";
import {
  getV2AllSourceKeys,
  getV2AvailableSources,
  normalizeSourceSelection,
  resolveSourceSelectionRuntime,
  sourcePresetKeys,
} from "../features/content/sourceSelectionService";
import { resolveSourceProvider } from "../services/data/sourceProvider";

describe("source selection v2", () => {
  it("normalizes and resolves selected source keys through mpmb-core registry runtime", () => {
    const allSourceKeys = getV2AllSourceKeys();
    const sample = allSourceKeys.slice(0, 25);
    const normalized = normalizeSourceSelection([...sample, "unknown-source-key", ...sample]);
    const runtime = resolveSourceSelectionRuntime(normalized);

    expect(normalized.length).toBeGreaterThan(0);
    expect(runtime.selectedSourceKeys).toEqual(normalized);
    expect(runtime.stats.sourceCount).toBe(normalized.length);
    expect(runtime.stats.classCount).toBeGreaterThanOrEqual(0);
    expect(runtime.stats.spellCount).toBeGreaterThanOrEqual(0);
  });

  it("builds provider and mode-specific source presets from v2 source catalog", () => {
    const sources = getV2AvailableSources();
    const mpmbPreset = sourcePresetKeys("provider-mpmb", sources);
    const open5ePreset = sourcePresetKeys("provider-open5e", sources);
    const upstream2014Preset = sourcePresetKeys("mpmb-upstream-2014-core", sources);
    const upstream2024Preset = sourcePresetKeys("mpmb-upstream-2024-core", sources);

    expect(mpmbPreset.length).toBeGreaterThan(0);
    expect(open5ePreset.length).toBeGreaterThan(0);
    expect(mpmbPreset.every((key) => resolveSourceProvider(sources.find((source) => source.key === key) ?? { key, group: undefined }) === "mpmb")).toBe(
      true,
    );
    expect(
      open5ePreset.every((key) => resolveSourceProvider(sources.find((source) => source.key === key) ?? { key, group: undefined }) === "open5e"),
    ).toBe(true);
    expect(upstream2014Preset.length).toBeGreaterThan(0);
    expect(upstream2024Preset.length).toBeGreaterThan(0);
    expect(new Set(upstream2014Preset)).not.toEqual(new Set(upstream2024Preset));
  });
});
