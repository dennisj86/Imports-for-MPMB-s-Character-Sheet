import type { SpellDefinition } from "../../../domain/content";
import type { AbilityKey } from "../../../domain/derivedStats";
import type { RollActionDescriptor } from "../../../domain/rolls";
import type { CharacterEngineState } from "../../../services/characterEngine";
import { classifySpell, type SpellCategory } from "../../../services/spells";

export interface SpellCardViewModel {
  id: string;
  name: string;
  level: number;
  levelLabel: string;
  school?: string;
  castingTime?: string;
  range?: string;
  duration?: string;
  concentration: boolean;
  ritual: boolean;
  categories: SpellCategory[];
  saveAbility?: AbilityKey;
  spellSaveDc?: number;
  spellAttackModifier?: number;
  damageFormula?: string;
  healingFormula?: string;
  summary: string;
  details?: string;
  rollDescriptor?: RollActionDescriptor;
}

export interface SpellbookViewModel {
  available: boolean;
  abilityLabel: string;
  spellSaveDc?: number;
  spellAttackModifier?: number;
  preparationLabel: string;
  slotSummary: string;
  spells: SpellCardViewModel[];
}

function modifierLabel(value: number | undefined): string {
  if (value === undefined) {
    return "Pending";
  }
  return value >= 0 ? `+${value}` : `${value}`;
}

function levelLabel(spell: SpellDefinition): string {
  return spell.level === 0 ? "Cantrip" : `Level ${spell.level}`;
}

export function buildSpellbookViewModel(engine: CharacterEngineState, rollDescriptors: RollActionDescriptor[]): SpellbookViewModel {
  const descriptorBySpellId = new Map(rollDescriptors.map((entry) => [entry.sourceId ?? entry.id, entry]));
  const spellcasting = engine.derivedStats.spellcasting;
  const slots = Object.entries(engine.progression.spellProgression.spellSlots)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([slotLevel, count]) => `L${slotLevel}: ${count}`)
    .join(" · ");

  return {
    available: spellcasting.available,
    abilityLabel: spellcasting.ability ? spellcasting.ability.toUpperCase() : "None",
    spellSaveDc: spellcasting.spellSaveDC,
    spellAttackModifier: spellcasting.spellAttackModifier,
    preparationLabel: engine.progression.spellProgression.mode,
    slotSummary: slots || "No slot table resolved",
    spells: engine.selectedSpells
      .map((spell) => {
        const classification = classifySpell(spell);
        return {
          id: spell.id,
          name: spell.name,
          level: spell.level,
          levelLabel: levelLabel(spell),
          school: spell.school,
          castingTime: spell.castingTime,
          range: spell.range,
          duration: spell.duration,
          concentration: spell.concentration,
          ritual: spell.ritual,
          categories: classification.categories,
          saveAbility: classification.saveAbility,
          spellSaveDc: classification.saveAbility ? spellcasting.spellSaveDC : undefined,
          spellAttackModifier: classification.hasSpellAttack ? spellcasting.spellAttackModifier : undefined,
          damageFormula: classification.damageFormula,
          healingFormula: classification.healingFormula,
          summary: classification.summary,
          details: spell.description,
          rollDescriptor: descriptorBySpellId.get(spell.id),
        };
      })
      .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name)),
  };
}

export function spellAttackLabel(value: number | undefined): string {
  return modifierLabel(value);
}
