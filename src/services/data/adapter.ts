import { contentSnapshot } from "./content";
import type {
  BackgroundDefinition,
  ClassDefinition,
  EquipmentDefinition,
  FeatDefinition,
  FeatureDefinition,
  MpmContentSnapshot,
  SourceDefinition,
  SpeciesDefinition,
  SpellDefinition,
  SubclassDefinition,
} from "../../domain/content";
import { getFeaturesForLevel } from "../../domain/derived";
import { resolveSourceProvider, type SourceProvider } from "./sourceProvider";

export type SpellFilters = {
  query?: string;
  level?: number;
  classKey?: string;
  concentration?: boolean;
  ritual?: boolean;
};

export type EquipmentFilters = {
  query?: string;
  category?: EquipmentDefinition["category"];
  rarity?: string;
};

const fullSnapshot = contentSnapshot;
let activeSnapshot: MpmContentSnapshot = fullSnapshot;
let activeSourceKeys = new Set(fullSnapshot.sources.map((source) => source.key));

function sourceRefMatchesSelection(sourceRefs: string[], selection: Set<string>): boolean {
  if (selection.size === 0) {
    return false;
  }
  if (sourceRefs.length === 0) {
    return true;
  }
  return sourceRefs.some((ref) => {
    const sourceKey = ref.split(":")[0]?.trim();
    return Boolean(sourceKey) && selection.has(sourceKey);
  });
}

function filterBySources<T extends { sourceRefs: string[] }>(entries: T[], selection: Set<string>): T[] {
  return entries.filter((entry) => sourceRefMatchesSelection(entry.sourceRefs, selection));
}

function applySourceSelection(sourceKeys: string[]): MpmContentSnapshot {
  const selection = new Set(sourceKeys);
  return {
    ...fullSnapshot,
    sources: fullSnapshot.sources.filter((source) => selection.has(source.key)),
    classes: filterBySources(fullSnapshot.classes, selection),
    subclasses: filterBySources(fullSnapshot.subclasses, selection),
    species: filterBySources(fullSnapshot.species, selection),
    backgrounds: filterBySources(fullSnapshot.backgrounds, selection),
    feats: filterBySources(fullSnapshot.feats, selection),
    spells: filterBySources(fullSnapshot.spells, selection),
    equipment: filterBySources(fullSnapshot.equipment, selection),
  };
}

export function getAvailableSources(): SourceDefinition[] {
  return fullSnapshot.sources;
}

export function getAvailableSourceProviders(): Array<{ key: SourceProvider; label: string; sourceCount: number }> {
  const providerCounts = new Map<SourceProvider, number>();
  for (const source of fullSnapshot.sources) {
    const provider = resolveSourceProvider(source);
    providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
  }
  return [
    { key: "mpmb", label: "MPMB", sourceCount: providerCounts.get("mpmb") ?? 0 },
    { key: "open5e", label: "Open5e", sourceCount: providerCounts.get("open5e") ?? 0 },
  ];
}

export function getActiveSourceKeys(): string[] {
  return Array.from(activeSourceKeys);
}

export function regenerateContentForSelectedSources(sourceKeys: string[]) {
  activeSourceKeys = new Set(sourceKeys);
  activeSnapshot = applySourceSelection(sourceKeys);
  return {
    sourceCount: activeSnapshot.sources.length,
    classCount: activeSnapshot.classes.length,
    subclassCount: activeSnapshot.subclasses.length,
    speciesCount: activeSnapshot.species.length,
    backgroundCount: activeSnapshot.backgrounds.length,
    featCount: activeSnapshot.feats.length,
    spellCount: activeSnapshot.spells.length,
    equipmentCount: activeSnapshot.equipment.length,
  };
}

export function getClasses(): ClassDefinition[] {
  return activeSnapshot.classes;
}

export function getClassById(id: string): ClassDefinition | undefined {
  return activeSnapshot.classes.find((entry) => entry.id === id);
}

export function getSubclassesForClass(classId: string): SubclassDefinition[] {
  const parentClass = activeSnapshot.classes.find((entry) => entry.id === classId);
  if (!parentClass) {
    return [];
  }
  const parentCanonical = parentClass.canonicalClassKey ?? parentClass.key.toLowerCase();
  return activeSnapshot.subclasses.filter((entry) => {
    if (entry.classId === classId) {
      return true;
    }
    const subclassCanonical = entry.canonicalClassKey ?? entry.classKey.toLowerCase();
    return subclassCanonical === parentCanonical;
  });
}

export function getSpecies(): SpeciesDefinition[] {
  return activeSnapshot.species;
}

export function getBackgrounds(): BackgroundDefinition[] {
  return activeSnapshot.backgrounds;
}

export function getBackgroundById(id: string): BackgroundDefinition | undefined {
  return activeSnapshot.backgrounds.find((entry) => entry.id === id);
}

export function getFeats(): FeatDefinition[] {
  return activeSnapshot.feats;
}

function normalizeLookup(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findFeatByNameLike(name: string): FeatDefinition | undefined {
  const needle = normalizeLookup(name);
  if (!needle) {
    return undefined;
  }
  const feats = getFeats();
  return (
    feats.find((entry) => normalizeLookup(entry.name) === needle || normalizeLookup(entry.key) === needle) ??
    feats.find((entry) => normalizeLookup(entry.name).startsWith(needle) || normalizeLookup(entry.key).startsWith(needle))
  );
}

export function getSpells(filters: SpellFilters = {}): SpellDefinition[] {
  const query = filters.query?.toLowerCase().trim();
  return activeSnapshot.spells.filter((spell) => {
    if (query && !spell.name.toLowerCase().includes(query) && !spell.key.toLowerCase().includes(query)) {
      return false;
    }
    if (filters.level !== undefined && spell.level !== filters.level) {
      return false;
    }
    if (filters.classKey && !spell.classes.includes(filters.classKey.toLowerCase())) {
      return false;
    }
    if (filters.concentration !== undefined && spell.concentration !== filters.concentration) {
      return false;
    }
    if (filters.ritual !== undefined && spell.ritual !== filters.ritual) {
      return false;
    }
    return true;
  });
}

export function getSpellById(id: string): SpellDefinition | undefined {
  return activeSnapshot.spells.find((entry) => entry.id === id);
}

export function getEquipmentCatalog(filters: EquipmentFilters = {}): EquipmentDefinition[] {
  const query = filters.query?.toLowerCase().trim();
  const rarity = filters.rarity?.toLowerCase().trim();
  return activeSnapshot.equipment.filter((item) => {
    if (query && !item.name.toLowerCase().includes(query) && !item.key.toLowerCase().includes(query)) {
      return false;
    }
    if (filters.category && item.category !== filters.category) {
      return false;
    }
    if (rarity && (item.rarity ?? "").toLowerCase() !== rarity) {
      return false;
    }
    return true;
  });
}

export function getFeaturesForClassLevel(
  classId: string | undefined,
  subclassId: string | undefined,
  level: number,
): FeatureDefinition[] {
  const classDef = classId ? getClassById(classId) : undefined;
  const subclassDef = subclassId ? activeSnapshot.subclasses.find((entry) => entry.id === subclassId) : undefined;
  return getFeaturesForLevel(classDef, subclassDef, level);
}

export function getContentMeta() {
  return {
    ...fullSnapshot.meta,
    activeSourceKeys: getActiveSourceKeys(),
    totalSources: fullSnapshot.sources.length,
  };
}
