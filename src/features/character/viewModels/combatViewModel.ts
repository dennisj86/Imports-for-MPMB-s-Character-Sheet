import type { CharacterDraft } from "../../../domain/character";
import type { CharacterPlayState } from "../../../domain/playState";
import type { CharacterEngineState } from "../../../services/characterEngine";
import { resolveArmorClassFromEquipment, type ArmorClassBreakdown } from "../../../services/equipment";
import type { PlayHitDicePoolCounter } from "../../../services/playState";

export interface CoreStatCard {
  id: string;
  label: string;
  value: string;
  sublabel?: string;
}

export interface CombatViewModel {
  characterLine: string;
  originLine: string;
  armorClass: ArmorClassBreakdown;
  hitDiceSummary: string;
  passiveSummary: string;
  coreStats: CoreStatCard[];
}

function modifierLabel(value: number | undefined): string {
  if (value === undefined) {
    return "Pending";
  }
  return value >= 0 ? `+${value}` : `${value}`;
}

function movementLabel(engine: CharacterEngineState): string {
  const speed = engine.derivedStats.speed;
  const walking = speed.walking ? `${speed.walking} ft` : "Pending";
  const extras = [
    speed.climbing ? `Climb ${speed.climbing} ft` : undefined,
    speed.swimming ? `Swim ${speed.swimming} ft` : undefined,
    speed.flying ? `Fly ${speed.flying} ft` : undefined,
  ].filter((entry): entry is string => Boolean(entry));
  return extras.length ? `${walking} (${extras.join(", ")})` : walking;
}

function hitDiceSummary(pools: PlayHitDicePoolCounter[]): string {
  const remaining = pools.reduce((sum, pool) => sum + pool.remaining, 0);
  const max = pools.reduce((sum, pool) => sum + pool.max, 0);
  if (max <= 0) {
    return "Unavailable";
  }
  return `${remaining}/${max}`;
}

export function buildCombatViewModel(input: {
  draft: CharacterDraft;
  engine: CharacterEngineState;
  playState: CharacterPlayState;
  maxHp: number;
  hitDicePools: PlayHitDicePoolCounter[];
}): CombatViewModel {
  const { draft, engine, playState } = input;
  const derived = engine.derivedStats;
  const className = engine.classDef?.name ?? "Class pending";
  const subclassName = engine.subclassDef?.name;
  const characterLine = `${className}${subclassName ? ` (${subclassName})` : ""} · Level ${draft.classSelection.level}`;
  const originLine = [engine.speciesDef?.name, engine.backgroundDef?.name].filter(Boolean).join(" · ") || "Origin pending";
  const armorClass = resolveArmorClassFromEquipment({
    inventoryItems: draft.inventory.items,
    equipmentCatalog: engine.equipmentCatalog,
    dexModifier: derived.abilityScores.dex.modifier,
  });
  const hitDice = hitDiceSummary(input.hitDicePools);

  return {
    characterLine,
    originLine,
    armorClass,
    hitDiceSummary: hitDice,
    passiveSummary: `Perception ${derived.passivePerception} · Investigation ${derived.passiveInvestigation} · Insight ${derived.passiveInsight}`,
    coreStats: [
      {
        id: "ac",
        label: "Armor Class",
        value: String(armorClass.total),
        sublabel: armorClass.armorName ? armorClass.armorName : "Unarmored",
      },
      {
        id: "hp",
        label: "Hit Points",
        value: `${playState.currentHp}/${input.maxHp}`,
        sublabel: playState.tempHp > 0 ? `${playState.tempHp} temp` : "No temp HP",
      },
      {
        id: "initiative",
        label: "Initiative",
        value: modifierLabel(derived.initiative),
      },
      {
        id: "speed",
        label: "Speed",
        value: movementLabel(engine),
      },
      {
        id: "proficiency",
        label: "Proficiency",
        value: modifierLabel(derived.proficiencyBonus),
      },
      {
        id: "hit-dice",
        label: "Hit Dice",
        value: hitDice,
      },
      {
        id: "spell-save",
        label: "Spell Save DC",
        value: derived.spellcasting.spellSaveDC ? String(derived.spellcasting.spellSaveDC) : "None",
        sublabel: derived.spellcasting.ability?.toUpperCase(),
      },
      {
        id: "spell-attack",
        label: "Spell Attack",
        value: derived.spellcasting.spellAttackModifier === undefined ? "None" : modifierLabel(derived.spellcasting.spellAttackModifier),
      },
    ],
  };
}
