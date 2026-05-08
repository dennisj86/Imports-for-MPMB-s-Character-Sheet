import type { MpmContentSnapshot } from "../../domain/content";

type SnapshotEntity = {
  key: string;
  name: string;
  sourceRefs: string[];
  sourceMeta?: {
    sourceSystem?: "mpmb" | "open5e";
    importPreset?: string;
    sourceDocumentKey?: string;
    edition?: "2014" | "2024" | "unknown";
  };
  canonicalClassKey?: string;
  classKey?: string;
};

type SnapshotEntityType = "classes" | "subclasses" | "species" | "backgrounds" | "feats" | "spells" | "equipment";

const ENTITY_TYPES: SnapshotEntityType[] = ["classes", "subclasses", "species", "backgrounds", "feats", "spells", "equipment"];

function toSlug(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferEdition(entry: SnapshotEntity): "2014" | "2024" | "unknown" {
  const edition = entry.sourceMeta?.edition;
  if (edition === "2014" || edition === "2024") {
    return edition;
  }
  const sourceRef = entry.sourceRefs[0] ?? "";
  if (sourceRef.includes("2024")) {
    return "2024";
  }
  if (sourceRef.includes("2014")) {
    return "2014";
  }
  return "unknown";
}

function entryPriority(entry: SnapshotEntity): number {
  const sourceSystem = entry.sourceMeta?.sourceSystem ?? "mpmb";
  const importPreset = entry.sourceMeta?.importPreset ?? "";
  const sourceDocumentKey = entry.sourceMeta?.sourceDocumentKey ?? entry.sourceRefs[0] ?? "";
  let score = sourceSystem === "mpmb" ? 90 : 70;
  if (importPreset === "mpmb-upstream-2024" || importPreset === "mpmb-upstream-2014") {
    score += 45;
  } else if (importPreset === "mpmb-local") {
    score += 25;
  } else if (importPreset === "mpmb-pdf") {
    score += 8;
  }
  if (sourceDocumentKey.startsWith("srd-")) {
    score += 10;
  }
  if (sourceDocumentKey.startsWith("open5e")) {
    score += 5;
  }
  return score;
}

function mergeSources(base: MpmContentSnapshot["sources"], imported: MpmContentSnapshot["sources"]): MpmContentSnapshot["sources"] {
  const byKey = new Map<string, MpmContentSnapshot["sources"][number]>();
  for (const source of [...base, ...imported]) {
    const existing = byKey.get(source.key);
    if (!existing) {
      byKey.set(source.key, source);
      continue;
    }
    byKey.set(source.key, {
      ...existing,
      ...source,
      name: existing.name || source.name,
      group: existing.group || source.group,
      url: existing.url || source.url,
    });
  }
  return Array.from(byKey.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function mergeByIdentity<T extends SnapshotEntity>(
  baseEntries: T[],
  importedEntries: T[],
  identityFn: (entry: T) => string,
): T[] {
  const byIdentity = new Map<string, T>();
  for (const entry of [...baseEntries, ...importedEntries]) {
    const identity = identityFn(entry);
    const existing = byIdentity.get(identity);
    if (!existing || entryPriority(entry) > entryPriority(existing)) {
      byIdentity.set(identity, entry);
    }
  }
  return Array.from(byIdentity.values());
}

function mergeEntityType(type: SnapshotEntityType, base: MpmContentSnapshot, imported: MpmContentSnapshot): SnapshotEntity[] {
  if (type === "classes") {
    return mergeByIdentity(
      base.classes as SnapshotEntity[],
      imported.classes as SnapshotEntity[],
      (entry) => `${entry.sourceMeta?.sourceSystem ?? "mpmb"}::${entry.canonicalClassKey ?? toSlug(entry.key || entry.name)}::${inferEdition(entry)}`,
    ).sort((left, right) => left.name.localeCompare(right.name));
  }
  if (type === "subclasses") {
    return mergeByIdentity(
      base.subclasses as SnapshotEntity[],
      imported.subclasses as SnapshotEntity[],
      (entry) =>
        `${entry.sourceMeta?.sourceSystem ?? "mpmb"}::${toSlug(entry.key)}::${entry.canonicalClassKey ?? toSlug(entry.classKey || entry.name)}::${inferEdition(entry)}`,
    ).sort((left, right) => left.name.localeCompare(right.name));
  }
  const baseEntries = base[type] as SnapshotEntity[];
  const importedEntries = imported[type] as SnapshotEntity[];
  return mergeByIdentity(
    baseEntries,
    importedEntries,
    (entry) => `${entry.sourceMeta?.sourceSystem ?? "mpmb"}::${toSlug(entry.key)}::${inferEdition(entry)}`,
  ).sort((left, right) => left.name.localeCompare(right.name));
}

function gatherReferencedSources(snapshot: MpmContentSnapshot): Set<string> {
  const referenced = new Set<string>();
  for (const type of ENTITY_TYPES) {
    const entries = snapshot[type] as SnapshotEntity[];
    for (const entry of entries) {
      for (const ref of entry.sourceRefs) {
        const key = ref.split(":")[0]?.trim();
        if (key) {
          referenced.add(key);
        }
      }
    }
  }
  return referenced;
}

export function mergeMpmSnapshots(base: MpmContentSnapshot, imported: MpmContentSnapshot): MpmContentSnapshot {
  const merged = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFiles: [...base.meta.sourceFiles, ...imported.meta.sourceFiles],
      parseErrors: [...base.meta.parseErrors, ...imported.meta.parseErrors],
    },
    sources: mergeSources(base.sources, imported.sources),
    classes: mergeEntityType("classes", base, imported) as MpmContentSnapshot["classes"],
    subclasses: mergeEntityType("subclasses", base, imported) as MpmContentSnapshot["subclasses"],
    species: mergeEntityType("species", base, imported) as MpmContentSnapshot["species"],
    backgrounds: mergeEntityType("backgrounds", base, imported) as MpmContentSnapshot["backgrounds"],
    feats: mergeEntityType("feats", base, imported) as MpmContentSnapshot["feats"],
    spells: mergeEntityType("spells", base, imported) as MpmContentSnapshot["spells"],
    equipment: mergeEntityType("equipment", base, imported) as MpmContentSnapshot["equipment"],
  } satisfies MpmContentSnapshot;
  const referenced = gatherReferencedSources(merged);
  return {
    ...merged,
    sources: merged.sources.filter((source) => referenced.has(source.key)),
  };
}

export function mergeMpmSnapshotChain(snapshots: MpmContentSnapshot[]): MpmContentSnapshot {
  if (snapshots.length === 0) {
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        sourceFiles: [],
        parseErrors: [],
      },
      sources: [],
      classes: [],
      subclasses: [],
      species: [],
      backgrounds: [],
      feats: [],
      spells: [],
      equipment: [],
    };
  }
  let merged = snapshots[0];
  for (const snapshot of snapshots.slice(1)) {
    merged = mergeMpmSnapshots(merged, snapshot);
  }
  return merged;
}

