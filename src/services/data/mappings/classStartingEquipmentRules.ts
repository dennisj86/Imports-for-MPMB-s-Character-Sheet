export type ClassStartingEquipmentItem = {
  name: string;
  quantity: number;
};

export type ClassStartingEquipmentPackage = {
  id: string;
  label: string;
  items: ClassStartingEquipmentItem[];
  notes?: string[];
};

export type ClassStartingEquipmentRule = {
  classKey: string;
  className: string;
  edition: "2014" | "2024";
  packageOptions?: ClassStartingEquipmentPackage[];
  gpAlternative?: {
    amount?: number;
    formula?: string;
  };
};

function item(name: string, quantity = 1): ClassStartingEquipmentItem {
  return { name, quantity };
}

const MPMB_2024_PACKAGE_OPTIONS: Record<string, ClassStartingEquipmentPackage[]> = {
  barbarian: [{ id: "package-a", label: "Starting Equipment Package", items: [item("Greataxe"), item("Handaxes", 4)] }],
  bard: [{ id: "package-a", label: "Starting Equipment Package", items: [item("Leather armor"), item("Dagger", 2), item("Musical Instrument of my choice")] }],
  cleric: [{ id: "package-a", label: "Starting Equipment Package", items: [item("Chain shirt"), item("Shield"), item("Mace"), item("Holy Symbol of my choice")] }],
  druid: [{ id: "package-a", label: "Starting Equipment Package", items: [item("Leather armor"), item("Shield"), item("Sickle"), item("Wooden staff druidic focus")] }],
  fighter: [
    { id: "package-a", label: "Starting Equipment Package (Heavy)", items: [item("Chain mail"), item("Greatsword"), item("Flail"), item("Javelins", 8)] },
    { id: "package-b", label: "Starting Equipment Package (Dexterity)", items: [item("Studded leather armor"), item("Scimitar"), item("Shortsword"), item("Longbow"), item("Quiver"), item("Arrows", 20)] },
  ],
  monk: [{ id: "package-a", label: "Starting Equipment Package", items: [item("Spear"), item("Daggers", 5), item("Choice of Artisan's Tools or Musical Instrument I'm proficient with")] }],
  paladin: [{ id: "package-a", label: "Starting Equipment Package", items: [item("Chain Mail"), item("Shield"), item("Longsword"), item("Javelins", 6), item("Holy Symbol of my choice")] }],
  ranger: [{ id: "package-a", label: "Starting Equipment Package", items: [item("Studded leather armor"), item("Shortsword"), item("Scimitar"), item("Longbow"), item("Quiver"), item("Arrows", 20), item("Sprig of mistletoe druidic focus")] }],
  rogue: [{ id: "package-a", label: "Starting Equipment Package", items: [item("Leather armor"), item("Shortsword"), item("Dagger", 2), item("Shortbow"), item("Quiver"), item("Arrows", 20)] }],
  sorcerer: [{ id: "package-a", label: "Starting Equipment Package", items: [item("Spear"), item("Daggers", 2), item("Crystal arcane focus")] }],
  warlock: [{ id: "package-a", label: "Starting Equipment Package", items: [item("Leather armor"), item("Sickle"), item("Dagger", 2), item("Orb arcane focus")] }],
  wizard: [{ id: "package-a", label: "Starting Equipment Package", items: [item("Robe"), item("Staff arcane focus"), item("Daggers", 2), item("Spellbook")] }],
};

export const CLASS_STARTING_EQUIPMENT_RULES: Record<string, ClassStartingEquipmentRule> = {
  "2014:barbarian": { classKey: "barbarian", className: "Barbarian", edition: "2014", gpAlternative: { formula: "2d4 × 10 gp" } },
  "2014:bard": { classKey: "bard", className: "Bard", edition: "2014", gpAlternative: { formula: "5d4 × 10 gp" } },
  "2014:cleric": { classKey: "cleric", className: "Cleric", edition: "2014", gpAlternative: { formula: "5d4 × 10 gp" } },
  "2014:druid": { classKey: "druid", className: "Druid", edition: "2014", gpAlternative: { formula: "2d4 × 10 gp" } },
  "2014:fighter": { classKey: "fighter", className: "Fighter", edition: "2014", gpAlternative: { formula: "5d4 × 10 gp" } },
  "2014:monk": { classKey: "monk", className: "Monk", edition: "2014", gpAlternative: { formula: "5d4 gp" } },
  "2014:paladin": { classKey: "paladin", className: "Paladin", edition: "2014", gpAlternative: { formula: "5d4 × 10 gp" } },
  "2014:ranger": { classKey: "ranger", className: "Ranger", edition: "2014", gpAlternative: { formula: "5d4 × 10 gp" } },
  "2014:rogue": { classKey: "rogue", className: "Rogue", edition: "2014", gpAlternative: { formula: "4d4 × 10 gp" } },
  "2014:sorcerer": { classKey: "sorcerer", className: "Sorcerer", edition: "2014", gpAlternative: { formula: "3d4 × 10 gp" } },
  "2014:warlock": { classKey: "warlock", className: "Warlock", edition: "2014", gpAlternative: { formula: "4d4 × 10 gp" } },
  "2014:wizard": { classKey: "wizard", className: "Wizard", edition: "2014", gpAlternative: { formula: "4d4 × 10 gp" } },
  "2024:barbarian": { classKey: "barbarian", className: "Barbarian", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.barbarian, gpAlternative: { amount: 75 } },
  "2024:bard": { classKey: "bard", className: "Bard", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.bard, gpAlternative: { amount: 90 } },
  "2024:cleric": { classKey: "cleric", className: "Cleric", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.cleric, gpAlternative: { amount: 110 } },
  "2024:druid": { classKey: "druid", className: "Druid", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.druid, gpAlternative: { amount: 50 } },
  "2024:fighter": { classKey: "fighter", className: "Fighter", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.fighter, gpAlternative: { amount: 155 } },
  "2024:monk": { classKey: "monk", className: "Monk", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.monk, gpAlternative: { amount: 50 } },
  "2024:paladin": { classKey: "paladin", className: "Paladin", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.paladin, gpAlternative: { amount: 150 } },
  "2024:ranger": { classKey: "ranger", className: "Ranger", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.ranger, gpAlternative: { amount: 150 } },
  "2024:rogue": { classKey: "rogue", className: "Rogue", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.rogue, gpAlternative: { amount: 100 } },
  "2024:sorcerer": { classKey: "sorcerer", className: "Sorcerer", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.sorcerer, gpAlternative: { amount: 50 } },
  "2024:warlock": { classKey: "warlock", className: "Warlock", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.warlock, gpAlternative: { amount: 100 } },
  "2024:wizard": { classKey: "wizard", className: "Wizard", edition: "2024", packageOptions: MPMB_2024_PACKAGE_OPTIONS.wizard, gpAlternative: { amount: 55 } },
};

export function getClassStartingEquipmentRule(
  classKey: string,
  edition: "2014" | "2024" | "unknown",
): ClassStartingEquipmentRule | undefined {
  if (edition === "2014" || edition === "2024") {
    return CLASS_STARTING_EQUIPMENT_RULES[`${edition}:${classKey}`];
  }
  return CLASS_STARTING_EQUIPMENT_RULES[`2024:${classKey}`] ?? CLASS_STARTING_EQUIPMENT_RULES[`2014:${classKey}`];
}
