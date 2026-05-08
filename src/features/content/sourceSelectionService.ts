import type { MpmContentSnapshot, SourceDefinition } from "../../domain/content";
import { contentSnapshot } from "../../services/data/content";
import { resolveSourceProvider, sourceKeysForProvider } from "../../services/data/sourceProvider";
import { createMpmbCoreRegistry } from "../../services/mpmbCore";

export type SourcePreset =
  | "all"
  | "provider-open5e"
  | "provider-mpmb"
  | "official-handbooks"
  | "official-books"
  | "ua"
  | "adventure"
  | "mpmb-pdf-core"
  | "mpmb-upstream-2014-core"
  | "mpmb-upstream-2024-core"
  | "open5e-2014"
  | "open5e-2024"
  | "open5e-both";

export type SourceRegenerationStats = {
  sourceCount: number;
  classCount: number;
  subclassCount: number;
  speciesCount: number;
  backgroundCount: number;
  featCount: number;
  spellCount: number;
  equipmentCount: number;
};

const availableSources = contentSnapshot.sources;
const allSourceKeys = availableSources.map((source) => source.key);
const availableSourceKeySet = new Set(allSourceKeys);

export function getV2AvailableSources(): SourceDefinition[] {
  return availableSources;
}

export function getV2AllSourceKeys(): string[] {
  return allSourceKeys;
}

export function normalizeSourceSelection(sourceKeys: string[]): string[] {
  return Array.from(new Set(sourceKeys.filter((key) => availableSourceKeySet.has(key))));
}

export function readPersistedSourceSelection(storageKey: string): string[] | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as { selectedSourceKeys?: string[] };
    if (!Array.isArray(parsed.selectedSourceKeys)) {
      return undefined;
    }
    return normalizeSourceSelection(parsed.selectedSourceKeys);
  } catch {
    return undefined;
  }
}

export function persistSourceSelection(sourceKeys: string[], storageKey: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeSourceSelection(sourceKeys);
  window.localStorage.setItem(storageKey, JSON.stringify({ selectedSourceKeys: normalized }, null, 2));
}

export function sourcePresetKeys(
  preset: SourcePreset,
  sources: SourceDefinition[] = availableSources,
): string[] {
  if (preset === "all") {
    return sources.map((source) => source.key);
  }
  if (preset === "provider-open5e") {
    return sourceKeysForProvider(sources, "open5e");
  }
  if (preset === "provider-mpmb") {
    return sourceKeysForProvider(sources, "mpmb");
  }
  if (preset === "official-handbooks") {
    return sources
      .filter((source) => resolveSourceProvider(source) === "mpmb" && /handbook/i.test(source.name))
      .map((source) => source.key);
  }
  if (preset === "official-books") {
    return sources
      .filter(
        (source) =>
          resolveSourceProvider(source) === "mpmb" &&
          (/sources/i.test(source.group ?? "") || /book/i.test(source.group ?? "")),
      )
      .map((source) => source.key);
  }
  if (preset === "ua") {
    return sources
      .filter(
        (source) =>
          resolveSourceProvider(source) === "mpmb" &&
          (/unearthed arcana/i.test(source.group ?? "") || /^UA[:]/i.test(source.key)),
      )
      .map((source) => source.key);
  }
  if (preset === "mpmb-pdf-core") {
    return sources.filter((source) => source.key.toLowerCase().startsWith("mpmbpdf-")).map((source) => source.key);
  }
  if (preset === "mpmb-upstream-2014-core") {
    return sources
      .filter((source) => source.key.toLowerCase().startsWith("mpmbup14-") || (source.group ?? "").toLowerCase().includes("mpmb upstream 2014"))
      .map((source) => source.key);
  }
  if (preset === "mpmb-upstream-2024-core") {
    return sources
      .filter((source) => source.key.toLowerCase().startsWith("mpmbup24-") || (source.group ?? "").toLowerCase().includes("mpmb upstream 2024"))
      .map((source) => source.key);
  }
  if (preset === "open5e-2014") {
    return sources
      .filter((source) => source.group === "Open5e 2014" || source.key === "srd-2014" || source.key === "open5e")
      .map((source) => source.key);
  }
  if (preset === "open5e-2024") {
    return sources
      .filter((source) => source.group === "Open5e 2024" || source.key === "srd-2024" || source.key === "open5e-2024")
      .map((source) => source.key);
  }
  if (preset === "open5e-both") {
    return sourceKeysForProvider(sources, "open5e");
  }
  return sources
    .filter((source) => resolveSourceProvider(source) === "mpmb" && /adventure/i.test(source.group ?? ""))
    .map((source) => source.key);
}

function snapshotStats(snapshot: MpmContentSnapshot, sourceCount: number): SourceRegenerationStats {
  return {
    sourceCount,
    classCount: snapshot.classes.length,
    subclassCount: snapshot.subclasses.length,
    speciesCount: snapshot.species.length,
    backgroundCount: snapshot.backgrounds.length,
    featCount: snapshot.feats.length,
    spellCount: snapshot.spells.length,
    equipmentCount: snapshot.equipment.length,
  };
}

export function resolveSourceSelectionRuntime(sourceKeys: string[]): {
  selectedSourceKeys: string[];
  stats: SourceRegenerationStats;
} {
  const selectedSourceKeys = normalizeSourceSelection(sourceKeys);
  const registry = createMpmbCoreRegistry(contentSnapshot, selectedSourceKeys);
  return {
    selectedSourceKeys,
    stats: snapshotStats(registry.selectedSnapshot, selectedSourceKeys.length),
  };
}
