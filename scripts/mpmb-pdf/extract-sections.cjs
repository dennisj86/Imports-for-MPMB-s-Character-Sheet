const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SECTION_HEADER_REGEX = /^(Name Dictionary \"[^\"]+\"|Before Close Document|Field Modified|Validate Field|Field Activated|Format Field|Calculate Field):$/;

function resolvePdfPath(repoRoot) {
  const candidates = [path.join(repoRoot, "docs", "dnd.pdf"), path.join(repoRoot, "docs", "DnD.pdf")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`PDF source not found. Checked: ${candidates.join(", ")}`);
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function extractSectionsFromPdf(pdfPath) {
  const result = spawnSync("pdfinfo", ["-js", pdfPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  });
  if (result.status !== 0) {
    throw new Error(`pdfinfo -js failed: ${result.stderr || result.stdout || "unknown error"}`);
  }

  const stdout = normalizeLineEndings(result.stdout || "");
  const lines = stdout.split("\n");
  const sections = [];
  let current = null;
  for (const line of lines) {
    const headerMatch = line.match(SECTION_HEADER_REGEX);
    if (headerMatch) {
      if (current) {
        sections.push(current);
      }
      current = {
        header: headerMatch[1],
        lines: [],
      };
      continue;
    }
    if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    sections.push(current);
  }

  return {
    rawJsOutput: stdout,
    sections: sections.map((section, index) => ({
      order: index + 1,
      header: section.header,
      content: section.lines.join("\n").trimEnd() + "\n",
    })),
  };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/\"/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function writeExtractionArtifacts({ repoRoot, pdfPath, extractionTimestamp, rawJsOutput, sections }) {
  const rawBaseDir = path.join(repoRoot, "data", "imports", "mpmb-pdf", "raw");
  const scriptsDir = path.join(rawBaseDir, "scripts");
  const manifestsDir = path.join(rawBaseDir, "manifests");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(manifestsDir, { recursive: true });

  const runToken = extractionTimestamp.replace(/[:.]/g, "-");
  const runScriptsDir = path.join(scriptsDir, runToken);
  fs.mkdirSync(runScriptsDir, { recursive: true });

  const scriptEntries = [];
  for (const section of sections) {
    const sectionSlug = slugify(section.header);
    const fileName = `${String(section.order).padStart(4, "0")}-${sectionSlug}.js`;
    const relativePath = path.join("data", "imports", "mpmb-pdf", "raw", "scripts", runToken, fileName);
    const absolutePath = path.join(repoRoot, relativePath);
    fs.writeFileSync(absolutePath, section.content, "utf8");
    scriptEntries.push({
      order: section.order,
      header: section.header,
      fileName,
      relativePath,
      lineCount: section.content.split("\n").length,
      parseStatus: "ok",
    });
  }

  const rawDumpRelative = path.join("data", "imports", "mpmb-pdf", "raw", "scripts", runToken, "pdfinfo-js-output.txt");
  fs.writeFileSync(path.join(repoRoot, rawDumpRelative), rawJsOutput, "utf8");

  const manifest = {
    extractionTimestamp,
    pdfSourcePath: path.relative(repoRoot, pdfPath),
    extractor: "pdfinfo -js",
    sectionsCount: sections.length,
    scriptEntries,
    warnings: [],
  };

  const manifestFileName = `mpmb-pdf-raw-${runToken}.json`;
  const manifestPath = path.join(manifestsDir, manifestFileName);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(manifestsDir, "latest-raw-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    runToken,
    scriptsDir: runScriptsDir,
    manifest,
    manifestPath,
  };
}

module.exports = {
  resolvePdfPath,
  extractSectionsFromPdf,
  writeExtractionArtifacts,
};
