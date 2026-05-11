import { useMemo, useState } from "react";
import type { ActiveEffectCatalogEntry, ActiveEffectDefinition } from "../../../../domain/rules";
import type { CharacterRollView, RollActionDescriptor, RollMode, RollRequest, RollResult, RollType } from "../../../../domain/rolls";
import type { PlayResourceCounter } from "../../../../services/playState";
import { activeEffectsForRollType, searchActiveEffectCatalog, type ActiveEffectCatalogEffectFilter, type ActiveEffectCatalogSourceFilter } from "../../../../services/rules";

interface ActionRollPanelProps {
  rollView: CharacterRollView;
  lastRoll?: RollResult;
  resources: PlayResourceCounter[];
  activeEffectCatalog?: ActiveEffectCatalogEntry[];
  showSpellRolls?: boolean;
  onRoll: (request: RollRequest, options?: { spendResourceKey?: string; resourceLabel?: string }) => void;
  onSpendResource: (resourceKey: string, amount?: number, label?: string) => void;
  onActivateEffect?: (effect: ActiveEffectDefinition, options?: { external?: boolean; sourceCasterName?: string; note?: string; diceExpression?: string }) => void;
  onCreateCustomEffect?: (options: {
    name: string;
    applicableRollTypes: RollType[];
    dice?: string;
    flat?: number;
    durationType?: "manual" | "until-used" | "one-roll";
    note?: string;
    sourceCasterName?: string;
  }) => void;
  onDismissEffect?: (effectId: string) => void;
}

const CUSTOM_ROLL_TYPE_OPTIONS: Array<{ value: RollType; label: string }> = [
  { value: "attack-roll", label: "Attack" },
  { value: "ability-check", label: "Ability" },
  { value: "skill-check", label: "Skill" },
  { value: "saving-throw", label: "Save" },
  { value: "death-save", label: "Death Save" },
  { value: "custom", label: "Custom" },
];

const DIE_SIZE_OPTIONS = ["1d4", "1d6", "1d8", "1d10", "1d12"];

