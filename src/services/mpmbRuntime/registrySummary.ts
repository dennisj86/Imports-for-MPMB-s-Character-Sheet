import type { MpmContentSnapshot, RulesMode } from "../../domain/content";
import { getCoreImportPresetForRulesMode } from "./runtimeLoadPlan";

type SnapshotEntity = {
  sourceRefs: string[];
  sourceMeta?: {
    importPreset?: string;
  };
};

const ENTITY_TYPES = ["classes", "subclasses", "species", "backgrounds", "feats", "spells", "equipment"] as const;

export interface MpmbRuntimeRegistryCounts {
  sources: number;
  classes: number;
  subclasses: number;
  species: number;
  backgrounds: number;
  feats: number;
  spells: number;
  equipment: number;
}

export interface MpmbRuntimeRegistrySummary {
  rulesMode: RulesMode;
  coreImportPreset: "mpmb-upstream-2014" | "mpmb-upstream-2024";
  counts: MpmbRuntimeRegistryCounts;
  sourceKeys: string[];
  importPresetBreakdown: Array<{ importPreset: string; count: number }>;
  warnings: string[];
}

function emptyCounts(): MpmbRuntimeRegistryCounts {
  return {
    sources: 0,
    classes: 0,
    subclasses: 0,
    species: 0,
    backgrounds: 0,
    feats: 0,
    spells: 0,
    equipment: 0,
  };
}

function readSourceKey(sourceRef: string): string | undefined {
  const sourceKey = sourceRef.split(":")[0]?.trim();
  return sourceKey || undefined;
}

function buildCounts(snapshot: MpmContentSnapshot): MpmbRuntimeRegistryCounts {
  return {
    sources: snapshot.sources.length,
    classes: snapshot.classes.length,
    subclasses: snapshot.subclasses.length,
    species: snapshot.species.length,
    backgrounds: snapshot.backgrounds.length,
    feats: snapshot.feats.length,
    spells: snapshot.spells.length,
    equipment: snapshot.equipment.length,
  };
}

export function summarizeMpmbRuntimeRegistry(
  snapshot: MpmContentSnapshot,
  rulesMode: RulesMode,
): MpmbRuntimeRegistrySummary {
  const counts = buildCounts(snapshot);
  const coreImportPreset = getCoreImportPresetForRulesMode(rulesMode);
  const sourceKeys = new Set<string>();
  const importPresetCounts = new Map<string, number>();

  for (const entityType of ENTITY_TYPES) {
    const entries = snapshot[entityType] as SnapshotEntity[];
    for (const entry of entries) {
      for (const sourceRef of entry.sourceRefs) {
        const sourceKey = readSourceKey(sourceRef);
        if (sourceKey) {
          sourceKeys.add(sourceKey);
        }
      }
      const importPreset = entry.sourceMeta?.importPreset ?? "unknown";
      importPresetCounts.set(importPreset, (importPresetCounts.get(importPreset) ?? 0) + 1);
    }
  }

  const warnings: string[] = [];
  if (counts.classes === 0 || counts.spells === 0) {
    warnings.push("Registry snapshot is missing expected core entities (classes/spells).");
  }
  if ((importPresetCounts.get(coreImportPreset) ?? 0) === 0) {
    warnings.push(`No entities with expected core preset '${coreImportPreset}' were found.`);
  }

  const importPresetBreakdown = Array.from(importPresetCounts.entries())
    .map(([importPreset, count]) => ({ importPreset, count }))
    .sort((left, right) => right.count - left.count || left.importPreset.localeCompare(right.importPreset));

  return {
    rulesMode,
    coreImportPreset,
    counts: counts ?? emptyCounts(),
    sourceKeys: Array.from(sourceKeys).sort((left, right) => left.localeCompare(right)),
    importPresetBreakdown,
    warnings,
  };
}
