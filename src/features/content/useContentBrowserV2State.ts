import { useMemo } from "react";
import type {
  BackgroundDefinition,
  ClassDefinition,
  EquipmentDefinition,
  FeatDefinition,
  MpmContentSnapshot,
  RulesMode,
  SourceDefinition,
  SpeciesDefinition,
  SpellDefinition,
  SubclassDefinition,
} from "../../domain/content";
import { resolveSubclassesForClassFromSnapshot } from "../../services/characterEngine";
import { contentSnapshot } from "../../services/data/content";
import {
  resolveBackgrounds,
  resolveClasses,
  resolveEquipment,
  resolveFeats,
  resolveSpecies,
  resolveSpells,
} from "../../services/data/rulesModeResolver";
import { createMpmbCoreRegistry, resolveSnapshotForCoreContext, type CoreProviderSelection } from "../../services/mpmbCore";

const DEFAULT_PROVIDER: CoreProviderSelection = "all";
const DEFAULT_RULES_MODE: RulesMode = "2024";

export interface ContentBrowserV2Context {
  provider?: CoreProviderSelection;
  rulesMode?: RulesMode;
}

export type ContentSpellFilters = {
  query?: string;
  level?: number;
  classKey?: string;
  concentration?: boolean;
  ritual?: boolean;
};

export type ContentEquipmentFilters = {
  query?: string;
  category?: EquipmentDefinition["category"];
  rarity?: string;
};

export interface ContentBrowserV2ViewState {
  context: Required<ContentBrowserV2Context>;
  snapshot: MpmContentSnapshot;
  sources: SourceDefinition[];
  classes: ClassDefinition[];
  species: SpeciesDefinition[];
  backgrounds: BackgroundDefinition[];
  feats: FeatDefinition[];
  spells: SpellDefinition[];
  equipment: EquipmentDefinition[];
  resolveSubclassesForClass: (classId: string) => SubclassDefinition[];
  filterSpells: (filters: ContentSpellFilters) => SpellDefinition[];
  filterEquipment: (filters: ContentEquipmentFilters) => EquipmentDefinition[];
}

function filterSpells(spells: SpellDefinition[], filters: ContentSpellFilters): SpellDefinition[] {
  const query = filters.query?.toLowerCase().trim();
  return spells.filter((spell) => {
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

function filterEquipment(equipment: EquipmentDefinition[], filters: ContentEquipmentFilters): EquipmentDefinition[] {
  const query = filters.query?.toLowerCase().trim();
  const rarity = filters.rarity?.toLowerCase().trim();
  return equipment.filter((entry) => {
    if (query && !entry.name.toLowerCase().includes(query) && !entry.key.toLowerCase().includes(query)) {
      return false;
    }
    if (filters.category && entry.category !== filters.category) {
      return false;
    }
    if (rarity && (entry.rarity ?? "").toLowerCase() !== rarity) {
      return false;
    }
    return true;
  });
}

export function resolveContentBrowserV2State(
  activeSourceKeys: string[],
  inputContext: ContentBrowserV2Context = {},
): ContentBrowserV2ViewState {
  const context: Required<ContentBrowserV2Context> = {
    provider: inputContext.provider ?? DEFAULT_PROVIDER,
    rulesMode: inputContext.rulesMode ?? DEFAULT_RULES_MODE,
  };
  const registry = createMpmbCoreRegistry(contentSnapshot, activeSourceKeys);
  const snapshot = resolveSnapshotForCoreContext(registry, context);
  const classes = resolveClasses(snapshot.classes, context);
  const species = resolveSpecies(snapshot.species, context);
  const backgrounds = resolveBackgrounds(snapshot.backgrounds, context);
  const feats = resolveFeats(snapshot.feats, context);
  const spells = resolveSpells(snapshot.spells, context);
  const equipment = resolveEquipment(snapshot.equipment, context);
  return {
    context,
    snapshot,
    sources: snapshot.sources,
    classes,
    species,
    backgrounds,
    feats,
    spells,
    equipment,
    resolveSubclassesForClass: (classId: string) =>
      resolveSubclassesForClassFromSnapshot(
        snapshot,
        classId,
        {
          provider: context.provider,
          rulesMode: context.rulesMode,
        },
        20,
      ),
    filterSpells: (filters: ContentSpellFilters) => filterSpells(spells, filters),
    filterEquipment: (filters: ContentEquipmentFilters) => filterEquipment(equipment, filters),
  };
}

export function useContentBrowserV2State(
  activeSourceKeys: string[],
  context: ContentBrowserV2Context = {},
  generation = 0,
): ContentBrowserV2ViewState {
  return useMemo(
    () => resolveContentBrowserV2State(activeSourceKeys, context),
    [activeSourceKeys, context.provider, context.rulesMode, generation],
  );
}