function modifierLabel(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function modeLabel(mode: RollMode): string {
  if (mode === "advantage") return "Advantage";
  if (mode === "disadvantage") return "Disadvantage";
  return "Normal";
}

function sourceFilterLabel(sourceFilter: ActiveEffectCatalogSourceFilter): string {
  if (sourceFilter === "spells") return "Spells";
  if (sourceFilter === "features") return "Features";
  if (sourceFilter === "items") return "Items";
  return "Custom";
}

function effectFilterLabel(effectFilter: ActiveEffectCatalogEffectFilter): string {
  if (effectFilter === "all") return "All Effects";
  if (effectFilter === "roll-bonus") return "Roll Bonus";
  if (effectFilter === "ac-bonus") return "AC Bonus";
  if (effectFilter === "advantage") return "Advantage";
  if (effectFilter === "disadvantage") return "Disadvantage";
  return "Note";
}

function sourceTypeLabel(sourceType: ActiveEffectCatalogEntry["sourceType"]): string {
  if (sourceType === "class-feature") return "Class Feature";
  if (sourceType === "subclass-feature") return "Subclass Feature";
  if (sourceType === "feat") return "Feat";
  if (sourceType === "item") return "Item";
  if (sourceType === "spell") return "Spell";
  if (sourceType === "custom") return "Custom";
  if (sourceType === "condition") return "Condition";
  if (sourceType === "species-feature") return "Species Feature";
  return "Background Feature";
}

function effectSummary(entry: Pick<ActiveEffectCatalogEntry, "effectType" | "modifier">): string {
  if (entry.effectType === "ac-bonus" && entry.modifier.flat !== undefined) {
    return `AC ${modifierLabel(entry.modifier.flat)}`;
  }
  if (entry.modifier.dice && entry.modifier.flat !== undefined) {
    return `${entry.modifier.dice} and ${modifierLabel(entry.modifier.flat)}`;
  }
  if (entry.modifier.dice) {
    return entry.modifier.dice;
  }
  if (entry.modifier.flat !== undefined) {
    return modifierLabel(entry.modifier.flat);
  }
  return entry.effectType;
}

function rollTypeLabel(rollType: RollType): string {
  if (rollType === "ability-check") return "Ability";
  if (rollType === "skill-check") return "Skill";
  if (rollType === "saving-throw") return "Save";
  if (rollType === "attack-roll") return "Attack";
  if (rollType === "spell-attack") return "Spell Attack";
  if (rollType === "death-save") return "Death Save";
  if (rollType === "damage-roll") return "Damage";
  return "Custom";
}

type WeaponProfileMetadata = {
  usageMode?: "melee" | "ranged" | "thrown" | "versatile-one-hand" | "versatile-two-hand";
  versatileDamageDice?: string;
  damageDice?: string;
};

function firstDiceToken(expression: string): string | undefined {
  return expression.match(/\b\d*d\d+\b/i)?.[0]?.replace(/\s+/g, "");
}

function applyVersatileDamageExpression(expression: string, versatileDice: string): string {
  const normalized = expression.replace(/\s+/g, "");
  const firstDice = normalized.match(/\b\d*d\d+\b/i)?.[0];
  if (!firstDice) {
    return normalized;
  }
  return normalized.replace(firstDice, versatileDice);
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
  const baseRoll = result.dice.keptRoll ?? result.dice.rawRolls[0] ?? 0;
  const appliedBonuses = result.temporaryModifierBreakdown?.filter((entry) => entry.applied) ?? [];
  return (
    <div className="rounded border border-indigo-200 bg-indigo-50 p-3">
      <p className="text-xs uppercase text-indigo-700">Last Roll</p>
      <p className="text-sm font-semibold text-slate-900">{result.label}</p>
      <div className="space-y-1 text-xs text-slate-700">
        <p>Mode: {modeLabel(result.rollMode)}</p>
        <p>Base Roll: {baseRoll}</p>
        <p>Base Modifier: {modifierLabel(result.baseModifier ?? result.modifier)}</p>
        {result.activeEffects?.length ? <p>Active Effect: {result.activeEffects.map((entry) => entry.label).join(", ")}</p> : null}
        {appliedBonuses.length ? <p>Bonus Modifiers: {appliedBonuses.map((entry) => `${entry.sourceName} ${entry.value}`).join(", ")}</p> : null}
        {result.bonusDice?.length ? (
          <p>Bonus Dice: {result.bonusDice.map((entry) => `${entry.sourceName ? `${entry.sourceName} ` : ""}${entry.expression}=${entry.total}`).join(", ")}</p>
        ) : null}
        <p className="text-sm font-semibold text-slate-900">Total: {result.total}</p>
      </div>
      {rawRolls ? <p className="mt-1 text-xs text-slate-600">Dice: {rawRolls}{result.dice.keptRoll ? ` · kept ${result.dice.keptRoll}` : ""}</p> : null}
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
  versatileMode,
  onChangeVersatileMode,
  onRoll,
  onSpendResource,
}: {
  descriptor: RollActionDescriptor;
  rollMode: RollMode;
  resourceById: Map<string, PlayResourceCounter>;
  versatileMode?: "one-hand" | "two-hand";
  onChangeVersatileMode: (mode: "one-hand" | "two-hand") => void;
  onRoll: ActionRollPanelProps["onRoll"];
  onSpendResource: ActionRollPanelProps["onSpendResource"];
}) {
  const singleResourceId = descriptor.resourceIds.length === 1 ? descriptor.resourceIds[0] : undefined;
  const resource = singleResourceId ? resourceById.get(singleResourceId) : undefined;
  const canSpend = Boolean(resource && resource.remaining > 0);
  const ambiguousResources = descriptor.resourceIds.length > 1;
  const rollRequest = descriptor.rollRequest;
  const weaponProfile = (rollRequest?.metadata?.weaponProfile ?? descriptor.damageRequest?.metadata?.weaponProfile) as
    | WeaponProfileMetadata
    | undefined;
  const versatileDamageDice = weaponProfile?.versatileDamageDice;
  const hasVersatileMode = Boolean(versatileDamageDice && descriptor.damageRequest?.diceExpression);
  const selectedVersatileMode = versatileMode ?? "one-hand";
  const versatileBaseDice = firstDiceToken(descriptor.damageRequest?.diceExpression ?? "");
  const versatileLabel =
    hasVersatileMode && versatileBaseDice
      ? `One-handed ${versatileBaseDice} · Two-handed ${versatileDamageDice}`
      : undefined;

  const withWeaponUsage = (request: RollRequest | undefined): RollRequest | undefined => {
    if (!request || !hasVersatileMode) {
      return request;
    }
    const useTwoHanded = selectedVersatileMode === "two-hand";
    const usageMode = useTwoHanded ? "versatile-two-hand" : "versatile-one-hand";
    const diceExpression =
      request.type === "damage-roll" && useTwoHanded && versatileDamageDice
        ? applyVersatileDamageExpression(request.diceExpression, versatileDamageDice)
        : request.diceExpression;
    return {
      ...request,
      diceExpression,
      metadata: {
        ...(request.metadata ?? {}),
        weaponUsageMode: usageMode,
      },
    };
  };
  const effectiveRollRequest = withWeaponUsage(rollRequest);
  const effectiveDamageRequest = withWeaponUsage(descriptor.damageRequest);

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
          {effectiveDamageRequest ? <p className="text-xs text-slate-700">Damage {effectiveDamageRequest.diceExpression}</p> : null}
          {hasVersatileMode ? (
            <label className="mt-1 inline-flex items-center gap-2 text-xs text-slate-700">
              Usage
              <select
                className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs text-slate-800"
                onChange={(event) => onChangeVersatileMode(event.target.value as "one-hand" | "two-hand")}
                value={selectedVersatileMode}
              >
                <option value="one-hand">One-handed</option>
                <option value="two-hand">Two-handed</option>
              </select>
              {versatileLabel ? <span className="text-slate-500">{versatileLabel}</span> : null}
            </label>
          ) : null}
          {descriptor.mappingBadges?.length ? <p className="text-xs text-slate-600">{descriptor.mappingBadges.join(" · ")}</p> : null}
          {resource ? <p className="text-xs text-slate-600">Resource: {resource.name} ({resource.remaining}/{resource.max})</p> : null}
          {ambiguousResources ? <p className="text-xs text-amber-700">Multiple resources linked; spend manually.</p> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {effectiveRollRequest ? (
            <RollButton request={effectiveRollRequest} rollMode={rollMode} onRoll={(request) => onRoll(request)}>
              Roll
            </RollButton>
          ) : null}
          {effectiveDamageRequest ? (
            <RollButton request={effectiveDamageRequest} rollMode="normal" onRoll={(request) => onRoll(request)}>
              Damage
            </RollButton>
          ) : null}
          {effectiveRollRequest && singleResourceId ? (
            <button
              className="rounded bg-indigo-700 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canSpend}
              onClick={() => onRoll({ ...effectiveRollRequest, rollMode }, { spendResourceKey: singleResourceId, resourceLabel: resource?.name })}
              type="button"
            >
              Roll + Spend
            </button>
          ) : null}
          {!effectiveRollRequest && singleResourceId ? (
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

export function ActionRollPanel({
  rollView,
  lastRoll,
  resources,
  activeEffectCatalog = [],
  showSpellRolls = true,
  onRoll,
  onSpendResource,
  onActivateEffect,
  onCreateCustomEffect,
  onDismissEffect,
}: ActionRollPanelProps) {
  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [selectedEffectIds, setSelectedEffectIds] = useState<string[]>([]);
  const [buffSearch, setBuffSearch] = useState("");
  const [sourceFilters, setSourceFilters] = useState<ActiveEffectCatalogSourceFilter[]>(["spells", "features", "items", "custom"]);
  const [effectFilter, setEffectFilter] = useState<ActiveEffectCatalogEffectFilter>("all");
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | undefined>();
  const [activationCasterName, setActivationCasterName] = useState("");
  const [activationNote, setActivationNote] = useState("");
  const [activationDice, setActivationDice] = useState("");
  const [customName, setCustomName] = useState("");
  const [customDice, setCustomDice] = useState("");
  const [customFlat, setCustomFlat] = useState("");
  const [customDuration, setCustomDuration] = useState<"manual" | "until-used" | "one-roll">("manual");
  const [customNote, setCustomNote] = useState("");
  const [customCasterName, setCustomCasterName] = useState("");
  const [customRollTypes, setCustomRollTypes] = useState<RollType[]>(["ability-check"]);
  const [weaponUsageByActionId, setWeaponUsageByActionId] = useState<Record<string, "one-hand" | "two-hand">>({});

  const resourceById = useMemo(() => new Map(resources.map((resource) => [resource.id, resource])), [resources]);
  const actionableSpells = rollView.spellRolls.filter((entry) => entry.rollRequest || entry.damageRequest || entry.spellSaveDc);
  const activeEffects = rollView.activeEffects?.filter((effect) => effect.status === "active") ?? [];
  const rollSelectableEffects = activeEffects
    .filter((effect) => effect.applicableRollTypes.length > 0)
    .filter((effect) => effect.targets.includes("self") || effect.targets.includes("global"));
  const excludedEffectIds = useMemo(() => activeEffects.map((effect) => effect.id), [activeEffects]);
  const searchResult = useMemo(
    () =>
      searchActiveEffectCatalog(activeEffectCatalog, undefined, {
        query: buffSearch,
        sourceFilters,
        effectFilter,
        excludeEffectIds: excludedEffectIds,
      }),
    [activeEffectCatalog, buffSearch, effectFilter, excludedEffectIds, sourceFilters],
  );
  const filteredCatalog = searchResult.matches;
  const futureMatches = searchResult.futureMatches;
  const searchDiagnostics = searchResult.diagnostics;

  const selectedCatalogEntry = filteredCatalog.find((entry) => entry.id === selectedCatalogId) ?? activeEffectCatalog.find((entry) => entry.id === selectedCatalogId);

  const applySelectedEffects = (request: RollRequest): RollRequest => {
    const applicable = activeEffectsForRollType(rollSelectableEffects, request.type).filter((effect) => selectedEffectIds.includes(effect.id));
    const temporaryModifiers = applicable.flatMap((effect) => effect.modifiers);
    return {
      ...request,
      temporaryModifiers: [...(request.temporaryModifiers ?? []), ...temporaryModifiers],
      selectedActiveEffectIds: Array.from(new Set([...(request.selectedActiveEffectIds ?? []), ...applicable.map((effect) => effect.id)])),
      selectedActiveEffects: Array.from(
        new Map(
          [...(request.selectedActiveEffects ?? []), ...applicable.map((effect) => ({
            id: effect.id,
            label: effect.label,
            sourceName: effect.sourceName,
          }))].map((entry) => [entry.id, entry]),
        ).values(),
      ),
    };
  };

  const rollWithEffects: ActionRollPanelProps["onRoll"] = (request, options) => onRoll(applySelectedEffects(request), options);

  const toggleSourceFilter = (value: ActiveEffectCatalogSourceFilter) => {
    setSourceFilters((current) => current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]);
  };

  const activateSelectedCatalogEntry = () => {
    if (!selectedCatalogEntry || !onActivateEffect) {
      return;
    }
    onActivateEffect(selectedCatalogEntry.effect, {
      external: true,
      sourceCasterName: activationCasterName.trim() || undefined,
      note: activationNote.trim() || undefined,
      diceExpression: selectedCatalogEntry.effect.configurableFields?.includes("die-size") ? activationDice || selectedCatalogEntry.modifier.dice : undefined,
    });
    setActivationCasterName("");
    setActivationNote("");
    setActivationDice("");
  };

  const activateCustomEffect = () => {
    if (!onCreateCustomEffect || !customName.trim()) {
      return;
    }
    const parsedFlat = customFlat.trim().length ? Number(customFlat) : undefined;
    const rollTypes = Array.from(
      new Set<RollType>(customRollTypes.includes("attack-roll") ? [...customRollTypes, "spell-attack"] : customRollTypes),
    );
    onCreateCustomEffect({
      name: customName.trim(),
      applicableRollTypes: rollTypes,
      dice: customDice.trim() || undefined,
      flat: parsedFlat !== undefined && Number.isFinite(parsedFlat) ? parsedFlat : undefined,
      durationType: customDuration,
      note: customNote.trim() || undefined,
      sourceCasterName: customCasterName.trim() || undefined,
    });
    setCustomName("");
    setCustomDice("");
    setCustomFlat("");
    setCustomDuration("manual");
    setCustomNote("");
    setCustomCasterName("");
    setCustomRollTypes(["ability-check"]);
  };

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
          <p className="mb-1 text-xs font-medium uppercase text-slate-500">Active Buffs</p>
          <ul className="space-y-1">
            {activeEffects.map((effect) => (
              <li key={effect.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1">
                <div className="text-xs text-slate-700">
                  <p className="font-medium">{effect.label}</p>
                  <p>
                    {sourceTypeLabel(effect.sourceType)} · {effect.durationType} · {effect.targets.join(", ")}
                    {effect.modifierSummary?.dice ? ` · ${effect.modifierSummary.dice}` : ""}
                    {effect.modifierSummary?.flat !== undefined ? ` · ${modifierLabel(effect.modifierSummary.flat)}` : ""}
                  </p>
                  {effect.note ? <p className="text-slate-600">{effect.note}</p> : null}
                </div>
                {onDismissEffect ? (
                  <button
                    className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-800"
                    onClick={() => onDismissEffect(effect.id)}
                    type="button"
                  >
                    Dismiss
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onActivateEffect ? (
        <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase text-slate-500">Activate External Buff</p>
          <div className="flex flex-wrap gap-2">
            {(["spells", "features", "items", "custom"] as const).map((value) => (
              <button
                key={value}
                className={`rounded px-2 py-1 text-xs ${sourceFilters.includes(value) ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}
                onClick={() => toggleSourceFilter(value)}
                type="button"
              >
                {value === "spells" ? "Spells" : value === "features" ? "Features" : value === "items" ? "Items" : "Custom"}
              </button>
            ))}
            {(["all", "roll-bonus", "ac-bonus"] as const).map((value) => (
              <button
                key={value}
                className={`rounded px-2 py-1 text-xs ${effectFilter === value ? "bg-indigo-700 text-white" : "bg-white text-slate-700 border border-slate-200"}`}
                onClick={() => setEffectFilter(value)}
                type="button"
              >
                {value === "all" ? "All Effects" : value === "roll-bonus" ? "Roll Bonus" : "AC Bonus"}
              </button>
            ))}
          </div>
          <input
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            onChange={(event) => setBuffSearch(event.target.value)}
            placeholder="Search buffs across spells, features, feats, and items"
            type="search"
            value={buffSearch}
          />
          <div className="text-xs text-slate-600">
            Filters: {searchDiagnostics.activeSourceFilters.length ? searchDiagnostics.activeSourceFilters.map(sourceFilterLabel).join(", ") : "None"} · Effect: {effectFilterLabel(searchDiagnostics.activeEffectFilter)}
          </div>
          {filteredCatalog.length ? (
            <ul className="max-h-56 space-y-1 overflow-auto">
              {filteredCatalog.map((entry) => (
                <li key={entry.id}>
                  <button
                    className={`flex w-full items-start justify-between rounded border px-2 py-1 text-left text-xs ${selectedCatalogId === entry.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    onClick={() => {
                      setSelectedCatalogId(entry.id);
                      setActivationDice(entry.modifier.dice ?? "");
                    }}
                    type="button"
                  >
                    <span>
                      <span className="block font-medium text-slate-900">{entry.label}</span>
                      <span className="text-slate-600">{sourceTypeLabel(entry.sourceType)} · {entry.durationType} · {entry.applicableRollTypes.map(rollTypeLabel).join(", ") || "No roll types"}</span>
                    </span>
                    <span className="text-slate-700">{effectSummary(entry)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded border border-dashed border-slate-300 bg-white p-2 text-xs text-slate-700">
              <p className="font-medium">No activatable buffs match this search.</p>
              <p>Active filters: {searchDiagnostics.activeSourceFilters.length ? searchDiagnostics.activeSourceFilters.map(sourceFilterLabel).join(", ") : "None"} · {effectFilterLabel(searchDiagnostics.activeEffectFilter)}</p>
              <p>Searched source types: {searchDiagnostics.searchedSourceTypes.join(", ") || "None"}</p>
              <p>{searchDiagnostics.mappedOnlyHint}</p>
              {futureMatches.length ? <p>Known but not activatable yet.</p> : null}
            </div>
          )}

          {futureMatches.length ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-2">
              <p className="mb-1 text-xs font-medium uppercase text-amber-800">Known but not activatable yet</p>
              <ul className="space-y-1">
                {futureMatches.map((entry) => (
                  <li key={entry.id} className="rounded border border-amber-200 bg-white px-2 py-1 text-xs text-slate-700">
                    <p className="font-medium">{entry.label}</p>
                    <p>{sourceTypeLabel(entry.sourceType)} · Future: {entry.expectedFutureEffectType}</p>
                    <p>{entry.reasonUnsupported}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selectedCatalogEntry ? (
            <div className="space-y-2 rounded border border-slate-200 bg-white p-2">
              <div className="text-xs text-slate-700">
                <p className="font-medium">{selectedCatalogEntry.label}</p>
                <p>{sourceTypeLabel(selectedCatalogEntry.sourceType)} · {effectSummary(selectedCatalogEntry)} · {selectedCatalogEntry.durationType}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Source / Caster Name
                  <input
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    onChange={(event) => setActivationCasterName(event.target.value)}
                    type="text"
                    value={activationCasterName}
                  />
                </label>
                {selectedCatalogEntry.effect.configurableFields?.includes("die-size") ? (
                  <label className="text-xs text-slate-700">
                    Bonus Die
                    <select
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                      onChange={(event) => setActivationDice(event.target.value)}
                      value={activationDice || selectedCatalogEntry.modifier.dice || "1d6"}
                    >
                      {DIE_SIZE_OPTIONS.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <label className="text-xs text-slate-700">
                Note
                <input
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                  onChange={(event) => setActivationNote(event.target.value)}
                  type="text"
                  value={activationNote}
                />
              </label>
              <button className="rounded bg-indigo-700 px-3 py-2 text-sm text-white" onClick={activateSelectedCatalogEntry} type="button">
                Activate on self
              </button>
            </div>
          ) : null}

          {sourceFilters.includes("custom") && onCreateCustomEffect ? (
            <div className="space-y-2 rounded border border-slate-200 bg-white p-2">
              <p className="text-xs font-medium uppercase text-slate-500">Custom Buff</p>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-xs text-slate-700">
                  Name
                  <input
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    onChange={(event) => setCustomName(event.target.value)}
                    type="text"
                    value={customName}
                  />
                </label>
                <label className="text-xs text-slate-700">
                  Duration
                  <select
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    onChange={(event) => setCustomDuration(event.target.value as "manual" | "until-used" | "one-roll")}
                    value={customDuration}
                  >
                    <option value="manual">Manual</option>
                    <option value="until-used">Until Used</option>
                    <option value="one-roll">One Roll</option>
                  </select>
                </label>
                <label className="text-xs text-slate-700">
                  Bonus Dice
                  <input
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    onChange={(event) => setCustomDice(event.target.value)}
                    placeholder="1d4"
                    type="text"
                    value={customDice}
                  />
                </label>
                <label className="text-xs text-slate-700">
                  Flat Bonus
                  <input
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    onChange={(event) => setCustomFlat(event.target.value)}
                    placeholder="+2"
                    type="number"
                    value={customFlat}
                  />
                </label>
                <label className="text-xs text-slate-700 md:col-span-2">
                  Source / Caster Name
                  <input
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    onChange={(event) => setCustomCasterName(event.target.value)}
                    type="text"
                    value={customCasterName}
                  />
                </label>
                <label className="text-xs text-slate-700 md:col-span-2">
                  Note
                  <input
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    onChange={(event) => setCustomNote(event.target.value)}
                    type="text"
                    value={customNote}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {CUSTOM_ROLL_TYPE_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700">
                    <input
                      checked={customRollTypes.includes(option.value)}
                      onChange={(event) =>
                        setCustomRollTypes((current) =>
                          event.target.checked ? Array.from(new Set([...current, option.value])) : current.filter((value) => value !== option.value),
                        )
                      }
                      type="checkbox"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white" onClick={activateCustomEffect} type="button">
                Activate Custom Buff
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {rollSelectableEffects.length > 0 ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-2">
          <p className="mb-1 text-xs font-medium uppercase text-slate-500">Optional Active Effects</p>
          <div className="flex flex-wrap gap-2">
            {rollSelectableEffects.map((effect) => (
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
                {effect.label}
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
                versatileMode={weaponUsageByActionId[descriptor.id]}
                onChangeVersatileMode={(mode) =>
                  setWeaponUsageByActionId((current) => ({
                    ...current,
                    [descriptor.id]: mode,
                  }))
                }
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
                  versatileMode={weaponUsageByActionId[descriptor.id]}
                  onChangeVersatileMode={(mode) =>
                    setWeaponUsageByActionId((current) => ({
                      ...current,
                      [descriptor.id]: mode,
                    }))
                  }
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