function withSourcesFiltered(snapshot: MpmContentSnapshot): MpmContentSnapshot {
  const referenced = gatherReferencedSources(snapshot);
  return {
    ...snapshot,
    sources: snapshot.sources.filter((source) => referenced.has(source.key)),
  };
}

export function filterMpmSnapshotByEntityPredicate(
  snapshot: MpmContentSnapshot,
  predicate: (entry: SnapshotEntity) => boolean,
): MpmContentSnapshot {
  const filtered = {
    ...snapshot,
    classes: snapshot.classes.filter((entry) => predicate(entry as SnapshotEntity)),
    subclasses: snapshot.subclasses.filter((entry) => predicate(entry as SnapshotEntity)),
    species: snapshot.species.filter((entry) => predicate(entry as SnapshotEntity)),
    backgrounds: snapshot.backgrounds.filter((entry) => predicate(entry as SnapshotEntity)),
    feats: snapshot.feats.filter((entry) => predicate(entry as SnapshotEntity)),
    spells: snapshot.spells.filter((entry) => predicate(entry as SnapshotEntity)),
    equipment: snapshot.equipment.filter((entry) => predicate(entry as SnapshotEntity)),
  };
  return withSourcesFiltered(filtered);
}

export function filterMpmSnapshotBySourceKeys(snapshot: MpmContentSnapshot, sourceKeys: Set<string>): MpmContentSnapshot {
  if (sourceKeys.size === 0) {
    return {
      ...snapshot,
      sources: [],
      classes: [],
      subclasses: [],
      species: [],
      backgrounds: [],
      feats: [],
      spells: [],
      equipment: [],
    };
  }

  const sourceMatch = (sourceRefs: string[]): boolean => {
    if (sourceRefs.length === 0) {
      return true;
    }
    return sourceRefs.some((ref) => {
      const sourceKey = ref.split(":")[0]?.trim();
      return Boolean(sourceKey) && sourceKeys.has(sourceKey);
    });
  };

  return filterMpmSnapshotByEntityPredicate(snapshot, (entry) => sourceMatch(entry.sourceRefs));
}

