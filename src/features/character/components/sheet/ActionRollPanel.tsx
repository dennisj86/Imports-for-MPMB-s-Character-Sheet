import { useMemo, useState } from "react";
import type { ActiveEffectCatalogEntry, ActiveEffectDefinition } from "../../../../domain/rules";
import type { CharacterRollView, RollActionDescriptor, RollMode, RollRequest, RollResult, RollType } from "../../../../domain/rolls";
import type { PlayResourceCounter } from "../../../../services/playState";
import { parseDiceExpression } from "../../../../features/dice";
import { activeEffectsForRollType, searchActiveEffectCatalog, type ActiveEffectCatalogEffectFilter, type ActiveEffectCatalogSourceFilter } from "../../../../services/rules";
import { ActionCard, EmptyState, InfoPopover, RollResultCard, SectionHeader, StatusBadge } from "./SheetDesignSystem";
import { ruleInfo } from "./rulesInfo";

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

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

type WeaponProfileMetadata = {
  usageMode?: "melee" | "ranged" | "thrown" | "versatile-one-hand" | "versatile-two-hand";
  versatileDamageDice?: string;
  damageDice?: string;
  properties?: string[];
  range?: string;
  masteryBadges?: string[];
};

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
  disabledReason,
}: {
  request: RollRequest;
  rollMode: RollMode;
  children: string;
  onRoll: (request: RollRequest) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      aria-label={`${children}: ${request.label}`}
      className="sheet-focus-ring rounded bg-slate-700 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      disabled={disabled}
      title={disabled ? disabledReason ?? "Action currently unavailable." : undefined}
      onClick={() => onRoll({ ...request, rollMode })}
      type="button"
    >
      {children}
    </button>
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
    <section className="space-y-2">
      <SectionHeader title={title} />
      {requests.length === 0 ? (
        <EmptyState title={title} description="No matching entries." />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {requests.map((request) => (
            <button
              aria-label={`Roll ${request.label}`}
              key={request.id}
              className="sheet-focus-ring sheet-card flex items-center justify-between rounded px-2 py-1.5 text-left text-sm"
              onClick={() => onRoll({ ...request, rollMode })}
              type="button"
            >
              <span>{request.label}</span>
              <span className="font-medium">{modifierLabel(request.modifier)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
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
  const weaponProperties = weaponProfile?.properties ?? [];
  const weaponMasteryBadges = weaponProfile?.masteryBadges ?? [];
  const descriptorMasteryBadges = descriptor.mappingBadges ?? [];
  const masteryBadges = Array.from(new Set([...weaponMasteryBadges, ...descriptorMasteryBadges]));
  const versatileDamageDice = weaponProfile?.versatileDamageDice;
  const hasVersatileMode = Boolean(versatileDamageDice && descriptor.damageRequest?.diceExpression);
  const selectedVersatileMode = versatileMode ?? "one-hand";
  const versatileBaseDice = firstDiceToken(descriptor.damageRequest?.diceExpression ?? "");
  const versatileLabel =
    hasVersatileMode && versatileBaseDice
      ? `One-handed ${versatileBaseDice} · Two-handed ${versatileDamageDice}`
      : undefined;
  const spendDisabledReason = resource ? `${resource.name} is depleted.` : "Resource unavailable.";

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
    <li>
      <ActionCard
        title={descriptor.label}
        subtitle={`${descriptor.activationType ?? "action"}${descriptor.sourceSummary ? ` · ${descriptor.sourceSummary}` : ""}${descriptor.rollRequest ? ` · attack ${modifierLabel(descriptor.rollRequest.modifier)}` : ""}`}
        badges={
          <>
            {masteryBadges.map((badge) => (
              <span key={badge} className="inline-flex items-center gap-1">
                <StatusBadge label={badge} status="info" />
                <InfoPopover title={badge} description={ruleInfo("weapon-mastery")} />
              </span>
            ))}
            {weaponProperties.map((property) => (
              <span key={`${descriptor.id}:${property}`} className="inline-flex items-center gap-1">
                <StatusBadge label={property} status="info" />
                <InfoPopover title={property} description={ruleInfo(property)} />
              </span>
            ))}
            {ambiguousResources ? <StatusBadge label="manual resource spend" status="blocked" /> : null}
            {resource ? <StatusBadge label={`${resource.name} ${resource.remaining}/${resource.max}`} status={resource.remaining > 0 ? "complete" : "pending"} /> : null}
            {weaponProfile?.range ? (
              <span className="inline-flex items-center gap-1">
                <StatusBadge label={`range ${weaponProfile.range}`} status="info" />
                <InfoPopover title="Range" description={ruleInfo("range")} />
              </span>
            ) : null}
          </>
        }
        actions={
          <>
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
                aria-label={`Roll and spend ${resource?.name ?? "resource"} for ${descriptor.label}`}
                className="sheet-focus-ring rounded bg-indigo-700 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!canSpend}
                title={!canSpend ? spendDisabledReason : undefined}
                onClick={() => onRoll({ ...effectiveRollRequest, rollMode }, { spendResourceKey: singleResourceId, resourceLabel: resource?.name })}
                type="button"
              >
                Roll + Spend
              </button>
            ) : null}
            {!effectiveRollRequest && singleResourceId ? (
              <button
                aria-label={`Spend ${resource?.name ?? "resource"} for ${descriptor.label}`}
                className="sheet-focus-ring rounded bg-slate-200 px-2 py-1 text-xs text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={!canSpend}
                title={!canSpend ? spendDisabledReason : undefined}
                onClick={() => onSpendResource(singleResourceId, 1, resource?.name)}
                type="button"
              >
                Spend
              </button>
            ) : null}
          </>
        }
      >
        {descriptor.spellSaveDc ? (
          <p className="text-xs text-slate-700">
            Save DC {descriptor.spellSaveDc}{descriptor.spellSaveAbility ? ` · ${descriptor.spellSaveAbility.toUpperCase()}` : ""}
          </p>
        ) : null}
        {effectiveDamageRequest ? <p className="text-xs text-slate-700">Damage {effectiveDamageRequest.diceExpression}</p> : null}
        {weaponProperties.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {weaponProperties.map((property) => (
              <span key={`property-inline-${descriptor.id}-${property}`} className="inline-flex items-center gap-1 text-xs text-slate-700">
                <span className="rounded bg-slate-100 px-1.5 py-0.5">{property}</span>
                <InfoPopover title={property} description={ruleInfo(property)} />
              </span>
            ))}
          </div>
        ) : null}
        {hasVersatileMode ? (
          <label className="mt-1 inline-flex items-center gap-2 text-xs text-slate-700">
            Usage
            <select
              aria-label={`Select weapon usage mode for ${descriptor.label}`}
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
      </ActionCard>
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
  const [actionSearch, setActionSearch] = useState("");
  const [freeDiceExpression, setFreeDiceExpression] = useState("d20");
  const [freeDiceLabel, setFreeDiceLabel] = useState("");
  const [showCustomBuffEditor, setShowCustomBuffEditor] = useState(false);

  const resourceById = useMemo(() => new Map(resources.map((resource) => [resource.id, resource])), [resources]);
  const actionableSpells = useMemo(
    () => rollView.spellRolls.filter((entry) => entry.rollRequest || entry.damageRequest || entry.spellSaveDc),
    [rollView.spellRolls],
  );
  const activeEffects = rollView.activeEffects?.filter((effect) => effect.status === "active") ?? [];
  const inactiveEffects = rollView.activeEffects?.filter((effect) => effect.status !== "active") ?? [];
  const consumedEffects = inactiveEffects.filter((effect) => effect.durationType === "until-used" || effect.durationType === "one-roll");
  const rollSelectableEffects = activeEffects
    .filter((effect) => effect.applicableRollTypes.length > 0)
    .filter((effect) => effect.targets.includes("self") || effect.targets.includes("global"));
  const normalizedActionSearch = normalizeSearch(actionSearch);
  const matchesActionSearch = (value: string): boolean => normalizeSearch(value).includes(normalizedActionSearch);
  const filterRollRequests = (entries: RollRequest[]): RollRequest[] => (
    normalizedActionSearch
      ? entries.filter((entry) => matchesActionSearch(`${entry.label} ${entry.type} ${entry.diceExpression}`))
      : entries
  );
  const filterDescriptors = (entries: RollActionDescriptor[]): RollActionDescriptor[] => (
    normalizedActionSearch
      ? entries.filter((entry) =>
        matchesActionSearch(`${entry.label} ${entry.sourceSummary ?? ""} ${entry.notes.join(" ")} ${(entry.mappingBadges ?? []).join(" ")}`))
      : entries
  );
  const filteredAbilityChecks = filterRollRequests(rollView.abilityChecks);
  const filteredSavingThrows = filterRollRequests(rollView.savingThrows);
  const filteredSkillChecks = filterRollRequests(rollView.skillChecks);
  const filteredActionRolls = filterDescriptors(rollView.actionRolls);
  const filteredSpellRolls = filterDescriptors(actionableSpells);
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
  const canActivateCustomEffect = customName.trim().length > 0 && customRollTypes.length > 0;
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
    setShowCustomBuffEditor(false);
  };

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader
          subtitle="Select optional buffs first, then execute rolls and resource spends."
          title="Action Console"
        />
        <label className="text-sm text-slate-700">
          Roll Mode{" "}
          <select
            aria-label="Select roll mode"
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

      <div className="sheet-card space-y-2 p-3">
        <SectionHeader
          actions={<StatusBadge label={`${filteredActionRolls.length + filteredSpellRolls.length} actions`} status="info" />}
          subtitle="Search across checks, action profiles and spell action entries."
          title="Action Search"
        />
        <input
          aria-label="Search action entries"
          className="sheet-no-overflow w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          onChange={(event) => setActionSearch(event.target.value)}
          placeholder="Search actions, attacks, saves, skills..."
          type="search"
          value={actionSearch}
        />
      </div>

      <div className="sheet-card space-y-2 p-3">
        <SectionHeader subtitle="Roll standalone dice formulas without combat automation." title="Free Dice Roller" />
        <div className="grid gap-2 md:grid-cols-[minmax(0,2fr),minmax(0,2fr),auto]">
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

      {activeEffects.length > 0 ? (
        <div className="sheet-card bg-slate-50 p-2">
          <SectionHeader
            actions={<StatusBadge label={`${activeEffects.length} active`} status="complete" />}
            subtitle="Effects with duration `one-roll` or `until-used` are consumed once checked and used in a roll."
            title="Active Buffs"
          />
          <ul className="space-y-1">
            {activeEffects.map((effect) => (
              <li key={effect.id} className="sheet-card flex flex-wrap items-center justify-between gap-2 rounded bg-white px-2 py-1">
                <div className="text-xs text-slate-700">
                  <p className="font-medium text-slate-900">{effect.label}</p>
                  <p>
                    {sourceTypeLabel(effect.sourceType)} · {effect.targets.join(", ")}
                    {effect.modifierSummary?.dice ? ` · ${effect.modifierSummary.dice}` : ""}
                    {effect.modifierSummary?.flat !== undefined ? ` · ${modifierLabel(effect.modifierSummary.flat)}` : ""}
                  </p>
                  {effect.note ? <p className="text-slate-600">{effect.note}</p> : null}
                </div>
                <div className="flex items-center gap-1">
                  <StatusBadge
                    label={effect.durationType}
                    status={effect.durationType === "until-used" || effect.durationType === "one-roll" ? "pending" : "info"}
                  />
                  <InfoPopover title={effect.durationType} description={ruleInfo(effect.durationType)} />
                </div>
                <div className="flex items-center gap-1">
                  <StatusBadge status="complete" label="active" />
                  <InfoPopover title="Active" description={ruleInfo("active")} />
                </div>
                {onDismissEffect ? (
                  <button
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
        </div>
      ) : null}

      {consumedEffects.length > 0 ? (
        <div className="sheet-card border-slate-300 bg-slate-50 p-2">
          <SectionHeader
            actions={<StatusBadge label={`${consumedEffects.length} consumed`} status="pending" />}
            subtitle="Consumed one-roll/until-used effects are removed from active selection until re-activated."
            title="Consumed Buffs"
          />
          <ul className="space-y-1">
            {consumedEffects.slice(0, 8).map((effect) => (
              <li key={effect.id} className="sheet-card flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-xs text-slate-700">
                <p className="font-medium text-slate-900">{effect.label}</p>
                <div className="flex items-center gap-1">
                  <StatusBadge label={effect.status} status="pending" />
                  <InfoPopover title={effect.status} description={ruleInfo(effect.status)} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onActivateEffect ? (
        <div className="sheet-card space-y-2 bg-slate-50 p-3">
          <SectionHeader subtitle="Search and activate mapped support effects" title="Activate External Buff" />
          <div className="flex flex-wrap gap-2">
            {(["spells", "features", "items", "custom"] as const).map((value) => (
              <button
                key={value}
                className={`sheet-focus-ring rounded px-2 py-1 text-xs ${sourceFilters.includes(value) ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}
                onClick={() => toggleSourceFilter(value)}
                type="button"
              >
                {value === "spells" ? "Spells" : value === "features" ? "Features" : value === "items" ? "Items" : "Custom"}
              </button>
            ))}
            {(["all", "roll-bonus", "ac-bonus"] as const).map((value) => (
              <button
                key={value}
                className={`sheet-focus-ring rounded px-2 py-1 text-xs ${effectFilter === value ? "bg-indigo-700 text-white" : "bg-white text-slate-700 border border-slate-200"}`}
                onClick={() => setEffectFilter(value)}
                type="button"
              >
                {value === "all" ? "All Effects" : value === "roll-bonus" ? "Roll Bonus" : "AC Bonus"}
              </button>
            ))}
          </div>
          <input
            aria-label="Search mapped external buffs"
            className="sheet-no-overflow w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            onChange={(event) => setBuffSearch(event.target.value)}
            placeholder="Search buffs across spells, features, feats, and items"
            type="search"
            value={buffSearch}
          />
          <div className="flex flex-wrap gap-1 text-xs text-slate-600">
            <StatusBadge label={`Sources: ${searchDiagnostics.activeSourceFilters.length ? searchDiagnostics.activeSourceFilters.map(sourceFilterLabel).join(", ") : "None"}`} status="info" />
            <StatusBadge label={`Effect: ${effectFilterLabel(searchDiagnostics.activeEffectFilter)}`} status="info" />
          </div>
          {filteredCatalog.length ? (
            <ul className="max-h-56 space-y-1 overflow-auto">
              {filteredCatalog.map((entry) => (
                <li key={entry.id}>
                  <button
                    className={`sheet-focus-ring flex w-full items-start justify-between rounded border px-2 py-1 text-left text-xs ${selectedCatalogId === entry.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    onClick={() => {
                      setSelectedCatalogId(entry.id);
                      setActivationDice(entry.modifier.dice ?? "");
                    }}
                    aria-label={`Select buff ${entry.label}`}
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
            <EmptyState title="No activatable buffs match this search." description={`${searchDiagnostics.mappedOnlyHint}${futureMatches.length ? " Known but not activatable entries exist." : ""}`} />
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
                    aria-label="External buff source or caster name"
                    className="sheet-no-overflow mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    onChange={(event) => setActivationCasterName(event.target.value)}
                    type="text"
                    value={activationCasterName}
                  />
                </label>
                {selectedCatalogEntry.effect.configurableFields?.includes("die-size") ? (
                  <label className="text-xs text-slate-700">
                    Bonus Die
                    <select
                      aria-label="Select bonus die for external buff"
                      className="sheet-no-overflow mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
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
                  aria-label="External buff note"
                  className="sheet-no-overflow mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                  onChange={(event) => setActivationNote(event.target.value)}
                  type="text"
                  value={activationNote}
                />
              </label>
              <button className="sheet-focus-ring rounded bg-indigo-700 px-3 py-2 text-sm text-white" onClick={activateSelectedCatalogEntry} type="button">
                Activate on self
              </button>
            </div>
          ) : null}

          {sourceFilters.includes("custom") && onCreateCustomEffect ? (
            showCustomBuffEditor ? (
              <div className="space-y-2 rounded border border-slate-200 bg-white p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase text-slate-500">Custom Buff</p>
                  <button
                    aria-label="Close custom buff editor"
                    className="sheet-focus-ring rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-700"
                    onClick={() => setShowCustomBuffEditor(false)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-xs text-slate-700">
                    Name
                    <input
                      aria-label="Custom buff name"
                      className="sheet-no-overflow mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                      onChange={(event) => setCustomName(event.target.value)}
                      type="text"
                      value={customName}
                    />
                  </label>
                  <label className="text-xs text-slate-700">
                    Duration
                    <select
                      aria-label="Custom buff duration"
                      className="sheet-no-overflow mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
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
                      aria-label="Custom buff bonus dice"
                      className="sheet-no-overflow mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                      onChange={(event) => setCustomDice(event.target.value)}
                      placeholder="1d4"
                      type="text"
                      value={customDice}
                    />
                  </label>
                  <label className="text-xs text-slate-700">
                    Flat Bonus
                    <input
                      aria-label="Custom buff flat bonus"
                      className="sheet-no-overflow mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                      onChange={(event) => setCustomFlat(event.target.value)}
                      placeholder="+2"
                      type="number"
                      value={customFlat}
                    />
                  </label>
                  <label className="text-xs text-slate-700 md:col-span-2">
                    Source / Caster Name
                    <input
                      aria-label="Custom buff source or caster name"
                      className="sheet-no-overflow mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                      onChange={(event) => setCustomCasterName(event.target.value)}
                      type="text"
                      value={customCasterName}
                    />
                  </label>
                  <label className="text-xs text-slate-700 md:col-span-2">
                    Note
                    <input
                      aria-label="Custom buff note"
                      className="sheet-no-overflow mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
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
                        aria-label={`Apply custom buff to ${option.label} rolls`}
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
                <button
                  className="sheet-focus-ring rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={!canActivateCustomEffect}
                  onClick={activateCustomEffect}
                  title={!canActivateCustomEffect ? "Enter a custom buff name and at least one roll type." : undefined}
                  type="button"
                >
                  Activate Custom Buff
                </button>
              </div>
            ) : (
              <button
                aria-label="Create custom buff"
                className="sheet-focus-ring rounded bg-slate-900 px-3 py-2 text-sm text-white"
                onClick={() => setShowCustomBuffEditor(true)}
                type="button"
              >
                Create Custom Buff
              </button>
            )
          ) : null}
        </div>
      ) : null}

      {rollSelectableEffects.length > 0 ? (
        <div className="sheet-card bg-slate-50 p-2">
          <SectionHeader
            actions={<StatusBadge label={`${selectedEffectIds.length} selected`} status="info" />}
            subtitle="Checked effects apply to the next matching roll. One-roll and until-used effects are consumed."
            title="Optional Active Effects"
          />
          <div className="flex flex-wrap gap-2">
            {rollSelectableEffects.map((effect) => (
              <label key={effect.id} className="sheet-card flex items-center gap-1 rounded bg-white px-2 py-1 text-xs text-slate-700">
                <input
                  aria-label={`Apply effect ${effect.label} to next roll`}
                  checked={selectedEffectIds.includes(effect.id)}
                  onChange={(event) =>
                    setSelectedEffectIds((current) =>
                      event.target.checked ? Array.from(new Set([...current, effect.id])) : current.filter((id) => id !== effect.id),
                    )
                  }
                  type="checkbox"
                />
                <span className="font-medium text-slate-900">{effect.label}</span>
                <StatusBadge
                  className="ml-1"
                  label={effect.durationType}
                  status={effect.durationType === "until-used" || effect.durationType === "one-roll" ? "pending" : "info"}
                />
                <InfoPopover title={effect.durationType} description={ruleInfo(effect.durationType)} />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <RequestGrid title="Ability Checks" requests={filteredAbilityChecks} rollMode={rollMode} onRoll={(request) => rollWithEffects(request)} />
      <RequestGrid title="Saving Throws" requests={filteredSavingThrows} rollMode={rollMode} onRoll={(request) => rollWithEffects(request)} />
      <RequestGrid title="Skill Checks" requests={filteredSkillChecks} rollMode={rollMode} onRoll={(request) => rollWithEffects(request)} />

      <section className="space-y-2">
        <SectionHeader
          actions={<StatusBadge label={`${filteredActionRolls.length}`} status="info" />}
          title="Action Rolls"
        />
        {filteredActionRolls.length === 0 ? (
          <EmptyState
            title="Action Rolls"
            description={normalizedActionSearch ? "No action entries match current search." : "No action entries resolved."}
          />
        ) : (
          <ul className="space-y-2">
            {filteredActionRolls.map((descriptor) => (
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
      </section>

      {showSpellRolls ? (
        <section className="space-y-2">
          <SectionHeader
            actions={<StatusBadge label={`${filteredSpellRolls.length}`} status="info" />}
            title="Spell Rolls"
          />
          {filteredSpellRolls.length === 0 ? (
            <EmptyState
              title="Spell Rolls"
              description={
                normalizedActionSearch
                  ? "No spell action entries match current search."
                  : "Spell roll actions appear when a selected spell has an attack, save, or damage context."
              }
            />
          ) : (
            <ul className="space-y-2">
              {filteredSpellRolls.map((descriptor) => (
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
        </section>
      ) : null}
    </div>
  );
}
