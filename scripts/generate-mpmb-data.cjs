const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const localOutputPath = path.join(repoRoot, "src/services/data/generated/mpmb-local-content.json");
const mergedOutputPath = path.join(repoRoot, "src/services/data/generated/mpmb-content.json");
const open5eNormalizedPath = path.join(repoRoot, "data/imports/open5e/normalized/latest-open5e-content.json");
const mpmbPdfNormalizedPath = path.join(repoRoot, "data/imports/mpmb-pdf/normalized/latest-mpmb-pdf-content.json");
const mpmbUpstream2014NormalizedPath = path.join(
  repoRoot,
  "data/imports/mpmb-upstream-2014/normalized/latest-mpmb-upstream-2014-content.json",
);
const mpmbUpstream2024NormalizedPath = path.join(
  repoRoot,
  "data/imports/mpmb-upstream-2024/normalized/latest-mpmb-upstream-2024-content.json",
);
const localDiagnosticsDir = path.join(repoRoot, "data/imports/mpmb-local/manifests");
const localDiagnosticsLatestPath = path.join(localDiagnosticsDir, "latest-runtime-diagnostics.json");
const localDiagnosticsLatestSummaryPath = path.join(localDiagnosticsDir, "latest-runtime-summary.json");
const enablePdfCoreSeed = process.env.MPMB_ENABLE_PDF_SEED === "1";

const regressionBaselineThresholds = {
  maxParseErrors: 9,
  minClasses: 15,
  minSubclasses: 230,
  minSpecies: 311,
  minBackgrounds: 132,
  minFeats: 227,
  minSpells: 256,
  minEquipment: 509,
};

function toSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildId(prefix, rawKey) {
  return `${prefix}:${toSlug(rawKey)}`;
}

function mergeSources(baseSources, importedSources) {
  const byKey = new Map();
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

function inferEdition(entry) {
  const edition = entry?.sourceMeta?.edition;
  if (edition) {
    return edition;
  }
  const sourceRef = entry?.sourceRefs?.[0] ?? "";
  if (sourceRef.includes("2024")) {
    return "2024";
  }
  if (sourceRef.includes("2014")) {
    return "2014";
  }
  return "unknown";
}

function entryScore(entry) {
  const sourceSystem = entry?.sourceMeta?.sourceSystem ?? "mpmb";
  const importPreset = entry?.sourceMeta?.importPreset ?? "";
  const sourceDocumentKey = entry?.sourceMeta?.sourceDocumentKey ?? entry?.sourceRefs?.[0] ?? "";
  let score = sourceSystem === "mpmb" ? 90 : 70;
  if (importPreset === "mpmb-upstream-2024" || importPreset === "mpmb-upstream-2014") {
    score += 45;
  } else if (importPreset === "mpmb-local") {
    score += 25;
  } else if (importPreset === "mpmb-pdf") {
    score += 8;
  } else if (sourceSystem === "mpmb") {
    score += 15;
  }
  if (sourceDocumentKey.startsWith("srd-")) {
    score += 10;
  }
  if (sourceDocumentKey.startsWith("open5e")) {
    score += 5;
  }
  return score;
}

function featureIdentity(feature) {
  return toSlug(feature?.key || feature?.id || feature?.name || "");
}

function supplementStructuredFields(preferred, fallback) {
  if (!fallback || typeof fallback !== "object") {
    return preferred;
  }
  let result = preferred;
  if (result?.structuredData === undefined && fallback.structuredData !== undefined) {
    result = {
      ...result,
      structuredData: fallback.structuredData,
    };
  }
  for (const field of ["weaponList", "damage", "range", "mastery"]) {
    if (result?.[field] === undefined && fallback[field] !== undefined) {
      result = {
        ...result,
        [field]: fallback[field],
      };
    }
  }
  if (Array.isArray(result?.features) && Array.isArray(fallback.features)) {
    const fallbackFeatures = new Map(
      fallback.features
        .map((feature) => [featureIdentity(feature), feature])
        .filter(([key]) => Boolean(key)),
    );
    const nextFeatures = result.features.map((feature) => {
      if (feature?.structuredData !== undefined) {
        return feature;
      }
      const fallbackFeature = fallbackFeatures.get(featureIdentity(feature));
      if (!fallbackFeature?.structuredData) {
        return feature;
      }
      return {
        ...feature,
        structuredData: fallbackFeature.structuredData,
      };
    });
    result = {
      ...result,
      features: nextFeatures,
    };
  }
  return result;
}

function mergeByIdentity(baseEntries, importedEntries, identityFn) {
  const byIdentity = new Map();
  for (const entry of [...baseEntries, ...importedEntries]) {
    const identity = identityFn(entry);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, entry);
      continue;
    }
    if (entryScore(entry) > entryScore(existing)) {
      byIdentity.set(identity, supplementStructuredFields(entry, existing));
    } else {
      byIdentity.set(identity, supplementStructuredFields(existing, entry));
    }
  }
  return Array.from(byIdentity.values());
}

