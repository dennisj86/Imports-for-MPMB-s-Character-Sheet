const fs = require("fs");
const path = require("path");
const vm = require("vm");

function toSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildId(prefix, rawKey) {
  return `${prefix}:${toSlug(rawKey)}`;
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

function remapSourceRefsForPdf(rawSourceRefs, sourceKeyMap) {
  return rawSourceRefs
    .map((ref) => {
      const text = String(ref);
      const [sourceKey, ...rest] = text.split(":");
      const mapped = sourceKeyMap.get(sourceKey) ?? `mpmbpdf-${toSlug(sourceKey)}`;
      if (rest.length === 0) {
        return mapped;
      }
      return `${mapped}:${rest.join(":")}`;
    })
    .filter(Boolean);
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

function inferEdition(sourceRefEntries) {
  const joined = sourceRefEntries.join(" ").toLowerCase();
  if (joined.includes("2024")) {
    return "2024";
  }
  return "unknown";
}

function localSourceMeta(sourceRefEntries, rawSourceRef, status) {
  return {
    sourceSystem: "mpmb",
    sourceDocumentKey: sourceRefEntries[0] ? String(sourceRefEntries[0]).split(":")[0] : "mpmb-pdf",
    sourceDocumentName: "DnD.pdf",
    edition: inferEdition(sourceRefEntries),
    importPreset: "mpmb-pdf",
    rawSourceRef,
    dataStatus: status,
  };
}

function cloneForNewObj(value) {
  const clone = safeClone(value);
  if (clone && typeof clone === "object") {
    return clone;
  }
  return { features: {} };
}

function createCaptureRuntime() {
  const registries = {
    SourceList: {},
    ClassList: {},
    ClassSubList: {},
    RaceList: {},
    RaceSubList: {},
    BackgroundList: {},
    BackgroundFeatureList: {},
    FeatsList: {},
    SpellsList: {},
    MagicItemsList: {},
    WeaponsList: {},
    ArmourList: {},
    ArmorList: {},
    GearList: {},
    AmmoList: {},
  };

  const subclassClassKeyMap = new Map();
  const raceVariantMap = new Map();

  function AddSubClass(classKey, subKey, definition) {
    const cKey = String(classKey).toLowerCase();
    const sKey = String(subKey).toLowerCase();
    const listKey = `${cKey}-${sKey}`;
    registries.ClassSubList[listKey] = definition ?? {};
    subclassClassKeyMap.set(listKey, cKey);
    return listKey;
  }

  function AddRacialVariant(raceKey, variantKey, definition) {
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

  function AddFeatureChoice(target, _isField, choiceName, choiceDefinition) {
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

  function desc(value) {
    if (Array.isArray(value)) {
      return value.join("\n");
    }
    return String(value ?? "");
  }

  const sandboxTarget = {
    ...registries,
    sheetVersion: 14000006,
    levels: Array.from({ length: 20 }, (_, index) => index + 1),
    typePF: false,
    desc,
    toUni: (value) => String(value),
    newObj: cloneForNewObj,
    isArray: Array.isArray,
    RequiredSheetVersion: () => undefined,
    AddSubClass,
    AddRacialVariant,
    AddFeatureChoice,
    What: () => "",
    How: () => 0,
    Who: () => "",
    SetStringifieds: () => undefined,
    processAddWeapons: () => undefined,
    processAddArmour: () => undefined,
    processAddMagicItems: () => undefined,
    processAddCompanions: () => undefined,
    processAddBackgrounds: () => undefined,
    processAddFeats: () => undefined,
    processAddSpells: () => undefined,
    ClassFeatureOptions: () => undefined,
    AddString: () => undefined,
    AddToModFld: () => undefined,
    RemoveString: () => undefined,
    RemoveSpell: () => undefined,
    AddSpell: () => undefined,
    SetProf: () => undefined,
    eval_ish: () => undefined,
    CurrentSpells: {},
    CurrentRace: {},
    CurrentClasses: {},
    CurrentFeats: {},
    CurrentBackground: {},
    CurrentArmour: {},
    CurrentWeapons: {},
    CurrentMagicItems: {},
    CurrentSources: { weapExcl: [], ammoExcl: [] },
    app: {
      viewerType: "capture",
      viewerVersion: 999,
      execDialog: () => "cancel",
      alert: () => undefined,
      addToolButton: () => undefined,
      removeToolButton: () => undefined,
      beginPriv: () => undefined,
      endPriv: () => undefined,
      trustedFunction: (fn) => fn,
    },
    event: {},
    console: {
      println: () => undefined,
      show: () => undefined,
      hide: () => undefined,
    },
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Date,
    JSON,
    RegExp,
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
      return noop;
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });

  return {
    registries,
    sandbox,
    sandboxTarget,
    subclassClassKeyMap,
    raceVariantMap,
  };
}

function shouldExecuteSection(sectionHeader) {
  return /^Name Dictionary \"(Lists[^\"]+|AbilityScores|ClassSelection|FunctionsImport|FunctionsResources|FunctionsSpells|DomParser)\"$/.test(
    sectionHeader,
  );
}

function executeSections(sections) {
  const runtime = createCaptureRuntime();
  const executionLog = [];
  for (const section of sections) {
    if (!shouldExecuteSection(section.header)) {
      continue;
    }
    try {
      vm.runInNewContext(section.content, runtime.sandbox, {
        filename: section.header,
        timeout: 120000,
      });
      executionLog.push({
        order: section.order,
        header: section.header,
        status: "ok",
      });
    } catch (error) {
      executionLog.push({
        order: section.order,
        header: section.header,
        status: "error",
        message: error.message,
      });
    }
  }
  return {
    ...runtime,
    executionLog,
  };
}

function pickRegistry(registries, sandboxTarget, primaryName, baseName) {
  const primary = registries[primaryName] || {};
  if (Object.keys(primary).length > 0) {
    return primary;
  }
  const base = sandboxTarget[baseName] || {};
  if (Object.keys(base).length > 0) {
    return base;
  }
  return {};
}

function normalizeCapturedRegistries(runtime, sourceFiles) {
  const { registries, sandboxTarget, subclassClassKeyMap, raceVariantMap } = runtime;
  const classList = pickRegistry(registries, sandboxTarget, "ClassList", "Base_ClassList");
  const classSubList = pickRegistry(registries, sandboxTarget, "ClassSubList", "Base_ClassSubList");
  const raceList = pickRegistry(registries, sandboxTarget, "RaceList", "Base_RaceList");
  const raceSubList = pickRegistry(registries, sandboxTarget, "RaceSubList", "Base_RaceSubList");
  const backgroundList = pickRegistry(registries, sandboxTarget, "BackgroundList", "Base_BackgroundList");
  const backgroundFeatureList = pickRegistry(registries, sandboxTarget, "BackgroundFeatureList", "Base_BackgroundFeatureList");
  const featsList = pickRegistry(registries, sandboxTarget, "FeatsList", "Base_FeatsList");
  const spellsList = pickRegistry(registries, sandboxTarget, "SpellsList", "Base_SpellsList");
  const magicItemsList = pickRegistry(registries, sandboxTarget, "MagicItemsList", "Base_MagicItemsList");
  const weaponsList = pickRegistry(registries, sandboxTarget, "WeaponsList", "Base_WeaponsList");
  const armourList = pickRegistry(registries, sandboxTarget, "ArmourList", "Base_ArmourList");
  const armorList = pickRegistry(registries, sandboxTarget, "ArmorList", "Base_ArmorList");
  const gearList = pickRegistry(registries, sandboxTarget, "GearList", "Base_GearList");
  const ammoList = pickRegistry(registries, sandboxTarget, "AmmoList", "Base_AmmoList");
  const sourceList = pickRegistry(registries, sandboxTarget, "SourceList", "Base_SourceList");

  const sourceKeyMap = new Map();
  const sources = Object.entries(sourceList)
    .map(([key, value]) => {
      if (!value || typeof value !== "object") {
        return undefined;
      }
      const mappedKey = `mpmbpdf-${toSlug(key)}`;
      sourceKeyMap.set(key, mappedKey);
      return {
        key: mappedKey,
        name: String(value.name ?? key),
        abbreviation: value.abbreviation ? String(value.abbreviation) : undefined,
        group: value.group ? `MPMB PDF ${String(value.group)}` : "MPMB PDF Core",
        date: value.date ? String(value.date) : undefined,
        url: value.url ? String(value.url) : undefined,
        defaultExcluded: Boolean(value.defaultExcluded),
      };
    })
    .filter((entry) => entry !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));

  const classes = Object.entries(classList).map(([key, value]) => {
    const classId = buildId("class", key);
    const refs = remapSourceRefsForPdf(sourceRefs(value?.source), sourceKeyMap);
    return {
      id: classId,
      key: String(key).toLowerCase(),
      canonicalClassKey: String(key).toLowerCase(),
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, `ClassList:${key}`, "partial"),
      hitDie: numberFromUnknown(value?.die),
      spellcastingFactor: safeClone(value?.spellcastingFactor),
      spellcastingKnown: safeClone(value?.spellcastingKnown),
      features: extractFeatures(value?.features, classId),
    };
  });

  const subclasses = Object.entries(classSubList).map(([key, value]) => {
    const classKeyFromMap = subclassClassKeyMap.get(key);
    const inferredClassKey = classKeyFromMap ?? key.split("-")[0];
    const subclassId = buildId("subclass", key);
    const fallbackName = key.split("-").slice(1).join(" ");
    const refs = remapSourceRefsForPdf(sourceRefs(value?.source), sourceKeyMap);
    return {
      id: subclassId,
      key: String(key).toLowerCase(),
      classId: buildId("class", inferredClassKey),
      classKey: String(inferredClassKey).toLowerCase(),
      canonicalClassKey: String(inferredClassKey).toLowerCase(),
      name: value?.subname ?? value?.fullname ?? value?.name ?? titleFromKey(fallbackName),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, `ClassSubList:${key}`, "partial"),
      spellcastingFactor: safeClone(value?.spellcastingFactor),
      spellcastingKnown: safeClone(value?.spellcastingKnown),
      features: extractFeatures(value?.features, subclassId),
    };
  });

  const speciesFromRaceList = Object.entries(raceList).map(([key, value]) => {
    const refs = remapSourceRefsForPdf(sourceRefs(value?.source), sourceKeyMap);
    return {
      id: buildId("species", key),
      key,
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, `RaceList:${key}`, "partial"),
      speed: extractSpeed(value?.speed),
      size: value?.size ? String(value.size) : undefined,
      traits: toText(value?.trait),
      variantOfId: undefined,
    };
  });

  const speciesFromVariants = Object.entries(raceSubList).map(([key, value]) => {
    const variantBaseKey = raceVariantMap.get(key) ?? value?._variantOf;
    const refs = remapSourceRefsForPdf(sourceRefs(value?.source), sourceKeyMap);
    return {
      id: buildId("species", key),
      key,
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, `RaceSubList:${key}`, "partial"),
      speed: extractSpeed(value?.speed),
      size: value?.size ? String(value.size) : undefined,
      traits: toText(value?.trait),
      variantOfId: variantBaseKey ? buildId("species", variantBaseKey) : undefined,
    };
  });

  const backgrounds = Object.entries(backgroundList).map(([key, value]) => {
    const featureText =
      typeof value?.feature === "string" ? toText(backgroundFeatureList[value.feature]?.description) : undefined;
    const refs = remapSourceRefsForPdf(sourceRefs(value?.source), sourceKeyMap);
    return {
      id: buildId("background", key),
      key,
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, `BackgroundList:${key}`, "partial"),
      skillText: toText(value?.skillstxt) ?? (Array.isArray(value?.skills) ? value.skills.join(", ") : undefined),
      toolText: toText(value?.toolProfs) ?? toText(value?.toolstxt),
      equipmentText: toText(value?.equipleft) ?? toText(value?.equipright),
      traitText: featureText ?? toText(value?.trait),
      bonusFeat: Array.isArray(value?.feats) ? value.feats.join(", ") : toText(value?.feats),
    };
  });

  const feats = Object.entries(featsList).map(([key, value]) => {
    const refs = remapSourceRefsForPdf(sourceRefs(value?.source), sourceKeyMap);
    return {
      id: buildId("feat", key),
      key,
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, `FeatsList:${key}`, "partial"),
      description: toText(value?.description) ?? toText(value?.descriptionFull),
      prerequisite: toText(value?.prerequisite),
    };
  });

  const spells = Object.entries(spellsList).map(([key, value]) => {
    const refs = remapSourceRefsForPdf(sourceRefs(value?.source), sourceKeyMap);
    return {
      id: buildId("spell", key),
      key,
      name: value?.name ?? titleFromKey(key),
      sourceRefs: refs,
      sourceMeta: localSourceMeta(refs, `SpellsList:${key}`, "partial"),
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
    ["magic-item", magicItemsList],
    ["weapon", weaponsList],
    ["armor", { ...armourList, ...armorList }],
    ["gear", gearList],
    ["ammo", ammoList],
  ];
  for (const [category, list] of listSets) {
    for (const [key, value] of Object.entries(list)) {
      const refs = remapSourceRefsForPdf(sourceRefs(value?.source), sourceKeyMap);
      equipment.push({
        id: buildId("equipment", `${category}-${key}`),
        key,
        category,
        name: value?.name ?? titleFromKey(key),
        sourceRefs: refs,
        sourceMeta: localSourceMeta(refs, `${category}:${key}`, "partial"),
        type: toText(value?.type),
        rarity: toText(value?.rarity),
        weight: value?.weight,
        description: toText(value?.description) ?? toText(value?.descriptionFull),
      });
    }
  }

  const snapshot = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFiles,
      parseErrors: runtime.executionLog.filter((entry) => entry.status === "error").map((entry) => `${entry.header}: ${entry.message}`),
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

  const capturedRegistryCounts = {
    ClassList: Object.keys(classList).length,
    ClassSubList: Object.keys(classSubList).length,
    RaceList: Object.keys(raceList).length,
    RaceSubList: Object.keys(raceSubList).length,
    BackgroundList: Object.keys(backgroundList).length,
    BackgroundFeatureList: Object.keys(backgroundFeatureList).length,
    FeatsList: Object.keys(featsList).length,
    SpellsList: Object.keys(spellsList).length,
    MagicItemsList: Object.keys(magicItemsList).length,
    WeaponsList: Object.keys(weaponsList).length,
    ArmourList: Object.keys(armourList).length + Object.keys(armorList).length,
    GearList: Object.keys(gearList).length,
    AmmoList: Object.keys(ammoList).length,
    SourceList: Object.keys(sourceList).length,
  };

  return {
    snapshot,
    capturedRegistryCounts,
  };
}

function readSectionsFromRawManifest(repoRoot, rawManifest) {
  const sections = [];
  for (const entry of rawManifest.scriptEntries) {
    const absolutePath = path.join(repoRoot, entry.relativePath);
    const content = fs.readFileSync(absolutePath, "utf8");
    sections.push({
      order: entry.order,
      header: entry.header,
      content,
    });
  }
  return sections;
}

module.exports = {
  executeSections,
  normalizeCapturedRegistries,
  readSectionsFromRawManifest,
};
