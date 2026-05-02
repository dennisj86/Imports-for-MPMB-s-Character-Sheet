import type { AbilityScores, CharacterDraft } from "./character";

const DEFAULT_ABILITY_SCORES: AbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

export function createCharacterDraft(id: string, name: string): CharacterDraft {
  const timestamp = new Date().toISOString();
  return {
    id,
    version: 2,
    name,
    provider: "mpmb",
    rulesMode: "2024",
    createdAt: timestamp,
    updatedAt: timestamp,
    abilityScores: { ...DEFAULT_ABILITY_SCORES },
    classSelection: {
      classId: undefined,
      level: 1,
    },
    subclassSelection: {
      subclassId: undefined,
    },
    speciesSelection: {
      speciesId: undefined,
    },
    backgroundSelection: {
      backgroundId: undefined,
    },
    featIds: [],
    spellSelection: {
      selectedSpellIds: [],
    },
    featureChoices: [],
    inventory: {
      items: [],
    },
  };
}
