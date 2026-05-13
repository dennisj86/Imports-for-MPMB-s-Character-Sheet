import type { AbilityScores, CharacterDraft } from "./character";
import { createDefaultCharacterPlayState } from "./playState";

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
    syncVersion: 1,
    name,
    provider: "mpmb",
    rulesMode: "2024",
    createdAt: timestamp,
    updatedAt: timestamp,
    portraitUrl: undefined,
    portraitData: undefined,
    backgroundImageUrl: undefined,
    backgroundImageData: undefined,
    themeColor: undefined,
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
      currency: {
        cp: 0,
        sp: 0,
        ep: 0,
        gp: 0,
        pp: 0,
      },
      currencyTransactions: [],
    },
    xp: {
      currentXp: 0,
      milestoneMode: false,
      levelSource: "xp",
    },
    levelUp: {
      hpGainByLevel: {},
      abilityScoreIncreases: {},
      featChoices: {},
      weaponMasteryChoices: {},
      fightingStyleChoices: {},
    },
    ruleChoices: {},
    playState: createDefaultCharacterPlayState(id, {
      maxHp: 1,
      now: timestamp,
    }),
  };
}
