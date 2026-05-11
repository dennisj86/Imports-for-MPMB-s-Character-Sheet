import { describe, expect, it } from "vitest";

declare const require: (id: string) => any;

const os = require("node:os");
const path = require("node:path");
const { writeExtractionArtifacts } = require("../../scripts/mpmb-pdf/extract-sections.cjs");

describe("mpmb pdf raw extraction artifacts", () => {
  it("writes a deterministic raw manifest with ordered script entries", () => {
    const repoRoot = path.join(os.tmpdir(), "mpmb-pdf-extraction-test");
    const extractionTimestamp = "2000-01-01T00:00:00.000Z";
    const result = writeExtractionArtifacts({
      repoRoot,
      pdfPath: "docs/DnD.pdf",
      extractionTimestamp,
      rawJsOutput: 'Name Dictionary "ListsClasses":\nvar Base_ClassList = {};\n',
      sections: [
        {
          order: 1,
          header: 'Name Dictionary "ListsClasses"',
          content: "var Base_ClassList = {};\n",
        },
        {
          order: 2,
          header: 'Name Dictionary "ListsSpells"',
          content: "var Base_SpellsList = {};\n",
        },
      ],
    });

    expect(result.runToken).toBe("2000-01-01T00-00-00-000Z");
    expect(result.manifest.sectionsCount).toBe(2);
    expect(result.manifest.scriptEntries.map((entry: { order: number }) => entry.order)).toEqual([1, 2]);
    expect(result.manifest.scriptEntries[0].header).toBe('Name Dictionary "ListsClasses"');
    expect(result.manifest.scriptEntries[1].header).toBe('Name Dictionary "ListsSpells"');
  });
});
