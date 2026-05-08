import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getV2AllSourceKeys, sourcePresetKeys } from "../features/content/sourceSelectionService";
import { resolveContentBrowserV2State } from "../features/content/useContentBrowserV2State";

function includesText(value: string, needle: string): boolean {
  return value.toLowerCase().includes(needle.toLowerCase());
}

describe("content browser v2", () => {
  it("resolves all content categories from v2 core path", () => {
    const state = resolveContentBrowserV2State(getV2AllSourceKeys(), { provider: "all", rulesMode: "2024" });

    expect(state.classes.length).toBeGreaterThan(0);
    expect(state.species.length).toBeGreaterThan(0);
    expect(state.backgrounds.length).toBeGreaterThan(0);
    expect(state.feats.length).toBeGreaterThan(0);
    expect(state.spells.length).toBeGreaterThan(0);
    expect(state.equipment.length).toBeGreaterThan(0);
  });

  it("keeps provider/rulesMode semantics across mpmb 2014, mpmb 2024, open5e, and all", () => {
    const sourceKeys = getV2AllSourceKeys();
    const mpmb2014 = resolveContentBrowserV2State(sourceKeys, { provider: "mpmb", rulesMode: "2014" });
    const mpmb2024 = resolveContentBrowserV2State(sourceKeys, { provider: "mpmb", rulesMode: "2024" });
    const open5e = resolveContentBrowserV2State(sourceKeys, { provider: "open5e", rulesMode: "2024" });
    const combined = resolveContentBrowserV2State(sourceKeys, { provider: "all", rulesMode: "2024" });

    expect(mpmb2014.classes.length).toBeGreaterThan(0);
    expect(mpmb2024.classes.length).toBeGreaterThan(0);
    expect(open5e.classes.length).toBeGreaterThan(0);
    expect(combined.classes.length).toBeGreaterThanOrEqual(mpmb2024.classes.length);
    expect(open5e.classes.every((entry) => entry.sourceMeta?.sourceSystem === "open5e")).toBe(true);
    expect(mpmb2024.classes.every((entry) => entry.sourceMeta?.sourceSystem === "mpmb")).toBe(true);

    const paladin2014 = mpmb2014.classes.find((entry) => includesText(`${entry.key} ${entry.name}`, "paladin"));
    const paladin2024 = mpmb2024.classes.find((entry) => includesText(`${entry.key} ${entry.name}`, "paladin"));
    expect(paladin2014).toBeDefined();
    expect(paladin2024).toBeDefined();
    expect(paladin2014?.sourceMeta?.importPreset).toBe("mpmb-upstream-2014");
    expect(paladin2024?.sourceMeta?.importPreset).toBe("mpmb-upstream-2024");
  });

  it("applies spell and equipment filtering through the v2 content service", () => {
    const sourceKeys = getV2AllSourceKeys();
    const state = resolveContentBrowserV2State(sourceKeys, { provider: "all", rulesMode: "2024" });
    const paladinClass = state.classes.find((entry) => includesText(`${entry.key} ${entry.name}`, "paladin"));
    const classSpells = state.filterSpells({ classKey: paladinClass?.key, level: 1 });
    const weaponEquipment = state.filterEquipment({ category: "weapon" });

    if (paladinClass) {
      expect(classSpells.every((spell) => spell.classes.includes(paladinClass.key))).toBe(true);
    }
    expect(weaponEquipment.every((entry) => entry.category === "weapon")).toBe(true);
  });

  it("uses v2 runtime paths in source store/content browser without direct adapter dependency", () => {
    const sourceStore = readFileSync("src/store/sourceStore.ts", "utf8");
    const sourceSelectionPanel = readFileSync("src/features/content/components/SourceSelectionPanel.tsx", "utf8");
    const contentBrowserPage = readFileSync("src/pages/ContentBrowserPage.tsx", "utf8");
    const adapterSource = readFileSync("src/services/data/adapter.ts", "utf8");

    expect(sourceStore).not.toContain("services/data/adapter");
    expect(sourceSelectionPanel).not.toContain("services/data/adapter");
    expect(contentBrowserPage).not.toContain("services/data/adapter");
    expect(sourceStore).toContain("resolveSourceSelectionRuntime");
    expect(contentBrowserPage).toContain("useContentBrowserV2State");
    expect(adapterSource).toContain("Compat");
  });

  it("supports upstream core presets through v2 source preset resolution", () => {
    const upstream2014 = sourcePresetKeys("mpmb-upstream-2014-core");
    const upstream2024 = sourcePresetKeys("mpmb-upstream-2024-core");

    expect(upstream2014.length).toBeGreaterThan(0);
    expect(upstream2024.length).toBeGreaterThan(0);

    const state2014 = resolveContentBrowserV2State(upstream2014, { provider: "mpmb", rulesMode: "2014" });
    const state2024 = resolveContentBrowserV2State(upstream2024, { provider: "mpmb", rulesMode: "2024" });

    expect(state2014.classes.length).toBeGreaterThan(0);
    expect(state2024.classes.length).toBeGreaterThan(0);
  });
});