function mergeSnapshots(base, imported) {
  const classIdentity = (entry) => {
    const sourceSystem = entry?.sourceMeta?.sourceSystem ?? "mpmb";
    const canonical = entry.canonicalClassKey ?? toSlug(entry.key || entry.name);
    return `${sourceSystem}::${canonical}::${inferEdition(entry)}`;
  };
  const subclassIdentity = (entry) => {
    const sourceSystem = entry?.sourceMeta?.sourceSystem ?? "mpmb";
    const canonical = entry.canonicalClassKey ?? toSlug(entry.classKey || entry.name);
    return `${sourceSystem}::${toSlug(entry.key)}::${canonical}::${inferEdition(entry)}`;
  };
  const genericIdentity = (entry) => {
    const sourceSystem = entry?.sourceMeta?.sourceSystem ?? "mpmb";
    return `${sourceSystem}::${toSlug(entry.key)}::${inferEdition(entry)}`;
  };
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFiles: [...base.meta.sourceFiles, ...imported.meta.sourceFiles],
      parseErrors: [...base.meta.parseErrors, ...imported.meta.parseErrors],
    },
    sources: mergeSources(base.sources, imported.sources),
    classes: mergeByIdentity(base.classes, imported.classes, classIdentity).sort((a, b) => a.name.localeCompare(b.name)),
    subclasses: mergeByIdentity(base.subclasses, imported.subclasses, subclassIdentity).sort((a, b) => a.name.localeCompare(b.name)),
    species: mergeByIdentity(base.species, imported.species, genericIdentity).sort((a, b) => a.name.localeCompare(b.name)),
    backgrounds: mergeByIdentity(base.backgrounds, imported.backgrounds, genericIdentity).sort((a, b) => a.name.localeCompare(b.name)),
    feats: mergeByIdentity(base.feats, imported.feats, genericIdentity).sort((a, b) => a.name.localeCompare(b.name)),
    spells: mergeByIdentity(base.spells, imported.spells, genericIdentity).sort((a, b) => a.name.localeCompare(b.name)),
    equipment: mergeByIdentity(base.equipment, imported.equipment, genericIdentity).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function titleFromKey(key) {
  const text = String(key).replace(/[-_]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toText(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .flat()
      .filter((item) => typeof item === "string")
      .join("\n")
      .trim();
  }
  return undefined;
}

function sourceRefs(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    if (Array.isArray(value[0])) {
      return value
        .map((item) => {
          if (!Array.isArray(item) || item.length === 0) {
            return "";
          }
          return item.length > 1 ? `${item[0]}:${item[1]}` : String(item[0]);
        })
        .filter(Boolean);
    }
    return value.length > 1 ? [`${value[0]}:${value[1]}`] : [String(value[0])];
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

function inferLocalEdition(sourceRefEntries) {
  const joined = sourceRefEntries.join(" ").toLowerCase();
  if (joined.includes("2024") || /\bp24\b/.test(joined) || /\bsrd24\b/.test(joined)) {
    return "2024";
  }
  if (/\bp\b/.test(joined) || /\bsrd\b/.test(joined)) {
    return "2014";
  }
  return "unknown";
}

function localSourceMeta(sourceRefEntries, rawSourceRef, status) {
  return {
    sourceSystem: "mpmb",
    sourceDocumentKey: sourceRefEntries[0] ? String(sourceRefEntries[0]).split(":")[0] : "unknown",
    sourceDocumentName: sourceRefEntries[0] ?? "unknown",
    edition: inferLocalEdition(sourceRefEntries),
    importPreset: "mpmb-local",
    rawSourceRef,
    dataStatus: status,
  };
}

function numberFromUnknown(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function safeClone(value, depth = 0) {
  if (depth > 6) {
    return undefined;
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "function") {
    return undefined;
  }
  if (value instanceof RegExp) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeClone(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      const cloned = safeClone(nested, depth + 1);
      if (cloned !== undefined) {
        result[key] = cloned;
      }
    }
    return result;
  }
  return undefined;
}

function extractMinLevel(featureKey, featureValue) {
  const explicit = numberFromUnknown(featureValue?.minlevel);
  if (explicit !== undefined) {
    return explicit;
  }
  const match = String(featureKey).match(/\d+/);
  if (match) {
    return Number(match[0]);
  }
  return 1;
}

const structuredChoiceKeys = [
  "choices",
  "choicesNotInMenu",
  "extraTimes",
  "extraname",
  "extrachoices",
  "autoSelectExtrachoices",
  "choicesWeaponMasteries",
  "choicesFightingStyles",
  "spellcastingBonus",
  "spellcastingAbility",
  "spellFirstColTitle",
  "skills",
  "skillstxt",
  "scores",
  "toolProfs",
  "languageProfs",
  "armorProfs",
  "weaponProfs",
  "addMod",
  "extraAC",
  "action",
  "usages",
  "recovery",
  "additional",
  "firstCol",
];

function extractStructuredData(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const output = {};
  for (const key of structuredChoiceKeys) {
    if (!(key in value)) {
      continue;
    }
    const cloned = safeClone(value[key]);
    if (cloned !== undefined) {
      output[key] = cloned;
    }
  }
  for (const choice of Array.isArray(value.choices) ? value.choices : []) {
    const choiceKey = toSlug(choice);
    const rawChoice = value[String(choice).toLowerCase()] ?? value[choiceKey] ?? value[String(choice)];
    const cloned = extractStructuredData(rawChoice);
    if (cloned !== undefined) {
      output[choiceKey] = cloned;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function extractFeatures(features, ownerId) {
  if (!features || typeof features !== "object") {
    return [];
  }
  const output = [];
  for (const [featureKey, rawFeature] of Object.entries(features)) {
    if (!rawFeature || typeof rawFeature !== "object" || Array.isArray(rawFeature)) {
      continue;
    }
    const name = rawFeature.name || titleFromKey(featureKey);
    const description =
      toText(rawFeature.description) ??
      toText(rawFeature.descriptionFull) ??
      toText(rawFeature.usagescalc) ??
      undefined;
    output.push({
      id: `${ownerId}:feature:${toSlug(featureKey)}`,
      key: featureKey,
      name,
      minLevel: extractMinLevel(featureKey, rawFeature),
      description,
      usages: rawFeature.usages,
      recovery: rawFeature.recovery,
      structuredData: extractStructuredData(rawFeature),
    });
  }
  return output.sort((a, b) => a.minLevel - b.minLevel || a.name.localeCompare(b.name));
}

function extractSpeed(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  const walk = value.walk?.spd;
  if (typeof walk === "number") {
    return `${walk} ft`;
  }
  return undefined;
}

function extractSpellClasses(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    const flattened = value.flat();
    return flattened.filter((entry) => typeof entry === "string").map((entry) => entry.toLowerCase());
  }
  if (typeof value === "string") {
    return [value.toLowerCase()];
  }
  return [];
}

function uniqueSortedStrings(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function gatherSourceFiles() {
  const wotcMaterial = fs
    .readdirSync(path.join(repoRoot, "WotC material"))
    .filter((fileName) => fileName.endsWith(".js") && /^(pub|ua)_/i.test(fileName))
    .sort()
    .map((fileName) => path.join("WotC material", fileName));
  const wotc2024 = fs
    .readdirSync(path.join(repoRoot, "WotC 2024"))
    .filter((fileName) => fileName.endsWith(".js"))
    .sort()
    .map((fileName) => path.join("WotC 2024", fileName));
  const homebrew = fs
    .readdirSync(path.join(repoRoot, "Homebrew"))
    .filter((fileName) => fileName.endsWith(".js"))
    .sort()
    .map((fileName) => path.join("Homebrew", fileName));
  const docsVariableSources = [
    path.join("docs", "Sheet skripte", "_variables", "ListsFeats.js"),
    path.join("docs", "Sheet skripte", "_variables", "ListsClasses.js"),
    path.join("docs", "Sheet skripte", "_variables", "ListsGear.js"),
    path.join("docs", "Sheet skripte 2024", "_variables", "ListsFeats.js"),
    path.join("docs", "Sheet skripte 2024", "_variables", "ListsClasses.js"),
    path.join("docs", "Sheet skripte 2024", "_variables", "ListsGear.js"),
  ].filter((relativePath) => fs.existsSync(path.join(repoRoot, relativePath)));
  return [...wotcMaterial, ...wotc2024, ...docsVariableSources, ...homebrew];
}

function classifySourceFile(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  if (normalized.startsWith("docs/sheet skripte")) {
    return "core-seed";
  }
  if (normalized === "wotc material/pub_20140818_phb.js" || normalized === "wotc 2024/pub_20240917_phb.js") {
    return "core-seed";
  }
  if (normalized.startsWith("wotc material/not-reprinted_")) {
    return "core-seed";
  }
  if (normalized.startsWith("wotc material/pub_") || normalized.startsWith("wotc 2024/pub_")) {
    return "published-supplement";
  }
  if (normalized.startsWith("wotc material/ua_") || normalized.startsWith("wotc 2024/ua_")) {
    return "ua";
  }
  if (normalized.startsWith("homebrew/")) {
    return "homebrew";
  }
  return "other";
}

function createLoadPlan(sourceFiles) {
  const buckets = {
    "core-seed": [],
    "published-supplement": [],
    ua: [],
    homebrew: [],
    other: [],
  };
  for (const file of sourceFiles) {
    buckets[classifySourceFile(file)].push(file);
  }
  const orderedFiles = [
    ...buckets["core-seed"],
    ...buckets["published-supplement"],
    ...buckets.ua,
    ...buckets.homebrew,
    ...buckets.other,
  ];
  return {
    orderedFiles,
    buckets,
  };
}

function hasOwnRegistryEntry(registry, key) {
  return Object.prototype.hasOwnProperty.call(registry, key);
}

function createFeaturePlaceholder() {
  return {
    usages: undefined,
    recovery: undefined,
    action: undefined,
    wildshapePageInfo: {
      uses: undefined,
      duration: undefined,
    },
    description: undefined,
    components: "",
    source: [["HB", 0]],
  };
}

function createFeatureRegistry() {
  const fallbackByKey = new Map();
  return new Proxy(
    {},
    {
      get(target, property) {
        if (typeof property === "symbol") {
          return target[property];
        }
        if (property in target) {
          return target[property];
        }
        if (!fallbackByKey.has(property)) {
          fallbackByKey.set(property, createFeaturePlaceholder());
        }
        return fallbackByKey.get(property);
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
      ownKeys(target) {
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, property) {
        return Object.getOwnPropertyDescriptor(target, property);
      },
    },
  );
}

function createClassPlaceholder() {
  return {
    features: createFeatureRegistry(),
    subclasses: [[], []],
    source: [["HB", 0]],
  };
}

function createRacePlaceholder() {
  return {
    trait: "",
    regExpSearch: "",
    features: createFeatureRegistry(),
    source: [["HB", 0]],
  };
}

function createSpellPlaceholder() {
  return {
    source: [["HB", 0]],
    components: "",
    description: "",
    classes: [],
  };
}

function createBackgroundPlaceholder() {
  return {
    source: [["HB", 0]],
    name: "",
    trait: "",
  };
}

function ensureAtLeastTwoNotes(value) {
  const fallbackEntry = { name: "", note: "" };
  if (!Array.isArray(value)) {
    return [fallbackEntry, { ...fallbackEntry }];
  }
  const cloned = value.map((entry) => {
    if (entry && typeof entry === "object") {
      return {
        name: entry.name ?? "",
        note: entry.note ?? "",
        source: entry.source,
      };
    }
    return { ...fallbackEntry };
  });
  while (cloned.length < 2) {
    cloned.push({ ...fallbackEntry });
  }
  return cloned;
}

function createMagicItemVariantFallback(baseItem) {
  return {
    name: undefined,
    source: ensureSourceTupleArray(baseItem?.source),
    attunement: baseItem?.attunement,
  };
}

const magicItemReservedFields = new Set([
  "name",
  "source",
  "description",
  "descriptionFull",
  "spellcastingBonus",
  "spellChanges",
  "toNotesPage",
  "type",
  "rarity",
  "magicItemTable",
  "attunement",
  "prerequisite",
  "prereqeval",
  "weight",
  "action",
  "extraLimitedFeatures",
  "calcChanges",
  "weaponOptions",
  "armorOptions",
  "choices",
  "selfChoosing",
  "addMod",
  "extraAC",
  "regExpSearch",
  "firstCol",
  "usages",
  "recovery",
  "additional",
  "_variantOf",
]);

function shouldCreateMagicItemVariantFallback(propertyKey) {
  if (!propertyKey || magicItemReservedFields.has(propertyKey)) {
    return false;
  }
  if (propertyKey === "__proto__") {
    return false;
  }
  return /[a-z0-9]/i.test(propertyKey);
}

function withMagicItemNestedFallback(entry) {
  const fallbackByKey = new Map();
  return new Proxy(entry, {
    get(target, property) {
      if (typeof property === "symbol") {
        return target[property];
      }
      if (property in target) {
        return target[property];
      }
      const key = String(property);
      if (!shouldCreateMagicItemVariantFallback(key)) {
        return undefined;
      }
      if (!fallbackByKey.has(key)) {
        fallbackByKey.set(key, createMagicItemVariantFallback(target));
      }
      return fallbackByKey.get(key);
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
    ownKeys(target) {
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, property) {
      return Object.getOwnPropertyDescriptor(target, property);
    },
  });
}

function createMagicItemPlaceholder(itemKey = "") {
  return withMagicItemNestedFallback({
    source: [["HB", 0]],
    name: titleFromKey(itemKey),
    description: "",
    descriptionFull: "",
    spellcastingBonus: [],
    spellChanges: {},
    toNotesPage: ensureAtLeastTwoNotes(undefined),
  });
}

function createCreaturePlaceholder(creatureKey = "") {
  return {
    name: titleFromKey(creatureKey),
    source: [["HB", 0]],
    traits: [],
    actions: [],
    features: [],
    notes: [],
    scores: [10, 10, 10, 10, 10, 10],
  };
}

function createCompanionNotesPlaceholder() {
  return [{ name: "Companion", description: "It assumes a chosen form." }];
}

function createCompanionPlaceholder(companionKey = "") {
  return {
    name: titleFromKey(companionKey),
    source: [["HB", 0]],
    includeCheck: () => true,
    action: [],
    notes: createCompanionNotesPlaceholder(),
    attributesAdd: {},
    attributesChange: () => undefined,
  };
}

function ensureSourceTupleArray(value) {
  if (Array.isArray(value) && value.length > 0) {
    if (Array.isArray(value[0])) {
      return value;
    }
    return [value];
  }
  return [["HB", 0]];
}

function normalizeRegExpSearch(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof RegExp) {
    return value.toString();
  }
  return String(value);
}

function ensureFeatureMap(value) {
  if (value && typeof value === "object") {
    return value;
  }
  return createFeatureRegistry();
}

function normalizeClassDefinition(value) {
  const normalized = value && typeof value === "object" ? value : {};
  normalized.source = ensureSourceTupleArray(normalized.source);
  normalized.features = ensureFeatureMap(normalized.features);
  if (!Array.isArray(normalized.subclasses)) {
    normalized.subclasses = [[], []];
  }
  return normalized;
}

function normalizeRaceDefinition(value) {
  const normalized = value && typeof value === "object" ? value : {};
  normalized.source = ensureSourceTupleArray(normalized.source);
  normalized.features = ensureFeatureMap(normalized.features);
  normalized.regExpSearch = normalizeRegExpSearch(normalized.regExpSearch);
  if (normalized.trait === undefined) {
    normalized.trait = "";
  }
  return normalized;
}

function normalizeBackgroundDefinition(value) {
  const normalized = value && typeof value === "object" ? value : {};
  normalized.source = ensureSourceTupleArray(normalized.source);
  if (normalized.name === undefined) {
    normalized.name = "";
  }
  if (normalized.trait === undefined) {
    normalized.trait = "";
  }
  return normalized;
}

function normalizeMagicItemDefinition(value) {
  const normalized = normalizeSimpleEntry(value, {
    name: "",
    description: "",
    descriptionFull: "",
    spellcastingBonus: [],
    spellChanges: {},
    toNotesPage: ensureAtLeastTwoNotes(undefined),
  });
  if (!Array.isArray(normalized.spellcastingBonus)) {
    normalized.spellcastingBonus = [];
  }
  if (!normalized.spellChanges || typeof normalized.spellChanges !== "object") {
    normalized.spellChanges = {};
  }
  normalized.toNotesPage = ensureAtLeastTwoNotes(normalized.toNotesPage);
  return withMagicItemNestedFallback(normalized);
}

function normalizeCreatureDefinition(value) {
  return normalizeSimpleEntry(value, {
    source: [["HB", 0]],
    traits: [],
    actions: [],
    features: [],
    notes: [],
    scores: [10, 10, 10, 10, 10, 10],
  });
}

function normalizeCompanionDefinition(value) {
  const normalized = normalizeSimpleEntry(value, {
    source: [["HB", 0]],
    action: [],
    notes: createCompanionNotesPlaceholder(),
    attributesAdd: {},
  });
  if (typeof normalized.includeCheck !== "function") {
    normalized.includeCheck = () => true;
  }
  if (typeof normalized.attributesChange !== "function") {
    normalized.attributesChange = () => undefined;
  }
  if (!Array.isArray(normalized.notes)) {
    normalized.notes = createCompanionNotesPlaceholder();
  }
  if (!Array.isArray(normalized.action)) {
    normalized.action = [];
  }
  return normalized;
}

function normalizeSimpleEntry(value, extraDefaults = {}) {
  const normalized = value && typeof value === "object" ? value : {};
  normalized.source = ensureSourceTupleArray(normalized.source);
  for (const [key, fallbackValue] of Object.entries(extraDefaults)) {
    if (normalized[key] === undefined) {
      normalized[key] = fallbackValue;
    }
  }
  return normalized;
}

function createFaultTolerantRegistry(missingFactory, options = {}) {
  const normalizeValue = typeof options.normalizeValue === "function" ? options.normalizeValue : (value) => value;
  const onMissing = typeof options.onMissing === "function" ? options.onMissing : undefined;
  const onSet = typeof options.onSet === "function" ? options.onSet : undefined;
  const fallbackByKey = new Map();
  return new Proxy(
    {},
    {
      get(target, property) {
        if (typeof property === "symbol") {
          return target[property];
        }
        if (property in target) {
          return target[property];
        }
        if (!fallbackByKey.has(property)) {
          const fallbackValue = missingFactory(property);
          fallbackByKey.set(property, fallbackValue);
          if (onMissing) {
            onMissing(String(property));
          }
        }
        return fallbackByKey.get(property);
      },
      set(target, property, value) {
        const normalized = normalizeValue(value);
        target[property] = normalized;
        if (onSet) {
          onSet(String(property), normalized);
        }
        return true;
      },
      ownKeys(target) {
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Object.getOwnPropertyDescriptor(target, property);
        if (descriptor) {
          return descriptor;
        }
        return undefined;
      },
    },
  );
}

const runtimeDiagnostics = {
  currentFile: "",
  unknownGlobals: new Map(),
  unknownGlobalsByFile: new Map(),
  shimCalls: new Map(),
  shimCallsByFile: new Map(),
  registryFallbacksByFile: new Map(),
  fileResults: [],
  loadPlan: undefined,
  seedInfo: {
    used: false,
    path: "",
    counts: {
      sources: 0,
      classes: 0,
      subclasses: 0,
      species: 0,
      backgrounds: 0,
      feats: 0,
      spells: 0,
      equipment: 0,
    },
  },
};

function currentFileKey() {
  return runtimeDiagnostics.currentFile || "__global__";
}

function incrementNamedCounter(map, key, increment = 1) {
  map.set(key, (map.get(key) ?? 0) + increment);
}

function incrementCounterByFile(mapByFile, fileKey, counterKey, increment = 1) {
  if (!mapByFile.has(fileKey)) {
    mapByFile.set(fileKey, new Map());
  }
  const fileMap = mapByFile.get(fileKey);
  fileMap.set(counterKey, (fileMap.get(counterKey) ?? 0) + increment);
}

function registerShimCall(name) {
  incrementNamedCounter(runtimeDiagnostics.shimCalls, name);
  incrementCounterByFile(runtimeDiagnostics.shimCallsByFile, currentFileKey(), name);
}

function registerUnknownGlobal(name) {
  incrementNamedCounter(runtimeDiagnostics.unknownGlobals, name);
  incrementCounterByFile(runtimeDiagnostics.unknownGlobalsByFile, currentFileKey(), name);
}

function registerRegistryFallback(registryName, propertyKey) {
  incrementCounterByFile(runtimeDiagnostics.registryFallbacksByFile, currentFileKey(), `${registryName}.${propertyKey}`);
}

const classListRegistry = createFaultTolerantRegistry(() => createClassPlaceholder(), {
  normalizeValue: normalizeClassDefinition,
  onMissing: (propertyKey) => registerRegistryFallback("ClassList", propertyKey),
});
const classSubListRegistry = createFaultTolerantRegistry(() => ({ features: createFeatureRegistry(), source: [["HB", 0]] }), {
  normalizeValue: (value) => normalizeSimpleEntry(value, { features: createFeatureRegistry() }),
  onMissing: (propertyKey) => registerRegistryFallback("ClassSubList", propertyKey),
});
const raceListRegistry = createFaultTolerantRegistry(() => createRacePlaceholder(), {
  normalizeValue: normalizeRaceDefinition,
  onMissing: (propertyKey) => registerRegistryFallback("RaceList", propertyKey),
});
const raceSubListRegistry = createFaultTolerantRegistry(() => createRacePlaceholder(), {
  normalizeValue: normalizeRaceDefinition,
  onMissing: (propertyKey) => registerRegistryFallback("RaceSubList", propertyKey),
});
const backgroundListRegistry = createFaultTolerantRegistry(() => createBackgroundPlaceholder(), {
  normalizeValue: normalizeBackgroundDefinition,
  onMissing: (propertyKey) => registerRegistryFallback("BackgroundList", propertyKey),
});
const backgroundFeatureListRegistry = createFaultTolerantRegistry(() => ({ description: "" }), {
  normalizeValue: (value) => normalizeSimpleEntry(value, { description: "" }),
  onMissing: (propertyKey) => registerRegistryFallback("BackgroundFeatureList", propertyKey),
});
const featsListRegistry = createFaultTolerantRegistry(() => ({ source: [["HB", 0]], description: "" }), {
  normalizeValue: (value) => normalizeSimpleEntry(value, { description: "" }),
  onMissing: (propertyKey) => registerRegistryFallback("FeatsList", propertyKey),
});
const spellsListRegistry = createFaultTolerantRegistry(() => createSpellPlaceholder(), {
  normalizeValue: (value) => normalizeSimpleEntry(value, { description: "", components: "", classes: [] }),
  onMissing: (propertyKey) => registerRegistryFallback("SpellsList", propertyKey),
});
const magicItemsListRegistry = createFaultTolerantRegistry((propertyKey) => createMagicItemPlaceholder(String(propertyKey)), {
  normalizeValue: normalizeMagicItemDefinition,
  onMissing: (propertyKey) => registerRegistryFallback("MagicItemsList", propertyKey),
});
const weaponsListRegistry = createFaultTolerantRegistry(() => ({ source: [["HB", 0]], description: "" }), {
  normalizeValue: (value) => normalizeSimpleEntry(value, { description: "" }),
  onMissing: (propertyKey) => registerRegistryFallback("WeaponsList", propertyKey),
});
const armourListRegistry = createFaultTolerantRegistry(() => ({ source: [["HB", 0]], description: "" }), {
  normalizeValue: (value) => normalizeSimpleEntry(value, { description: "" }),
  onMissing: (propertyKey) => registerRegistryFallback("ArmourList", propertyKey),
});
const armorListRegistry = createFaultTolerantRegistry(() => ({ source: [["HB", 0]], description: "" }), {
  normalizeValue: (value) => normalizeSimpleEntry(value, { description: "" }),
  onMissing: (propertyKey) => registerRegistryFallback("ArmorList", propertyKey),
});
const gearListRegistry = createFaultTolerantRegistry(() => ({ source: [["HB", 0]], description: "" }), {
  normalizeValue: (value) => normalizeSimpleEntry(value, { description: "" }),
  onMissing: (propertyKey) => registerRegistryFallback("GearList", propertyKey),
});
const ammoListRegistry = createFaultTolerantRegistry(() => ({ source: [["HB", 0]], description: "" }), {
  normalizeValue: (value) => normalizeSimpleEntry(value, { description: "" }),
  onMissing: (propertyKey) => registerRegistryFallback("AmmoList", propertyKey),
});
const creatureListRegistry = createFaultTolerantRegistry((propertyKey) => createCreaturePlaceholder(String(propertyKey)), {
  normalizeValue: normalizeCreatureDefinition,
  onMissing: (propertyKey) => registerRegistryFallback("CreatureList", propertyKey),
});
const companionListRegistry = createFaultTolerantRegistry((propertyKey) => createCompanionPlaceholder(String(propertyKey)), {
  normalizeValue: normalizeCompanionDefinition,
  onMissing: (propertyKey) => registerRegistryFallback("CompanionList", propertyKey),
});

const registries = {
  SourceList: createFaultTolerantRegistry(() => ({ name: "" }), {
    normalizeValue: (value) => (value && typeof value === "object" ? value : { name: "" }),
    onMissing: (propertyKey) => registerRegistryFallback("SourceList", propertyKey),
  }),
  ClassList: classListRegistry,
  ClassSubList: classSubListRegistry,
  RaceList: raceListRegistry,
  RaceSubList: raceSubListRegistry,
  BackgroundList: backgroundListRegistry,
  BackgroundFeatureList: backgroundFeatureListRegistry,
  FeatsList: featsListRegistry,
  SpellsList: spellsListRegistry,
  MagicItemsList: magicItemsListRegistry,
  WeaponsList: weaponsListRegistry,
  ArmourList: armourListRegistry,
  ArmorList: armorListRegistry,
  GearList: gearListRegistry,
  AmmoList: ammoListRegistry,
  CreatureList: creatureListRegistry,
  CompanionList: companionListRegistry,
};

const subclassClassKeyMap = new Map();
const raceVariantMap = new Map();
const parseErrors = [];

function desc(value) {
  if (Array.isArray(value)) {
    return value.join("\n");
  }
  return String(value ?? "");
}

function cloneForNewObj(value) {
  const clone = safeClone(value);
  if (Array.isArray(clone)) {
    return clone;
  }
  if (clone && typeof clone === "object") {
    if (!clone.features || typeof clone.features !== "object") {
      clone.features = createFeatureRegistry();
    }
    return clone;
  }
  return {};
}

function AddSubClass(classKey, subKey, definition) {
  registerShimCall("AddSubClass");
  const cKey = String(classKey).toLowerCase();
  const sKey = String(subKey).toLowerCase();
  const listKey = `${cKey}-${sKey}`;
  const safeDefinition = definition && typeof definition === "object" ? definition : {};
  if (!safeDefinition.features || typeof safeDefinition.features !== "object") {
    safeDefinition.features = createFeatureRegistry();
  }
  registries.ClassSubList[listKey] = safeDefinition;
  subclassClassKeyMap.set(listKey, cKey);
  return listKey;
}

function AddRacialVariant(raceKey, variantKey, definition) {
  registerShimCall("AddRacialVariant");
  const rKey = String(raceKey).toLowerCase();
  const vKey = String(variantKey).toLowerCase();
  const listKey = `${rKey}-${vKey}`;
  const baseRace = registries.RaceList[rKey] ?? registries.RaceList[raceKey] ?? {};
  registries.RaceSubList[listKey] = {
    ...baseRace,
    ...(definition ?? {}),
    _variantOf: rKey,
  };
  raceVariantMap.set(listKey, rKey);
  return listKey;
}

function AddBackgroundVariant(backgroundKey, variantKey, definition) {
  registerShimCall("AddBackgroundVariant");
  const bKey = String(backgroundKey).toLowerCase();
  const vKey = String(variantKey).toLowerCase();
  const listKey = `${bKey}-${vKey}`;
  const baseBackground = registries.BackgroundList[bKey] ?? registries.BackgroundList[backgroundKey] ?? {};
  registries.BackgroundList[listKey] = {
    ...baseBackground,
    ...(definition ?? {}),
    _variantOf: bKey,
  };
  return listKey;
}

function AddFeatureChoice(target, _isField, choiceName, choiceDefinition) {
  registerShimCall("AddFeatureChoice");
  if (!target || typeof target !== "object") {
    return;
  }
  if (!Array.isArray(target.extrachoices)) {
    target.extrachoices = [];
  }
  const safeChoiceName = String(choiceName ?? choiceDefinition?.name ?? "").trim();
  if (safeChoiceName && !target.extrachoices.includes(safeChoiceName)) {
    target.extrachoices.push(safeChoiceName);
  }
  if (choiceDefinition && typeof choiceDefinition === "object" && safeChoiceName) {
    target[safeChoiceName.toLowerCase()] = choiceDefinition;
  }
}

function createShimFunction(name, implementation = () => undefined) {
  return function shimmedFunction(...args) {
    registerShimCall(name);
    return implementation(...args);
  };
}

const noopBase = function noopBase() {
  return undefined;
};

const noop = new Proxy(noopBase, {
  apply() {
    return undefined;
  },
  construct() {
    return {};
  },
  get(_target, property) {
    if (property === Symbol.toPrimitive) {
      return () => 0;
    }
    if (property === "toString") {
      return () => "";
    }
    if (property === "valueOf") {
      return () => 0;
    }
    return noop;
  },
  has() {
    return true;
  },
  set() {
    return true;
  },
});

const sandboxTarget = {
  ...registries,
  sheetVersion: 14000006,
  levels: Array.from({ length: 20 }, (_, index) => index + 1),
  typePF: false,
  desc,
  toUni: (value) => String(value),
  newObj: cloneForNewObj,
  isArray: Array.isArray,
  RequiredSheetVersion: createShimFunction("RequiredSheetVersion"),
  AddSubClass,
  AddRacialVariant,
  AddBackgroundVariant,
  AddFeatureChoice,
  What: createShimFunction("What", () => ""),
  How: createShimFunction("How", () => 0),
  Who: createShimFunction("Who", () => ""),
  SetStringifieds: createShimFunction("SetStringifieds"),
  processAddWeapons: createShimFunction("processAddWeapons"),
  processAddArmour: createShimFunction("processAddArmour"),
  processAddMagicItems: createShimFunction("processAddMagicItems"),
  processAddCompanions: createShimFunction("processAddCompanions"),
  processAddBackgrounds: createShimFunction("processAddBackgrounds"),
  processAddFeats: createShimFunction("processAddFeats"),
  processAddSpells: createShimFunction("processAddSpells"),
  ClassFeatureOptions: createShimFunction("ClassFeatureOptions"),
  AddString: createShimFunction("AddString"),
  AddToModFld: createShimFunction("AddToModFld"),
  RemoveString: createShimFunction("RemoveString"),
  RemoveSpell: createShimFunction("RemoveSpell"),
  AddSpell: createShimFunction("AddSpell"),
  SetProf: createShimFunction("SetProf"),
  eval_ish: createShimFunction("eval_ish"),
  CurrentSpells: {},
  CurrentRace: {},
  CurrentClasses: { known: {} },
  CurrentFeats: { known: [], choices: [] },
  CurrentBackground: {},
  CurrentArmour: {},
  CurrentWeapons: {},
  CurrentMagicItems: {},
  CurrentSources: { weapExcl: [], ammoExcl: [] },
  ClassList: registries.ClassList,
  ClassSubList: registries.ClassSubList,
  RaceList: registries.RaceList,
  RaceSubList: registries.RaceSubList,
  BackgroundList: registries.BackgroundList,
  BackgroundFeatureList: registries.BackgroundFeatureList,
  FeatsList: registries.FeatsList,
  SpellsList: registries.SpellsList,
  MagicItemsList: registries.MagicItemsList,
  WeaponsList: registries.WeaponsList,
  ArmourList: registries.ArmourList,
  ArmorList: registries.ArmorList,
  GearList: registries.GearList,
  AmmoList: registries.AmmoList,
  CreatureList: registries.CreatureList,
  CompanionList: registries.CompanionList,
  Base_SourceList: registries.SourceList,
  Base_ClassList: registries.ClassList,
  Base_ClassSubList: registries.ClassSubList,
  Base_RaceList: registries.RaceList,
  Base_RaceSubList: registries.RaceSubList,
  Base_BackgroundList: registries.BackgroundList,
  Base_BackgroundFeatureList: registries.BackgroundFeatureList,
  Base_FeatsList: registries.FeatsList,
  Base_SpellsList: registries.SpellsList,
  Base_MagicItemsList: registries.MagicItemsList,
  Base_WeaponsList: registries.WeaponsList,
  Base_ArmourList: registries.ArmourList,
  Base_ArmorList: registries.ArmorList,
  Base_GearList: registries.GearList,
  Base_AmmoList: registries.AmmoList,
  Base_CreatureList: registries.CreatureList,
  Base_CompanionList: registries.CompanionList,
  Math,
  Number,
  String,
  Boolean,
  Object,
  Array,
  Date,
  JSON,
  RegExp,
  Error,
  parseInt,
  parseFloat,
  isNaN,
  Infinity,
  NaN,
  undefined,
};

const sandbox = new Proxy(sandboxTarget, {
  has() {
    return true;
  },
  get(target, property) {
    if (property in target) {
      return target[property];
    }
    if (typeof property !== "symbol") {
      registerUnknownGlobal(String(property));
    }
    return noop;
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
});
const vmContext = vm.createContext(sandbox);

const registryAliases = [
  { names: ["ClassList", "Base_ClassList"], registry: registries.ClassList },
  { names: ["ClassSubList", "Base_ClassSubList"], registry: registries.ClassSubList },
  { names: ["RaceList", "Base_RaceList"], registry: registries.RaceList },
  { names: ["RaceSubList", "Base_RaceSubList"], registry: registries.RaceSubList },
  { names: ["BackgroundList", "Base_BackgroundList"], registry: registries.BackgroundList },
  { names: ["BackgroundFeatureList", "Base_BackgroundFeatureList"], registry: registries.BackgroundFeatureList },
  { names: ["FeatsList", "Base_FeatsList"], registry: registries.FeatsList },
  { names: ["SpellsList", "Base_SpellsList"], registry: registries.SpellsList },
  { names: ["MagicItemsList", "Base_MagicItemsList"], registry: registries.MagicItemsList },
  { names: ["WeaponsList", "Base_WeaponsList"], registry: registries.WeaponsList },
  { names: ["ArmourList", "Base_ArmourList"], registry: registries.ArmourList },
  { names: ["ArmorList", "Base_ArmorList"], registry: registries.ArmorList },
  { names: ["GearList", "Base_GearList"], registry: registries.GearList },
  { names: ["AmmoList", "Base_AmmoList"], registry: registries.AmmoList },
];

function assimilateDetachedBaseRegistries() {
  for (const { names, registry } of registryAliases) {
    for (const name of names) {
      const value = vmContext[name];
      if (value && typeof value === "object" && value !== registry && !Array.isArray(value)) {
        for (const [key, entry] of Object.entries(value)) {
          registry[key] = entry;
        }
      }
      vmContext[name] = registry;
    }
  }
}

function seedFromMpmbPdfSnapshot(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) {
    return {
      used: false,
      path: snapshotPath,
      counts: {
        sources: 0,
        classes: 0,
        subclasses: 0,
        species: 0,
        backgrounds: 0,
        feats: 0,
        spells: 0,
        equipment: 0,
      },
    };
  }
  const raw = fs.readFileSync(snapshotPath, "utf8");
  const snapshot = JSON.parse(raw);
  const counts = {
    sources: 0,
    classes: 0,
    subclasses: 0,
    species: 0,
    backgrounds: 0,
    feats: 0,
    spells: 0,
    equipment: 0,
  };

  for (const source of snapshot.sources ?? []) {
    if (!source?.key || hasOwnRegistryEntry(registries.SourceList, source.key)) {
      continue;
    }
    registries.SourceList[source.key] = {
      name: source.name ?? source.key,
      abbreviation: source.abbreviation,
      group: source.group,
      date: source.date,
      url: source.url,
      defaultExcluded: source.defaultExcluded,
    };
    counts.sources += 1;
  }

  for (const classEntry of snapshot.classes ?? []) {
    const key = classEntry?.key;
    if (!key || hasOwnRegistryEntry(registries.ClassList, key)) {
      continue;
    }
    registries.ClassList[key] = {
      name: classEntry.name ?? titleFromKey(key),
      source: classEntry.sourceRefs ?? classEntry.source ?? [["HB", 0]],
      die: classEntry.hitDie,
      spellcastingFactor: classEntry.spellcastingFactor,
      spellcastingKnown: classEntry.spellcastingKnown,
      features: {},
      subclasses: [[], []],
    };
    counts.classes += 1;
  }

  for (const subclassEntry of snapshot.subclasses ?? []) {
    const key = subclassEntry?.key;
    if (!key || hasOwnRegistryEntry(registries.ClassSubList, key)) {
      continue;
    }
    registries.ClassSubList[key] = {
      subname: subclassEntry.name ?? titleFromKey(key),
      source: subclassEntry.sourceRefs ?? [["HB", 0]],
      features: {},
    };
    if (subclassEntry.classKey) {
      subclassClassKeyMap.set(key, String(subclassEntry.classKey).toLowerCase());
    }
    counts.subclasses += 1;
  }

  for (const speciesEntry of snapshot.species ?? []) {
    const key = speciesEntry?.key;
    if (!key || hasOwnRegistryEntry(registries.RaceList, key)) {
      continue;
    }
    registries.RaceList[key] = {
      name: speciesEntry.name ?? titleFromKey(key),
      source: speciesEntry.sourceRefs ?? [["HB", 0]],
      trait: speciesEntry.traits ?? "",
      speed: speciesEntry.speed,
      size: speciesEntry.size,
    };
    counts.species += 1;
  }

  for (const backgroundEntry of snapshot.backgrounds ?? []) {
    const key = backgroundEntry?.key;
    if (!key || hasOwnRegistryEntry(registries.BackgroundList, key)) {
      continue;
    }
    registries.BackgroundList[key] = {
      name: backgroundEntry.name ?? titleFromKey(key),
      source: backgroundEntry.sourceRefs ?? [["HB", 0]],
      skillstxt: backgroundEntry.skillText,
      toolstxt: backgroundEntry.toolText,
      trait: backgroundEntry.traitText,
      feats: backgroundEntry.bonusFeat ? [backgroundEntry.bonusFeat] : undefined,
    };
    counts.backgrounds += 1;
  }

  for (const featEntry of snapshot.feats ?? []) {
    const key = featEntry?.key;
    if (!key || hasOwnRegistryEntry(registries.FeatsList, key)) {
      continue;
    }
    registries.FeatsList[key] = {
      name: featEntry.name ?? titleFromKey(key),
      source: featEntry.sourceRefs ?? [["HB", 0]],
      description: featEntry.description ?? "",
      prerequisite: featEntry.prerequisite,
    };
    counts.feats += 1;
  }

  for (const spellEntry of snapshot.spells ?? []) {
    const key = spellEntry?.key;
    if (!key || hasOwnRegistryEntry(registries.SpellsList, key)) {
      continue;
    }
    registries.SpellsList[key] = {
      name: spellEntry.name ?? titleFromKey(key),
      source: spellEntry.sourceRefs ?? [["HB", 0]],
      level: spellEntry.level ?? 0,
      school: spellEntry.school,
      time: spellEntry.castingTime,
      range: spellEntry.range,
      duration: spellEntry.duration,
      ritual: Boolean(spellEntry.ritual),
      concentration: Boolean(spellEntry.concentration),
      classes: spellEntry.classes ?? [],
      description: spellEntry.description ?? "",
      components: "",
    };
    counts.spells += 1;
  }

  for (const equipmentEntry of snapshot.equipment ?? []) {
    const key = equipmentEntry?.key;
    if (!key) {
      continue;
    }
    const targetRegistry =
      equipmentEntry.category === "weapon"
        ? registries.WeaponsList
        : equipmentEntry.category === "armor"
          ? registries.ArmourList
          : equipmentEntry.category === "ammo"
            ? registries.AmmoList
            : equipmentEntry.category === "gear"
              ? registries.GearList
              : registries.MagicItemsList;
    if (hasOwnRegistryEntry(targetRegistry, key)) {
      continue;
    }
    targetRegistry[key] = {
      name: equipmentEntry.name ?? titleFromKey(key),
      source: equipmentEntry.sourceRefs ?? [["HB", 0]],
      description: equipmentEntry.description ?? "",
      type: equipmentEntry.type,
      rarity: equipmentEntry.rarity,
      weight: equipmentEntry.weight,
    };
    counts.equipment += 1;
  }

  return {
    used: true,
    path: snapshotPath,
    counts,
  };
}

function runSources() {
  const sourceFiles = gatherSourceFiles();
  const loadPlan = createLoadPlan(sourceFiles);
  runtimeDiagnostics.loadPlan = {
    orderedFiles: loadPlan.orderedFiles,
    buckets: loadPlan.buckets,
  };
  runtimeDiagnostics.seedInfo = enablePdfCoreSeed
    ? seedFromMpmbPdfSnapshot(mpmbPdfNormalizedPath)
    : {
        used: false,
        path: mpmbPdfNormalizedPath,
        counts: {
          sources: 0,
          classes: 0,
          subclasses: 0,
          species: 0,
          backgrounds: 0,
          feats: 0,
          spells: 0,
          equipment: 0,
        },
      };
  if (typeof String.prototype.capitalize !== "function") {
    Object.defineProperty(String.prototype, "capitalize", {
      value: function capitalize() {
        const text = String(this);
        return text.charAt(0).toUpperCase() + text.slice(1);
      },
      configurable: true,
      writable: true,
    });
  }
  if (typeof Object.prototype.capitalize !== "function") {
    Object.defineProperty(Object.prototype, "capitalize", {
      value: function capitalizeObject() {
        const text = String(this);
        return text.charAt(0).toUpperCase() + text.slice(1);
      },
      configurable: true,
      writable: true,
    });
  }
  vm.runInContext(
    `
const __stringPrototype = "".constructor.prototype;
if (typeof __stringPrototype.capitalize !== "function") {
  Object.defineProperty(__stringPrototype, "capitalize", {
    value: function capitalize() {
      const text = String(this);
      return text.charAt(0).toUpperCase() + text.slice(1);
    },
    configurable: true,
    writable: true
  });
}
if (typeof Object.prototype.capitalize !== "function") {
  Object.defineProperty(Object.prototype, "capitalize", {
    value: function capitalizeObject() {
      const text = String(this);
      return text.charAt(0).toUpperCase() + text.slice(1);
    },
    configurable: true,
    writable: true
  });
}
`,
    vmContext,
  );
  runtimeDiagnostics.stringCapitalizeType = vm.runInContext("typeof ''.capitalize", vmContext);
  for (const relativePath of loadPlan.orderedFiles) {
    const absolutePath = path.join(repoRoot, relativePath);
    const sourceCode = fs.readFileSync(absolutePath, "utf8");
    const beforeUnknown = runtimeDiagnostics.unknownGlobalsByFile.get(relativePath);
    const beforeUnknownCount = beforeUnknown
      ? Array.from(beforeUnknown.values()).reduce((total, count) => total + count, 0)
      : 0;
    const beforeFallback = runtimeDiagnostics.registryFallbacksByFile.get(relativePath);
    const beforeFallbackCount = beforeFallback
      ? Array.from(beforeFallback.values()).reduce((total, count) => total + count, 0)
      : 0;
    const beforeShim = runtimeDiagnostics.shimCallsByFile.get(relativePath);
    const beforeShimCount = beforeShim ? Array.from(beforeShim.values()).reduce((total, count) => total + count, 0) : 0;
    runtimeDiagnostics.currentFile = relativePath;
    try {
      vm.runInContext(sourceCode, vmContext, {
        filename: relativePath,
        timeout: 120000,
        displayErrors: true,
      });
      assimilateDetachedBaseRegistries();
      const afterUnknown = runtimeDiagnostics.unknownGlobalsByFile.get(relativePath);
      const afterUnknownCount = afterUnknown
        ? Array.from(afterUnknown.values()).reduce((total, count) => total + count, 0)
        : 0;
      const afterFallback = runtimeDiagnostics.registryFallbacksByFile.get(relativePath);
      const afterFallbackCount = afterFallback
        ? Array.from(afterFallback.values()).reduce((total, count) => total + count, 0)
        : 0;
      const afterShim = runtimeDiagnostics.shimCallsByFile.get(relativePath);
      const afterShimCount = afterShim ? Array.from(afterShim.values()).reduce((total, count) => total + count, 0) : 0;
      runtimeDiagnostics.fileResults.push({
        file: relativePath,
        status: "ok",
        category: classifySourceFile(relativePath),
        unknownGlobalsCountDelta: Math.max(0, afterUnknownCount - beforeUnknownCount),
        registryFallbackCountDelta: Math.max(0, afterFallbackCount - beforeFallbackCount),
        shimCallCountDelta: Math.max(0, afterShimCount - beforeShimCount),
      });
    } catch (error) {
      const stackLine = typeof error?.stack === "string" ? error.stack.split("\n")[1]?.trim() : "";
      const message = `${relativePath}: ${error.message}${stackLine ? ` (${stackLine})` : ""}`;
      parseErrors.push(message);
      const afterUnknown = runtimeDiagnostics.unknownGlobalsByFile.get(relativePath);
      const afterFallback = runtimeDiagnostics.registryFallbacksByFile.get(relativePath);
      const afterShim = runtimeDiagnostics.shimCallsByFile.get(relativePath);
      runtimeDiagnostics.fileResults.push({
        file: relativePath,
        status: "error",
        category: classifySourceFile(relativePath),
        errorMessage: String(error?.message ?? "unknown error"),
        stackLine,
        unknownGlobalsTop:
          afterUnknown
            ? Array.from(afterUnknown.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, count]) => ({ name, count }))
            : [],
        registryFallbackTop:
          afterFallback
            ? Array.from(afterFallback.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, count]) => ({ name, count }))
            : [],
        shimCallsTop:
          afterShim
            ? Array.from(afterShim.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, count]) => ({ name, count }))
            : [],
      });
    } finally {
      runtimeDiagnostics.currentFile = "";
    }
  }
  return loadPlan.orderedFiles;
}

