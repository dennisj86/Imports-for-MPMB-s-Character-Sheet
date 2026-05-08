import { useMemo, useState } from "react";
import type { SpellDefinition } from "../../../../domain/content";
import type { CastSpellOptions, PlaySpellSlotCounter } from "../../../../services/playState";

interface SpellSlotTrackerProps {
  slots: PlaySpellSlotCounter[];
  selectedSpells: SpellDefinition[];
  onSpendSlot: (slotKey: string, amount?: number) => void;
  onRestoreSlot: (slotKey: string, amount?: number) => void;
  onCastSpell: (spellId: string, options?: CastSpellOptions) => void;
}

function defaultSlotLevel(spell: SpellDefinition, slots: PlaySpellSlotCounter[]): number | undefined {
  if (spell.level <= 0) {
    return undefined;
  }
  const eligible = slots.filter((slot) => slot.level >= spell.level && slot.remaining > 0);
  return eligible[0]?.level;
}

export function SpellSlotTracker({
  slots,
  selectedSpells,
  onSpendSlot,
  onRestoreSlot,
  onCastSpell,
}: SpellSlotTrackerProps) {
  const [slotSelectionBySpellId, setSlotSelectionBySpellId] = useState<Record<string, number>>({});
  const [ritualCastBySpellId, setRitualCastBySpellId] = useState<Record<string, boolean>>({});

  const slotsByLevel = useMemo(() => {
    const byLevel = new Map<number, PlaySpellSlotCounter>();
    for (const slot of slots) {
      byLevel.set(slot.level, slot);
    }
    return byLevel;
  }, [slots]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {slots.length === 0 ? (
          <p className="text-sm text-slate-500">No spell slots available.</p>
        ) : (
          slots.map((slot) => (
            <div key={slot.slotKey} className="rounded border border-slate-200 p-2 text-sm">
              <p className="text-xs uppercase text-slate-500">Slot L{slot.level}</p>
              <p className="font-semibold">
                {slot.remaining} / {slot.max}
              </p>
              <p className="text-xs text-slate-600">{slot.rechargeLabel}</p>
              <div className="mt-2 flex gap-1">
                <button className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800" onClick={() => onRestoreSlot(slot.slotKey, 1)} type="button">
                  +1
                </button>
                <button className="rounded bg-slate-700 px-2 py-1 text-xs text-white" onClick={() => onSpendSlot(slot.slotKey, 1)} type="button">
                  -1
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase text-slate-500">Cast Selected Spells</p>
        {selectedSpells.length === 0 ? (
          <p className="text-sm text-slate-500">No selected spells.</p>
        ) : (
          <ul className="space-y-2">
            {selectedSpells.map((spell) => {
              const eligibleSlots = slots.filter((slot) => slot.level >= spell.level);
              const availableSlots = eligibleSlots.filter((slot) => slot.remaining > 0);
              const storedLevel = slotSelectionBySpellId[spell.id];
              const storedLevelAvailable = storedLevel !== undefined && availableSlots.some((slot) => slot.level === storedLevel);
              const selectedLevel = storedLevelAvailable ? storedLevel : defaultSlotLevel(spell, availableSlots);
              const selectedSlot = selectedLevel ? slotsByLevel.get(selectedLevel) : undefined;
              const ritual = ritualCastBySpellId[spell.id] ?? false;
              const castMode = spell.level <= 0 ? "cantrip" : ritual ? "ritual" : "slot";
              const noSlotAvailable = castMode === "slot" && availableSlots.length === 0;
              const canCastWithSlot = castMode === "cantrip" || castMode === "ritual" || (selectedSlot ? selectedSlot.remaining > 0 : false);
              return (
                <li key={spell.id} className="rounded border border-slate-200 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {spell.name} {spell.level === 0 ? "(Cantrip)" : `(L${spell.level})`}
                      </p>
                      <p className="text-xs text-slate-600">
                        {spell.castingTime ?? "Unknown cast time"}
                        {spell.concentration ? " · Concentration" : ""}
                        {spell.ritual ? " · Ritual" : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {castMode === "cantrip" ? "Cantrip cast" : castMode === "ritual" ? "Ritual cast: no slot" : "Slot cast"}
                      </p>
                    </div>
                    <button
                      className="rounded bg-indigo-700 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={!canCastWithSlot}
                      onClick={() =>
                        onCastSpell(spell.id, {
                          slotLevel: selectedLevel,
                          ritualCast: ritual,
                        })
                      }
                      type="button"
                    >
                      Cast
                    </button>
                  </div>

                  {spell.level > 0 ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr,auto]">
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
                  {noSlotAvailable ? <p className="mt-2 text-xs text-amber-700">No available slot for this spell.</p> : null}
                  {spell.concentration ? <p className="mt-1 text-xs text-slate-500">Casting this can start or replace concentration.</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
