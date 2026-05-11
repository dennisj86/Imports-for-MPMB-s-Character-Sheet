import fs from "node:fs";
import path from "node:path";
import { Open5eClient } from "../src/services/data/open5e/client";
import { buildPresetSelection, discoverDocuments, inferEditionFromDocument } from "../src/services/data/open5e/discovery";
import { mergeSnapshots } from "../src/services/data/open5e/merge";
import { normalizeOpen5e } from "../src/services/data/open5e/normalize";
import type { MpmContentSnapshot } from "../src/domain/content";
import type { Open5eManifest, Open5ePreset, Open5eRawSnapshot } from "../src/services/data/open5e/types";

const repoRoot = path.resolve(process.cwd());
const rawOutputDir = path.join(repoRoot, "data", "imports", "open5e", "raw");
const normalizedOutputDir = path.join(repoRoot, "data", "imports", "open5e", "normalized");
const manifestOutputDir = path.join(repoRoot, "data", "imports", "open5e", "manifests");
const currentMergedSnapshotPath = path.join(repoRoot, "src", "services", "data", "generated", "mpmb-content.json");
const localSnapshotPath = path.join(repoRoot, "src", "services", "data", "generated", "mpmb-local-content.json");
const fallbackSnapshotPath = path.join(repoRoot, "src", "services", "data", "generated", "mpmb-content.json");
const mergedSnapshotPath = path.join(repoRoot, "src", "services", "data", "generated", "mpmb-content.json");

function parsePresetArg(argv: string[]): Open5ePreset {
  const explicitPreset = argv
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("--preset="))
    ?.split("=")[1];
  const positional = argv.find((entry) => !entry.startsWith("--"));
  const preset = (explicitPreset || positional || "open5e-both").trim() as Open5ePreset;
  if (preset === "open5e-2014" || preset === "open5e-2024" || preset === "open5e-both") {
    return preset;
  }
  throw new Error(`Unsupported preset: ${preset}`);
}

function ensureDirectory(directoryPath: string): void {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function compactTimestamp(isoTimestamp: string): string {
  return isoTimestamp.replace(/[:.]/g, "-");
}

function writeJson(filePath: string, value: unknown): void {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readSnapshotFromDisk(filePath: string): MpmContentSnapshot | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as MpmContentSnapshot;
}

async function main() {
  const preset = parsePresetArg(process.argv.slice(2));
  const client = new Open5eClient();
  const discovery = await discoverDocuments(client);
  const selection = buildPresetSelection(discovery, preset);
  const selectedDocumentKeys = selection.selectedDocuments.map((document) => document.key);
  if (selectedDocumentKeys.length === 0) {
    throw new Error(`No Open5e documents selected for preset ${preset}`);
  }

  const documentKeyFilter = selectedDocumentKeys.join(",");
  const importTimestamp = new Date().toISOString();

  const [classes, species, spells, backgrounds, feats, items, weapons, armor] = await Promise.all([
    client.fetchAllPages("classes", { document__key__in: documentKeyFilter, ordering: "key" }),
    client.fetchAllPages("species", { document__key__in: documentKeyFilter, ordering: "key" }),
    client.fetchAllPages("spells", { document__key__in: documentKeyFilter, ordering: "key" }),
    client.fetchAllPages("backgrounds", { document__key__in: documentKeyFilter, ordering: "key" }),
    client.fetchAllPages("feats", { document__key__in: documentKeyFilter, ordering: "key" }),
    client.fetchAllPages("items", { document__key__in: documentKeyFilter, ordering: "key" }),
    client.fetchAllPages("weapons", { document__key__in: documentKeyFilter, ordering: "key" }),
    client.fetchAllPages("armor", { document__key__in: documentKeyFilter, ordering: "key" }),
  ]);

  const rawSnapshot: Open5eRawSnapshot = {
    meta: {
      importTimestamp,
      apiVersion: "v2",
      preset,
      selectedDocumentKeys,
      selectedDocuments: selection.selectedDocuments.map((document) => ({
        key: document.key,
        name: document.display_name?.trim() || document.name || document.key,
        edition: inferEditionFromDocument(document),
        publisher: document.publisher?.key,
        licenseKeys: (document.licenses ?? []).map((license) => license.key).filter((entry): entry is string => Boolean(entry)),
      })),
    },
    documents: selection.selectedDocuments,
    classes: classes.entries,
    species: species.entries,
    spells: spells.entries,
    backgrounds: backgrounds.entries,
    feats: feats.entries,
    items: items.entries,
    weapons: weapons.entries,
    armor: armor.entries,
  };

  const normalized = normalizeOpen5e(rawSnapshot);
  const snapshotForMerge =
    readSnapshotFromDisk(currentMergedSnapshotPath) ??
    readSnapshotFromDisk(localSnapshotPath) ??
    readSnapshotFromDisk(fallbackSnapshotPath) ?? {
      meta: {
        generatedAt: importTimestamp,
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
  const merged = mergeSnapshots(snapshotForMerge, normalized.snapshot);

  const timestampToken = compactTimestamp(importTimestamp);
  const rawFileName = `open5e-${preset}-${timestampToken}.json`;
  const normalizedFileName = `open5e-${preset}-${timestampToken}.json`;
  const manifestFileName = `open5e-${preset}-${timestampToken}.json`;

  ensureDirectory(rawOutputDir);
  ensureDirectory(normalizedOutputDir);
  ensureDirectory(manifestOutputDir);

  writeJson(path.join(rawOutputDir, rawFileName), rawSnapshot);
  writeJson(path.join(rawOutputDir, "latest-open5e-raw.json"), rawSnapshot);
  writeJson(path.join(normalizedOutputDir, normalizedFileName), normalized.snapshot);
  writeJson(path.join(normalizedOutputDir, "latest-open5e-content.json"), normalized.snapshot);
  writeJson(mergedSnapshotPath, merged.merged);

  const manifest: Open5eManifest = {
    importTimestamp,
    apiVersion: "v2",
    preset,
    selectedDocumentKeys,
    counts: {
      raw: {
        classes: classes.entries.length,
        species: species.entries.length,
        spells: spells.entries.length,
        backgrounds: backgrounds.entries.length,
        feats: feats.entries.length,
        items: items.entries.length,
        weapons: weapons.entries.length,
        armor: armor.entries.length,
      },
      normalized: {
        sources: normalized.snapshot.sources.length,
        classes: normalized.snapshot.classes.length,
        subclasses: normalized.snapshot.subclasses.length,
        species: normalized.snapshot.species.length,
        backgrounds: normalized.snapshot.backgrounds.length,
        feats: normalized.snapshot.feats.length,
        spells: normalized.snapshot.spells.length,
        equipment: normalized.snapshot.equipment.length,
      },
    },
    warnings: [...selection.warnings, ...normalized.warnings, ...merged.warnings],
    skipped: normalized.skipped,
  };
  writeJson(path.join(manifestOutputDir, manifestFileName), manifest);
  writeJson(path.join(manifestOutputDir, "latest-open5e-manifest.json"), manifest);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        preset,
        selectedDocuments: selectedDocumentKeys,
        counts: manifest.counts.normalized,
        mergedCounts: {
          classes: merged.merged.classes.length,
          subclasses: merged.merged.subclasses.length,
          species: merged.merged.species.length,
          backgrounds: merged.merged.backgrounds.length,
          feats: merged.merged.feats.length,
          spells: merged.merged.spells.length,
          equipment: merged.merged.equipment.length,
        },
        manifestPath: path.join("data", "imports", "open5e", "manifests", manifestFileName),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
