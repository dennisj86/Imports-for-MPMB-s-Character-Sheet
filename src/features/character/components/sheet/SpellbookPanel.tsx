import { useMemo, useState } from "react";
import type { SpellDefinition } from "../../../../domain/content";
import type { RollMode, RollRequest } from "../../../../domain/rolls";
import type { SpellbookViewModel, SpellCardViewModel } from "../../viewModels/spellbookViewModel";
import type { CastSpellOptions, PlaySpellSlotCounter } from "../../../../services/playState";
import { createActiveEffectFromSpell } from "../../../../services/rules";

interface SpellbookPanelProps {
  viewModel: SpellbookViewModel;
  slots: PlaySpellSlotCounter[];
  onCastSpell: (spellId: string, options?: CastSpellOptions) => void;
  onSpendSlot: (slotKey: string, amount?: number) => void;
  onRestoreSlot: (slotKey: string, amount?: number) => void;
  onRoll: (request: RollRequest) => void;
}

function modifierLabel(value: number | undefined): string {
  if (value === undefined) {
    return "Pending";
  }
  return value >= 0 ? `+${value}` : `${value}`;
}

function defaultSlotLevel(spell: SpellCardViewModel, slots: PlaySpellSlotCounter[]): number | undefined {
  if (spell.level <= 0) {
    return undefined;
  }
  return slots.filter((slot) => slot.level >= spell.level && slot.remaining > 0)[0]?.level;
}

