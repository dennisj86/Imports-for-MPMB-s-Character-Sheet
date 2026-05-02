import type { AbilityKey } from "../../../domain/appliedRules";

export interface ClassBaseRule {
  savingThrows: AbilityKey[];
  armor: string[];
  weapons: string[];
  tools: string[];
  skillChoices: {
    count: number;
    options: string[];
  };
}

export const CLASS_BASE_RULES: Record<string, ClassBaseRule> = {
  artificer: {
    savingThrows: ["con", "int"],
    armor: ["Light armor", "Medium armor", "Shields"],
    weapons: ["Simple weapons", "Firearms"],
    tools: ["Thieves' tools", "Tinker's tools", "Artisan's tools"],
    skillChoices: {
      count: 2,
      options: ["Arcana", "History", "Investigation", "Medicine", "Nature", "Perception", "Sleight of Hand"],
    },
  },
  barbarian: {
    savingThrows: ["str", "con"],
    armor: ["Light armor", "Medium armor", "Shields"],
    weapons: ["Simple weapons", "Martial weapons"],
    tools: [],
    skillChoices: {
      count: 2,
      options: ["Animal Handling", "Athletics", "Intimidation", "Nature", "Perception", "Survival"],
    },
  },
  bard: {
    savingThrows: ["dex", "cha"],
    armor: ["Light armor"],
    weapons: ["Simple weapons", "Hand crossbows", "Longswords", "Rapiers", "Shortswords"],
    tools: ["Three musical instruments"],
    skillChoices: {
      count: 3,
      options: ["Any skill"],
    },
  },
  cleric: {
    savingThrows: ["wis", "cha"],
    armor: ["Light armor", "Medium armor", "Shields"],
    weapons: ["Simple weapons"],
    tools: [],
    skillChoices: {
      count: 2,
      options: ["History", "Insight", "Medicine", "Persuasion", "Religion"],
    },
  },
  druid: {
    savingThrows: ["int", "wis"],
    armor: ["Light armor", "Medium armor", "Shields (nonmetal)"],
    weapons: ["Clubs", "Daggers", "Darts", "Javelins", "Maces", "Quarterstaffs", "Scimitars", "Sickles", "Slings", "Spears"],
    tools: ["Herbalism kit"],
    skillChoices: {
      count: 2,
      options: ["Arcana", "Animal Handling", "Insight", "Medicine", "Nature", "Perception", "Religion", "Survival"],
    },
  },
  fighter: {
    savingThrows: ["str", "con"],
    armor: ["All armor", "Shields"],
    weapons: ["Simple weapons", "Martial weapons"],
    tools: [],
    skillChoices: {
      count: 2,
      options: ["Acrobatics", "Animal Handling", "Athletics", "History", "Insight", "Intimidation", "Perception", "Survival"],
    },
  },
  monk: {
    savingThrows: ["str", "dex"],
    armor: [],
    weapons: ["Simple weapons", "Shortswords"],
    tools: ["One artisan's tool or one musical instrument"],
    skillChoices: {
      count: 2,
      options: ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"],
    },
  },
  paladin: {
    savingThrows: ["wis", "cha"],
    armor: ["All armor", "Shields"],
    weapons: ["Simple weapons", "Martial weapons"],
    tools: [],
    skillChoices: {
      count: 2,
      options: ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"],
    },
  },
  ranger: {
    savingThrows: ["str", "dex"],
    armor: ["Light armor", "Medium armor", "Shields"],
    weapons: ["Simple weapons", "Martial weapons"],
    tools: [],
    skillChoices: {
      count: 3,
      options: ["Animal Handling", "Athletics", "Insight", "Investigation", "Nature", "Perception", "Stealth", "Survival"],
    },
  },
  rogue: {
    savingThrows: ["dex", "int"],
    armor: ["Light armor"],
    weapons: ["Simple weapons", "Hand crossbows", "Longswords", "Rapiers", "Shortswords"],
    tools: ["Thieves' tools"],
    skillChoices: {
      count: 4,
      options: [
        "Acrobatics",
        "Athletics",
        "Deception",
        "Insight",
        "Intimidation",
        "Investigation",
        "Perception",
        "Performance",
        "Persuasion",
        "Sleight of Hand",
        "Stealth",
      ],
    },
  },
  sorcerer: {
    savingThrows: ["con", "cha"],
    armor: [],
    weapons: ["Daggers", "Darts", "Slings", "Quarterstaffs", "Light crossbows"],
    tools: [],
    skillChoices: {
      count: 2,
      options: ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"],
    },
  },
  warlock: {
    savingThrows: ["wis", "cha"],
    armor: ["Light armor"],
    weapons: ["Simple weapons"],
    tools: [],
    skillChoices: {
      count: 2,
      options: ["Arcana", "Deception", "History", "Intimidation", "Investigation", "Nature", "Religion"],
    },
  },
  wizard: {
    savingThrows: ["int", "wis"],
    armor: [],
    weapons: ["Daggers", "Darts", "Slings", "Quarterstaffs", "Light crossbows"],
    tools: [],
    skillChoices: {
      count: 2,
      options: ["Arcana", "History", "Insight", "Investigation", "Medicine", "Religion"],
    },
  },
};