export interface MpmbV2ModeLayers {
  core2014: MpmContentSnapshot;
  core2024: MpmContentSnapshot;
  addons: MpmContentSnapshot;
  fallback: MpmContentSnapshot;
  manualAndOther: MpmContentSnapshot;
}

export interface MpmbV2ModeSnapshots {
  layers: MpmbV2ModeLayers;
  open5e: MpmContentSnapshot;
  mpmbByMode: Record<"2014" | "2024", MpmContentSnapshot>;
  combinedByMode: Record<"2014" | "2024", MpmContentSnapshot>;
}

export function buildMpmbV2ModeSnapshots(snapshot: MpmContentSnapshot): MpmbV2ModeSnapshots {
  const mpmbOnly = filterMpmSnapshotByEntityPredicate(snapshot, (entry) => entry.sourceMeta?.sourceSystem === "mpmb");
  const open5eOnly = filterMpmSnapshotByEntityPredicate(snapshot, (entry) => entry.sourceMeta?.sourceSystem === "open5e");

  const core2014 = filterMpmSnapshotByEntityPredicate(mpmbOnly, (entry) => entry.sourceMeta?.importPreset === "mpmb-upstream-2014");
  const core2024 = filterMpmSnapshotByEntityPredicate(mpmbOnly, (entry) => entry.sourceMeta?.importPreset === "mpmb-upstream-2024");
  const addons = filterMpmSnapshotByEntityPredicate(mpmbOnly, (entry) => entry.sourceMeta?.importPreset === "mpmb-local");
  const fallback = filterMpmSnapshotByEntityPredicate(mpmbOnly, (entry) => entry.sourceMeta?.importPreset === "mpmb-pdf");
  const manualAndOther = filterMpmSnapshotByEntityPredicate(
    mpmbOnly,
    (entry) =>
      !["mpmb-upstream-2014", "mpmb-upstream-2024", "mpmb-local", "mpmb-pdf"].includes(entry.sourceMeta?.importPreset ?? ""),
  );

  const mode2014 = mergeMpmSnapshotChain([core2014, addons, fallback, manualAndOther]);
  const mode2024 = mergeMpmSnapshotChain([core2024, addons, fallback, manualAndOther]);
  const combined2014 = mergeMpmSnapshots(mode2014, open5eOnly);
  const combined2024 = mergeMpmSnapshots(mode2024, open5eOnly);

  return {
    layers: {
      core2014,
      core2024,
      addons,
      fallback,
      manualAndOther,
    },
    open5e: open5eOnly,
    mpmbByMode: {
      "2014": mode2014,
      "2024": mode2024,
    },
    combinedByMode: {
      "2014": combined2014,
      "2024": combined2024,
    },
  };
}
