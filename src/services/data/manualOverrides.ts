import type { BackgroundDefinition, MpmContentSnapshot, SourceDefinition } from "../../domain/content";
import { buildId } from "../../lib/slug";

const manualSource: SourceDefinition = {
  key: "mpmb-manual",
  name: "MPMB Manual Overrides",
  group: "MPMB Overrides",
  defaultExcluded: false,
};

const manualBackgrounds: BackgroundDefinition[] = [
  {
    id: buildId("background", "outlander-wanderer-custom"),
    key: "outlander-wanderer-custom",
    name: "Outlander / Wanderer (Custom)",
    sourceRefs: ["mpmb-manual"],
    sourceMeta: {
      sourceSystem: "mpmb",
      sourceDocumentKey: "mpmb-manual",
      sourceDocumentName: "Manual Override",
      edition: "unknown",
      importPreset: "mpmb-manual",
      rawSourceRef: "manual:background:outlander-wanderer-custom",
      dataStatus: "manual",
    },
    skillText: "Athletics and Survival",
    toolText: "One musical instrument",
    traitText:
      "Wanderer-style fallback background. Manual override because this background is not consistently available in the current free provider snapshots.",
    bonusFeat: "Magic Initiate (Cleric)",
  },
];

function hasOutlanderLikeBackground(backgrounds: BackgroundDefinition[]): boolean {
  return backgrounds.some((entry) => /outlander|wanderer/i.test(`${entry.name} ${entry.key}`));
}

function mergeSources(existing: SourceDefinition[]): SourceDefinition[] {
  if (existing.some((entry) => entry.key === manualSource.key)) {
    return existing;
  }
  return [...existing, manualSource];
}

function mergeBackgrounds(existing: BackgroundDefinition[]): BackgroundDefinition[] {
  if (hasOutlanderLikeBackground(existing)) {
    return existing;
  }
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of manualBackgrounds) {
    if (!byId.has(entry.id)) {
      byId.set(entry.id, entry);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function applyManualOverrides(snapshot: MpmContentSnapshot): MpmContentSnapshot {
  return {
    ...snapshot,
    sources: mergeSources(snapshot.sources),
    backgrounds: mergeBackgrounds(snapshot.backgrounds),
  };
}