function SpellSlotOverview({
  slots,
  onSpendSlot,
  onRestoreSlot,
}: Pick<SpellbookPanelProps, "slots" | "onSpendSlot" | "onRestoreSlot">) {
  if (slots.length === 0) {
    return <p className="rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-500">No spell slots available.</p>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {slots.map((slot) => (
        <div key={slot.slotKey} className="rounded border border-slate-200 p-2 text-sm">
          <p className="text-xs uppercase text-slate-500">Slot L{slot.level}</p>
          <p className="font-semibold">
            {slot.remaining} / {slot.max}
          </p>
          <div className="mt-2 flex gap-1">
            <button className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800" onClick={() => onRestoreSlot(slot.slotKey, 1)} type="button">
              +1
            </button>
            <button className="rounded bg-slate-700 px-2 py-1 text-xs text-white" onClick={() => onSpendSlot(slot.slotKey, 1)} type="button">
              -1
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SpellbookPanel({
  viewModel,
  slots,
  onCastSpell,
  onSpendSlot,
  onRestoreSlot,
  onRoll,
}: SpellbookPanelProps) {
  const [slotSelectionBySpellId, setSlotSelectionBySpellId] = useState<Record<string, number>>({});
  const [ritualCastBySpellId, setRitualCastBySpellId] = useState<Record<string, boolean>>({});
  const [selfTargetBySpellId, setSelfTargetBySpellId] = useState<Record<string, boolean>>({});
  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const slotsByLevel = useMemo(() => new Map(slots.map((slot) => [slot.level, slot])), [slots]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase text-slate-500">Ability</p>
          <p className="font-medium">{viewModel.abilityLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Save DC</p>
          <p className="font-medium">{viewModel.spellSaveDc ?? "None"}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Spell Attack</p>
          <p className="font-medium">{modifierLabel(viewModel.spellAttackModifier)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Mode</p>
          <p className="font-medium capitalize">{viewModel.preparationLabel}</p>
        </div>
      </div>

      <SpellSlotOverview slots={slots} onRestoreSlot={onRestoreSlot} onSpendSlot={onSpendSlot} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase text-slate-500">Prepared / Known Spells</p>
        <label className="text-sm text-slate-700">
          Roll Mode{" "}
          <select
            className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            onChange={(event) => setRollMode(event.target.value as RollMode)}
            value={rollMode}
          >
            <option value="normal">Normal</option>
            <option value="advantage">Advantage</option>
            <option value="disadvantage">Disadvantage</option>
          </select>
        </label>
      </div>

      {viewModel.spells.length === 0 ? (
        <p className="text-sm text-slate-500">No spells selected.</p>
      ) : (
        <ul className="space-y-3">
          {viewModel.spells.map((spell) => {
            const availableSlots = slots.filter((slot) => slot.level >= spell.level && slot.remaining > 0);
            const storedLevel = slotSelectionBySpellId[spell.id];
            const selectedLevel = storedLevel && availableSlots.some((slot) => slot.level === storedLevel)
              ? storedLevel
              : defaultSlotLevel(spell, slots);
            const selectedSlot = selectedLevel ? slotsByLevel.get(selectedLevel) : undefined;
            const ritual = ritualCastBySpellId[spell.id] ?? false;
            const spellForEffect: SpellDefinition = {
              id: spell.id,
              key: spell.id,
              name: spell.name,
              sourceRefs: [],
              level: spell.level,
              concentration: spell.concentration,
              ritual: spell.ritual,
              classes: [],
              description: spell.details ?? spell.summary,
            };
            const activeEffect = createActiveEffectFromSpell(spellForEffect);
            const canApplyEffectToSelf = Boolean(activeEffect);
            const selfTarget = selfTargetBySpellId[spell.id] ?? true;
            const castMode = spell.level <= 0 ? "cantrip" : ritual ? "ritual" : "slot";
            const canCast = castMode === "cantrip" || castMode === "ritual" || Boolean(selectedSlot && selectedSlot.remaining > 0);
            const rollRequest = spell.rollDescriptor?.rollRequest;
            const damageRequest = spell.rollDescriptor?.damageRequest;
            return (
              <li key={spell.id} className="rounded border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{spell.name}</p>
                    <p className="text-xs text-slate-600">
                      {spell.levelLabel}
                      {spell.school ? ` · ${spell.school}` : ""}
                      {spell.castingTime ? ` · ${spell.castingTime}` : ""}
                      {spell.range ? ` · ${spell.range}` : ""}
                      {spell.duration ? ` · ${spell.duration}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {spell.categories.map((category) => (
                        <span key={category} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {category}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-slate-700">{spell.summary}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                      {spell.spellAttackModifier !== undefined ? <span>Spell Attack {modifierLabel(spell.spellAttackModifier)}</span> : null}
                      {spell.spellSaveDc ? <span>Save DC {spell.spellSaveDc}{spell.saveAbility ? ` · ${spell.saveAbility.toUpperCase()}` : ""}</span> : null}
                      {spell.damageFormula ? <span>Damage {spell.damageFormula}</span> : null}
                      {spell.healingFormula ? <span>Healing {spell.healingFormula}</span> : null}
                    </div>
                  </div>

                  <div className="min-w-40 space-y-2">
                    {spell.level > 0 ? (
                      <div className="grid gap-2">
                        <select
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                          disabled={ritual || availableSlots.length === 0}
                          onChange={(event) =>
                            setSlotSelectionBySpellId((current) => ({
                              ...current,
                              [spell.id]: Number(event.target.value),
                            }))
                          }
                          value={selectedLevel ?? ""}
                        >
                          {availableSlots.length === 0 ? <option value="">No slots available</option> : null}
                          {availableSlots.map((slot) => (
                            <option key={slot.slotKey} value={slot.level}>
                              Slot L{slot.level} ({slot.remaining}/{slot.max})
                            </option>
                          ))}
                        </select>
                        {spell.ritual ? (
                          <label className="flex items-center gap-1 text-xs text-slate-700">
                            <input
                              checked={ritual}
                              onChange={(event) =>
                                setRitualCastBySpellId((current) => ({
                                  ...current,
                                  [spell.id]: event.target.checked,
                                }))
                              }
                              type="checkbox"
                            />
                            Ritual
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                    {canApplyEffectToSelf ? (
                      <label className="flex items-center gap-1 text-xs text-slate-700">
                        <input
                          checked={selfTarget}
                          onChange={(event) =>
                            setSelfTargetBySpellId((current) => ({
                              ...current,
                              [spell.id]: event.target.checked,
                            }))
                          }
                          type="checkbox"
                        />
                        Apply effect to self
                      </label>
                    ) : null}
                    <button
                      className="w-full rounded bg-indigo-700 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={!canCast}
                      onClick={() =>
                        onCastSpell(spell.id, {
                          slotLevel: selectedLevel,
                          ritualCast: ritual,
                          activeEffectTarget: canApplyEffectToSelf && selfTarget ? "self" : undefined,
                          concentrationNotes: canApplyEffectToSelf && selfTarget ? "Target: Self" : undefined,
                        })
                      }
                      type="button"
                    >
                      Cast
                    </button>
                    <div className="flex flex-wrap gap-1">
                      {rollRequest ? (
                        <button
                          className="rounded bg-slate-700 px-2 py-1 text-xs text-white"
                          onClick={() => onRoll({ ...rollRequest, rollMode })}
                          type="button"
                        >
                          Roll Attack
                        </button>
                      ) : null}
                      {damageRequest ? (
                        <button
                          className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800"
                          onClick={() => onRoll({ ...damageRequest, rollMode: "normal" })}
                          type="button"
                        >
                          Roll Damage
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                {spell.details ? (
                  <details className="mt-2 text-xs text-slate-600">
                    <summary className="cursor-pointer text-slate-700">Details</summary>
                    <p className="mt-1 whitespace-pre-wrap">{spell.details}</p>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
