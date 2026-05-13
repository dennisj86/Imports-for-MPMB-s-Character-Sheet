import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { useCharacterEngine, useCharacterPlayState } from "../features/character/hooks";
import { ActionRollPanel } from "../features/character/components/sheet/ActionRollPanel";
import { ConcentrationPanel } from "../features/character/components/sheet/ConcentrationPanel";
import { ConditionTray } from "../features/character/components/sheet/ConditionTray";
import { DiagnosticsPanel } from "../features/character/components/sheet/DiagnosticsPanel";
import { FeatureCardsPanel } from "../features/character/components/sheet/FeatureCardsPanel";
import { HitPointControls } from "../features/character/components/sheet/HitPointControls";
import { InventoryPanel } from "../features/character/components/sheet/InventoryPanel";
import { PersistentRollDock } from "../features/character/components/sheet/PersistentRollDock";
import { RestControls } from "../features/character/components/sheet/RestControls";
import {
  CharacterHeroHeader,
  CoreStatCard,
  DiagnosticsDrawer,
  EmptyState,
  ResourceBadge,
  SectionHeader,
  StatPill,
  StatusBadge,
  type StatusTone,
} from "../features/character/components/sheet/SheetDesignSystem";
import { SpellbookPanel } from "../features/character/components/sheet/SpellbookPanel";
import {
  SHEET_TAB_LABELS,
  SHEET_TABS,
  buildCombatViewModel,
  buildFeatureGroupsViewModel,
  buildInventoryViewModel,
  buildOverviewResourceHighlights,
  buildProgressionViewModel,
  resolveDeathSaveRollResolution,
  buildSpellbookViewModel,
  type SheetTabId,
} from "../features/character/viewModels";
import type { RollMode, RollRequest, RollResult } from "../domain/rolls";
import { adjustCurrencyAmount as adjustInventoryCurrencyAmount, equipItem, setCurrencyAmount as setInventoryCurrencyAmount, setHpGainMethod, unequipItem } from "../services/equipment";
import { setAsiOrFeatOption } from "../services/levelUp";
import { buildCharacterRollView, getLatestRollResult } from "../services/rolls";
import { activeEffectsForRollType, buildActiveEffectCatalog, resolveCombinedRuleProficiencies } from "../services/rules";
import { useCharacterStore } from "../store/characterStore";
import { useSourceStore } from "../store/sourceStore";

function modifierLabel(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function ArmorBreakdown({ armorClass }: { armorClass: ReturnType<typeof buildCombatViewModel>["armorClass"] }) {
  return (
    <div className="sheet-card border-indigo-200 bg-indigo-50/60 p-3 text-sm">
      <SectionHeader subtitle="Armor, shield and bonus contributions" title="AC Breakdown" />
      <p className="mt-1">
        Base {armorClass.armorBase}
        {armorClass.armorName ? ` (${armorClass.armorName})` : ""} · Dex {modifierLabel(armorClass.dexApplied)} · Shield +{armorClass.shieldBonus} · Bonus +
        {armorClass.bonus}
      </p>
      {armorClass.shieldName ? <p className="text-xs text-slate-600">Shield: {armorClass.shieldName}</p> : null}
      {armorClass.modifierSources?.length ? <p className="text-xs text-slate-600">Sources: {armorClass.modifierSources.join(", ")}</p> : null}
    </div>
  );
}

function CoreStatGrid({ cards }: { cards: ReturnType<typeof buildCombatViewModel>["coreStats"] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <CoreStatCard key={card.id} highlight={card.id === "ac" || card.id === "hp"} label={card.label} sublabel={card.sublabel} value={card.value} />
      ))}
    </div>
  );
}

function coreStatValue(cards: ReturnType<typeof buildCombatViewModel>["coreStats"], id: string, fallback = "Pending"): string {
  return String(cards.find((entry) => entry.id === id)?.value ?? fallback);
}

function listLabel(values: string[], empty = "None"): string {
  return values.length > 0 ? values.join(", ") : empty;
}

