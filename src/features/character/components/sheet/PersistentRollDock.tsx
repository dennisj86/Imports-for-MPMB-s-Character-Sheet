import { useMemo, useState } from "react";
import type { CharacterPlayEvent } from "../../../../domain/playState";
import type { ActiveEffectState } from "../../../../domain/rules";
import type { RollMode, RollRequest, RollResult } from "../../../../domain/rolls";
import { parseDiceExpression } from "../../../../features/dice";
import { EmptyState, InfoPopover, RollResultCard, SectionHeader, StatusBadge } from "./SheetDesignSystem";
import { PlayLogPanel } from "./PlayLogPanel";
import { ruleInfo } from "./rulesInfo";

interface PersistentRollDockProps {
  className?: string;
  compact?: boolean;
  rollMode: RollMode;
  onRollModeChange: (mode: RollMode) => void;
  lastRoll?: RollResult;
  playEvents: CharacterPlayEvent[];
  activeEffects: ActiveEffectState[];
  selectedEffectIds: string[];
  onSelectedEffectIdsChange: (ids: string[]) => void;
  onRoll: (request: RollRequest) => void;
  onDismissEffect?: (effectId: string) => void;
}

const QUICK_DICE_EXPRESSIONS = ["d20", "1d4", "1d6", "1d8", "1d10", "1d12", "1d100"];

