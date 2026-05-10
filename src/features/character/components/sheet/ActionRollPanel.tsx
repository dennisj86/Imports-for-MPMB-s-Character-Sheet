import { useMemo, useState } from "react";
import type { PlayResourceCounter } from "../../../../services/playState";
import type { CharacterRollView, RollActionDescriptor, RollMode, RollRequest, RollResult } from "../../../../domain/rolls";
import { activeEffectsForRollType } from "../../../../services/rules";

interface ActionRollPanelProps {
  rollView: CharacterRollView;
  lastRoll?: RollResult;
  resources: PlayResourceCounter[];
  showSpellRolls?: boolean;
  onRoll: (request: RollRequest, options?: { spendResourceKey?: string; resourceLabel?: string }) => void;
  onSpendResource: (resourceKey: string, amount?: number, label?: string) => void;
}

function modifierLabel(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function modeLabel(mode: RollMode): string {
  if (mode === "advantage") return "Advantage";
  if (mode === "disadvantage") return "Disadvantage";
  return "Normal";
}

function RollButton({
  request,
  rollMode,
  children,
  onRoll,
  disabled,
}: {
  request: RollRequest;
  rollMode: RollMode;
  children: string;
  onRoll: (request: RollRequest) => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="rounded bg-slate-700 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      disabled={disabled}
      onClick={() => onRoll({ ...request, rollMode })}
      type="button"
    >
      {children}
    </button>
  );
}

function LastRollCard({ result }: { result?: RollResult }) {
  if (!result) {
    return <p className="rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-500">No rolls yet.</p>;
  }
  const rawRolls = result.dice.rawRolls.join(", ");
  return (
    <div className="rounded border border-indigo-200 bg-indigo-50 p-3">
      <p className="text-xs uppercase text-indigo-700">Last Roll</p>
      <p className="text-sm font-semibold text-slate-900">{result.label}</p>
      <p className="text-sm text-slate-800">
        {modeLabel(result.rollMode)} · {result.diceExpression} {modifierLabel(result.modifier)} = <span className="font-semibold">{result.total}</span>
      </p>
      {result.bonusDice?.length ? (
        <p className="text-xs text-slate-600">
          Bonus: {result.bonusDice.map((entry) => `${entry.expression}=${entry.total}`).join(", ")}
        </p>
      ) : null}
      {rawRolls ? <p className="text-xs text-slate-600">Dice: {rawRolls}{result.dice.keptRoll ? ` · kept ${result.dice.keptRoll}` : ""}</p> : null}
      {result.outcomeLabel && result.outcomeLabel !== "normal" ? <p className="text-xs text-amber-700">{result.outcomeLabel}</p> : null}
    </div>
  );
}

function RequestGrid({
  title,
  requests,
  rollMode,
  onRoll,
}: {
  title: string;
  requests: RollRequest[];
  rollMode: RollMode;
  onRoll: (request: RollRequest) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase text-slate-500">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {requests.map((request) => (
          <button
            key={request.id}
            className="flex items-center justify-between rounded border border-slate-200 px-2 py-1.5 text-left text-sm hover:bg-slate-50"
            onClick={() => onRoll({ ...request, rollMode })}
            type="button"
          >
            <span>{request.label}</span>
            <span className="font-medium">{modifierLabel(request.modifier)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionDescriptorRow({
  descriptor,
  rollMode,
  resourceById,
  onRoll,
  onSpendResource,
}: {
  descriptor: RollActionDescriptor;
  rollMode: RollMode;
  resourceById: Map<string, PlayResourceCounter>;
  onRoll: ActionRollPanelProps["onRoll"];
  onSpendResource: ActionRollPanelProps["onSpendResource"];
}) {
  const singleResourceId = descriptor.resourceIds.length === 1 ? descriptor.resourceIds[0] : undefined;
  const resource = singleResourceId ? resourceById.get(singleResourceId) : undefined;
  const canSpend = Boolean(resource && resource.remaining > 0);
  const ambiguousResources = descriptor.resourceIds.length > 1;
  const rollRequest = descriptor.rollRequest;

  return (
    <li className="rounded border border-slate-200 p-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{descriptor.label}</p>
          <p className="text-xs text-slate-600">
            {descriptor.activationType ?? "action"}
            {descriptor.sourceSummary ? ` · ${descriptor.sourceSummary}` : ""}
            {descriptor.rollRequest ? ` · attack ${modifierLabel(descriptor.rollRequest.modifier)}` : ""}
          </p>
          {descriptor.spellSaveDc ? (
            <p className="text-xs text-slate-700">
              Save DC {descriptor.spellSaveDc}{descriptor.spellSaveAbility ? ` · ${descriptor.spellSaveAbility.toUpperCase()}` : ""}
            </p>
          ) : null}
          {descriptor.damageRequest ? <p className="text-xs text-slate-700">Damage {descriptor.damageRequest.diceExpression}</p> : null}
          {descriptor.mappingBadges?.length ? <p className="text-xs text-slate-600">{descriptor.mappingBadges.join(" · ")}</p> : null}
          {resource ? <p className="text-xs text-slate-600">Resource: {resource.name} ({resource.remaining}/{resource.max})</p> : null}
          {ambiguousResources ? <p className="text-xs text-amber-700">Multiple resources linked; spend manually.</p> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {rollRequest ? (
            <RollButton request={rollRequest} rollMode={rollMode} onRoll={(request) => onRoll(request)}>
              Roll
            </RollButton>
          ) : null}
          {descriptor.damageRequest ? (
            <RollButton request={descriptor.damageRequest} rollMode="normal" onRoll={(request) => onRoll(request)}>
              Damage
            </RollButton>
          ) : null}
          {rollRequest && singleResourceId ? (
            <button
              className="rounded bg-indigo-700 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canSpend}
              onClick={() => onRoll({ ...rollRequest, rollMode }, { spendResourceKey: singleResourceId, resourceLabel: resource?.name })}
              type="button"
            >
              Roll + Spend
            </button>
          ) : null}
          {!rollRequest && singleResourceId ? (
            <button
              className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled={!canSpend}
              onClick={() => onSpendResource(singleResourceId, 1, resource?.name)}
              type="button"
            >
              Spend
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ActionRollPanel({ rollView, lastRoll, resources, showSpellRolls = true, onRoll, onSpendResource }: ActionRollPanelProps) {
  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [selectedEffectIds, setSelectedEffectIds] = useState<string[]>([]);
  const resourceById = useMemo(() => new Map(resources.map((resource) => [resource.id, resource])), [resources]);
  const actionableSpells = rollView.spellRolls.filter((entry) => entry.rollRequest || entry.damageRequest || entry.spellSaveDc);
  const activeEffects = rollView.activeEffects?.filter((effect) => effect.status === "active") ?? [];
  const applySelectedEffects = (request: RollRequest): RollRequest => {
    const applicable = activeEffectsForRollType(activeEffects, request.type).filter((effect) => selectedEffectIds.includes(effect.id));
    const temporaryModifiers = applicable.flatMap((effect) => effect.modifiers);
    return {
      ...request,
      temporaryModifiers: [...(request.temporaryModifiers ?? []), ...temporaryModifiers],
      selectedActiveEffectIds: Array.from(new Set([...(request.selectedActiveEffectIds ?? []), ...applicable.map((effect) => effect.id)])),
    };
  };
  const rollWithEffects: ActionRollPanelProps["onRoll"] = (request, options) => onRoll(applySelectedEffects(request), options);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
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

      <LastRollCard result={lastRoll} />

      {activeEffects.length > 0 ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-2">
          <p className="mb-1 text-xs font-medium uppercase text-slate-500">Optional Active Effects</p>
          <div className="flex flex-wrap gap-2">
            {activeEffects.map((effect) => (
              <label key={effect.id} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                <input
                  checked={selectedEffectIds.includes(effect.id)}
                  onChange={(event) =>
                    setSelectedEffectIds((current) =>
                      event.target.checked ? Array.from(new Set([...current, effect.id])) : current.filter((id) => id !== effect.id),
                    )
                  }
                  type="checkbox"
                />
                {effect.sourceName}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <RequestGrid title="Ability Checks" requests={rollView.abilityChecks} rollMode={rollMode} onRoll={(request) => rollWithEffects(request)} />
      <RequestGrid title="Saving Throws" requests={rollView.savingThrows} rollMode={rollMode} onRoll={(request) => rollWithEffects(request)} />
      <RequestGrid title="Skill Checks" requests={rollView.skillChecks} rollMode={rollMode} onRoll={(request) => rollWithEffects(request)} />

      <div>
        <p className="mb-2 text-xs font-medium uppercase text-slate-500">Action Rolls</p>
        {rollView.actionRolls.length === 0 ? (
          <p className="text-sm text-slate-500">No action entries resolved.</p>
        ) : (
          <ul className="space-y-2">
            {rollView.actionRolls.map((descriptor) => (
              <ActionDescriptorRow
                key={descriptor.id}
                descriptor={descriptor}
                onRoll={rollWithEffects}
                onSpendResource={onSpendResource}
                resourceById={resourceById}
                rollMode={rollMode}
              />
            ))}
          </ul>
        )}
      </div>

      {showSpellRolls ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase text-slate-500">Spell Rolls</p>
          {actionableSpells.length === 0 ? (
            <p className="text-sm text-slate-500">Spell roll actions appear when a selected spell has an attack, save, or damage context.</p>
          ) : (
            <ul className="space-y-2">
              {actionableSpells.map((descriptor) => (
                <ActionDescriptorRow
                  key={descriptor.id}
                  descriptor={descriptor}
                  onRoll={rollWithEffects}
                  onSpendResource={onSpendResource}
                  resourceById={resourceById}
                  rollMode={rollMode}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