function ProficiencySummary({
  proficiencies,
}: {
  proficiencies: ReturnType<typeof resolveCombinedRuleProficiencies>;
}) {
  return (
    <div className="sheet-card bg-slate-50 p-3 text-sm">
      <SectionHeader title="Proficiencies" />
      <div className="mt-2 flex flex-wrap gap-2">
        <StatPill label="Skills" value={listLabel(proficiencies.skills)} />
        <StatPill label="Expertise" value={listLabel(proficiencies.expertiseSkills)} />
        <StatPill label="Tools" value={listLabel(proficiencies.tools)} />
        <StatPill label="Languages" value={listLabel(proficiencies.languages)} />
        <StatPill label="Weapons" value={listLabel(proficiencies.weapons)} />
        <StatPill label="Armor" value={listLabel(proficiencies.armor)} />
      </div>
    </div>
  );
}

function choiceTone(status: "complete" | "missing" | "unsupported" | "needs-builder"): StatusTone {
  if (status === "complete") return "complete";
  if (status === "unsupported") return "unsupported";
  if (status === "needs-builder") return "blocked";
  return "pending";
}

function choiceLabel(status: "complete" | "missing" | "unsupported" | "needs-builder"): string {
  if (status === "missing") return "pending";
  if (status === "needs-builder") return "blocked";
  return status;
}

