import { describe, expect, it } from "vitest";

declare const require: (id: string) => any;

const { executeSections, normalizeCapturedRegistries } = require("../../scripts/mpmb-pdf/capture-normalize.cjs");

describe("mpmb pdf capture + normalization", () => {
  it("captures base registries and maps them to the app schema", () => {
    const sections = [
      {
        order: 1,
        header: 'Name Dictionary "ListsSources"',
        content: [
          "var Base_SourceList = {};",
          'Base_SourceList["SRD"] = { name: "System Reference Document" };',
        ].join("\n"),
      },
      {
        order: 2,
        header: 'Name Dictionary "ListsClasses"',
        content: [
          "var Base_ClassList = {};",
          'Base_ClassList["fighter"] = {',
          '  name: "Fighter",',
          "  source: [\"SRD\", 70],",
          "  die: 10,",
          "  features: {",
          '    "fighting style": { name: "Fighting Style", minlevel: 1, description: "Pick a style." }',
          "  }",
          "};",
          "AddSubClass('fighter', 'champion', {",
          "  subname: 'Champion',",
          "  source: ['SRD', 72],",
          "  features: { 'improved critical': { name: 'Improved Critical', minlevel: 3, description: 'Crit on 19-20.' } }",
          "});",
        ].join("\n"),
      },
      {
        order: 3,
        header: 'Name Dictionary "ListsBackgrounds"',
        content: [
          "var Base_BackgroundFeatureList = {};",
          "var Base_BackgroundList = {};",
          'Base_BackgroundFeatureList["shelter"] = { description: "Get shelter from temples." };',
          'Base_BackgroundList["acolyte"] = {',
          '  name: "Acolyte",',
          "  source: ['SRD', 127],",
          "  feature: 'shelter'",
          "};",
        ].join("\n"),
      },
      {
        order: 4,
        header: 'Name Dictionary "ListsSpells"',
        content: [
          "var Base_SpellsList = {};",
          'Base_SpellsList["magic missile"] = {',
          '  name: "Magic Missile",',
          "  source: [['SRD', 257]],",
          "  level: 1,",
          "  school: 'Evoc',",
          "  time: '1 action',",
          "  range: '120 ft',",
          "  duration: 'Instantaneous',",
          "  classes: ['wizard'],",
          "  description: 'Three glowing darts of magical force.'",
          "};",
        ].join("\n"),
      },
    ];

    const runtime = executeSections(sections);
    const result = normalizeCapturedRegistries(runtime, ['pdf:Name Dictionary "ListsClasses"']);

    expect(runtime.executionLog.every((entry: { status: string }) => entry.status === "ok")).toBe(true);
    expect(result.capturedRegistryCounts.SourceList).toBe(1);
    expect(result.capturedRegistryCounts.ClassList).toBe(1);
    expect(result.capturedRegistryCounts.BackgroundList).toBe(1);
    expect(result.capturedRegistryCounts.SpellsList).toBe(1);

    const [classEntry] = result.snapshot.classes;
    const [subclassEntry] = result.snapshot.subclasses;
    const [spellEntry] = result.snapshot.spells;
    const [backgroundEntry] = result.snapshot.backgrounds;

    expect(classEntry.canonicalClassKey).toBe("fighter");
    expect(classEntry.sourceMeta?.sourceSystem).toBe("mpmb");
    expect(classEntry.sourceRefs[0]).toBe("mpmbpdf-srd:70");

    expect(subclassEntry.classKey).toBe("fighter");
    expect(subclassEntry.sourceRefs[0]).toBe("mpmbpdf-srd:72");

    expect(spellEntry.level).toBe(1);
    expect(spellEntry.sourceMeta?.sourceSystem).toBe("mpmb");
    expect(spellEntry.sourceRefs[0]).toBe("mpmbpdf-srd:257");
    expect(spellEntry.classes).toEqual(["wizard"]);

    expect(backgroundEntry.traitText).toContain("shelter");
  });
});
