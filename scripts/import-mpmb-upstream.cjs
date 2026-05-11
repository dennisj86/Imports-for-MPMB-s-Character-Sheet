const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { executeSections, normalizeCapturedRegistries } = require("./mpmb-pdf/capture-normalize.cjs");

const repoRoot = path.resolve(__dirname, "..");

const defaultUpstreamPath2014 = path.join(repoRoot, "docs", "Sheet skripte");
const defaultUpstreamPath2024 = path.join(repoRoot, "docs", "Sheet skripte 2024");

const presetConfigs = {
  "mpmb-upstream-2014": {
    edition: "2014",
    importPreset: "mpmb-upstream-2014",
    sourceKeyPrefix: "mpmbup14",
    sourceGroupPrefix: "MPMB Upstream 2014 ",
    defaultSourceGroup: "MPMB Upstream 2014 Core",
    upstreamRoot: process.env.MPMB_UPSTREAM_2014_PATH || defaultUpstreamPath2014,
  },
  "mpmb-upstream-2024": {
    edition: "2024",
    importPreset: "mpmb-upstream-2024",
    sourceKeyPrefix: "mpmbup24",
    sourceGroupPrefix: "MPMB Upstream 2024 ",
    defaultSourceGroup: "MPMB Upstream 2024 Core",
    upstreamRoot: process.env.MPMB_UPSTREAM_2024_PATH || defaultUpstreamPath2024,
  },
};

const coreVariableFiles = [
  "Lists.js",
  "ListsSources.js",
  "ListsClasses.js",
  "ListsRaces.js",
  "ListsBackgrounds.js",
  "ListsFeats.js",
  "ListsSpells.js",
  "ListsGear.js",
  "ListsMagicItems.js",
];

function parseTargetArg(argv) {
  const explicitTarget = argv
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("--target="))
    ?.split("=")[1];
  const positional = argv.find((entry) => !entry.startsWith("--"));
  const target = (explicitTarget || positional || "all").trim().toLowerCase();
  if (!["2014", "2024", "all"].includes(target)) {
    throw new Error(`Unsupported target: ${target}`);
  }
  return target;
}

