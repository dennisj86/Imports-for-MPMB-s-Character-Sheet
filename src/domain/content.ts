export interface FeatureDefinition {
  id: string;
  key: string;
  name: string;
  minLevel: number;
  description?: string;
  usages?: unknown;
  recovery?: unknown;
}

export interface SourceMeta {
  sourceSystem: "mpmb" | "open5e";
  sourceDocumentKey: string;
  sourceDocumentName: string;
  edition: "2014" | "2024" | "unknown";
  importPreset: string;
  license?: string;
  rawSourceRef: string;
  dataStatus?: "complete" | "partial" | "pending" | "manual";
}

export interface ClassDefinition {
  id: string;
  key: string;
  canonicalClassKey?: string;
  name: string;
  sourceRefs: string[];
  sourceMeta?: SourceMeta;
  hitDie?: number;
  spellcastingFactor?: unknown;
  spellcastingKnown?: unknown;
  features: FeatureDefinition[];
}

export interface SubclassDefinition {
  id: string;
  key: string;
  classId: string;
  classKey: string;
  canonicalClassKey?: string;
  name: string;
  sourceRefs: string[];
  sourceMeta?: SourceMeta;
  spellcastingFactor?: unknown;
  spellcastingKnown?: unknown;
  features: FeatureDefinition[];
}

export interface SpeciesDefinition {
  id: string;
  key: string;
  name: string;
  sourceRefs: string[];
  sourceMeta?: SourceMeta;
  speed?: string;
  size?: string;
  traits?: string;
  variantOfId?: string;
}

export interface BackgroundDefinition {
  id: string;
  key: string;
  name: string;
  sourceRefs: string[];
  sourceMeta?: SourceMeta;
  skillText?: string;
  toolText?: string;
  equipmentText?: string;
  traitText?: string;
  bonusFeat?: string;
}

export interface FeatDefinition {
  id: string;
  key: string;
  name: string;
  sourceRefs: string[];
  sourceMeta?: SourceMeta;
  description?: string;
  prerequisite?: string;
}

export interface SpellDefinition {
  id: string;
  key: string;
  name: string;
  sourceRefs: string[];
  sourceMeta?: SourceMeta;
  level: number;
  school?: string;
  castingTime?: string;
  range?: string;
  duration?: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  description?: string;
}

export interface EquipmentDefinition {
  id: string;
  key: string;
  category: "magic-item" | "weapon" | "armor" | "gear" | "ammo";
  name: string;
  sourceRefs: string[];
  sourceMeta?: SourceMeta;
  type?: string;
  rarity?: string;
  weight?: number | string;
  description?: string;
}

export interface SourceDefinition {
  key: string;
  name: string;
  abbreviation?: string;
  group?: string;
  date?: string;
  url?: string;
  defaultExcluded?: boolean;
}

export interface MpmContentSnapshot {
  meta: {
    generatedAt: string;
    sourceFiles: string[];
    parseErrors: string[];
  };
  sources: SourceDefinition[];
  classes: ClassDefinition[];
  subclasses: SubclassDefinition[];
  species: SpeciesDefinition[];
  backgrounds: BackgroundDefinition[];
  feats: FeatDefinition[];
  spells: SpellDefinition[];
  equipment: EquipmentDefinition[];
}
