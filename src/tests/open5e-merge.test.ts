import { describe, expect, it } from "vitest";
import { mergeSnapshots } from "../services/data/open5e/merge";
import type { MpmContentSnapshot } from "../domain/content";

function buildBaseSnapshot(): MpmContentSnapshot {
  return {
    meta: {
      generatedAt: "2026-05-02T00:00:00.000Z",
      sourceFiles: ["local"],
      parseErrors: [],
    },
    sources: [
      {
        key: "UA:TEST",
        name: "UA Test",
      },
    ],
    classes: [],
    subclasses: [
      {
        id: "subclass:fighter-sample",
        key: "fighter-sample",
        classId: "class:fighter",
        classKey: "fighter",
        canonicalClassKey: "fighter",
        name: "Sample Fighter Subclass",
        sourceRefs: ["UA:TEST:1"],
        sourceMeta: {
          sourceSystem: "mpmb",
          sourceDocumentKey: "UA:TEST",
          sourceDocumentName: "UA Test",
          edition: "unknown",
          importPreset: "mpmb-local",
          rawSourceRef: "fighter-sample",
          dataStatus: "partial",
        },
        features: [],
      },
    ],
    species: [],
    backgrounds: [],
    feats: [],
    spells: [],
    equipment: [],
  };
}

function buildImportedSnapshot(): MpmContentSnapshot {
  return {
    meta: {
      generatedAt: "2026-05-02T00:00:00.000Z",
      sourceFiles: ["open5e"],
      parseErrors: [],
    },
    sources: [
      {
        key: "srd-2024",
        name: "5e 2024 Rules",
        group: "Open5e 2024",
      },
    ],
    classes: [
      {
        id: "class:fighter-2024",
        key: "fighter",
        canonicalClassKey: "fighter",
        name: "Fighter (2024)",
        sourceRefs: ["srd-2024"],
        sourceMeta: {
          sourceSystem: "open5e",
          sourceDocumentKey: "srd-2024",
          sourceDocumentName: "5e 2024 Rules",
          edition: "2024",
          importPreset: "open5e-both",
          rawSourceRef: "srd-2024_fighter",
          dataStatus: "complete",
        },
        features: [],
      },
    ],
    subclasses: [],
    species: [],
    backgrounds: [],
    feats: [],
    spells: [],
    equipment: [],
  };
}

describe("open5e merge", () => {
  it("keeps local data and adds imported classes additively", () => {
    const merged = mergeSnapshots(buildBaseSnapshot(), buildImportedSnapshot());
    expect(merged.merged.classes.length).toBe(1);
    expect(merged.merged.subclasses.length).toBe(1);
    expect(merged.merged.classes[0].canonicalClassKey).toBe("fighter");
    expect(merged.merged.subclasses[0].classKey).toBe("fighter");
  });
});
