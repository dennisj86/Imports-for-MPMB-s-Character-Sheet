import { describe, expect, it } from "vitest";
import { contentSnapshot } from "../services/data/content";
import { createMpmbCoreRegistry, getMpmbCoreRuntimeLoadPlan, getMpmbCoreRuntimeRegistrySummary, resolveSnapshotForCoreContext } from "../services/mpmbCore";
import { buildMpmbV2ModeSnapshots } from "../services/mpmbNormalization/snapshotMerge";

describe("mpmb core v2", () => {
  it("creates deterministic 2014/2024 core mode snapshots", () => {
    const snapshots = buildMpmbV2ModeSnapshots(contentSnapshot);
    expect(snapshots.layers.core2014.classes.length).toBeGreaterThan(0);
    expect(snapshots.layers.core2024.classes.length).toBeGreaterThan(0);
    expect(snapshots.layers.core2014.classes.every((entry) => entry.sourceMeta?.importPreset === "mpmb-upstream-2014")).toBe(true);
    expect(snapshots.layers.core2024.classes.every((entry) => entry.sourceMeta?.importPreset === "mpmb-upstream-2024")).toBe(true);
  });

  it("resolves provider=mpmb by rules mode to separate core snapshots", () => {
    const registry = createMpmbCoreRegistry(contentSnapshot);
    const mpmb2014 = resolveSnapshotForCoreContext(registry, { provider: "mpmb", rulesMode: "2014" });
    const mpmb2024 = resolveSnapshotForCoreContext(registry, { provider: "mpmb", rulesMode: "2024" });

    expect(mpmb2014.classes.length).toBeGreaterThan(0);
    expect(mpmb2024.classes.length).toBeGreaterThan(0);
    expect(mpmb2014.classes.some((entry) => entry.key === "paladin" && entry.sourceMeta?.importPreset === "mpmb-upstream-2014")).toBe(true);
    expect(mpmb2024.classes.some((entry) => entry.key === "paladin" && entry.sourceMeta?.importPreset === "mpmb-upstream-2024")).toBe(true);
  });

  it("keeps open5e optional and separate from mpmb-only mode snapshot", () => {
    const registry = createMpmbCoreRegistry(contentSnapshot);
    const mpmb2024 = resolveSnapshotForCoreContext(registry, { provider: "mpmb", rulesMode: "2024" });
    const combined2024 = resolveSnapshotForCoreContext(registry, { provider: "all", rulesMode: "2024" });

    expect(combined2024.classes.length).toBeGreaterThanOrEqual(mpmb2024.classes.length);
    expect(combined2024.classes.some((entry) => entry.sourceMeta?.sourceSystem === "open5e")).toBe(true);
    expect(mpmb2024.classes.every((entry) => entry.sourceMeta?.sourceSystem === "mpmb")).toBe(true);
  });

  it("exposes runtime load plan and registry summaries for both rules modes", () => {
    const registry = createMpmbCoreRegistry(contentSnapshot);
    const plan2014 = getMpmbCoreRuntimeLoadPlan("2014");
    const plan2024 = getMpmbCoreRuntimeLoadPlan("2024");
    const summary2014 = getMpmbCoreRuntimeRegistrySummary(registry, "2014");
    const summary2024 = getMpmbCoreRuntimeRegistrySummary(registry, "2024");

    expect(plan2014.coreImportPreset).toBe("mpmb-upstream-2014");
    expect(plan2024.coreImportPreset).toBe("mpmb-upstream-2024");
    expect(plan2014.stages.some((stage) => stage.id === "core-variables")).toBe(true);
    expect(plan2014.stages.some((stage) => stage.id === "core-functions")).toBe(true);
    expect(plan2024.stages.some((stage) => stage.id === "wotc-overlays")).toBe(true);
    expect(summary2014.counts.classes).toBeGreaterThan(0);
    expect(summary2024.counts.classes).toBeGreaterThan(0);
    expect(summary2014.importPresetBreakdown.some((entry) => entry.importPreset === "mpmb-upstream-2014")).toBe(true);
    expect(summary2024.importPresetBreakdown.some((entry) => entry.importPreset === "mpmb-upstream-2024")).toBe(true);
  });
});