function normalizeDiceExpression(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function isD20Expression(expression: string): boolean {
  const normalized = normalizeDiceExpression(expression);
  return normalized === "d20" || normalized === "1d20";
}

function normalizedD20Expression(expression: string): string {
  return isD20Expression(expression) ? "1d20" : expression.trim();
}

function modifierLabel(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function PersistentRollDock({
  className,
  compact = false,
  rollMode,
  onRollModeChange,
  lastRoll,
  playEvents,
  activeEffects,
  selectedEffectIds,
  onSelectedEffectIdsChange,
  onRoll,
  onDismissEffect,
}: PersistentRollDockProps) {
  const [freeDiceExpression, setFreeDiceExpression] = useState("d20");
  const [freeDiceLabel, setFreeDiceLabel] = useState("");
  const [playLogOpen, setPlayLogOpen] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);

  const runningEffects = activeEffects.filter((effect) => effect.status === "active");
  const selectableEffects = runningEffects
    .filter((effect) => effect.status === "active")
    .filter((effect) => effect.applicableRollTypes.length > 0)
    .filter((effect) => effect.targets.includes("self") || effect.targets.includes("global"));
  const consumedEffects = activeEffects.filter(
    (effect) => effect.status !== "active" && (effect.durationType === "until-used" || effect.durationType === "one-roll"),
  );

  const freeDiceValidationError = useMemo(() => {
    const expression = normalizedD20Expression(freeDiceExpression);
    if (!expression) {
      return "Enter a dice expression.";
    }
    try {
      parseDiceExpression(expression);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid dice expression.";
    }
  }, [freeDiceExpression]);

  const rollFreeDice = () => {
    if (freeDiceValidationError) {
      return;
    }
    const expression = normalizedD20Expression(freeDiceExpression);
    const label = freeDiceLabel.trim() || `Free Roll (${expression})`;
    onRoll({
      id: `roll:free:${Date.now()}`,
      type: "custom",
      label,
      sourceType: "custom",
      sourceId: "free-dice",
      modifier: 0,
      diceExpression: expression,
      rollMode: isD20Expression(expression) ? rollMode : "normal",
      metadata: {
        utility: "free-dice",
      },
    });
  };

  const rollDeathSaveShortcut = () => {
    onRoll({
      id: `roll:free:death-save:${Date.now()}`,
      type: "death-save",
      label: "Death Save",
      sourceType: "custom",
      sourceId: "free-dice",
      modifier: 0,
      diceExpression: "1d20",
      rollMode,
      metadata: {
        utility: "death-save-shortcut",
      },
    });
  };

  const toggleSelectableEffect = (effectId: string, checked: boolean) => {
    onSelectedEffectIdsChange(
      checked ? Array.from(new Set([...selectedEffectIds, effectId])) : selectedEffectIds.filter((id) => id !== effectId),
    );
  };

  const dockBody = (
    <div className="space-y-3">
      <div className="sheet-card space-y-2 p-3">
        <SectionHeader title="Roll Mode" />
        <select
          aria-label="Select roll mode"
          className="sheet-no-overflow w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          onChange={(event) => onRollModeChange(event.target.value as RollMode)}
          value={rollMode}
        >
          <option value="normal">Normal</option>
          <option value="advantage">Advantage</option>
          <option value="disadvantage">Disadvantage</option>
        </select>
      </div>

      <div className="sheet-card space-y-2 p-3">
        <SectionHeader subtitle="Always available" title="Free Dice Roller" />
        <div className="grid gap-2">
          <input
            aria-label="Free dice formula"
            className="sheet-no-overflow w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            onChange={(event) => setFreeDiceExpression(event.target.value)}
            placeholder="d20, 2d6+3, 1d20+5"
            type="text"
            value={freeDiceExpression}
          />
          <input
            aria-label="Free roll label"
            className="sheet-no-overflow w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            onChange={(event) => setFreeDiceLabel(event.target.value)}
            placeholder="Optional custom label"
            type="text"
            value={freeDiceLabel}
          />
          <button
            aria-label="Roll free dice expression"
            className="sheet-focus-ring rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={Boolean(freeDiceValidationError)}
            onClick={rollFreeDice}
            title={freeDiceValidationError}
            type="button"
          >
            Roll
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_DICE_EXPRESSIONS.map((expression) => (
            <button
              key={`quick-die-${expression}`}
              aria-label={`Set free dice expression to ${expression}`}
              className={`sheet-focus-ring rounded px-2 py-1 text-xs ${normalizeDiceExpression(freeDiceExpression) === normalizeDiceExpression(expression) ? "bg-indigo-700 text-white" : "bg-slate-100 text-slate-700"}`}
              onClick={() => setFreeDiceExpression(expression)}
              type="button"
            >
              {expression}
            </button>
          ))}
          <button
            aria-label="Roll death save"
            className="sheet-focus-ring rounded bg-rose-700 px-2 py-1 text-xs text-white"
            onClick={rollDeathSaveShortcut}
            type="button"
          >
            Death Save
          </button>
        </div>
        {freeDiceValidationError ? <p className="text-xs text-rose-700">{freeDiceValidationError}</p> : null}
      </div>

      <RollResultCard result={lastRoll} />

      <div className="sheet-card bg-slate-50 p-2">
        <SectionHeader actions={<StatusBadge label={`${runningEffects.length} active`} status="complete" />} title="Active Buffs" />
        {runningEffects.length === 0 ? (
          <EmptyState title="Active Buffs" description="No active buffs are currently running." />
        ) : (
          <ul className="space-y-1">
            {runningEffects.map((effect) => (
              <li key={effect.id} className="sheet-card flex flex-wrap items-center justify-between gap-2 rounded bg-white px-2 py-1">
                <div className="text-xs text-slate-700">
                  <p className="font-medium text-slate-900">{effect.label}</p>
                  <p>
                    {effect.targets.join(", ")}
                    {effect.modifierSummary?.dice ? ` · ${effect.modifierSummary.dice}` : ""}
                    {effect.modifierSummary?.flat !== undefined ? ` · ${modifierLabel(effect.modifierSummary.flat)}` : ""}
                  </p>
                  {effect.note ? <p className="text-slate-600">{effect.note}</p> : null}
                </div>
                <div className="flex items-center gap-1">
                  <StatusBadge label={effect.durationType} status={effect.durationType === "until-used" || effect.durationType === "one-roll" ? "pending" : "info"} />
                  <InfoPopover title={effect.durationType} description={ruleInfo(effect.durationType)} />
                </div>
                {onDismissEffect ? (
                  <button
                    aria-label={`Dismiss active effect ${effect.label}`}
                    className="sheet-focus-ring rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-800"
                    onClick={() => onDismissEffect(effect.id)}
                    type="button"
                  >
                    Dismiss
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sheet-card bg-slate-50 p-2">
        <SectionHeader
          actions={<StatusBadge label={`${selectedEffectIds.length} selected`} status="info" />}
          subtitle="Checked effects apply to the next matching roll."
          title="Optional Buffs"
        />
        {selectableEffects.length === 0 ? (
          <EmptyState title="Optional Buffs" description="No optional buffs available for roll selection." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectableEffects.map((effect) => (
              <label key={effect.id} className="sheet-card flex items-center gap-1 rounded bg-white px-2 py-1 text-xs text-slate-700">
                <input
                  aria-label={`Apply effect ${effect.label} to next roll`}
                  checked={selectedEffectIds.includes(effect.id)}
                  onChange={(event) => toggleSelectableEffect(effect.id, event.target.checked)}
                  type="checkbox"
                />
                <span className="font-medium text-slate-900">{effect.label}</span>
                <StatusBadge label={effect.durationType} status={effect.durationType === "until-used" || effect.durationType === "one-roll" ? "pending" : "info"} />
              </label>
            ))}
          </div>
        )}
        {consumedEffects.length ? (
          <p className="text-xs text-slate-600">
            Consumed effects: {consumedEffects.map((effect) => effect.label).join(", ")}
          </p>
        ) : null}
      </div>

      <section className="sheet-card p-3">
        <SectionHeader
          actions={
            <button
              aria-expanded={playLogOpen}
              className="sheet-focus-ring rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-800"
              onClick={() => setPlayLogOpen((value) => !value)}
              type="button"
            >
              {playLogOpen ? "Hide Log" : "Show Log"}
            </button>
          }
          title="Play Log"
        />
        {playLogOpen ? <div className="mt-2"><PlayLogPanel events={playEvents} /></div> : <p className="mt-2 text-xs text-slate-600">Recent entries are hidden by default.</p>}
      </section>
    </div>
  );

  return (
    <aside className={`sheet-card sheet-elevation-2 min-w-0 space-y-3 p-3 ${className ?? ""}`.trim()}>
      <SectionHeader
        actions={compact ? <StatusBadge label={lastRoll ? `Last ${lastRoll.total}` : "No roll"} status="info" /> : undefined}
        subtitle="Free roller, latest result, buffs and play log stay in reach."
        title="Persistent Roll Dock"
      />
      {compact ? (
        <div className="space-y-2">
          <button
            aria-expanded={compactOpen}
            aria-label="Toggle roll dock details"
            className="sheet-focus-ring w-full rounded bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={() => setCompactOpen((value) => !value)}
            type="button"
          >
            {compactOpen ? "Hide Roll Tools" : "Show Roll Tools"}
          </button>
          {compactOpen ? dockBody : null}
        </div>
      ) : (
        dockBody
      )}
    </aside>
  );
}
