import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { getAvailableSources, getClasses, getSubclassesForClass, regenerateContentForSelectedSources } from "../services/data/adapter";

declare const require: (id: string) => any;

const upstreamImporter = require("../../scripts/import-mpmb-upstream.cjs");

const upstream2014SnapshotPath = path.join(
  process.cwd(),
  "data",
  "imports",
  "mpmb-upstream-2014",
  "normalized",
  "latest-mpmb-upstream-2014-content.json",
);
const upstream2024SnapshotPath = path.join(
  process.cwd(),
  "data",
  "imports",
  "mpmb-upstream-2024",
  "normalized",
  "latest-mpmb-upstream-2024-content.json",
);
const upstream2014ComparisonPath = path.join(
  process.cwd(),
  "data",
  "imports",
  "mpmb-upstream-2014",
  "manifests",
  "comparison-report.json",
);
const upstream2024ComparisonPath = path.join(
  process.cwd(),
  "data",
  "imports",
  "mpmb-upstream-2024",
  "manifests",
  "comparison-report.json",
);

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function makeEmptySnapshot(): {
  meta: { generatedAt: string; sourceFiles: string[]; parseErrors: string[] };
  sources: any[];
  classes: any[];
  subclasses: any[];
  species: any[];
  backgrounds: any[];
  feats: any[];
  spells: any[];
  equipment: any[];
} {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFiles: [],
      parseErrors: [],
    },
    sources: [] as any[],
    classes: [] as any[],
    subclasses: [] as any[],
    species: [] as any[],
    backgrounds: [] as any[],
    feats: [] as any[],
    spells: [] as any[],
    equipment: [] as any[],
  };
}

