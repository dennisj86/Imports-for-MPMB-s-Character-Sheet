import { useMemo, useState } from "react";
import type { SpellDefinition } from "../../../../domain/content";
import type { RollMode, RollRequest } from "../../../../domain/rolls";
import type { SpellbookViewModel, SpellCardViewModel } from "../../viewModels/spellbookViewModel";
import type { CastSpellOptions, PlaySpellSlotCounter } from "../../../../services/playState";
import { createActiveEffectFromSpell } from "../../../../services/rules";
import { EmptyState, SectionHeader, SpellCardShell, StatusBadge } from "./SheetDesignSystem";

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
    return <EmptyState title="Spell Slots" description="No spell slots available." />;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {slots.map((slot) => (
        <div key={slot.slotKey} className="sheet-card p-2 text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Slot L{slot.level}</p>
          <p className="font-semibold text-slate-900">
            {slot.remaining} / {slot.max}
          </p>
          <div className="mt-2 flex gap-1">
            <button
              aria-label={`Restore one level ${slot.level} spell slot`}
              className="sheet-focus-ring rounded bg-slate-200 px-2 py-1 text-xs text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled={slot.remaining >= slot.max}
              onClick={() => onRestoreSlot(slot.slotKey, 1)}
              title={slot.remaining >= slot.max ? "Slot pool already full." : undefined}
              type="button"
            >
              +1
            </button>
            <button
              aria-label={`Spend one level ${slot.level} spell slot`}
              className="sheet-focus-ring rounded bg-slate-700 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={slot.remaining <= 0}
              onClick={() => onSpendSlot(slot.slotKey, 1)}
              title={slot.remaining <= 0 ? "No remaining slots in this pool." : undefined}
              type="button"
            >
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
  const [spellSearch, setSpellSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | "cantrip" | "leveled">("all");
  const [concentrationFilter, setConcentrationFilter] = useState<"all" | "concentration" | "no-concentration">("all");
  const slotsByLevel = useMemo(() => new Map(slots.map((slot) => [slot.level, slot])), [slots]);
  const normalizedSpellSearch = spellSearch.trim().toLowerCase();
  const filteredSpells = useMemo(
    () =>
      viewModel.spells.filter((spell) => {
        const searchMatch = normalizedSpellSearch.length === 0 || `${spell.name} ${spell.summary} ${spell.details ?? ""}`.toLowerCase().includes(normalizedSpellSearch);
        const levelMatch =
          levelFilter === "all"
            ? true
            : levelFilter === "cantrip"
              ? spell.level === 0
              : spell.level > 0;
        const concentrationMatch =
          concentrationFilter === "all"
            ? true
            : concentrationFilter === "concentration"
              ? spell.concentration
              : !spell.concentration;
        return searchMatch && levelMatch && concentrationMatch;
      }),
    [concentrationFilter, levelFilter, normalizedSpellSearch, viewModel.spells],
  );

  return (
    <div className="space-y-4">
      <div className="sheet-card grid gap-2 border-indigo-200 bg-indigo-50/60 p-3 text-sm sm:grid-cols-4">
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
        <SectionHeader
          actions={<StatusBadge label={`${filteredSpells.length} shown`} status="info" />}
          subtitle="Prepared and known spell list"
          title="Spells"
        />
        <label className="text-sm text-slate-700">
          Roll Mode{" "}
          <select
            aria-label="Select spell roll mode"
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

      <div className="sheet-card grid gap-2 p-3 md:grid-cols-[minmax(0,2fr),repeat(2,minmax(0,1fr))]">
        <input
          aria-label="Search spells"
          className="sheet-no-overflow w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          onChange={(event) => setSpellSearch(event.target.value)}
          placeholder="Search spells, summaries, details..."
          type="search"
          value={spellSearch}
        />
        <select
          aria-label="Filter spells by level"
          className="sheet-no-overflow rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          onChange={(event) => setLevelFilter(event.target.value as "all" | "cantrip" | "leveled")}
          value={levelFilter}
        >
          <option value="all">All Levels</option>
          <option value="cantrip">Cantrips</option>
          <option value="leveled">Leveled</option>
        </select>
        <select
          aria-label="Filter spells by concentration requirement"
          className="sheet-no-overflow rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          onChange={(event) => setConcentrationFilter(event.target.value as "all" | "concentration" | "no-concentration")}
          value={concentrationFilter}
        >
          <option value="all">All Concentration States</option>
          <option value="concentration">Concentration</option>
          <option value="no-concentration">No Concentration</option>
        </select>
      </div>

      {viewModel.spells.length === 0 ? (
        <EmptyState title="Spellbook" description="No spells selected." />
      ) : filteredSpells.length === 0 ? (
        <EmptyState title="Spell Search" description="No spells match the current filters." />
      ) : (
        <ul className="space-y-3">
          {filteredSpells.map((spell) => {
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
            const castDisabledReason =
              castMode === "slot" && !canCast
                ? "No available spell slot for this spell level."
                : undefined;
            const rollRequest = spell.rollDescriptor?.rollRequest;
            const damageRequest = spell.rollDescriptor?.damageRequest;
            return (
              <li key={spell.id}>
                <SpellCardShell
                  title={spell.name}
                  subtitle={`${spell.levelLabel}${spell.school ? ` · ${spell.school}` : ""}${spell.castingTime ? ` · ${spell.castingTime}` : ""}${spell.range ? ` · ${spell.range}` : ""}${spell.duration ? ` · ${spell.duration}` : ""}`}
                  tags={
                    <>
                      {spell.categories.map((category) => (
                        <StatusBadge key={category} label={category} status="info" />
                      ))}
                      {spell.concentration ? <StatusBadge label="concentration" status="pending" /> : null}
                      {spell.ritual ? <StatusBadge label="ritual" status="complete" /> : null}
                      <StatusBadge label={canApplyEffectToSelf ? "effect mapped" : "no mapped effect"} status={canApplyEffectToSelf ? "complete" : "unsupported"} />
                    </>
                  }
                  controls={
                    <>
                      {spell.level > 0 ? (
                        <div className="grid gap-2">
                          <select
                            aria-label={`Choose spell slot level for ${spell.name}`}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                            disabled={ritual || availableSlots.length === 0}
                            title={ritual ? "Ritual casting does not consume a slot." : availableSlots.length === 0 ? "No slot available for this spell." : undefined}
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
                                aria-label={`Toggle ritual cast for ${spell.name}`}
                                checked={ritual}
                                onChange={(event) =>
                                  setRitualCastBySpellId((current) => ({
                                    ...current,
                                    [spell.id]: event.target.checked,
                                  }))
                                }
                                type="checkbox"
                              />
                              Ritual Cast
                            </label>
                          ) : null}
                        </div>
                      ) : null}
                      {canApplyEffectToSelf ? (
                        <label className="flex items-center gap-1 text-xs text-slate-700">
                          <input
                            aria-label={`Apply ${spell.name} active effect to self`}
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
                        aria-label={`Cast ${spell.name}`}
                        className="sheet-focus-ring w-full rounded bg-indigo-700 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                        disabled={!canCast}
                        title={castDisabledReason}
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
                            aria-label={`Roll spell attack for ${spell.name}`}
                            className="sheet-focus-ring rounded bg-slate-700 px-2 py-1 text-xs text-white"
                            onClick={() => onRoll({ ...rollRequest, rollMode })}
                            type="button"
                          >
                            Roll Attack
                          </button>
                        ) : null}
                        {damageRequest ? (
                          <button
                            aria-label={`Roll spell damage for ${spell.name}`}
                            className="sheet-focus-ring rounded bg-slate-200 px-2 py-1 text-xs text-slate-800"
                            onClick={() => onRoll({ ...damageRequest, rollMode: "normal" })}
                            type="button"
                          >
                            Roll Damage
                          </button>
                        ) : null}
                      </div>
                    </>
                  }
                >
                  <p className="text-sm text-slate-700">{spell.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
                    {spell.spellAttackModifier !== undefined ? <span>Spell Attack {modifierLabel(spell.spellAttackModifier)}</span> : null}
                    {spell.spellSaveDc ? <span>Save DC {spell.spellSaveDc}{spell.saveAbility ? ` · ${spell.saveAbility.toUpperCase()}` : ""}</span> : null}
                    {spell.damageFormula ? <span>Damage {spell.damageFormula}</span> : null}
                    {spell.healingFormula ? <span>Healing {spell.healingFormula}</span> : null}
                  </div>
                  {spell.details ? (
                    <details className="mt-2 text-xs text-slate-600">
                      <summary aria-label={`Show details for ${spell.name}`} className="cursor-pointer text-slate-700">Details</summary>
                      <p className="mt-1 whitespace-pre-wrap">{spell.details}</p>
                    </details>
                  ) : null}
                </SpellCardShell>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
