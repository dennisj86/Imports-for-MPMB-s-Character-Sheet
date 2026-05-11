const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { resolvePdfPath, extractSectionsFromPdf, writeExtractionArtifacts } = require("./mpmb-pdf/extract-sections.cjs");
const { executeSections, normalizeCapturedRegistries, readSectionsFromRawManifest } = require("./mpmb-pdf/capture-normalize.cjs");

const repoRoot = path.resolve(__dirname, "..");
const rawManifestsDir = path.join(repoRoot, "data", "imports", "mpmb-pdf", "raw", "manifests");
const normalizedDir = path.join(repoRoot, "data", "imports", "mpmb-pdf", "normalized");
const manifestsDir = path.join(repoRoot, "data", "imports", "mpmb-pdf", "manifests");

function parseMode(argv) {
  const explicitMode = argv
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("--mode="))
    ?.split("=")[1];
  const positional = argv.find((entry) => !entry.startsWith("--"));
  const mode = (explicitMode || positional || "full").trim();
  if (!["full", "raw", "normalize"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  return mode;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readLatestRawManifest() {
  const latestPath = path.join(rawManifestsDir, "latest-raw-manifest.json");
  if (!fs.existsSync(latestPath)) {
    throw new Error(`Raw manifest not found: ${latestPath}. Run raw extraction first.`);
  }
  return JSON.parse(fs.readFileSync(latestPath, "utf8"));
}

function normalizeRunToken(iso) {
  return iso.replace(/[:.]/g, "-");
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

function runRawExtraction() {
  const extractionTimestamp = new Date().toISOString();
  const pdfPath = resolvePdfPath(repoRoot);
  const { rawJsOutput, sections } = extractSectionsFromPdf(pdfPath);
  const writeResult = writeExtractionArtifacts({
    repoRoot,
    pdfPath,
    extractionTimestamp,
    rawJsOutput,
    sections,
  });
  return {
    extractionTimestamp,
    pdfPath,
    sectionsCount: sections.length,
    ...writeResult,
  };
}

function runNormalization(rawManifest) {
  const runTimestamp = new Date().toISOString();
  const sections = readSectionsFromRawManifest(repoRoot, rawManifest);
  const runtime = executeSections(sections);
  const sourceFiles = sections
    .filter((section) => /^Name Dictionary/.test(section.header))
    .map((section) => `pdf:${section.header}`);
  const { snapshot, capturedRegistryCounts } = normalizeCapturedRegistries(runtime, sourceFiles);

  const runToken = normalizeRunToken(runTimestamp);
  fs.mkdirSync(normalizedDir, { recursive: true });
  fs.mkdirSync(manifestsDir, { recursive: true });

  const normalizedFileName = `mpmb-pdf-normalized-${runToken}.json`;
  const normalizedPath = path.join(normalizedDir, normalizedFileName);
  writeJson(normalizedPath, snapshot);
  writeJson(path.join(normalizedDir, "latest-mpmb-pdf-content.json"), snapshot);

  const executionErrors = runtime.executionLog.filter((entry) => entry.status === "error");
  const manifest = {
    importTimestamp: runTimestamp,
    sourcePdf: rawManifest.pdfSourcePath,
    rawManifestRef: path.relative(repoRoot, path.join(rawManifestsDir, "latest-raw-manifest.json")),
    scriptSectionsExecuted: runtime.executionLog.length,
    executionErrors: executionErrors.length,
    executionLog: runtime.executionLog,
    capturedRegistryCounts,
    normalizedCounts: {
      sources: snapshot.sources.length,
      classes: snapshot.classes.length,
      subclasses: snapshot.subclasses.length,
      species: snapshot.species.length,
      backgrounds: snapshot.backgrounds.length,
      feats: snapshot.feats.length,
      spells: snapshot.spells.length,
      equipment: snapshot.equipment.length,
    },
    warnings: executionErrors.map((entry) => `${entry.header}: ${entry.message}`),
  };

  const manifestFileName = `mpmb-pdf-import-${runToken}.json`;
  writeJson(path.join(manifestsDir, manifestFileName), manifest);
  writeJson(path.join(manifestsDir, "latest-mpmb-pdf-manifest.json"), manifest);

  const refreshOutput = triggerMergedSnapshotRefresh();

  return {
    runToken,
    normalizedFileName,
    manifestFileName,
    manifest,
    refreshOutput,
  };
}

function main() {
  const mode = parseMode(process.argv.slice(2));
  let rawResult;
  if (mode === "raw" || mode === "full") {
    rawResult = runRawExtraction();
  }

  let normalizeResult;
  if (mode === "normalize" || mode === "full") {
    const rawManifest = mode === "full" ? rawResult.manifest : readLatestRawManifest();
    normalizeResult = runNormalization(rawManifest);
  }

  const summary = {
    mode,
    raw: rawResult
      ? {
          pdfPath: path.relative(repoRoot, rawResult.pdfPath),
          sectionsCount: rawResult.sectionsCount,
          rawManifestPath: path.relative(repoRoot, rawResult.manifestPath),
        }
      : undefined,
    normalized: normalizeResult
      ? {
          normalizedSnapshot: path.join("data", "imports", "mpmb-pdf", "normalized", normalizeResult.normalizedFileName),
          manifestPath: path.join("data", "imports", "mpmb-pdf", "manifests", normalizeResult.manifestFileName),
          counts: normalizeResult.manifest.normalizedCounts,
          executionErrors: normalizeResult.manifest.executionErrors,
        }
      : undefined,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
}
