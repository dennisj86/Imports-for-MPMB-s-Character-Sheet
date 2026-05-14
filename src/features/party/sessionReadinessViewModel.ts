import type { CharacterDraft } from "../../domain/character";
import type { PartyState } from "../../domain/party";
import { resolveCharacterEngineState } from "../../services/characterEngine";
import { contentSnapshot } from "../../services/data/content";
import { ensureCharacterPlayState, resolveHitDiceCounters, resolveResourceCounters, resolveSpellSlotCounters } from "../../services/playState";
import { buildInventoryViewModel, buildProgressionViewModel } from "../character/viewModels";

export interface PartyCharacterReadinessViewModel {
  id: string;
  href: string;
  name: string;
  classLevelLabel: string;
  level: number;
  hpLabel: string;
  armorClassLabel?: string;
  pendingChoices: number;
  unsupportedManualRules: number;
  missingSpellComponents: number;
  depletedResources: number;
  topNotes: string[];
  pendingPreview?: string;
  manualPreview?: string;
  componentPreview?: string;
}

export interface PartyKnownGapViewModel {
  id: string;
  label: string;
  detail: string;
  characterId: string;
  characterName: string;
}

export interface PartySessionReadinessViewModel {
  memberCount: number;
  characters: PartyCharacterReadinessViewModel[];
  knownGaps: PartyKnownGapViewModel[];
}

function classLevelLabel(character: CharacterDraft, className: string | undefined): string {
  return `${className ?? "No class"} L${character.classSelection.level}`;
}

function topKnownNotes(input: {
  pendingChoices: number;
  unsupportedManualRules: number;
  missingSpellComponents: number;
  depletedResources: number;
}): string[] {
  const notes: string[] = [];
  if (input.pendingChoices > 0) {
    notes.push(`${input.pendingChoices} pending choice${input.pendingChoices === 1 ? "" : "s"}`);
  }
  if (input.unsupportedManualRules > 0) {
    notes.push(`${input.unsupportedManualRules} manual/unsupported rule${input.unsupportedManualRules === 1 ? "" : "s"}`);
  }
  if (input.missingSpellComponents > 0) {
    notes.push(`${input.missingSpellComponents} missing spell component${input.missingSpellComponents === 1 ? "" : "s"}`);
  }
  if (input.depletedResources > 0) {
    notes.push(`${input.depletedResources} depleted resource${input.depletedResources === 1 ? "" : "s"}`);
  }
  return notes.slice(0, 3);
}