function normalizeContent(loadedSources) {
  const sources = Object.entries(registries.SourceList)
    .map(([key, value]) => {
      if (!value || typeof value !== "object") {
        return undefined;
      }
      return {
        key,
        name: String(value.name ?? key),
        abbreviation: value.abbreviation ? String(value.abbreviation) : undefined,
        group: value.group ? String(value.group) : undefined,
        date: value.date ? String(value.date) : undefined,
        url: value.url ? String(value.url) : undefined,
        defaultExcluded: Boolean(value.defaultExcluded),
      };
    })
    .filter((entry) => entry !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));

  const classes = Object.entries(registries.ClassList).map(([key, value]) => {
    const classId = buildId("class", key);
    const refs = sourceRefs(value?.source);
    return {
      id: classId,
      key: String(key).toLowerCase(),
      canonicalClassKey: String(key).toLowerCase(),
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, key, "partial"),
      hitDie: numberFromUnknown(value?.die),
      spellcastingFactor: safeClone(value?.spellcastingFactor),
      spellcastingKnown: safeClone(value?.spellcastingKnown),
      features: extractFeatures(value?.features, classId),
    };
  });

  const subclasses = Object.entries(registries.ClassSubList).map(([key, value]) => {
    const classKeyFromMap = subclassClassKeyMap.get(key);
    const inferredClassKey = classKeyFromMap ?? key.split("-")[0];
    const subclassId = buildId("subclass", key);
    const fallbackName = key.split("-").slice(1).join(" ");
    const refs = sourceRefs(value?.source);
    return {
      id: subclassId,
      key: String(key).toLowerCase(),
      classId: buildId("class", inferredClassKey),
      classKey: String(inferredClassKey).toLowerCase(),
      canonicalClassKey: String(inferredClassKey).toLowerCase(),
      name: value?.subname ?? value?.fullname ?? value?.name ?? titleFromKey(fallbackName),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, key, "partial"),
      spellcastingFactor: safeClone(value?.spellcastingFactor),
      spellcastingKnown: safeClone(value?.spellcastingKnown),
      features: extractFeatures(value?.features, subclassId),
    };
  });

  const speciesFromRaceList = Object.entries(registries.RaceList).map(([key, value]) => {
    const refs = sourceRefs(value?.source);
    return {
      id: buildId("species", key),
      key,
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, key, "partial"),
      speed: extractSpeed(value?.speed),
      size: value?.size ? String(value.size) : undefined,
      traits: toText(value?.trait),
      variantOfId: undefined,
    };
  });

  const speciesFromVariants = Object.entries(registries.RaceSubList).map(([key, value]) => {
    const variantBaseKey = raceVariantMap.get(key) ?? value?._variantOf;
    const refs = sourceRefs(value?.source);
    return {
      id: buildId("species", key),
      key,
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, key, "partial"),
      speed: extractSpeed(value?.speed),
      size: value?.size ? String(value.size) : undefined,
      traits: toText(value?.trait),
      variantOfId: variantBaseKey ? buildId("species", variantBaseKey) : undefined,
    };
  });

  const backgrounds = Object.entries(registries.BackgroundList).map(([key, value]) => {
    const featureText =
      typeof value?.feature === "string" ? toText(registries.BackgroundFeatureList[value.feature]?.description) : undefined;
    const refs = sourceRefs(value?.source);
    return {
      id: buildId("background", key),
      key,
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, key, "partial"),
      skillText: toText(value?.skillstxt) ?? (Array.isArray(value?.skills) ? value.skills.join(", ") : undefined),
      toolText: toText(value?.toolProfs) ?? toText(value?.toolstxt),
      equipmentText: toText(value?.equipleft) ?? toText(value?.equipright),
      traitText: featureText ?? toText(value?.trait),
      bonusFeat: Array.isArray(value?.feats) ? value.feats.join(", ") : toText(value?.feats),
    };
  });

  const feats = Object.entries(registries.FeatsList).map(([key, value]) => {
    const refs = sourceRefs(value?.source);
    return {
      id: buildId("feat", key),
      key,
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, key, "partial"),
      description: toText(value?.description) ?? toText(value?.descriptionFull),
      prerequisite: toText(value?.prerequisite),
      structuredData: extractStructuredData(value),
    };
  });

  const spells = Object.entries(registries.SpellsList).map(([key, value]) => {
    const refs = sourceRefs(value?.source);
    return {
      id: buildId("spell", key),
      key,
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, key, "partial"),
      level: numberFromUnknown(value?.level) ?? 0,
      school: toText(value?.school),
      castingTime: toText(value?.time),
      range: toText(value?.range),
      duration: toText(value?.duration),
      concentration: Boolean(value?.concentration) || /conc/i.test(String(value?.duration ?? "")),
      ritual: Boolean(value?.ritual),
      classes: uniqueSortedStrings(extractSpellClasses(value?.classes)),
      description: toText(value?.description) ?? toText(value?.descriptionFull),
    };
  });

  const equipment = [];
  const listSets = [
    ["magic-item", registries.MagicItemsList],
    ["weapon", registries.WeaponsList],
    ["armor", { ...registries.ArmourList, ...registries.ArmorList }],
    ["gear", registries.GearList],
    ["ammo", registries.AmmoList],
  ];
  for (const [category, list] of listSets) {
    for (const [key, value] of Object.entries(list)) {
      const refs = sourceRefs(value?.source);
      equipment.push({
        id: buildId("equipment", `${category}-${key}`),
        key,
        category,
        name: value?.name ?? titleFromKey(key),
        sourceRefs: refs,
        sourceMeta: localSourceMeta(refs, `${category}:${key}`, "partial"),
        type: toText(value?.type),
        weaponList: toText(value?.list),
        damage: safeClone(value?.damage),
        range: toText(value?.range),
        mastery: toText(value?.mastery),
        rarity: toText(value?.rarity),
        weight: value?.weight,
        description: toText(value?.description) ?? toText(value?.descriptionFull),
      });
    }
  }

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFiles: loadedSources,
      parseErrors: parseErrors,
    },
    sources,
    classes: classes.sort((a, b) => a.name.localeCompare(b.name)),
    subclasses: subclasses.sort((a, b) => a.name.localeCompare(b.name)),
    species: [...speciesFromRaceList, ...speciesFromVariants].sort((a, b) => a.name.localeCompare(b.name)),
    backgrounds: backgrounds.sort((a, b) => a.name.localeCompare(b.name)),
    feats: feats.sort((a, b) => a.name.localeCompare(b.name)),
    spells: spells.sort((a, b) => a.name.localeCompare(b.name)),
    equipment: equipment.sort((a, b) => a.name.localeCompare(b.name)),
  };

  return output;
}

