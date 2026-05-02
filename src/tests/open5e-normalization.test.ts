import { describe, expect, it } from "vitest";
import { normalizeOpen5e } from "../services/data/open5e/normalize";
import type { Open5eRawSnapshot } from "../services/data/open5e/types";

function buildRawSnapshot(): Open5eRawSnapshot {
  return {
    meta: {
      importTimestamp: "2026-05-02T00:00:00.000Z",
      apiVersion: "v2",
      preset: "open5e-both",
      selectedDocumentKeys: ["srd-2024"],
      selectedDocuments: [
        {
          key: "srd-2024",
          name: "System Reference Document 5.2",
          edition: "2024",
          publisher: "wizards-of-the-coast",
          licenseKeys: ["cc-by-40"],
        },
      ],
    },
    documents: [
      {
        key: "srd-2024",
        name: "System Reference Document 5.2",
        display_name: "5e 2024 Rules",
        type: "SOURCE",
        gamesystem: {
          key: "5e-2024",
          name: "5th Edition 2024",
        },
        licenses: [{ key: "cc-by-40", name: "Creative Commons Attribution 4.0" }],
      },
    ],
    classes: [
      {
        key: "srd-2024_fighter",
        name: "Fighter",
        subclass_of: null,
        hit_dice: "D10",
        caster_type: "NONE",
        features: [{ key: "srd-2024_fighter_second-wind", name: "Second Wind", desc: "Gain hp.", gained_at: [{ level: 1 }] }],
        document: {
          key: "srd-2024",
          name: "System Reference Document 5.2",
          display_name: "5e 2024 Rules",
          gamesystem: { key: "5e-2024" },
          licenses: [{ key: "cc-by-40" }],
        },
      },
      {
        key: "srd-2024_champion",
        name: "Champion",
        subclass_of: { key: "srd-2024_fighter", name: "Fighter" },
        features: [{ key: "srd-2024_champion_improved-critical", name: "Improved Critical", desc: "Crits on 19.", gained_at: [{ level: 3 }] }],
        document: {
          key: "srd-2024",
          name: "System Reference Document 5.2",
          display_name: "5e 2024 Rules",
          gamesystem: { key: "5e-2024" },
          licenses: [{ key: "cc-by-40" }],
        },
      },
    ],
    species: [],
    spells: [
      {
        key: "srd-2024_true-strike",
        name: "True Strike",
        level: 0,
        school: { name: "Divination", key: "divination" },
        classes: [{ key: "srd-2024_fighter", name: "Fighter" }],
        casting_time: "action",
        range_text: "Self",
        duration: "instantaneous",
        concentration: false,
        ritual: false,
        desc: "Strike true.",
        document: {
          key: "srd-2024",
          name: "System Reference Document 5.2",
          display_name: "5e 2024 Rules",
          gamesystem: { key: "5e-2024" },
          licenses: [{ key: "cc-by-40" }],
        },
      },
    ],
    backgrounds: [],
    feats: [],
    items: [],
    weapons: [],
    armor: [],
  };
}

describe("open5e normalization", () => {
  it("normalizes classes/spells and applies source metadata", () => {
    const normalized = normalizeOpen5e(buildRawSnapshot());

    expect(normalized.snapshot.classes.length).toBe(1);
    expect(normalized.snapshot.subclasses.length).toBe(1);
    expect(normalized.snapshot.spells.length).toBe(1);

    const fighter = normalized.snapshot.classes[0];
    const champion = normalized.snapshot.subclasses[0];
    const spell = normalized.snapshot.spells[0];

    expect(fighter.key).toBe("fighter");
    expect(fighter.canonicalClassKey).toBe("fighter");
    expect(fighter.sourceMeta?.sourceSystem).toBe("open5e");
    expect(fighter.sourceMeta?.edition).toBe("2024");

    expect(champion.classKey).toBe("fighter");
    expect(champion.classId).toBe(fighter.id);
    expect(champion.features[0].minLevel).toBe(3);

    expect(spell.classes).toContain("fighter");
    expect(spell.sourceMeta?.importPreset).toBe("open5e-both");
  });
});
