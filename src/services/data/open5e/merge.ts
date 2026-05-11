import type {
  BackgroundDefinition,
  ClassDefinition,
  EquipmentDefinition,
  FeatDefinition,
  MpmContentSnapshot,
  SourceDefinition,
  SpeciesDefinition,
  SpellDefinition,
  SubclassDefinition,
} from "../../../domain/content";
import { toSlug } from "../../../lib/slug";
import type { MergeResult } from "./types";

type WithSourceMeta = {
  sourceRefs: string[];
  sourceMeta?: {
    sourceSystem?: string;
    sourceDocumentKey?: string;
    edition?: "2014" | "2024" | "unknown";
  };
};

function inferEdition(entry: WithSourceMeta): "2014" | "2024" | "unknown" {
  if (entry.sourceMeta?.edition) {
    return entry.sourceMeta.edition;
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

function scoreEntry(entry: WithSourceMeta): number {
  const sourceSystem = entry.sourceMeta?.sourceSystem ?? "mpmb";
  const sourceDocumentKey = entry.sourceMeta?.sourceDocumentKey ?? entry.sourceRefs[0] ?? "";
  let score = sourceSystem === "mpmb" ? 90 : 70;
  if (sourceDocumentKey.startsWith("srd-")) {
    score += 10;
  }
  if (sourceDocumentKey.startsWith("open5e")) {
    score += 5;
  }
  return score;
}

function mergeSources(baseSources: SourceDefinition[], importedSources: SourceDefinition[]): SourceDefinition[] {
  const byKey = new Map<string, SourceDefinition>();
  for (const source of [...baseSources, ...importedSources]) {
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
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function mergeByKey<T extends WithSourceMeta>(
  base: T[],
  imported: T[],
  makeIdentity: (entry: T) => string,
): { entries: T[]; replaced: number } {
  const byIdentity = new Map<string, T>();
  let replaced = 0;
  for (const entry of [...base, ...imported]) {
    const identity = makeIdentity(entry);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, entry);
      continue;
    }
    if (scoreEntry(entry) > scoreEntry(existing)) {
      byIdentity.set(identity, entry);
      replaced += 1;
    }
  }
  return {
    entries: Array.from(byIdentity.values()),
    replaced,
  };
}

function classIdentity(entry: ClassDefinition): string {
  const sourceSystem = entry.sourceMeta?.sourceSystem ?? "mpmb";
  const canonical = entry.canonicalClassKey ?? toSlug(entry.key || entry.name);
  return `${sourceSystem}::${canonical}::${inferEdition(entry)}`;
}

function subclassIdentity(entry: SubclassDefinition): string {
  const sourceSystem = entry.sourceMeta?.sourceSystem ?? "mpmb";
  const canonical = entry.canonicalClassKey ?? toSlug(entry.classKey || entry.name);
  return `${sourceSystem}::${toSlug(entry.key)}::${canonical}::${inferEdition(entry)}`;
}

function genericIdentity(entry: { key: string } & WithSourceMeta): string {
  const sourceSystem = entry.sourceMeta?.sourceSystem ?? "mpmb";
  return `${sourceSystem}::${toSlug(entry.key)}::${inferEdition(entry)}`;
}

function sortByName<T extends { name: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

export function mergeSnapshots(base: MpmContentSnapshot, imported: MpmContentSnapshot): MergeResult {
  const warnings: string[] = [];
  const mergedSources = mergeSources(base.sources, imported.sources);

  const mergedClassesResult = mergeByKey<ClassDefinition>(base.classes, imported.classes, classIdentity);
  const mergedSubclassesResult = mergeByKey<SubclassDefinition>(base.subclasses, imported.subclasses, subclassIdentity);
  const mergedSpeciesResult = mergeByKey<SpeciesDefinition>(base.species, imported.species, genericIdentity);
  const mergedBackgroundsResult = mergeByKey<BackgroundDefinition>(base.backgrounds, imported.backgrounds, genericIdentity);
  const mergedFeatsResult = mergeByKey<FeatDefinition>(base.feats, imported.feats, genericIdentity);
  const mergedSpellsResult = mergeByKey<SpellDefinition>(base.spells, imported.spells, genericIdentity);
  const mergedEquipmentResult = mergeByKey<EquipmentDefinition>(base.equipment, imported.equipment, genericIdentity);

  const merged: MpmContentSnapshot = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFiles: [...base.meta.sourceFiles, ...imported.meta.sourceFiles],
      parseErrors: [...base.meta.parseErrors, ...imported.meta.parseErrors],
    },
    sources: mergedSources,
    classes: sortByName(mergedClassesResult.entries),
    subclasses: sortByName(mergedSubclassesResult.entries),
    species: sortByName(mergedSpeciesResult.entries),
    backgrounds: sortByName(mergedBackgroundsResult.entries),
    feats: sortByName(mergedFeatsResult.entries),
    spells: sortByName(mergedSpellsResult.entries),
    equipment: sortByName(mergedEquipmentResult.entries),
  };

  warnings.push(
    `Merge replaced entries: classes=${mergedClassesResult.replaced}, subclasses=${mergedSubclassesResult.replaced}, species=${mergedSpeciesResult.replaced}, backgrounds=${mergedBackgroundsResult.replaced}, feats=${mergedFeatsResult.replaced}, spells=${mergedSpellsResult.replaced}, equipment=${mergedEquipmentResult.replaced}`,
  );

  return {
    merged,
    warnings,
  };
}
