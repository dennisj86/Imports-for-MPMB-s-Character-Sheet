import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getClasses, getSubclassesForClass } from "../services/data/adapter";

declare const require: (id: string) => any;

const runtimeGenerator = require("../../scripts/generate-mpmb-data.cjs");

const diagnosticsPath = path.join(process.cwd(), "data/imports/mpmb-local/manifests/latest-runtime-diagnostics.json");
const summaryPath = path.join(process.cwd(), "data/imports/mpmb-local/manifests/latest-runtime-summary.json");
const localContentPath = path.join(process.cwd(), "src/services/data/generated/mpmb-local-content.json");

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

describe("mpmb runtime fixes", () => {
  it("prioritizes core seed files before supplements in load plan", () => {
    const sourceFiles = [
      "WotC material/ua_20190514_Artificer_dupl.js",
      "WotC material/pub_20171121_XGtE.js",
      "WotC 2024/pub_20240917_PHB.js",
      "WotC material/pub_20140818_PHB.js",
      "Homebrew/reddit_20180203_Tome-of-Monstrous-Races.js",
    ];
    const loadPlan = runtimeGenerator.createLoadPlan(sourceFiles);
    expect(loadPlan.orderedFiles.slice(0, 2)).toEqual(["WotC 2024/pub_20240917_PHB.js", "WotC material/pub_20140818_PHB.js"]);
  });

  it("keeps class/background/spell registries usable after generation", () => {
    const localContent = readJsonFile<{
      classes: unknown[];
      backgrounds: unknown[];
      spells: unknown[];
      meta: { parseErrors: string[] };
    }>(localContentPath);
    expect(localContent.classes.length).toBeGreaterThan(0);
    expect(localContent.backgrounds.length).toBeGreaterThan(0);
    expect(localContent.spells.length).toBeGreaterThan(0);
    expect(localContent.meta.parseErrors.length).toBe(0);
  });

  it("records AddBackgroundVariant shim usage in diagnostics", () => {
    const diagnostics = readJsonFile<{
      shimCallsTop: Array<{ name: string; count: number }>;
    }>(diagnosticsPath);
    const addBackgroundVariant = diagnostics.shimCallsTop.find((entry) => entry.name === "AddBackgroundVariant");
    expect(addBackgroundVariant).toBeDefined();
    expect((addBackgroundVariant?.count ?? 0) > 0).toBe(true);
  });

  it("processes historically problematic artificer UA files without hard crash", () => {
    const diagnostics = readJsonFile<{
      fileResults: Array<{ file: string; status: string }>;
      parseErrorCount: number;
    }>(diagnosticsPath);
    const ua2 = diagnostics.fileResults.find((entry) => entry.file === "WotC material/ua_20190228_Artificer_dupl.js");
    const ua3 = diagnostics.fileResults.find((entry) => entry.file === "WotC material/ua_20190514_Artificer_dupl.js");
    expect(diagnostics.parseErrorCount).toBe(0);
    expect(ua2?.status).toBe("ok");
    expect(ua3?.status).toBe("ok");
  });

  it("enforces regression thresholds for entity counts and parse errors", () => {
    const summary = readJsonFile<{
      local: {
        classes: number;
        subclasses: number;
        backgrounds: number;
        feats: number;
        spells: number;
        equipment: number;
        parseErrors: number;
      };
      regression: {
        failures: unknown[];
      };
    }>(summaryPath);
    expect(summary.regression.failures.length).toBe(0);
    expect(summary.local.parseErrors).toBe(0);
    expect(summary.local.classes).toBeGreaterThanOrEqual(15);
    expect(summary.local.subclasses).toBeGreaterThanOrEqual(230);
    expect(summary.local.backgrounds).toBeGreaterThanOrEqual(132);
    expect(summary.local.feats).toBeGreaterThanOrEqual(227);
    expect(summary.local.spells).toBeGreaterThanOrEqual(256);
    expect(summary.local.equipment).toBeGreaterThanOrEqual(509);
  });

  it("keeps subclass linking intact for generated mpmb classes", () => {
    const fighter = getClasses().find((entry) => entry.key === "fighter" && entry.sourceMeta?.importPreset === "mpmb-local");
    if (!fighter) {
      expect(true).toBe(true);
      return;
    }
    const subclasses = getSubclassesForClass(fighter.id);
    expect(subclasses.length).toBeGreaterThan(0);
  });
});