describe("mpmb upstream integration", () => {
  beforeAll(() => {
    regenerateContentForSelectedSources(getAvailableSources().map((source) => source.key));
  });

  it("writes normalized upstream artifacts and comparison reports for 2014/2024", () => {
    expect(fs.existsSync(upstream2014SnapshotPath)).toBe(true);
    expect(fs.existsSync(upstream2024SnapshotPath)).toBe(true);
    expect(fs.existsSync(upstream2014ComparisonPath)).toBe(true);
    expect(fs.existsSync(upstream2024ComparisonPath)).toBe(true);

    const snapshot2014 = readJson<{
      classes: unknown[];
      species: unknown[];
      backgrounds: unknown[];
      spells: unknown[];
      feats: unknown[];
      equipment: unknown[];
      sources: unknown[];
    }>(upstream2014SnapshotPath);
    const snapshot2024 = readJson<{
      classes: unknown[];
      species: unknown[];
      backgrounds: unknown[];
      spells: unknown[];
      feats: unknown[];
      equipment: unknown[];
      sources: unknown[];
    }>(upstream2024SnapshotPath);

    expect(snapshot2014.classes.length).toBeGreaterThanOrEqual(10);
    expect(snapshot2014.spells.length).toBeGreaterThanOrEqual(250);
    expect(snapshot2024.classes.length).toBeGreaterThanOrEqual(10);
    expect(snapshot2024.spells.length).toBeGreaterThanOrEqual(250);
    expect(snapshot2024.backgrounds.length).toBeGreaterThanOrEqual(4);
  });

  it("prefers mpmb upstream 2014 core for provider=mpmb in rulesMode=2014", () => {
    const classes2014 = getClasses({ provider: "mpmb", rulesMode: "2014" });
    expect(classes2014.length).toBeGreaterThan(0);
    expect(classes2014.some((entry) => entry.sourceMeta?.importPreset === "mpmb-upstream-2014")).toBe(true);

    const paladin2014 = classes2014.find((entry) => entry.key === "paladin");
    expect(paladin2014).toBeDefined();
    if (!paladin2014) {
      return;
    }
    expect(paladin2014.sourceMeta?.importPreset).toBe("mpmb-upstream-2014");
    expect(paladin2014.sourceMeta?.edition).toBe("2014");
  });

  it("prefers mpmb upstream 2024 core for provider=mpmb in rulesMode=2024", () => {
    const classes2024 = getClasses({ provider: "mpmb", rulesMode: "2024" });
    expect(classes2024.length).toBeGreaterThan(0);
    expect(classes2024.some((entry) => entry.sourceMeta?.importPreset === "mpmb-upstream-2024")).toBe(true);

    const paladin2024 = classes2024.find((entry) => entry.key === "paladin");
    expect(paladin2024).toBeDefined();
    if (!paladin2024) {
      return;
    }
    expect(paladin2024.sourceMeta?.importPreset).toBe("mpmb-upstream-2024");
    expect(paladin2024.sourceMeta?.edition).toBe("2024");
  });

  it("keeps mpmb-local subclasses linkable to upstream core classes", () => {
    const fighter2014 = getClasses({ provider: "mpmb", rulesMode: "2014" }).find(
      (entry) => entry.key === "fighter" && entry.sourceMeta?.importPreset === "mpmb-upstream-2014",
    );
    expect(fighter2014).toBeDefined();
    if (!fighter2014) {
      return;
    }

    const subclasses = getSubclassesForClass(fighter2014.id, {
      provider: "mpmb",
      rulesMode: "2014",
      classLevel: 20,
    });
    expect(subclasses.length).toBeGreaterThan(0);
    expect(subclasses.some((entry) => entry.sourceMeta?.importPreset === "mpmb-local")).toBe(true);
  });

  it("enforces upstream > local > pdf merge precedence for same-identity entries", () => {
    const base = makeEmptySnapshot();
    const local = makeEmptySnapshot();
    local.classes = [
      {
        id: "class:fighter-local",
        key: "fighter",
        canonicalClassKey: "fighter",
        name: "Fighter Local",
        sourceRefs: ["P:1"],
        sourceMeta: {
          sourceSystem: "mpmb",
          sourceDocumentKey: "P",
          sourceDocumentName: "PHB",
          edition: "2014",
          importPreset: "mpmb-local",
          rawSourceRef: "ClassList:fighter",
        },
        features: [],
      },
    ];

    const pdf = makeEmptySnapshot();
    pdf.classes = [
      {
        id: "class:fighter-pdf",
        key: "fighter",
        canonicalClassKey: "fighter",
        name: "Fighter PDF",
        sourceRefs: ["mpmbpdf-srd:1"],
        sourceMeta: {
          sourceSystem: "mpmb",
          sourceDocumentKey: "mpmbpdf-srd",
          sourceDocumentName: "DnD.pdf",
          edition: "2014",
          importPreset: "mpmb-pdf",
          rawSourceRef: "ClassList:fighter",
        },
        features: [],
      },
    ];

    const upstream = makeEmptySnapshot();
    upstream.classes = [
      {
        id: "class:fighter-upstream",
        key: "fighter",
        canonicalClassKey: "fighter",
        name: "Fighter Upstream",
        sourceRefs: ["mpmbup14-p:1"],
        sourceMeta: {
          sourceSystem: "mpmb",
          sourceDocumentKey: "mpmbup14-p",
          sourceDocumentName: "MPMBs-Character-Record-Sheet",
          edition: "2014",
          importPreset: "mpmb-upstream-2014",
          rawSourceRef: "ClassList:fighter",
        },
        features: [],
      },
    ];

    const mergedLocalPdf = upstreamImporter.mergeSnapshots(base, local);
    const mergedWithPdf = upstreamImporter.mergeSnapshots(mergedLocalPdf, pdf);
    expect(mergedWithPdf.classes[0]?.name).toBe("Fighter Local");

    const mergedWithUpstream = upstreamImporter.mergeSnapshots(mergedWithPdf, upstream);
    expect(mergedWithUpstream.classes[0]?.name).toBe("Fighter Upstream");
  });
});
