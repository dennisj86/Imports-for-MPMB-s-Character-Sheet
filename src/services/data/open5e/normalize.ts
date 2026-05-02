import type {
  BackgroundDefinition,
  ClassDefinition,
  EquipmentDefinition,
  FeatDefinition,
  FeatureDefinition,
  MpmContentSnapshot,
  SpeciesDefinition,
  SpellDefinition,
  SubclassDefinition,
} from "../../../domain/content";
import { buildId, toSlug } from "../../../lib/slug";
import { resolveCanonicalClassKey } from "../resolvers/classResolver";
import { inferEditionFromDocument } from "./discovery";
import type { Open5eEdition, Open5eNormalizedResult, Open5eRawSnapshot } from "./types";
import { toOpen5eSourceDefinition } from "./types";

type Open5eDocumentRef = {
  key?: string;
  name?: string;
  display_name?: string;
  gamesystem?: { key?: string };
  licenses?: Array<{ key?: string }>;
  publisher?: { key?: string };
  permalink?: string;
};

type Open5eFeature = {
  key?: string;
  name?: string;
  desc?: string;
  gained_at?: Array<{ level?: number | string }>;
  data_for_class_table?: Array<{ level?: number | string; column_value?: string }>;
};

type Open5eClass = {
  key?: string;
  name?: string;
  desc?: string;
  document?: Open5eDocumentRef;
  subclass_of?: { key?: string; name?: string } | null;
  features?: Open5eFeature[];
  hit_dice?: string;
  caster_type?: string;
};

type Open5eSpecies = {
  key?: string;
  name?: string;
  desc?: string;
  document?: Open5eDocumentRef;
  traits?: Array<{ name?: string; desc?: string; type?: string }>;
  subspecies_of?: { key?: string; name?: string } | null;
};

type Open5eBackground = {
  key?: string;
  name?: string;
  desc?: string;
  document?: Open5eDocumentRef;
  benefits?: Array<{ type?: string; desc?: string }>;
};

type Open5eFeat = {
  key?: string;
  name?: string;
  desc?: string;
  prerequisite?: string;
  benefits?: Array<{ desc?: string }>;
  document?: Open5eDocumentRef;
};

type Open5eSpell = {
  key?: string;
  name?: string;
  desc?: string;
  higher_level?: string;
  level?: number;
  school?: { name?: string; key?: string } | string;
  casting_time?: string;
  range_text?: string;
  range?: number | string;
  duration?: string;
  concentration?: boolean;
  ritual?: boolean;
  classes?: Array<{ key?: string; name?: string }>;
  document?: Open5eDocumentRef;
};

type Open5eItem = {
  key?: string;
  name?: string;
  desc?: string;
  category?: { key?: string; name?: string } | string;
  weight?: string | number;
  document?: Open5eDocumentRef;
  armor?: unknown;
  weapon?: unknown;
};

type Open5eWeapon = {
  key?: string;
  name?: string;
  document?: Open5eDocumentRef;
  properties?: Array<{ property?: { name?: string; desc?: string }; detail?: string | null }>;
  damage_dice?: string;
  damage_type?: { name?: string };
};

type Open5eArmor = {
  key?: string;
  name?: string;
  document?: Open5eDocumentRef;
  category?: string;
  ac_display?: string;
};

type SourceMeta = {
  sourceSystem: "open5e";
  sourceDocumentKey: string;
  sourceDocumentName: string;
  edition: Open5eEdition;
  importPreset: string;
  license?: string;
  rawSourceRef: string;
  dataStatus?: "complete" | "partial" | "pending" | "manual";
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const parts = value.map((entry) => toText(entry)).filter((entry): entry is string => Boolean(entry));
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  return undefined;
}

function minLevelFromFeature(feature: Open5eFeature): number {
  const levels = asArray<{ level?: number | string }>(feature.gained_at)
    .map((entry) => Number(entry.level))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
  if (levels.length > 0) {
    return Math.min(...levels);
  }
  const tableLevels = asArray<{ level?: number | string }>(feature.data_for_class_table)
    .map((entry) => Number(entry.level))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
  if (tableLevels.length > 0) {
    return Math.min(...tableLevels);
  }
  return 1;
}

