import { useMemo, useState } from "react";
import type { ActiveEffectCatalogEntry, ActiveEffectDefinition } from "../../../../domain/rules";
import type { CharacterRollView, RollActionDescriptor, RollMode, RollRequest, RollResult, RollType } from "../../../../domain/rolls";
import type { PlayResourceCounter } from "../../../../services/playState";
import { searchActiveEffectCatalog, type ActiveEffectCatalogEffectFilter, type ActiveEffectCatalogSourceFilter } from "../../../../services/rules";
import { ActionCard, EmptyState, InfoPopover, SectionHeader, StatusBadge } from "./SheetDesignSystem";
import { ruleInfo } from "./rulesInfo";

interface ActionRollPanelProps {
  rollView: CharacterRollView;
  lastRoll?: RollResult;
  rollMode: RollMode;
  onRollModeChange: (mode: RollMode) => void;
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

type ActionGroupId = "attacks" | "actions" | "bonus-actions" | "reactions" | "resources";
type RollListGroupId = "ability-checks" | "saving-throws" | "skill-checks" | "spell-rolls";
type ActionPanelGroupId = ActionGroupId | RollListGroupId;
type MasteryAutomationStatus = "automated" | "manual" | "unsupported";

const ACTION_GROUP_CONFIG: Record<ActionGroupId, { title: string; subtitle: string }> = {
  attacks: { title: "Attacks", subtitle: "Primary combat attacks and damage profiles." },
  actions: { title: "Actions", subtitle: "Standard action economy entries." },
  "bonus-actions": { title: "Bonus Actions", subtitle: "Quick options with bonus-action timing." },
  reactions: { title: "Reactions", subtitle: "Reaction-triggered actions." },
  resources: { title: "Resources", subtitle: "Resource-linked actions and utility entries." },
};

const MASTERY_INFO_BY_KEY: Record<string, { name: string; summary: string; automation: MasteryAutomationStatus }> = {
  cleave: {
    name: "Cleave",
    summary: "On a hit, the weapon can spill damage to a nearby second target.",
    automation: "manual",
  },
  graze: {
    name: "Graze",
    summary: "On a miss, still deal ability-modifier damage to the target.",
    automation: "manual",
  },
  nick: {
    name: "Nick",
    summary: "Enables a faster off-hand style strike during your attack sequence.",
    automation: "manual",
  },
  push: {
    name: "Push",
    summary: "Can move the target away from you after a successful hit.",
    automation: "manual",
  },
  sap: {
    name: "Sap",
    summary: "Can weaken the target's next offensive pressure.",
    automation: "manual",
  },
  slow: {
    name: "Slow",
    summary: "Can reduce the target's speed for the round.",
    automation: "manual",
  },
  topple: {
    name: "Topple",
    summary: "Can force a target prone after a successful hit.",
    automation: "manual",
  },
  vex: {
    name: "Vex",
    summary: "Can set up advantage pressure for a follow-up attack.",
    automation: "manual",
  },
};

function modifierLabel(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function breakdownValueLabel(value: number | string | boolean): string {
  if (typeof value === "number") {
    return modifierLabel(value);
  }
  return String(value);
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

function normalizeMasteryToken(value: string | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function masteryInfoForToken(token: string | undefined) {
  return token ? MASTERY_INFO_BY_KEY[token] : undefined;
}

function masteryStatusTone(status: MasteryAutomationStatus): "complete" | "pending" | "unsupported" {
  if (status === "automated") {
    return "complete";
  }
  if (status === "manual") {
    return "pending";
  }
  return "unsupported";
}

type WeaponProfileMetadata = {
  usageMode?: "melee" | "ranged" | "thrown" | "versatile-one-hand" | "versatile-two-hand";
  versatileDamageDice?: string;
  damageDice?: string;
  properties?: string[];
  range?: string;
  mastery?: string;
  masteryBadges?: string[];
  diagnostics?: string[];
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

function classifyActionGroup(descriptor: RollActionDescriptor): ActionGroupId {
  const hasAttackRoll = descriptor.rollRequest?.type === "attack-roll" || descriptor.rollRequest?.type === "spell-attack";
  const weaponLinked = descriptor.sourceType === "weapon";
  if (hasAttackRoll || weaponLinked) {
    return "attacks";
  }
  if (descriptor.activationType === "bonus-action") {
    return "bonus-actions";
  }
  if (descriptor.activationType === "reaction") {
    return "reactions";
  }
  if (descriptor.resourceIds.length > 0 || descriptor.activationType === "free" || descriptor.activationType === "utility" || descriptor.activationType === "special") {
    return "resources";
  }
  return "actions";
}

function initialCollapsedGroups(): Record<ActionPanelGroupId, boolean> {
  return {
    attacks: false,
    actions: false,
    "bonus-actions": false,
    reactions: true,
    resources: true,
    "ability-checks": true,
    "saving-throws": true,
    "skill-checks": true,
    "spell-rolls": true,
  };
}

function groupCountLabel(count: number): string {
  return count === 1 ? "1 entry" : `${count} entries`;
}

function GroupHeader({
  collapsed,
  count,
  onToggle,
  title,
  subtitle,
}: {
  collapsed: boolean;
  count: number;
  onToggle: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <SectionHeader
      actions={
        <div className="flex items-center gap-2">
          <StatusBadge label={groupCountLabel(count)} status="info" />
          <button
            aria-expanded={!collapsed}
            className="sheet-focus-ring rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-800"
            onClick={onToggle}
            type="button"
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      }
      subtitle={subtitle}
      title={title}
    />
  );
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
      className="sheet-focus-ring rounded bg-slate-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      disabled={disabled}
      title={disabled ? disabledReason ?? "Action currently unavailable." : undefined}
      onClick={() => onRoll({ ...request, rollMode })}
      type="button"
    >
      {children}
    </button>
  );
}

function ActionDescriptorRow({
  descriptor,
  lastRoll,
  rollMode,
  resourceById,
  versatileMode,
  onChangeVersatileMode,
  onRoll,
  onSpendResource,
}: {
  descriptor: RollActionDescriptor;
  lastRoll?: RollResult;
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
  const masteryToken = normalizeMasteryToken(weaponProfile?.mastery);
  const masteryInfo = masteryInfoForToken(masteryToken);
  const masteryName = masteryInfo?.name ?? (weaponProfile?.mastery ? weaponProfile.mastery : masteryBadges.length ? "Mastery selected" : undefined);
  const masteryAutomation: MasteryAutomationStatus | undefined = masteryInfo?.automation ?? (masteryName ? "unsupported" : undefined);
  const masterySummary = masteryInfo?.summary ?? (masteryName ? "Mastery selected, details unavailable." : undefined);
  const masteryDiagnostics = weaponProfile?.diagnostics?.find((entry) => entry.toLowerCase().includes("mastery"));
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
  const linkedResult =
    lastRoll && (
      (effectiveRollRequest && lastRoll.requestId === effectiveRollRequest.id) ||
      (effectiveDamageRequest && lastRoll.requestId === effectiveDamageRequest.id)
    ) ? lastRoll : undefined;
  const linkedNatural = linkedResult?.naturalRoll ?? linkedResult?.dice.keptRoll ?? linkedResult?.dice.rawRolls[0];
  const linkedBaseModifier = linkedResult?.baseModifier ?? linkedResult?.modifier;
  const linkedEffects = linkedResult?.activeEffects?.map((entry) => entry.label) ?? [];
  const linkedTemporaryModifiers = linkedResult?.temporaryModifierBreakdown?.filter((entry) => entry.applied) ?? [];
  const linkedPermanentModifiers = linkedResult?.permanentModifierBreakdown?.filter((entry) => entry.applied) ?? [];
  const linkedEffectsLabel = linkedEffects.length > 0 ? linkedEffects.join(", ") : "None";
  const linkedModifierContributions = [...linkedPermanentModifiers, ...linkedTemporaryModifiers];
  const rollAttackAndDamage = () => {
    if (effectiveRollRequest) {
      onRoll({ ...effectiveRollRequest, rollMode });
    }
    if (effectiveDamageRequest) {
      onRoll({ ...effectiveDamageRequest, rollMode: "normal" });
    }
  };

  return (
    <li>
      <ActionCard
        title={descriptor.label}
        subtitle={`${descriptor.activationType ?? "action"}${descriptor.sourceSummary ? ` · ${descriptor.sourceSummary}` : ""}${descriptor.rollRequest ? ` · attack ${modifierLabel(descriptor.rollRequest.modifier)}` : ""}`}
        badges={
          <>
            {masteryName ? <StatusBadge label={`Mastery ${masteryName}`} status="info" /> : null}
            {masteryAutomation ? <StatusBadge label={masteryAutomation} status={masteryStatusTone(masteryAutomation)} /> : null}
            {weaponProperties.map((property) => (
              <StatusBadge key={`${descriptor.id}:${property}`} label={property} status="info" />
            ))}
            {ambiguousResources ? <StatusBadge label="manual resource spend" status="blocked" /> : null}
            {resource ? <StatusBadge label={`${resource.name} ${resource.remaining}/${resource.max}`} status={resource.remaining > 0 ? "complete" : "pending"} /> : null}
            {weaponProfile?.range ? <StatusBadge label={`range ${weaponProfile.range}`} status="info" /> : null}
          </>
        }
        actions={
          <>
            {effectiveRollRequest ? (
              <RollButton request={effectiveRollRequest} rollMode={rollMode} onRoll={(request) => onRoll(request)}>
                Attack Roll
              </RollButton>
            ) : null}
            {effectiveDamageRequest ? (
              <RollButton request={effectiveDamageRequest} rollMode="normal" onRoll={(request) => onRoll(request)}>
                Damage Roll
              </RollButton>
            ) : null}
            {effectiveRollRequest && effectiveDamageRequest ? (
              <button
                aria-label={`Roll attack and damage for ${descriptor.label}`}
                className="sheet-focus-ring rounded bg-indigo-700 px-3 py-2 text-sm text-white"
                onClick={rollAttackAndDamage}
                type="button"
              >
                Attack + Damage
              </button>
            ) : null}
            {effectiveRollRequest && singleResourceId ? (
              <button
                aria-label={`Roll and spend ${resource?.name ?? "resource"} for ${descriptor.label}`}
                className="sheet-focus-ring rounded bg-indigo-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
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
                className="sheet-focus-ring rounded bg-slate-200 px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
        {masteryName ? (
          <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-slate-900">Weapon Mastery: {masteryName}</p>
              <div className="flex items-center gap-1">
                {masteryAutomation ? <StatusBadge label={masteryAutomation} status={masteryStatusTone(masteryAutomation)} /> : null}
                <InfoPopover title="Weapon Mastery" description={ruleInfo("weapon-mastery")} />
              </div>
            </div>
            {masterySummary ? <p className="mt-1">{masterySummary}</p> : null}
            {masteryAutomation !== "automated" ? (
              <p className="mt-1 text-[11px] text-slate-600">Manual: remember this effect when resolving the attack.</p>
            ) : null}
            {masteryDiagnostics ? <p className="mt-1 text-[11px] text-slate-500">Diagnostics: {masteryDiagnostics}</p> : null}
          </div>
        ) : null}
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
        {linkedResult ? (
          <div className="mt-2 rounded border border-indigo-200 bg-indigo-50 p-2 text-xs text-slate-700">
            <p className="font-medium text-indigo-900">Last Result: {linkedResult.label}</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-indigo-700">d20</dt>
                <dd className="font-medium text-slate-900">{linkedNatural ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-indigo-700">Modifier</dt>
                <dd className="font-medium text-slate-900">{modifierLabel(linkedBaseModifier ?? 0)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] uppercase tracking-wide text-indigo-700">Effects</dt>
                <dd>{linkedEffectsLabel}</dd>
              </div>
              {linkedModifierContributions.length ? (
                <div className="col-span-2">
                  <dt className="text-[11px] uppercase tracking-wide text-indigo-700">Modifiers</dt>
                  <dd>{linkedModifierContributions.map((entry) => `${entry.sourceName} ${breakdownValueLabel(entry.value)}`).join(", ")}</dd>
                </div>
              ) : null}
              <div className="col-span-2">
                <dt className="text-[11px] uppercase tracking-wide text-indigo-700">Total</dt>
                <dd className="font-semibold text-slate-900">{linkedResult.total}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </ActionCard>
    </li>
  );
}

function RequestList({
  requests,
  rollMode,
  onRoll,
}: {
  requests: RollRequest[];
  rollMode: RollMode;
  onRoll: (request: RollRequest) => void;
}) {
  return (
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
  );
}

export function ActionRollPanel({
  rollView,
  lastRoll,
  rollMode,
  onRollModeChange,
  resources,
  activeEffectCatalog = [],
  showSpellRolls = true,
  onRoll,
  onSpendResource,
  onActivateEffect,
  onCreateCustomEffect,
}: ActionRollPanelProps) {
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
  const [showCustomBuffEditor, setShowCustomBuffEditor] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<ActionPanelGroupId, boolean>>(initialCollapsedGroups);

  const resourceById = useMemo(() => new Map(resources.map((resource) => [resource.id, resource])), [resources]);
  const actionableSpells = useMemo(
    () => rollView.spellRolls.filter((entry) => entry.rollRequest || entry.damageRequest || entry.spellSaveDc),
    [rollView.spellRolls],
  );
  const activeEffects = rollView.activeEffects?.filter((effect) => effect.status === "active") ?? [];
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
  const groupedActions = useMemo(() => {
    const grouped: Record<ActionGroupId, RollActionDescriptor[]> = {
      attacks: [],
      actions: [],
      "bonus-actions": [],
      reactions: [],
      resources: [],
    };
    for (const descriptor of filteredActionRolls) {
      grouped[classifyActionGroup(descriptor)].push(descriptor);
    }
    return grouped;
  }, [filteredActionRolls]);
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
  const totalSearchEntries =
    filteredActionRolls.length +
    filteredAbilityChecks.length +
    filteredSavingThrows.length +
    filteredSkillChecks.length +
    (showSpellRolls ? filteredSpellRolls.length : 0);

  const toggleSourceFilter = (value: ActiveEffectCatalogSourceFilter) => {
    setSourceFilters((current) => current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]);
  };

  const toggleGroup = (groupId: ActionPanelGroupId) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
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

  const renderActionGroup = (groupId: ActionGroupId) => {
    const group = groupedActions[groupId];
    const config = ACTION_GROUP_CONFIG[groupId];
    const collapsed = collapsedGroups[groupId];
    return (
      <section key={groupId} className="space-y-2">
        <GroupHeader
          collapsed={collapsed}
          count={group.length}
          onToggle={() => toggleGroup(groupId)}
          subtitle={config.subtitle}
          title={config.title}
        />
        {!collapsed ? (
          group.length === 0 ? (
            <EmptyState
              title={config.title}
              description={normalizedActionSearch ? `No ${config.title.toLowerCase()} match current search.` : `No ${config.title.toLowerCase()} resolved.`}
            />
          ) : (
            <ul className="space-y-2">
              {group.map((descriptor) => (
                <ActionDescriptorRow
                  key={descriptor.id}
                  descriptor={descriptor}
                  lastRoll={lastRoll}
                  onRoll={onRoll}
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
          )
        ) : null}
      </section>
    );
  };

  const renderRequestGroup = (groupId: RollListGroupId, title: string, subtitle: string, entries: RollRequest[]) => {
    const collapsed = collapsedGroups[groupId];
    return (
      <section className="space-y-2">
        <GroupHeader collapsed={collapsed} count={entries.length} onToggle={() => toggleGroup(groupId)} subtitle={subtitle} title={title} />
        {!collapsed ? (
          entries.length === 0 ? (
            <EmptyState title={title} description={normalizedActionSearch ? `No ${title.toLowerCase()} match current search.` : `No ${title.toLowerCase()} available.`} />
          ) : (
            <RequestList requests={entries} rollMode={rollMode} onRoll={(request) => onRoll(request)} />
          )
        ) : null}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader
          subtitle="Optional buffs are selected in the persistent roll dock. Execute grouped actions here."
          title="Action Console"
        />
        <label className="text-sm text-slate-700">
          Roll Mode{" "}
          <select
            aria-label="Select roll mode"
            className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            onChange={(event) => onRollModeChange(event.target.value as RollMode)}
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
          actions={<StatusBadge label={groupCountLabel(totalSearchEntries)} status="info" />}
          subtitle="Search across grouped actions, checks and spell entries."
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

      {renderActionGroup("attacks")}
      {renderActionGroup("actions")}
      {renderActionGroup("bonus-actions")}
      {renderActionGroup("reactions")}
      {renderActionGroup("resources")}

      {renderRequestGroup("ability-checks", "Ability Checks", "Core ability checks for quick calls.", filteredAbilityChecks)}
      {renderRequestGroup("saving-throws", "Saving Throws", "Defensive checks with save modifiers.", filteredSavingThrows)}
      {renderRequestGroup("skill-checks", "Skill Checks", "Skill list sorted for table use.", filteredSkillChecks)}

      {showSpellRolls ? (
        <section className="space-y-2">
          <GroupHeader
            collapsed={collapsedGroups["spell-rolls"]}
            count={filteredSpellRolls.length}
            onToggle={() => toggleGroup("spell-rolls")}
            subtitle="Spell action entries with attack/save/damage context."
            title="Spell Rolls"
          />
          {!collapsedGroups["spell-rolls"] ? (
            filteredSpellRolls.length === 0 ? (
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
                    lastRoll={lastRoll}
                    onRoll={onRoll}
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
            )
          ) : null}
        </section>
      ) : null}

      {onActivateEffect ? (
        <div className="sheet-card space-y-2 bg-slate-50 p-3">
          <SectionHeader subtitle="Search and activate mapped support effects" title="Activate External Buff" />
          <div className="flex flex-wrap gap-2">
            {(["spells", "features", "items", "custom"] as const).map((value) => (
              <button
                key={value}
                className={`sheet-focus-ring rounded px-2 py-1 text-xs ${sourceFilters.includes(value) ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
                onClick={() => toggleSourceFilter(value)}
                type="button"
              >
                {value === "spells" ? "Spells" : value === "features" ? "Features" : value === "items" ? "Items" : "Custom"}
              </button>
            ))}
            {(["all", "roll-bonus", "ac-bonus"] as const).map((value) => (
              <button
                key={value}
                className={`sheet-focus-ring rounded px-2 py-1 text-xs ${effectFilter === value ? "bg-indigo-700 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
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
    </div>
  );
}
