export interface FeatureDefinition {
  id: string;
  key: string;
  name: string;
  minLevel: number;
  description?: string;
  usages?: unknown;
  recovery?: unknown;
  structuredData?: unknown;
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

export type RulesMode = "2014" | "2024";
export type ContentVersion = "2014" | "2024" | "legacy" | "unknown";
export type ConversionMode = "native" | "2024-converted" | "legacy-only";

export interface CompatibilityMeta {
  contentVersion: ContentVersion;
  canonicalKey: string;
  replacementGroup: string;
  replacedBy2024?: boolean;
  legacyCompatibleIn2024?: boolean;
  conversionMode?: ConversionMode;
  notes?: string[];
  subclassUnlockLevel?: number;
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
  compatibility?: CompatibilityMeta;
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
  compatibility?: CompatibilityMeta;
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
  compatibility?: CompatibilityMeta;
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
  compatibility?: CompatibilityMeta;
}

export interface FeatDefinition {
  id: string;
  key: string;
  name: string;
  sourceRefs: string[];
  sourceMeta?: SourceMeta;
  description?: string;
  prerequisite?: string;
  structuredData?: unknown;
  compatibility?: CompatibilityMeta;
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
  compatibility?: CompatibilityMeta;
}

export interface EquipmentDefinition {
  id: string;
  key: string;
  category: "magic-item" | "weapon" | "armor" | "gear" | "ammo";
  name: string;
  sourceRefs: string[];
  sourceMeta?: SourceMeta;
  type?: string;
  weaponList?: string;
  damage?: unknown;
  range?: string;
  mastery?: string;
  rarity?: string;
  weight?: number | string;
  description?: string;
  compatibility?: CompatibilityMeta;
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