function extractFeatures(features: Open5eFeature[] | undefined, ownerId: string): FeatureDefinition[] {
  const output: FeatureDefinition[] = [];
  for (const feature of asArray<Open5eFeature>(features)) {
    const name = feature.name?.trim() || "Unnamed Feature";
    const key = feature.key?.trim() || toSlug(name);
    output.push({
      id: `${ownerId}:feature:${toSlug(key)}`,
      key,
      name,
      minLevel: minLevelFromFeature(feature),
      description: toText(feature.desc),
      usages: feature.data_for_class_table,
      recovery: undefined,
    });
  }
  return output.sort((a, b) => a.minLevel - b.minLevel || a.name.localeCompare(b.name));
}

function inferHitDie(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d+)/);
  if (!match) {
    return undefined;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function inferSourceMeta(document: Open5eDocumentRef | undefined, preset: string, rawKey: string, status?: SourceMeta["dataStatus"]): SourceMeta {
  const docKey = document?.key ?? "unknown-document";
  const edition = inferEditionFromDocument({
    key: docKey,
    gamesystem: document?.gamesystem,
  });
  const sourceDocumentName = document?.display_name ?? document?.name ?? docKey;
  const license = asArray<{ key?: string }>(document?.licenses).map((entry) => entry.key).filter(Boolean).join(", ") || undefined;
  return {
    sourceSystem: "open5e",
    sourceDocumentKey: docKey,
    sourceDocumentName,
    edition,
    importPreset: preset,
    license,
    rawSourceRef: rawKey,
    dataStatus: status,
  };
}

function mapCasterType(value: string | undefined): string | number | null | undefined {
  const normalized = (value ?? "").toUpperCase().trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "NONE") {
    return 0;
  }
  if (normalized === "FULL") {
    return 1;
  }
  if (normalized === "HALF") {
    return 2;
  }
  if (normalized === "THIRD") {
    return 3;
  }
  return normalized.toLowerCase();
}

function mapItemCategory(item: Open5eItem): EquipmentDefinition["category"] {
  const categoryKey =
    typeof item.category === "string"
      ? item.category.toLowerCase()
      : (item.category?.key ?? item.category?.name ?? "").toLowerCase();
  if (item.weapon || categoryKey.includes("weapon")) {
    return "weapon";
  }
  if (item.armor || categoryKey.includes("armor") || categoryKey.includes("shield")) {
    return "armor";
  }
  if (categoryKey.includes("ammunition") || categoryKey.includes("ammo")) {
    return "ammo";
  }
  if (
    categoryKey.includes("wondrous") ||
    categoryKey.includes("magic") ||
    categoryKey.includes("ring") ||
    categoryKey.includes("rod") ||
    categoryKey.includes("wand") ||
    categoryKey.includes("staff") ||
    categoryKey.includes("potion")
  ) {
    return "magic-item";
  }
  return "gear";
}

function displayClassName(baseName: string, edition: Open5eEdition): string {
  if (edition === "2014") {
    return `${baseName} (2014)`;
  }
  if (edition === "2024") {
    return `${baseName} (2024)`;
  }
  return baseName;
}

function classIdentityKey(canonicalClassKey: string, edition: Open5eEdition): string {
  return `${canonicalClassKey}::${edition}`;
}

function classIdFromCanonical(canonicalClassKey: string, edition: Open5eEdition): string {
  return buildId("class", edition === "unknown" ? canonicalClassKey : `${canonicalClassKey}-${edition}`);
}