export function buildPartyCharacterReadiness(
  character: CharacterDraft,
  options: {
    partyId: string;
  },
): PartyCharacterReadinessViewModel {
  const engine = resolveCharacterEngineState(contentSnapshot, character, {
    provider: character.provider,
    rulesMode: character.rulesMode,
  });
  const maxHp = engine.derivedStats.hitPoints.max;
  const playState = ensureCharacterPlayState(character.playState, character.id, { maxHp });
  const progression = buildProgressionViewModel(character, engine);
  const inventory = buildInventoryViewModel(character, engine, playState);
  const resourceCounters = resolveResourceCounters(playState, engine.actionResources);
  const spellSlotCounters = resolveSpellSlotCounters(playState, engine.actionResources);
  const hitDiceCounters = resolveHitDiceCounters(playState);

  const unsupportedRuleChoices = progression.ruleChoices.filter((entry) => entry.status === "unsupported").length;
  const unsupportedCapabilities = progression.missingCapabilities.filter((entry) => entry.status === "unsupported").length;
  const unsupportedOptionScoped = engine.ruleEngine.optionScoped.diagnostics.filter((entry) => entry.status === "unsupported").length;
  const manualDerivedNotes = engine.derivedStats.notes.length;
  const manualActionNotes = engine.actionResources.pending.length;
  const unsupportedManualRules = unsupportedRuleChoices + unsupportedCapabilities + unsupportedOptionScoped + manualDerivedNotes + manualActionNotes;
  const missingSpellComponents = inventory.neededSpellComponents.filter((entry) => entry.status === "missing").length;
  const depletedResources =
    resourceCounters.filter((entry) => entry.max > 0 && entry.remaining === 0).length +
    spellSlotCounters.filter((entry) => entry.max > 0 && entry.remaining === 0).length +
    hitDiceCounters.filter((entry) => entry.max > 0 && entry.remaining === 0).length;

  return {
    id: character.id,
    href: `/party/${options.partyId}/characters/${character.id}`,
    name: character.name,
    classLevelLabel: classLevelLabel(character, engine.classDef?.name),
    level: character.classSelection.level,
    hpLabel: `${playState.currentHp}/${maxHp}`,
    armorClassLabel: Number.isFinite(engine.derivedStats.armorClass.value) ? `AC ${engine.derivedStats.armorClass.value}` : undefined,
    pendingChoices: progression.pendingChoiceCount,
    unsupportedManualRules,
    missingSpellComponents,
    depletedResources,
    topNotes: topKnownNotes({
      pendingChoices: progression.pendingChoiceCount,
      unsupportedManualRules,
      missingSpellComponents,
      depletedResources,
    }),
    pendingPreview: progression.pendingChoices[0]?.label ?? progression.ruleChoices.find((entry) => entry.status !== "complete")?.label,
    manualPreview:
      progression.missingCapabilities.find((entry) => entry.status === "unsupported")?.detail ??
      engine.actionResources.pending[0]?.description ??
      engine.derivedStats.notes[0] ??
      engine.ruleEngine.optionScoped.diagnostics.find((entry) => entry.status === "unsupported")?.message,
    componentPreview: inventory.neededSpellComponents.find((entry) => entry.status === "missing")?.spellName,
  };
}

export function buildPartySessionReadiness(
  party: PartyState | undefined,
  characters: CharacterDraft[],
  options: {
    partyId: string;
  },
): PartySessionReadinessViewModel {
  const orderedIds = party?.characterIds ?? characters.map((entry) => entry.id);
  const characterById = new Map(characters.map((entry) => [entry.id, entry]));
  const readinessCharacters = orderedIds
    .map((id) => characterById.get(id))
    .filter((entry): entry is CharacterDraft => Boolean(entry))
    .map((entry) => buildPartyCharacterReadiness(entry, options));

  const knownGaps: PartyKnownGapViewModel[] = [];
  for (const character of readinessCharacters) {
    if (character.pendingChoices > 0) {
      knownGaps.push({
        id: `gap:${character.id}:pending`,
        label: `${character.name}: choices still pending`,
        detail: `${character.pendingChoices} builder or level-up choice${character.pendingChoices === 1 ? "" : "s"} still need attention before play.${character.pendingPreview ? ` First issue: ${character.pendingPreview}.` : ""}`,
        characterId: character.id,
        characterName: character.name,
      });
    }
    if (character.unsupportedManualRules > 0) {
      knownGaps.push({
        id: `gap:${character.id}:manual`,
        label: `${character.name}: manual table handling remains`,
        detail: `${character.unsupportedManualRules} rule or automation gap${character.unsupportedManualRules === 1 ? "" : "s"} still need manual handling during play.${character.manualPreview ? ` Example: ${character.manualPreview}` : ""}`,
        characterId: character.id,
        characterName: character.name,
      });
    }
    if (character.missingSpellComponents > 0) {
      knownGaps.push({
        id: `gap:${character.id}:components`,
        label: `${character.name}: spell materials missing`,
        detail: `${character.missingSpellComponents} prepared spell component${character.missingSpellComponents === 1 ? "" : "s"} are missing from inventory.${character.componentPreview ? ` First spell: ${character.componentPreview}.` : ""}`,
        characterId: character.id,
        characterName: character.name,
      });
    }
  }

  return {
    memberCount: readinessCharacters.length,
    characters: readinessCharacters,
    knownGaps,
  };
}
