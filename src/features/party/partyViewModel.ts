import type { CharacterDraft } from "../../domain/character";
import type { PartyState } from "../../domain/party";
import { resolveCharacterEngineState } from "../../services/characterEngine";
import { contentSnapshot } from "../../services/data/content";
import { ensureCharacterPlayState } from "../../services/playState";

export interface PartyCharacterTileViewModel {
  id: string;
  name: string;
  classLevelLabel: string;
  hpLabel: string;
  tempHpLabel?: string;
  armorClassLabel?: string;
  conditionLabels: string[];
  concentrating: boolean;
  portraitSrc?: string;
  backgroundSrc?: string;
  themeColor?: string;
}

export function buildPartyCharacterTile(character: CharacterDraft): PartyCharacterTileViewModel {
  const engine = resolveCharacterEngineState(contentSnapshot, character, {
    provider: character.provider,
    rulesMode: character.rulesMode,
  });
  const maxHp = engine.derivedStats.hitPoints.max;
  const playState = ensureCharacterPlayState(character.playState, character.id, { maxHp });
  return {
    id: character.id,
    name: character.name,
    classLevelLabel: `${engine.classDef?.name ?? "No class"} L${character.classSelection.level}`,
    hpLabel: `${playState.currentHp}/${maxHp}`,
    tempHpLabel: playState.tempHp > 0 ? `+${playState.tempHp} temp` : undefined,
    armorClassLabel: Number.isFinite(engine.derivedStats.armorClass.value) ? `AC ${engine.derivedStats.armorClass.value}` : undefined,
    conditionLabels: playState.activeConditions.map((entry) => entry.name),
    concentrating: Boolean(playState.concentration),
    portraitSrc: character.portraitData ?? character.portraitUrl,
    backgroundSrc: character.backgroundImageData ?? character.backgroundImageUrl,
    themeColor: character.themeColor,
  };
}

export function buildPartyTiles(party: PartyState | undefined, characters: CharacterDraft[]): PartyCharacterTileViewModel[] {
  const orderedIds = party?.characterIds ?? characters.map((entry) => entry.id);
  const characterById = new Map(characters.map((entry) => [entry.id, entry]));
  return orderedIds
    .map((id) => characterById.get(id))
    .filter((entry): entry is CharacterDraft => Boolean(entry))
    .map(buildPartyCharacterTile);
}