export function normalizeOpen5e(raw: Open5eRawSnapshot): Open5eNormalizedResult {
  const warnings: string[] = [];
  const skipped: string[] = [];

  const sources = raw.documents.map((document) => toOpen5eSourceDefinition(document)).sort((a, b) => a.name.localeCompare(b.name));

  const classByIdentity = new Map<string, ClassDefinition>();
  const classSourceScore = new Map<string, number>();
  const classIdByRawKey = new Map<string, string>();

  const rawClasses = asArray<Open5eClass>(raw.classes);
  const rawSubclasses: Open5eClass[] = [];
  for (const entry of rawClasses) {
    if (entry.subclass_of) {
      rawSubclasses.push(entry);
      continue;
    }

    const canonicalClassKey = resolveCanonicalClassKey({
      key: entry.key ?? undefined,
      name: entry.name ?? undefined,
    });
    const sourceMeta = inferSourceMeta(entry.document, raw.meta.preset, entry.key ?? canonicalClassKey);
    const edition = sourceMeta.edition;
    const identity = classIdentityKey(canonicalClassKey, edition);
    const classId = classIdFromCanonical(canonicalClassKey, edition);

    const documentKey = sourceMeta.sourceDocumentKey;
    const sourceScore = documentKey.startsWith("srd-") ? 200 : documentKey.startsWith("open5e") ? 120 : 80;
    const existingScore = classSourceScore.get(identity) ?? -1;
    if (existingScore > sourceScore) {
      classIdByRawKey.set(entry.key ?? classId, classId);
      continue;
    }

    classSourceScore.set(identity, sourceScore);
    classByIdentity.set(identity, {
      id: classId,
      key: canonicalClassKey,
      canonicalClassKey,
      name: displayClassName(entry.name?.trim() || canonicalClassKey, edition),
      sourceRefs: [sourceMeta.sourceDocumentKey],
      sourceMeta,
      hitDie: inferHitDie(entry.hit_dice),
      spellcastingFactor: mapCasterType(entry.caster_type),
      spellcastingKnown: undefined,
      features: extractFeatures(entry.features, classId),
    });
    classIdByRawKey.set(entry.key ?? classId, classId);
  }

  const classes = Array.from(classByIdentity.values()).sort((a, b) => a.name.localeCompare(b.name));

  const subclasses: SubclassDefinition[] = [];
  for (const entry of rawSubclasses) {
    const parentRawKey = entry.subclass_of?.key ?? "";
    const parentCanonicalKey = resolveCanonicalClassKey({
      key: parentRawKey,
      name: entry.subclass_of?.name,
    });
    const sourceMeta = inferSourceMeta(entry.document, raw.meta.preset, entry.key ?? "subclass", "partial");
    const edition = sourceMeta.edition;
    const classId = classIdByRawKey.get(parentRawKey) ?? classIdFromCanonical(parentCanonicalKey, edition);
    const subclassKey = entry.key?.trim() || `${parentCanonicalKey}-${toSlug(entry.name ?? "subclass")}`;
    const subclassId = buildId("subclass", `${subclassKey}-${edition}`);
    subclasses.push({
      id: subclassId,
      key: subclassKey,
      classId,
      classKey: parentCanonicalKey,
      canonicalClassKey: parentCanonicalKey,
      name: displayClassName(entry.name?.trim() || "Unnamed Subclass", edition),
      sourceRefs: [sourceMeta.sourceDocumentKey],
      sourceMeta,
      spellcastingFactor: mapCasterType(entry.caster_type),
      spellcastingKnown: undefined,
      features: extractFeatures(entry.features, subclassId),
    });
  }

  const species: SpeciesDefinition[] = [];
  for (const entry of asArray<Open5eSpecies>(raw.species)) {
    const sourceMeta = inferSourceMeta(entry.document, raw.meta.preset, entry.key ?? "species");
    const traits = asArray<{ name?: string; desc?: string; type?: string }>(entry.traits);
    const sizeTrait = traits.find((trait) => (trait.type ?? "").toUpperCase() === "SIZE");
    const speedTrait = traits.find((trait) => (trait.type ?? "").toUpperCase() === "SPEED");
    const speciesId = buildId("species", `${entry.key ?? toSlug(entry.name ?? "species")}-${sourceMeta.edition}`);
    const traitText = traits
      .map((trait) => {
        const title = toText(trait.name);
        const body = toText(trait.desc);
        return title && body ? `${title}: ${body}` : title ?? body;
      })
      .filter((value): value is string => Boolean(value))
      .join("\n");
    species.push({
      id: speciesId,
      key: entry.key ?? toSlug(entry.name ?? "species"),
      name: displayClassName(entry.name?.trim() || "Unnamed Species", sourceMeta.edition),
      sourceRefs: [sourceMeta.sourceDocumentKey],
      sourceMeta,
      speed: toText(speedTrait?.desc),
      size: toText(sizeTrait?.desc),
      traits: traitText || toText(entry.desc),
      variantOfId: entry.subspecies_of?.key ? buildId("species", `${entry.subspecies_of.key}-${sourceMeta.edition}`) : undefined,
    });
  }

  const backgrounds: BackgroundDefinition[] = [];
  for (const entry of asArray<Open5eBackground>(raw.backgrounds)) {
    const sourceMeta = inferSourceMeta(entry.document, raw.meta.preset, entry.key ?? "background");
    const benefits = asArray<{ type?: string; desc?: string }>(entry.benefits);
    const benefitText = (type: string) =>
      benefits
        .filter((benefit) => (benefit.type ?? "").toLowerCase() === type)
        .map((benefit) => benefit.desc?.trim())
        .filter((value): value is string => Boolean(value))
        .join("; ");
    backgrounds.push({
      id: buildId("background", `${entry.key ?? toSlug(entry.name ?? "background")}-${sourceMeta.edition}`),
      key: entry.key ?? toSlug(entry.name ?? "background"),
      name: displayClassName(entry.name?.trim() || "Unnamed Background", sourceMeta.edition),
      sourceRefs: [sourceMeta.sourceDocumentKey],
      sourceMeta: {
        ...sourceMeta,
        dataStatus: benefits.length > 0 ? "complete" : "partial",
      },
      skillText: benefitText("skill_proficiency") || undefined,
      toolText: benefitText("tool_proficiency") || undefined,
      equipmentText: benefitText("equipment") || undefined,
      traitText: toText(entry.desc),
      bonusFeat: benefitText("feat") || undefined,
    });
  }

  const feats: FeatDefinition[] = [];
  for (const entry of asArray<Open5eFeat>(raw.feats)) {
    const sourceMeta = inferSourceMeta(entry.document, raw.meta.preset, entry.key ?? "feat");
    const benefitText = asArray<{ desc?: string }>(entry.benefits)
      .map((benefit) => toText(benefit.desc))
      .filter((value): value is string => Boolean(value))
      .join("\n");
    feats.push({
      id: buildId("feat", `${entry.key ?? toSlug(entry.name ?? "feat")}-${sourceMeta.edition}`),
      key: entry.key ?? toSlug(entry.name ?? "feat"),
      name: displayClassName(entry.name?.trim() || "Unnamed Feat", sourceMeta.edition),
      sourceRefs: [sourceMeta.sourceDocumentKey],
      sourceMeta: {
        ...sourceMeta,
        dataStatus: benefitText ? "complete" : "partial",
      },
      description: [toText(entry.desc), benefitText].filter(Boolean).join("\n").trim() || undefined,
      prerequisite: toText(entry.prerequisite),
    });
  }

  const spells: SpellDefinition[] = [];
  for (const entry of asArray<Open5eSpell>(raw.spells)) {
    const sourceMeta = inferSourceMeta(entry.document, raw.meta.preset, entry.key ?? "spell");
    const spellClasses = asArray<{ key?: string; name?: string }>(entry.classes).map((classEntry) =>
      resolveCanonicalClassKey({
        key: classEntry.key ?? undefined,
        name: classEntry.name ?? undefined,
      }),
    );
    const description = [toText(entry.desc), toText(entry.higher_level)].filter(Boolean).join("\n").trim() || undefined;
    spells.push({
      id: buildId("spell", `${entry.key ?? toSlug(entry.name ?? "spell")}-${sourceMeta.edition}`),
      key: entry.key ?? toSlug(entry.name ?? "spell"),
      name: displayClassName(entry.name?.trim() || "Unnamed Spell", sourceMeta.edition),
      sourceRefs: [sourceMeta.sourceDocumentKey],
      sourceMeta: {
        ...sourceMeta,
        dataStatus: spellClasses.length > 0 ? "complete" : "partial",
      },
      level: Number(entry.level ?? 0),
      school: typeof entry.school === "string" ? entry.school : entry.school?.name,
      castingTime: toText(entry.casting_time),
      range: toText(entry.range_text) ?? toText(entry.range),
      duration: toText(entry.duration),
      concentration: Boolean(entry.concentration),
      ritual: Boolean(entry.ritual),
      classes: Array.from(new Set(spellClasses.filter(Boolean))).sort((a, b) => a.localeCompare(b)),
      description,
    });
  }

  const equipmentByKey = new Map<string, EquipmentDefinition>();
  for (const entry of asArray<Open5eItem>(raw.items)) {
    const sourceMeta = inferSourceMeta(entry.document, raw.meta.preset, entry.key ?? "item");
    const key = entry.key ?? toSlug(entry.name ?? "item");
    equipmentByKey.set(key, {
      id: buildId("equipment", `${key}-${sourceMeta.edition}`),
      key,
      category: mapItemCategory(entry),
      name: displayClassName(entry.name?.trim() || "Unnamed Item", sourceMeta.edition),
      sourceRefs: [sourceMeta.sourceDocumentKey],
      sourceMeta: {
        ...sourceMeta,
        dataStatus: "partial",
      },
      type: typeof entry.category === "string" ? entry.category : entry.category?.name ?? entry.category?.key,
      rarity: undefined,
      weight: entry.weight,
      description: toText(entry.desc),
    });
  }

  for (const entry of asArray<Open5eWeapon>(raw.weapons)) {
    const sourceMeta = inferSourceMeta(entry.document, raw.meta.preset, entry.key ?? "weapon");
    const key = entry.key ?? toSlug(entry.name ?? "weapon");
    const existing = equipmentByKey.get(key);
    const propertiesText = asArray<{ property?: { name?: string; desc?: string }; detail?: string | null }>(entry.properties)
      .map((property) => {
        const propName = toText(property.property?.name);
        const propDetail = toText(property.detail) ?? toText(property.property?.desc);
        return propName && propDetail ? `${propName}: ${propDetail}` : propName ?? propDetail;
      })
      .filter((value): value is string => Boolean(value))
      .join("\n");
    const description = [toText(existing?.description), propertiesText].filter(Boolean).join("\n").trim() || undefined;
    equipmentByKey.set(key, {
      id: existing?.id ?? buildId("equipment", `${key}-${sourceMeta.edition}`),
      key,
      category: "weapon",
      name: existing?.name ?? displayClassName(entry.name?.trim() || "Unnamed Weapon", sourceMeta.edition),
      sourceRefs: existing?.sourceRefs ?? [sourceMeta.sourceDocumentKey],
      sourceMeta: existing?.sourceMeta ?? sourceMeta,
      type: [toText(entry.damage_dice), toText(entry.damage_type?.name)].filter(Boolean).join(" ") || existing?.type,
      rarity: existing?.rarity,
      weight: existing?.weight,
      description,
    });
  }

  for (const entry of asArray<Open5eArmor>(raw.armor)) {
    const sourceMeta = inferSourceMeta(entry.document, raw.meta.preset, entry.key ?? "armor");
    const key = entry.key ?? toSlug(entry.name ?? "armor");
    const existing = equipmentByKey.get(key);
    const description = [toText(existing?.description), toText(entry.ac_display)].filter(Boolean).join("\n").trim() || undefined;
    equipmentByKey.set(key, {
      id: existing?.id ?? buildId("equipment", `${key}-${sourceMeta.edition}`),
      key,
      category: "armor",
      name: existing?.name ?? displayClassName(entry.name?.trim() || "Unnamed Armor", sourceMeta.edition),
      sourceRefs: existing?.sourceRefs ?? [sourceMeta.sourceDocumentKey],
      sourceMeta: existing?.sourceMeta ?? sourceMeta,
      type: toText(entry.category) ?? existing?.type,
      rarity: existing?.rarity,
      weight: existing?.weight,
      description,
    });
  }

  const equipment = Array.from(equipmentByKey.values()).sort((a, b) => a.name.localeCompare(b.name));

  const snapshot: MpmContentSnapshot = {
    meta: {
      generatedAt: raw.meta.importTimestamp,
      sourceFiles: [`open5e:${raw.meta.preset}`],
      parseErrors: [],
    },
    sources,
    classes,
    subclasses: subclasses.sort((a, b) => a.name.localeCompare(b.name)),
    species: species.sort((a, b) => a.name.localeCompare(b.name)),
    backgrounds: backgrounds.sort((a, b) => a.name.localeCompare(b.name)),
    feats: feats.sort((a, b) => a.name.localeCompare(b.name)),
    spells: spells.sort((a, b) => a.name.localeCompare(b.name)),
    equipment,
  };

  if (snapshot.classes.length === 0) {
    warnings.push("Open5e normalization produced zero classes.");
  }
  if (snapshot.spells.length === 0) {
    warnings.push("Open5e normalization produced zero spells.");
  }
  if (snapshot.backgrounds.length === 0) {
    warnings.push("Open5e normalization produced zero backgrounds.");
  }
  if (snapshot.feats.length === 0) {
    warnings.push("Open5e normalization produced zero feats.");
  }
  if (snapshot.species.length === 0) {
    warnings.push("Open5e normalization produced zero species.");
  }

  for (const classEntry of classes) {
    if (!classEntry.key || classEntry.key === "unknown-class") {
      skipped.push(`class:${classEntry.id} unresolved canonical key`);
    }
  }

  return {
    snapshot,
    importMeta: raw.meta,
    warnings,
    skipped,
  };
}