function normalizeRunToken(isoTimestamp) {
  return isoTimestamp.replace(/[:.]/g, "-");
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256ForContent(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function toSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function entryPriorityScore(entry) {
  const sourceSystem = entry?.sourceMeta?.sourceSystem ?? "mpmb";
  const importPreset = entry?.sourceMeta?.importPreset ?? "";
  const sourceDocumentKey = entry?.sourceMeta?.sourceDocumentKey ?? entry?.sourceRefs?.[0] ?? "";
  let score = sourceSystem === "mpmb" ? 100 : 70;
  if (importPreset === "mpmb-upstream-2024" || importPreset === "mpmb-upstream-2014") {
    score += 40;
  } else if (importPreset === "mpmb-local") {
    score += 20;
  } else if (importPreset === "mpmb-pdf") {
    score += 5;
  }
  if (sourceDocumentKey.startsWith("srd-")) {
    score += 5;
  }
  return score;
}

function mergeByIdentity(baseEntries, importedEntries, identityFn) {
  const byIdentity = new Map();
  for (const entry of [...baseEntries, ...importedEntries]) {
    const identity = identityFn(entry);
    const existing = byIdentity.get(identity);
    if (!existing || entryPriorityScore(entry) > entryPriorityScore(existing)) {
      byIdentity.set(identity, entry);
    }
  }
  return Array.from(byIdentity.values());
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
      sourceFiles: [...(base.meta?.sourceFiles ?? []), ...(imported.meta?.sourceFiles ?? [])],
      parseErrors: [...(base.meta?.parseErrors ?? []), ...(imported.meta?.parseErrors ?? [])],
    },
    sources: mergeSources(base.sources ?? [], imported.sources ?? []),
    classes: mergeByIdentity(base.classes ?? [], imported.classes ?? [], classIdentity).sort((a, b) => a.name.localeCompare(b.name)),
    subclasses: mergeByIdentity(base.subclasses ?? [], imported.subclasses ?? [], subclassIdentity).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    species: mergeByIdentity(base.species ?? [], imported.species ?? [], genericIdentity).sort((a, b) => a.name.localeCompare(b.name)),
    backgrounds: mergeByIdentity(base.backgrounds ?? [], imported.backgrounds ?? [], genericIdentity).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    feats: mergeByIdentity(base.feats ?? [], imported.feats ?? [], genericIdentity).sort((a, b) => a.name.localeCompare(b.name)),
    spells: mergeByIdentity(base.spells ?? [], imported.spells ?? [], genericIdentity).sort((a, b) => a.name.localeCompare(b.name)),
    equipment: mergeByIdentity(base.equipment ?? [], imported.equipment ?? [], genericIdentity).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function createEmptySnapshot() {
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

function triggerMergedSnapshotRefresh() {
  const result = spawnSync("node", ["scripts/generate-mpmb-data.cjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to refresh merged snapshot.\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function collectUpstreamFiles(config) {
  const variableDir = path.join(config.upstreamRoot, "_variables");
  const fileEntries = coreVariableFiles.map((fileName, index) => {
    const absolutePath = path.join(variableDir, fileName);
    return {
      order: index + 1,
      fileName,
      relativeUpstreamPath: path.join("_variables", fileName).replace(/\\/g, "/"),
      absolutePath,
      exists: fs.existsSync(absolutePath),
    };
  });
  const missingFiles = fileEntries.filter((entry) => !entry.exists).map((entry) => entry.fileName);
  return {
    variableDir,
    fileEntries,
    missingFiles,
  };
}

function createSectionsFromUpstreamFiles(fileEntries) {
  return fileEntries.map((entry) => ({
    order: entry.order,
    header: `Name Dictionary "${entry.fileName.replace(/\.js$/i, "")}"`,
    content: fs.readFileSync(entry.absolutePath, "utf8"),
  }));
}

function computeCounts(snapshot) {
  return {
    sources: snapshot.sources.length,
    classes: snapshot.classes.length,
    subclasses: snapshot.subclasses.length,
    species: snapshot.species.length,
    backgrounds: snapshot.backgrounds.length,
    feats: snapshot.feats.length,
    spells: snapshot.spells.length,
    equipment: snapshot.equipment.length,
  };
}

function buildLegacyMpmbBaseline() {
  const localPath = path.join(repoRoot, "src", "services", "data", "generated", "mpmb-local-content.json");
  const pdfPath = path.join(repoRoot, "data", "imports", "mpmb-pdf", "normalized", "latest-mpmb-pdf-content.json");

  const local = readJson(localPath) ?? createEmptySnapshot();
  const pdf = readJson(pdfPath);
  if (!pdf) {
    return local;
  }
  return mergeSnapshots(local, pdf);
}

function identityForType(type) {
  if (type === "classes") {
    return (entry) => `${entry.canonicalClassKey ?? toSlug(entry.key || entry.name)}::${inferEdition(entry)}`;
  }
  if (type === "subclasses") {
    return (entry) =>
      `${toSlug(entry.key)}::${entry.canonicalClassKey ?? toSlug(entry.classKey || entry.name)}::${inferEdition(entry)}`;
  }
  return (entry) => `${toSlug(entry.key)}::${inferEdition(entry)}`;
}

function qualityMetrics(snapshot) {
  return {
    classesWithFeatures: snapshot.classes.filter((entry) => Array.isArray(entry.features) && entry.features.length > 0).length,
    subclassesWithFeatures: snapshot.subclasses.filter((entry) => Array.isArray(entry.features) && entry.features.length > 0).length,
    speciesWithTraits: snapshot.species.filter((entry) => Boolean(entry.traits)).length,
    backgroundsWithTrait: snapshot.backgrounds.filter((entry) => Boolean(entry.traitText)).length,
    featsWithDescription: snapshot.feats.filter((entry) => Boolean(entry.description)).length,
    spellsWithDescription: snapshot.spells.filter((entry) => Boolean(entry.description)).length,
    equipmentWithDescription: snapshot.equipment.filter((entry) => Boolean(entry.description)).length,
  };
}

function diffType(baseSnapshot, candidateSnapshot, type) {
  const identity = identityForType(type);
  const baseEntries = baseSnapshot[type] ?? [];
  const candidateEntries = candidateSnapshot[type] ?? [];
  const baseByIdentity = new Map(baseEntries.map((entry) => [identity(entry), entry]));
  const candidateByIdentity = new Map(candidateEntries.map((entry) => [identity(entry), entry]));

  const added = [];
  const missing = [];
  const changed = [];

  for (const [id, entry] of candidateByIdentity.entries()) {
    if (!baseByIdentity.has(id)) {
      added.push({ id, key: entry.key, name: entry.name });
      continue;
    }
    const before = baseByIdentity.get(id);
    if (JSON.stringify(before) !== JSON.stringify(entry)) {
      changed.push({ id, baseName: before?.name, candidateName: entry.name });
    }
  }

  for (const [id, entry] of baseByIdentity.entries()) {
    if (!candidateByIdentity.has(id)) {
      missing.push({ id, key: entry.key, name: entry.name });
    }
  }

  return {
    baseCount: baseEntries.length,
    candidateCount: candidateEntries.length,
    delta: candidateEntries.length - baseEntries.length,
    addedCount: added.length,
    missingCount: missing.length,
    changedCount: changed.length,
    addedSample: added.slice(0, 30),
    missingSample: missing.slice(0, 30),
    changedSample: changed.slice(0, 30),
  };
}

function buildComparisonReport({ config, baselineSnapshot, candidateSnapshot, importTimestamp, warnings }) {
  const types = ["classes", "subclasses", "species", "backgrounds", "feats", "spells", "equipment"];
  const entityTypes = {};
  for (const type of types) {
    entityTypes[type] = diffType(baselineSnapshot, candidateSnapshot, type);
  }

  const baselineQuality = qualityMetrics(baselineSnapshot);
  const candidateQuality = qualityMetrics(candidateSnapshot);
  const qualityDelta = {};
  for (const key of Object.keys(candidateQuality)) {
    qualityDelta[key] = candidateQuality[key] - baselineQuality[key];
  }

  return {
    generatedAt: importTimestamp,
    importPreset: config.importPreset,
    baselineLabel: "mpmb-local + mpmb-pdf",
    candidateLabel: config.importPreset,
    counts: {
      baseline: computeCounts(baselineSnapshot),
      candidate: computeCounts(candidateSnapshot),
    },
    entityTypes,
    quality: {
      baseline: baselineQuality,
      candidate: candidateQuality,
      delta: qualityDelta,
    },
    warnings,
  };
}

function runUpstreamImport(config, options = {}) {
  const refreshMergedSnapshot = options.refreshMergedSnapshot ?? true;
  const importTimestamp = new Date().toISOString();
  const runToken = normalizeRunToken(importTimestamp);

  if (!fs.existsSync(config.upstreamRoot)) {
    throw new Error(`Upstream repository path not found: ${config.upstreamRoot}`);
  }

  const { variableDir, fileEntries, missingFiles } = collectUpstreamFiles(config);
  if (missingFiles.length > 0) {
    throw new Error(`Missing required upstream core files in ${variableDir}: ${missingFiles.join(", ")}`);
  }

  const baseDir = path.join(repoRoot, "data", "imports", config.importPreset);
  const rawScriptsRunDir = path.join(baseDir, "raw", "scripts", runToken);
  const rawManifestsDir = path.join(baseDir, "raw", "manifests");
  const normalizedDir = path.join(baseDir, "normalized");
  const manifestsDir = path.join(baseDir, "manifests");
  ensureDirectory(rawScriptsRunDir);
  ensureDirectory(rawManifestsDir);
  ensureDirectory(normalizedDir);
  ensureDirectory(manifestsDir);

  const copiedFileEntries = [];
  for (const fileEntry of fileEntries) {
    const content = fs.readFileSync(fileEntry.absolutePath, "utf8");
    const fileToken = `${String(fileEntry.order).padStart(4, "0")}-${fileEntry.fileName}`;
    const copiedAbsolutePath = path.join(rawScriptsRunDir, fileToken);
    fs.writeFileSync(copiedAbsolutePath, content, "utf8");
    copiedFileEntries.push({
      ...fileEntry,
      copiedRelativePath: path.relative(repoRoot, copiedAbsolutePath).replace(/\\/g, "/"),
      lineCount: content.split(/\r?\n/).length,
      sha256: sha256ForContent(content),
    });
  }

  const rawManifest = {
    importTimestamp,
    importPreset: config.importPreset,
    edition: config.edition,
    upstreamRoot: config.upstreamRoot,
    variableDir,
    files: copiedFileEntries.map((entry) => ({
      order: entry.order,
      fileName: entry.fileName,
      relativeUpstreamPath: entry.relativeUpstreamPath,
      copiedRelativePath: entry.copiedRelativePath,
      lineCount: entry.lineCount,
      sha256: entry.sha256,
    })),
  };
  const rawManifestFileName = `${config.importPreset}-raw-${runToken}.json`;
  writeJson(path.join(rawManifestsDir, rawManifestFileName), rawManifest);
  writeJson(path.join(rawManifestsDir, "latest-raw-manifest.json"), rawManifest);

  const sections = createSectionsFromUpstreamFiles(copiedFileEntries);
  const runtime = executeSections(sections);
  const executionErrors = runtime.executionLog.filter((entry) => entry.status === "error");
  const warnings = [
    ...executionErrors.map((entry) => `${entry.header}: ${entry.message}`),
    ...missingFiles.map((entry) => `Missing expected core file: ${entry}`),
  ];

  const sourceFiles = copiedFileEntries.map((entry) => `upstream:${config.edition}:${entry.relativeUpstreamPath}`);
  const { snapshot, capturedRegistryCounts } = normalizeCapturedRegistries(runtime, sourceFiles, {
    sourceSystem: "mpmb",
    sourceKeyPrefix: config.sourceKeyPrefix,
    sourceGroupPrefix: config.sourceGroupPrefix,
    defaultSourceGroup: config.defaultSourceGroup,
    sourceDocumentName: path.basename(config.upstreamRoot),
    importPreset: config.importPreset,
    forcedEdition: config.edition,
  });

  const normalizedFileName = `${config.importPreset}-normalized-${runToken}.json`;
  writeJson(path.join(normalizedDir, normalizedFileName), snapshot);
  writeJson(path.join(normalizedDir, `latest-${config.importPreset}-content.json`), snapshot);

  const baselineSnapshot = buildLegacyMpmbBaseline();
  const comparisonReport = buildComparisonReport({
    config,
    baselineSnapshot,
    candidateSnapshot: snapshot,
    importTimestamp,
    warnings,
  });
  const comparisonFileName = `${config.importPreset}-comparison-${runToken}.json`;
  writeJson(path.join(manifestsDir, comparisonFileName), comparisonReport);
  writeJson(path.join(manifestsDir, "comparison-report.json"), comparisonReport);

  const manifest = {
    importTimestamp,
    importPreset: config.importPreset,
    edition: config.edition,
    upstreamRoot: config.upstreamRoot,
    rawManifestPath: path.join("data", "imports", config.importPreset, "raw", "manifests", rawManifestFileName),
    normalizedSnapshotPath: path.join("data", "imports", config.importPreset, "normalized", normalizedFileName),
    execution: {
      scriptsExecuted: runtime.executionLog.length,
      executionErrors: executionErrors.length,
      executionLog: runtime.executionLog,
    },
    capturedRegistryCounts,
    normalizedCounts: computeCounts(snapshot),
    warnings,
    skipped: missingFiles,
  };
  const manifestFileName = `${config.importPreset}-import-${runToken}.json`;
  writeJson(path.join(manifestsDir, manifestFileName), manifest);
  writeJson(path.join(manifestsDir, `latest-${config.importPreset}-manifest.json`), manifest);

  const refreshOutput = refreshMergedSnapshot ? triggerMergedSnapshotRefresh() : undefined;

  return {
    importPreset: config.importPreset,
    edition: config.edition,
    rawManifestPath: path.join("data", "imports", config.importPreset, "raw", "manifests", rawManifestFileName),
    normalizedSnapshotPath: path.join("data", "imports", config.importPreset, "normalized", normalizedFileName),
    manifestPath: path.join("data", "imports", config.importPreset, "manifests", manifestFileName),
    comparisonReportPath: path.join("data", "imports", config.importPreset, "manifests", "comparison-report.json"),
    counts: manifest.normalizedCounts,
    warningsCount: warnings.length,
    executionErrors: executionErrors.length,
    refreshOutput,
  };
}

function runTarget(target) {
  if (target === "2014") {
    return [runUpstreamImport(presetConfigs["mpmb-upstream-2014"], { refreshMergedSnapshot: true })];
  }
  if (target === "2024") {
    return [runUpstreamImport(presetConfigs["mpmb-upstream-2024"], { refreshMergedSnapshot: true })];
  }

  const results = [];
  results.push(runUpstreamImport(presetConfigs["mpmb-upstream-2014"], { refreshMergedSnapshot: false }));
  results.push(runUpstreamImport(presetConfigs["mpmb-upstream-2024"], { refreshMergedSnapshot: false }));
  triggerMergedSnapshotRefresh();
  return results;
}

function main() {
  const target = parseTargetArg(process.argv.slice(2));
  const results = runTarget(target);
  const summary = {
    target,
    imports: results.map((entry) => ({
      importPreset: entry.importPreset,
      edition: entry.edition,
      counts: entry.counts,
      warningsCount: entry.warningsCount,
      executionErrors: entry.executionErrors,
      normalizedSnapshotPath: entry.normalizedSnapshotPath,
      comparisonReportPath: entry.comparisonReportPath,
    })),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = {
  coreVariableFiles,
  parseTargetArg,
  runUpstreamImport,
  runTarget,
  buildComparisonReport,
  mergeSnapshots,
};
