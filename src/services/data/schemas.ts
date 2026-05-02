import { z } from "zod";

export const featureSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  minLevel: z.number(),
  description: z.string().optional(),
  usages: z.unknown().optional(),
  recovery: z.unknown().optional(),
});

export const sourceMetaSchema = z.object({
  sourceSystem: z.enum(["mpmb", "open5e"]),
  sourceDocumentKey: z.string(),
  sourceDocumentName: z.string(),
  edition: z.enum(["2014", "2024", "unknown"]),
  importPreset: z.string(),
  license: z.string().optional(),
  rawSourceRef: z.string(),
  dataStatus: z.enum(["complete", "partial", "pending", "manual"]).optional(),
});

export const compatibilityMetaSchema = z.object({
  contentVersion: z.enum(["2014", "2024", "legacy", "unknown"]),
  canonicalKey: z.string(),
  replacementGroup: z.string(),
  replacedBy2024: z.boolean().optional(),
  legacyCompatibleIn2024: z.boolean().optional(),
  conversionMode: z.enum(["native", "2024-converted", "legacy-only"]).optional(),
  notes: z.array(z.string()).optional(),
  subclassUnlockLevel: z.number().optional(),
});

export const classSchema = z.object({
  id: z.string(),
  key: z.string(),
  canonicalClassKey: z.string().optional(),
  name: z.string(),
  sourceRefs: z.array(z.string()),
  sourceMeta: sourceMetaSchema.optional(),
  hitDie: z.number().optional(),
  spellcastingFactor: z.union([z.number(), z.string(), z.null(), z.unknown()]).optional(),
  spellcastingKnown: z.unknown().optional(),
  features: z.array(featureSchema),
  compatibility: compatibilityMetaSchema.optional(),
});

export const subclassSchema = z.object({
  id: z.string(),
  key: z.string(),
  classId: z.string(),
  classKey: z.string(),
  canonicalClassKey: z.string().optional(),
  name: z.string(),
  sourceRefs: z.array(z.string()),
  sourceMeta: sourceMetaSchema.optional(),
  spellcastingFactor: z.union([z.number(), z.string(), z.null(), z.unknown()]).optional(),
  spellcastingKnown: z.unknown().optional(),
  features: z.array(featureSchema),
  compatibility: compatibilityMetaSchema.optional(),
});

export const speciesSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  sourceRefs: z.array(z.string()),
  sourceMeta: sourceMetaSchema.optional(),
  speed: z.string().optional(),
  size: z.string().optional(),
  traits: z.string().optional(),
  variantOfId: z.string().optional(),
  compatibility: compatibilityMetaSchema.optional(),
});

export const backgroundSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  sourceRefs: z.array(z.string()),
  sourceMeta: sourceMetaSchema.optional(),
  skillText: z.string().optional(),
  toolText: z.string().optional(),
  equipmentText: z.string().optional(),
  traitText: z.string().optional(),
  bonusFeat: z.string().optional(),
  compatibility: compatibilityMetaSchema.optional(),
});

export const featSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  sourceRefs: z.array(z.string()),
  sourceMeta: sourceMetaSchema.optional(),
  description: z.string().optional(),
  prerequisite: z.string().optional(),
  compatibility: compatibilityMetaSchema.optional(),
});

export const spellSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  sourceRefs: z.array(z.string()),
  sourceMeta: sourceMetaSchema.optional(),
  level: z.number(),
  school: z.string().optional(),
  castingTime: z.string().optional(),
  range: z.string().optional(),
  duration: z.string().optional(),
  concentration: z.boolean(),
  ritual: z.boolean(),
  classes: z.array(z.string()),
  description: z.string().optional(),
  compatibility: compatibilityMetaSchema.optional(),
});

export const equipmentSchema = z.object({
  id: z.string(),
  key: z.string(),
  category: z.enum(["magic-item", "weapon", "armor", "gear", "ammo"]),
  name: z.string(),
  sourceRefs: z.array(z.string()),
  sourceMeta: sourceMetaSchema.optional(),
  type: z.string().optional(),
  rarity: z.string().optional(),
  weight: z.union([z.number(), z.string()]).optional(),
  description: z.string().optional(),
  compatibility: compatibilityMetaSchema.optional(),
});

export const sourceSchema = z.object({
  key: z.string(),
  name: z.string(),
  abbreviation: z.string().optional(),
  group: z.string().optional(),
  date: z.string().optional(),
  url: z.string().optional(),
  defaultExcluded: z.boolean().optional(),
});

export const contentSnapshotSchema = z.object({
  meta: z.object({
    generatedAt: z.string(),
    sourceFiles: z.array(z.string()),
    parseErrors: z.array(z.string()),
  }),
  sources: z.array(sourceSchema),
  classes: z.array(classSchema),
  subclasses: z.array(subclassSchema),
  species: z.array(speciesSchema),
  backgrounds: z.array(backgroundSchema),
  feats: z.array(featSchema),
  spells: z.array(spellSchema),
  equipment: z.array(equipmentSchema),
});

export type ContentSnapshotSchema = z.infer<typeof contentSnapshotSchema>;