function mapToSortedCountEntries(inputMap, limit = Number.POSITIVE_INFINITY) {
  if (!(inputMap instanceof Map)) {
    return [];
  }
  return Array.from(inputMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function mapOfMapsToObject(mapOfMaps, topItemsPerFile = 25) {
  if (!(mapOfMaps instanceof Map)) {
    return {};
  }
  const output = {};
  for (const [file, innerMap] of mapOfMaps.entries()) {
    output[file] = mapToSortedCountEntries(innerMap, topItemsPerFile);
  }
  return output;
}

function parseErrorCategory(errorMessage, expression) {
  const messageLower = String(errorMessage).toLowerCase();
  const expressionLower = String(expression ?? "").toLowerCase();
  if (expressionLower.includes("base_")) {
    return "fehlende Base_* Registry";
  }
  if (expressionLower.includes("magicitemslist") || expressionLower.includes("companionlist") || expressionLower.includes("creaturelist")) {
    return "fehlende Core-Registry";
  }
  if (messageLower.includes("is not defined") || messageLower.includes("not a function")) {
    return "fehlender Helper/Shim";
  }
  if (messageLower.includes("cannot set properties of undefined") || messageLower.includes("cannot read properties of undefined")) {
    return "tieferes Runtime-Verhalten";
  }
  if (messageLower.includes("syntaxerror")) {
    return "sonstiges";
  }
  return "sonstiges";
}

function parseErrorCauseHint(category, expression) {
  if (category === "fehlende Base_* Registry") {
    return "Script greift auf Base_* zu, bevor Basisdaten sichtbar sind.";
  }
  if (category === "fehlende Core-Registry") {
    return "Script erwartet initialisierte Core-Registry-Einträge mit tieferen Feldern.";
  }
  if (category === "fehlender Helper/Shim") {
    return "Script nutzt Runtime-Helfer, der in der Sandbox noch fehlt.";
  }
  if (category === "tieferes Runtime-Verhalten") {
    return `Script nutzt Laufzeitstrukturen, die ohne vollen Sheet-Kontext nicht vollständig vorhanden sind (${expression || "ohne Ausdruck"}).`;
  }
  return "Nicht eindeutig klassifiziert; manuelle Prüfung erforderlich.";
}

function parseErrorEntry(rawMessage) {
  const message = String(rawMessage ?? "");
  const firstSeparator = message.indexOf(": ");
  const file = firstSeparator === -1 ? "unknown-file" : message.slice(0, firstSeparator);
  const remainder = firstSeparator === -1 ? message : message.slice(firstSeparator + 2);
  const expressionStart = remainder.lastIndexOf(" (");
  const expression = expressionStart >= 0 && remainder.endsWith(")") ? remainder.slice(expressionStart + 2, -1) : "";
  const errorText = expressionStart >= 0 ? remainder.slice(0, expressionStart) : remainder;
  const category = parseErrorCategory(errorText, expression);
  return {
    file,
    error: errorText,
    expression,
    category,
    probableCause: parseErrorCauseHint(category, expression),
  };
}

function getRegistryEntryCounts() {
  return {
    SourceList: Object.keys(registries.SourceList).length,
    ClassList: Object.keys(registries.ClassList).length,
    ClassSubList: Object.keys(registries.ClassSubList).length,
    RaceList: Object.keys(registries.RaceList).length,
    RaceSubList: Object.keys(registries.RaceSubList).length,
    BackgroundList: Object.keys(registries.BackgroundList).length,
    BackgroundFeatureList: Object.keys(registries.BackgroundFeatureList).length,
    FeatsList: Object.keys(registries.FeatsList).length,
    SpellsList: Object.keys(registries.SpellsList).length,
    MagicItemsList: Object.keys(registries.MagicItemsList).length,
    WeaponsList: Object.keys(registries.WeaponsList).length,
    ArmourList: Object.keys(registries.ArmourList).length,
    ArmorList: Object.keys(registries.ArmorList).length,
    GearList: Object.keys(registries.GearList).length,
    AmmoList: Object.keys(registries.AmmoList).length,
    CreatureList: Object.keys(registries.CreatureList).length,
    CompanionList: Object.keys(registries.CompanionList).length,
  };
}

function buildRuntimeDiagnosticsArtifact() {
  const parsedErrors = parseErrors.map((entry) => parseErrorEntry(entry));
  return {
    generatedAt: new Date().toISOString(),
    stringCapitalizeType: runtimeDiagnostics.stringCapitalizeType,
    parseErrorCount: parsedErrors.length,
    parseErrors: parsedErrors,
    loadPlan: runtimeDiagnostics.loadPlan,
    seedInfo: runtimeDiagnostics.seedInfo,
    registryEntryCounts: getRegistryEntryCounts(),
    fileResults: runtimeDiagnostics.fileResults,
    unknownGlobalsTop: mapToSortedCountEntries(runtimeDiagnostics.unknownGlobals, 100),
    unknownGlobalsByFile: mapOfMapsToObject(runtimeDiagnostics.unknownGlobalsByFile),
    shimCallsTop: mapToSortedCountEntries(runtimeDiagnostics.shimCalls, 100),
    shimCallsByFile: mapOfMapsToObject(runtimeDiagnostics.shimCallsByFile),
    registryFallbacksByFile: mapOfMapsToObject(runtimeDiagnostics.registryFallbacksByFile),
    partiallyProcessedFiles: runtimeDiagnostics.fileResults.filter((entry) => entry.status !== "ok").map((entry) => entry.file),
  };
}

function buildRuntimeSummary(localContent, mergedContent, diagnosticsArtifact) {
  const partialFileCount = diagnosticsArtifact.partiallyProcessedFiles.length;
  return {
    generatedAt: diagnosticsArtifact.generatedAt,
    local: {
      classes: localContent.classes.length,
      subclasses: localContent.subclasses.length,
      species: localContent.species.length,
      backgrounds: localContent.backgrounds.length,
      feats: localContent.feats.length,
      spells: localContent.spells.length,
      equipment: localContent.equipment.length,
      parseErrors: diagnosticsArtifact.parseErrorCount,
      partialFiles: partialFileCount,
    },
    merged: {
      classes: mergedContent.classes.length,
      subclasses: mergedContent.subclasses.length,
      species: mergedContent.species.length,
      backgrounds: mergedContent.backgrounds.length,
      feats: mergedContent.feats.length,
      spells: mergedContent.spells.length,
      equipment: mergedContent.equipment.length,
      parseErrors: mergedContent.meta.parseErrors.length,
    },
    loadPlanBuckets: runtimeDiagnostics.loadPlan?.buckets ?? {},
  };
}

function evaluateRegressionThresholds(summary) {
  const checks = [
    {
      key: "maxParseErrors",
      actual: summary.local.parseErrors,
      expected: `<= ${regressionBaselineThresholds.maxParseErrors}`,
      pass: summary.local.parseErrors <= regressionBaselineThresholds.maxParseErrors,
    },
    {
      key: "minClasses",
      actual: summary.local.classes,
      expected: `>= ${regressionBaselineThresholds.minClasses}`,
      pass: summary.local.classes >= regressionBaselineThresholds.minClasses,
    },
    {
      key: "minSubclasses",
      actual: summary.local.subclasses,
      expected: `>= ${regressionBaselineThresholds.minSubclasses}`,
      pass: summary.local.subclasses >= regressionBaselineThresholds.minSubclasses,
    },
    {
      key: "minSpecies",
      actual: summary.local.species,
      expected: `>= ${regressionBaselineThresholds.minSpecies}`,
      pass: summary.local.species >= regressionBaselineThresholds.minSpecies,
    },
    {
      key: "minBackgrounds",
      actual: summary.local.backgrounds,
      expected: `>= ${regressionBaselineThresholds.minBackgrounds}`,
      pass: summary.local.backgrounds >= regressionBaselineThresholds.minBackgrounds,
    },
    {
      key: "minFeats",
      actual: summary.local.feats,
      expected: `>= ${regressionBaselineThresholds.minFeats}`,
      pass: summary.local.feats >= regressionBaselineThresholds.minFeats,
    },
    {
      key: "minSpells",
      actual: summary.local.spells,
      expected: `>= ${regressionBaselineThresholds.minSpells}`,
      pass: summary.local.spells >= regressionBaselineThresholds.minSpells,
    },
    {
      key: "minEquipment",
      actual: summary.local.equipment,
      expected: `>= ${regressionBaselineThresholds.minEquipment}`,
      pass: summary.local.equipment >= regressionBaselineThresholds.minEquipment,
    },
  ];
  const failures = checks.filter((check) => !check.pass);
  return {
    checks,
    failures,
  };
}

function writeDiagnosticsArtifacts(diagnosticsArtifact, summary, regression) {
  fs.mkdirSync(localDiagnosticsDir, { recursive: true });
  fs.writeFileSync(localDiagnosticsLatestPath, JSON.stringify(diagnosticsArtifact, null, 2), "utf8");
  fs.writeFileSync(
    localDiagnosticsLatestSummaryPath,
    JSON.stringify(
      {
        ...summary,
        regression,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function main() {
  const loadedSources = runSources();
  const localContent = normalizeContent(loadedSources);
  fs.mkdirSync(path.dirname(localOutputPath), { recursive: true });
  fs.writeFileSync(localOutputPath, JSON.stringify(localContent, null, 2), "utf8");

  let mergedContent = localContent;
  const additiveSources = [
    ["mpmb-upstream-2014", mpmbUpstream2014NormalizedPath],
    ["mpmb-upstream-2024", mpmbUpstream2024NormalizedPath],
    ["open5e", open5eNormalizedPath],
    ["mpmb-pdf", mpmbPdfNormalizedPath],
  ];
  for (const [label, additivePath] of additiveSources) {
    if (!fs.existsSync(additivePath)) {
      continue;
    }
    try {
      const raw = fs.readFileSync(additivePath, "utf8");
      const additiveContent = JSON.parse(raw);
      mergedContent = mergeSnapshots(mergedContent, additiveContent);
    } catch (error) {
      parseErrors.push(`${label} merge read failed: ${error.message}`);
    }
  }
  fs.writeFileSync(mergedOutputPath, JSON.stringify(mergedContent, null, 2), "utf8");
  const diagnosticsArtifact = buildRuntimeDiagnosticsArtifact();
  const summary = buildRuntimeSummary(localContent, mergedContent, diagnosticsArtifact);
  const regression = evaluateRegressionThresholds(summary);
  writeDiagnosticsArtifacts(diagnosticsArtifact, summary, regression);

  const counts = summary;
  // eslint-disable-next-line no-console
  console.log("Generated src/services/data/generated/mpmb-local-content.json + mpmb-content.json", counts);
  if (regression.failures.length > 0) {
    const failureLines = regression.failures.map((entry) => `- ${entry.key}: actual ${entry.actual}, expected ${entry.expected}`);
    throw new Error(`MPMB runtime regression thresholds failed:\n${failureLines.join("\n")}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createLoadPlan,
  classifySourceFile,
  parseErrorEntry,
  evaluateRegressionThresholds,
  buildRuntimeSummary,
  runSources,
  normalizeContent,
  main,
};