export function CharacterSheetPage() {
  const generation = useSourceStore((state) => state.generation);
  const activeSourceKeys = useSourceStore((state) => state.activeSourceKeys);
  const { id } = useParams<{ id: string }>();
  const characters = useCharacterStore((state) => state.characters);
  const updateCharacter = useCharacterStore((state) => state.updateCharacter);
  const [activeTab, setActiveTab] = useState<SheetTabId>("overview");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [selectedEffectIds, setSelectedEffectIds] = useState<string[]>([]);
  const draft = characters.find((entry) => entry.id === id);
  const engineView = useCharacterEngine(draft, activeSourceKeys, generation);
  const playStateView = useCharacterPlayState(draft, engineView?.engine, updateCharacter);

  if (!draft) {
    return (
      <Panel title="Character not found">
        <p className="text-sm text-slate-600">The selected character does not exist.</p>
        <Link className="mt-2 inline-block rounded bg-slate-800 px-3 py-2 text-sm text-white" to="/">
          Back to list
        </Link>
      </Panel>
    );
  }

  if (!engineView) {
    return (
      <Panel title="Sheet unavailable">
        <p className="text-sm text-slate-600">The character engine state could not be resolved for this character.</p>
      </Panel>
    );
  }

  if (!playStateView) {
    return (
      <Panel title="Session state unavailable">
        <p className="text-sm text-slate-600">The local play state is currently unavailable for this character.</p>
      </Panel>
    );
  }

  const engine = engineView.engine;
  const playState = playStateView.playState;
  const rollView = buildCharacterRollView(engine, playState.activeEffects);
  const activeEffectCatalog = useMemo(
    () => buildActiveEffectCatalog(engineView.snapshot),
    [engineView.snapshot],
  );
  const combinedProficiencies = useMemo(
    () => resolveCombinedRuleProficiencies(engine.appliedRules, engine.ruleEngine.optionScoped),
    [engine.appliedRules, engine.ruleEngine.optionScoped],
  );
  const lastRoll = getLatestRollResult(playState.playEvents);
  const combat = buildCombatViewModel({
    draft,
    engine,
    playState,
    maxHp: playStateView.runtime.maxHp,
    hitDicePools: playStateView.hitDiceCounters,
  });
  const spellbook = buildSpellbookViewModel(engine, rollView.spellRolls);
  const inventory = buildInventoryViewModel(draft, engine, playState);
  const featureGroups = buildFeatureGroupsViewModel(engine);
  const progression = buildProgressionViewModel(draft, engine);
  const rollEffects = rollView.activeEffects ?? [];
  const selectableRollEffects = useMemo(
    () =>
      rollEffects
        .filter((effect) => effect.status === "active")
        .filter((effect) => effect.applicableRollTypes.length > 0)
        .filter((effect) => effect.targets.includes("self") || effect.targets.includes("global")),
    [rollEffects],
  );
  useEffect(() => {
    setSelectedEffectIds((current) => current.filter((id) => selectableRollEffects.some((effect) => effect.id === id)));
  }, [selectableRollEffects]);
  const overviewResourceHighlights = useMemo(
    () => buildOverviewResourceHighlights(playStateView.resourceCounters, playStateView.spellSlotCounters, 5),
    [playStateView.resourceCounters, playStateView.spellSlotCounters],
  );
  const rollWithSelectedEffects = useCallback(
    (request: RollRequest, options?: { spendResourceKey?: string; resourceLabel?: string }): RollResult | undefined => {
      const applicable = activeEffectsForRollType(selectableRollEffects, request.type).filter((effect) => selectedEffectIds.includes(effect.id));
      const temporaryModifiers = applicable.flatMap((effect) => effect.modifiers);
      const requestWithSelectedEffects: RollRequest = {
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
      const rollResult = playStateView.roll(requestWithSelectedEffects, options);
      if (requestWithSelectedEffects.type === "death-save" && rollResult && playState.currentHp <= 0 && !playState.deathSaves.dead) {
        const resolution = resolveDeathSaveRollResolution(rollResult);
        playStateView.recordDeathSave(resolution);
        if (resolution === "critical-success") {
          playStateView.applyHealing(1);
        }
      }
      return rollResult;
    },
    [playState, playStateView, selectableRollEffects, selectedEffectIds],
  );
  const rollDeathSaveFromOverview = useCallback(() => {
    rollWithSelectedEffects({
      id: "roll:overview:death-save",
      type: "death-save",
      label: "Death Save",
      sourceType: "custom",
      sourceId: "overview",
      modifier: 0,
      diceExpression: "1d20",
      rollMode,
      metadata: {
        utility: "overview-death-save",
      },
    });
  }, [rollMode, rollWithSelectedEffects]);
  const equipInventoryItem = (itemInstanceId: string, slot?: Parameters<typeof equipItem>[3]) => {
    updateCharacter(draft.id, (current) => equipItem(current, engine.equipmentCatalog, itemInstanceId, slot).draft);
  };
  const unequipInventoryItem = (itemInstanceId: string) => {
    updateCharacter(draft.id, (current) => unequipItem(current, engine.equipmentCatalog, itemInstanceId).draft);
  };
  const setCurrencyAmount = (denomination: "cp" | "sp" | "ep" | "gp" | "pp", amount: number) => {
    updateCharacter(draft.id, (current) => ({
      ...current,
      inventory: setInventoryCurrencyAmount(current.inventory, denomination, amount),
    }));
  };
  const adjustCurrencyAmount = (denomination: "cp" | "sp" | "ep" | "gp" | "pp", delta: number) => {
    updateCharacter(draft.id, (current) => ({
      ...current,
      inventory: adjustInventoryCurrencyAmount(current.inventory, denomination, delta),
    }));
  };
  const chooseHpGainMethod = (method: Parameters<typeof setHpGainMethod>[2]) => {
    updateCharacter(draft.id, (current) => setHpGainMethod(current, current.classSelection.level, method));
  };
  const chooseHpGainMethodForLevel = (level: number, method: Parameters<typeof setHpGainMethod>[2], value?: number) => {
    updateCharacter(draft.id, (current) => setHpGainMethod(current, level, method, value));
  };
  const chooseAsiOrFeatOption = (choiceId: string, optionId: string) => {
    updateCharacter(draft.id, (current) =>
      setAsiOrFeatOption(current, choiceId, optionId === "feat" ? "feat" : optionId === "ability-score-improvement" ? "ability-score-improvement" : undefined),
    );
  };

  return (
    <div className="min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr),minmax(300px,360px)] lg:items-start lg:gap-4">
      <div className="min-w-0 space-y-4 pb-44 lg:pb-0">
        <CharacterHeroHeader
          actions={
            <>
              <Link className="sheet-focus-ring rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-800" to={`/builder/${draft.id}`}>
                Edit Builder
              </Link>
              <Link className="sheet-focus-ring rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-800" to="/">
                Back
              </Link>
            </>
          }
          characterLine={combat.characterLine}
          footer={<CoreStatGrid cards={combat.coreStats} />}
          name={draft.name}
          originLine={combat.originLine}
        />

        <nav
          aria-label="Character sheet tabs"
          className="sheet-card sticky top-2 z-20 flex flex-nowrap gap-1 overflow-x-auto p-1"
          role="tablist"
        >
          {SHEET_TABS.map((tab) => (
            <button
              aria-controls={`${tab}-panel`}
              aria-selected={activeTab === tab}
              key={tab}
              className={`sheet-focus-ring sheet-no-overflow shrink-0 whitespace-nowrap rounded px-3 py-2 text-sm ${activeTab === tab ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              id={`${tab}-tab`}
              onClick={() => setActiveTab(tab)}
              role="tab"
              type="button"
            >
              {SHEET_TAB_LABELS[tab]}
            </button>
          ))}
        </nav>

        {activeTab === "overview" ? (
          <div aria-labelledby="overview-tab" className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.35fr),minmax(0,1fr)]" id="overview-panel" role="tabpanel">
            <div className="space-y-3">
              <section className="sheet-card p-3">
                <SectionHeader subtitle="Damage, healing and death saves in one place." title="Vitals / HP" />
                <div className="mt-2">
                  <HitPointControls
                    currentHp={playState.currentHp}
                    deathSaves={playState.deathSaves}
                    maxHp={playStateView.runtime.maxHp}
                    onApplyDamage={playStateView.applyDamage}
                    onApplyHealing={playStateView.applyHealing}
                    onRecordDeathSave={playStateView.recordDeathSave}
                    onRollDeathSave={rollDeathSaveFromOverview}
                    onReplaceTempHp={playStateView.replaceTempHp}
                    onSetCurrentHp={playStateView.setCurrentHp}
                    onSetTempHp={playStateView.setTempHp}
                    tempHp={playState.tempHp}
                  />
                </div>
              </section>

              <section className="sheet-card p-3">
                <SectionHeader subtitle="Defensive snapshot with fast combat reference." title="AC & Combat Summary" />
                <div className="mt-2 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <CoreStatCard
                      highlight
                      label="Armor Class"
                      sublabel={combat.armorClass.armorName ? combat.armorClass.armorName : "Unarmored"}
                      value={String(combat.armorClass.total)}
                    />
                    <CoreStatCard
                      label="Hit Dice"
                      sublabel="Available for short rests"
                      value={combat.hitDiceSummary}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatPill label="Initiative" value={coreStatValue(combat.coreStats, "initiative")} />
                    <StatPill label="Speed" value={coreStatValue(combat.coreStats, "speed")} />
                    <StatPill label="Proficiency" value={coreStatValue(combat.coreStats, "proficiency")} />
                    <StatPill label="Passives" value={combat.passiveSummary} />
                  </div>
                  <ArmorBreakdown armorClass={combat.armorClass} />
                </div>
              </section>
            </div>

            <div className="space-y-3">
              <section className="sheet-card p-3">
                <SectionHeader subtitle="Visibility for current tactical restrictions." title="Conditions & Concentration" />
                <div className="mt-2 grid gap-3 xl:grid-cols-2">
                  <ConditionTray activeConditions={playState.activeConditions} onToggleCondition={playStateView.toggleCondition} />
                  <ConcentrationPanel
                    concentration={playState.concentration}
                    onEnd={playStateView.endConcentration}
                    onStart={playStateView.startConcentration}
                  />
                </div>
              </section>

              <section className="sheet-card p-3">
                <SectionHeader subtitle="Most-used counters at a glance." title="Resource Highlights" />
                {overviewResourceHighlights.length ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {overviewResourceHighlights.map((resource) => (
                      <ResourceBadge
                        key={resource.id}
                        label={resource.label}
                        max={resource.max}
                        rechargeLabel={resource.rechargeLabel}
                        remaining={resource.remaining}
                        source={resource.source}
                        quietInfo
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="Resource Highlights" description="No tracked resources available." />
                )}
              </section>

              <ProficiencySummary proficiencies={combinedProficiencies} />

              <section className="sheet-card p-3">
                <SectionHeader subtitle="Short and long rest controls stay close." title="Quick Rest Controls" />
                <div className="mt-2 space-y-2 text-sm">
                  <p className="text-slate-700">Hit Dice {combat.hitDiceSummary}</p>
                  <div className="flex flex-wrap gap-2">
                    <button className="sheet-focus-ring rounded bg-slate-700 px-3 py-2 text-sm text-white" onClick={playStateView.applyShortRest} type="button">
                      Short Rest
                    </button>
                    <button className="sheet-focus-ring rounded bg-indigo-700 px-3 py-2 text-sm text-white" onClick={playStateView.applyLongRest} type="button">
                      Long Rest
                    </button>
                    <button className="sheet-focus-ring rounded bg-slate-200 px-3 py-2 text-sm text-slate-800" onClick={() => setActiveTab("manage")} type="button">
                      Rest Details
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "actions" ? (
          <section aria-labelledby="actions-tab" className="sheet-card min-w-0 p-3" id="actions-panel" role="tabpanel">
            <SectionHeader subtitle="Grouped action surface with reduced scrolling." title="Actions & Rolls" />
            <ActionRollPanel
              activeEffectCatalog={activeEffectCatalog}
              lastRoll={lastRoll}
              onActivateEffect={playStateView.addActiveEffect}
              onCreateCustomEffect={playStateView.addCustomActiveEffect}
              onRoll={rollWithSelectedEffects}
              onRollModeChange={setRollMode}
              onSpendResource={playStateView.spendResource}
              resources={playStateView.resourceCounters}
              rollMode={rollMode}
              rollView={rollView}
              showSpellRolls={false}
            />
          </section>
        ) : null}

        {activeTab === "spells" ? (
          <section aria-labelledby="spells-tab" className="sheet-card min-w-0 p-4" id="spells-panel" role="tabpanel">
            <SectionHeader subtitle="Readable spell cards with cast controls and effect hints" title="Spellbook" />
            <SpellbookPanel
              onCastSpell={playStateView.castSpell}
              onRestoreSlot={playStateView.restoreSpellSlot}
              onRoll={playStateView.roll}
              onSpendSlot={playStateView.spendSpellSlot}
              slots={playStateView.spellSlotCounters}
              viewModel={spellbook}
            />
          </section>
        ) : null}

        {activeTab === "inventory" ? (
          <section aria-labelledby="inventory-tab" className="sheet-card min-w-0 p-4" id="inventory-panel" role="tabpanel">
            <SectionHeader subtitle="Equipped state, armor/shield/weapon cards and AC readability" title="Inventory & Equipment" />
            <InventoryPanel
              onAdjustCurrency={adjustCurrencyAmount}
              onEquipItem={equipInventoryItem}
              onSetCurrency={setCurrencyAmount}
              onUnequipItem={unequipInventoryItem}
              viewModel={inventory}
            />
          </section>
        ) : null}

        {activeTab === "features" ? (
          <section aria-labelledby="features-tab" className="sheet-card min-w-0 p-4" id="features-panel" role="tabpanel">
            <SectionHeader subtitle="Compact feature cards with applied choice summaries" title="Features & Traits" />
            <FeatureCardsPanel groups={featureGroups} />
          </section>
        ) : null}

        {activeTab === "manage" ? (
          <div aria-labelledby="manage-tab" className="grid min-w-0 gap-4 lg:grid-cols-2" id="manage-panel" role="tabpanel">
            <section className="sheet-card p-4">
              <SectionHeader subtitle="Progression and rule-choice completion state" title="Level Progression" />
              <div className="mt-3 space-y-3 text-sm">
                <p>
                  Level {progression.currentLevel} · {progression.className}
                  {progression.subclassName ? ` (${progression.subclassName})` : ""}
                </p>
                <p className="text-xs text-slate-600">
                  {progression.levelUpPendingChoiceCount} open level-up progression choice(s) · {progression.rulePendingChoiceCount} open rule choice(s)
                </p>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label="complete" status="complete" />
                  <StatusBadge label="pending" status="pending" />
                  <StatusBadge label="unsupported" status="unsupported" />
                  <StatusBadge label="blocked" status="blocked" />
                </div>
                {progression.pendingChoices.length ? (
                  <ul className="space-y-2">
                    {progression.pendingChoices.map((choice) => (
                      <li key={choice.id} className="sheet-card p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{choice.label}</p>
                          <StatusBadge label={choiceLabel(choice.status)} status={choiceTone(choice.status)} />
                        </div>
                        <p className="text-xs text-slate-600">{choice.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : progression.ruleChoices.some((choice) => choice.status === "missing" || choice.status === "unsupported") ? (
                  <p className="text-slate-600">No level-up-only progression choices are exposed; open rule choices are listed below.</p>
                ) : (
                  <p className="text-slate-600">No required progression choices are exposed for this level.</p>
                )}
                {progression.ruleChoices.length ? (
                  <div className="space-y-2">
                    <SectionHeader title="Rule Choices" />
                    {progression.ruleChoices.map((choice) => (
                      <div key={choice.id} className="sheet-card p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{choice.label}</p>
                          <StatusBadge label={choiceLabel(choice.status)} status={choiceTone(choice.status)} />
                        </div>
                        <p className="text-xs text-slate-600">{choice.detail}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                <Link className="sheet-focus-ring inline-block rounded bg-slate-800 px-3 py-2 text-sm text-white" to={`/builder/${draft.id}`}>
                  Open Builder Choices
                </Link>
              </div>
            </section>

            <section className="sheet-card p-4">
              <SectionHeader subtitle="HP gains, ASI/Feat controls and unresolved blockers" title="Level-Up Choice Surface" />
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="mb-1 font-medium">Max HP Gain Method</p>
                  {progression.hpGainChoices.length === 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {progression.hpGainMethods.map((method) => (
                        <button
                          key={method}
                          className={`sheet-focus-ring rounded border px-2 py-1 text-xs ${
                            progression.selectedHpGainMethod === method ? "border-indigo-700 bg-indigo-50 text-indigo-800" : "border-slate-200 text-slate-700"
                          }`}
                          onClick={() => chooseHpGainMethod(method)}
                          type="button"
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {progression.hpGainChoices.map((choice) => (
                        <div key={choice.level} className="sheet-card p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-medium">Level {choice.level}</p>
                            <StatusBadge label={choice.status === "missing" ? "pending" : choice.status} status={choice.status === "missing" ? "pending" : "complete"} />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {progression.hpGainMethods.map((method) => (
                              <button
                                key={`${choice.level}-${method}`}
                                className={`sheet-focus-ring rounded border px-2 py-1 text-xs ${
                                  choice.selectedMethod === method ? "border-indigo-700 bg-indigo-50 text-indigo-800" : "border-slate-200 text-slate-700"
                                }`}
                                onClick={() => chooseHpGainMethodForLevel(choice.level, method, choice.value)}
                                type="button"
                              >
                                {method}
                              </button>
                            ))}
                            {(choice.selectedMethod === "manual" || choice.selectedMethod === "rolled") ? (
                              <input
                                className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                                min={1}
                                onChange={(event) => {
                                  const value = Number(event.target.value);
                                  chooseHpGainMethodForLevel(choice.level, choice.selectedMethod, Number.isFinite(value) && value > 0 ? value : undefined);
                                }}
                                placeholder="Value"
                                type="number"
                                value={choice.value ?? ""}
                              />
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-600">{choice.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-slate-600">
                    Level-up max HP choices are separate from Hit-Dice short-rest healing.
                  </p>
                </div>
                <div>
                  <p className="mb-1 font-medium">ASI / Feat Choices</p>
                  {progression.asiOrFeatChoices.length === 0 ? (
                    <EmptyState title="ASI / Feat" description="No structured ASI/Feat choice is exposed for the current level." />
                  ) : (
                    <ul className="space-y-2">
                      {progression.asiOrFeatChoices.map((choice) => (
                        <li key={choice.id} className="sheet-card p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">Level {choice.level} ASI / Feat</p>
                              <p className="text-xs text-slate-600">{choice.detail}</p>
                            </div>
                            <StatusBadge label={choiceLabel(choice.status)} status={choiceTone(choice.status)} />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {choice.options.map((option) => (
                              <button
                                key={option}
                                className={`sheet-focus-ring rounded border px-2 py-1 text-xs ${
                                  choice.selectedOption === option ? "border-indigo-700 bg-indigo-50 text-indigo-800" : "border-slate-200 text-slate-700"
                                }`}
                                onClick={() => chooseAsiOrFeatOption(choice.id, option)}
                                type="button"
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {progression.missingCapabilities.length ? (
                  <ul className="space-y-2">
                    {progression.missingCapabilities.map((entry) => (
                      <li key={entry.id} className="sheet-card p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{entry.label}</p>
                            <p className="text-xs text-slate-600">{entry.detail}</p>
                          </div>
                          <StatusBadge label={choiceLabel(entry.status)} status={choiceTone(entry.status)} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>

            <section className="sheet-card p-4">
              <SectionHeader title="Rest & Hit Dice" />
              <RestControls
                constitutionModifier={playStateView.runtime.constitutionModifier}
                currentHp={playState.currentHp}
                hitDicePools={playStateView.hitDiceCounters}
                lastHitDieResult={playStateView.lastHitDieResult}
                maxHp={playStateView.runtime.maxHp}
                onLongRest={playStateView.applyLongRest}
                onSpendHitDie={playStateView.spendHitDie}
                onShortRest={playStateView.applyShortRest}
                plan={playStateView.runtime.restPlan}
              />
            </section>

            <DiagnosticsDrawer
              hideLabel="Hide Diagnostics"
              onToggle={() => setShowDiagnostics((value) => !value)}
              open={showDiagnostics}
              showLabel="Show Diagnostics"
              title="Diagnostics"
            >
              <DiagnosticsPanel engine={engine} inventory={inventory} />
            </DiagnosticsDrawer>
          </div>
        ) : null}
      </div>

      <aside className="hidden min-w-0 lg:block">
        <div className="sticky top-3 max-h-[calc(100vh-1rem)] overflow-y-auto pr-1">
          <PersistentRollDock
            activeEffects={rollEffects}
            lastRoll={lastRoll}
            onDismissEffect={playStateView.dismissActiveEffect}
            onRoll={rollWithSelectedEffects}
            onRollModeChange={setRollMode}
            onSelectedEffectIdsChange={setSelectedEffectIds}
            playEvents={playState.playEvents}
            rollMode={rollMode}
            selectedEffectIds={selectedEffectIds}
          />
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-300 bg-white/95 p-2 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-6xl">
          <PersistentRollDock
            activeEffects={rollEffects}
            compact
            lastRoll={lastRoll}
            onDismissEffect={playStateView.dismissActiveEffect}
            onRoll={rollWithSelectedEffects}
            onRollModeChange={setRollMode}
            onSelectedEffectIdsChange={setSelectedEffectIds}
            playEvents={playState.playEvents}
            rollMode={rollMode}
            selectedEffectIds={selectedEffectIds}
          />
        </div>
      </div>
    </div>
  );
}
