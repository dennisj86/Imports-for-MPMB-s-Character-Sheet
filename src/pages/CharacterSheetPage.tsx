import { useMemo, useState } from "react";
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
import { PlayLogPanel } from "../features/character/components/sheet/PlayLogPanel";
import { ResourceTracker } from "../features/character/components/sheet/ResourceTracker";
import { RestControls } from "../features/character/components/sheet/RestControls";
import {
  CharacterHeroHeader,
  CoreStatCard,
  DiagnosticsDrawer,
  EmptyState,
  ResourceBadge,
  RollResultCard,
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
  buildProgressionViewModel,
  buildSpellbookViewModel,
  type SheetTabId,
} from "../features/character/viewModels";
import type { DerivedCharacterStats } from "../domain/derivedStats";
import { adjustCurrencyAmount as adjustInventoryCurrencyAmount, equipItem, setCurrencyAmount as setInventoryCurrencyAmount, setHpGainMethod, unequipItem } from "../services/equipment";
import { setAsiOrFeatOption } from "../services/levelUp";
import { buildCharacterRollView, getLatestRollResult } from "../services/rolls";
import { buildActiveEffectCatalog, resolveCombinedRuleProficiencies } from "../services/rules";
import { useCharacterStore } from "../store/characterStore";
import { useSourceStore } from "../store/sourceStore";

const abilities = ["str", "dex", "con", "int", "wis", "cha"] as const;

function modifierLabel(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function AbilitySummary({
  derivedStats,
}: {
  derivedStats: DerivedCharacterStats;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {abilities.map((ability) => {
        const score = derivedStats.abilityScores[ability];
        return (
          <div key={ability} className="sheet-card p-2 text-center text-sm">
            <p className="text-xs uppercase text-slate-500">{ability}</p>
            <p className="text-lg font-semibold">{score.finalScore}</p>
            <p className="text-xs text-slate-600">{modifierLabel(score.modifier)}</p>
          </div>
        );
      })}
    </div>
  );
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
    <div className="min-w-0 space-y-4">
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
        <div aria-labelledby="overview-tab" className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr),minmax(320px,1fr)]" id="overview-panel" role="tabpanel">
          <div className="space-y-4">
            <section className="sheet-card p-4">
              <SectionHeader title="Vitals" />
              <HitPointControls
                currentHp={playState.currentHp}
                deathSaves={playState.deathSaves}
                maxHp={playStateView.runtime.maxHp}
                onApplyDamage={playStateView.applyDamage}
                onApplyHealing={playStateView.applyHealing}
                onRecordDeathSave={playStateView.recordDeathSave}
                onReplaceTempHp={playStateView.replaceTempHp}
                onSetCurrentHp={playStateView.setCurrentHp}
                onSetTempHp={playStateView.setTempHp}
                tempHp={playState.tempHp}
              />
            </section>

            <section className="sheet-card p-4">
              <SectionHeader title="Core Combat" />
              <div className="space-y-3">
                <ArmorBreakdown armorClass={combat.armorClass} />
                <AbilitySummary derivedStats={engine.derivedStats} />
                <div className="flex flex-wrap gap-2">
                  <StatPill label="Initiative" value={String(combat.coreStats.find((entry) => entry.id === "initiative")?.value ?? "Pending")} />
                  <StatPill label="Speed" value={String(combat.coreStats.find((entry) => entry.id === "speed")?.value ?? "Pending")} />
                  <StatPill label="Proficiency" value={String(combat.coreStats.find((entry) => entry.id === "proficiency")?.value ?? "Pending")} />
                  <StatPill label="Passives" value={combat.passiveSummary} />
                </div>
                <ProficiencySummary proficiencies={combinedProficiencies} />
              </div>
            </section>

            <section className="sheet-card p-4">
              <SectionHeader subtitle="Track battlefield state and concentration quickly" title="Conditions & Concentration" />
              <div className="grid gap-4 lg:grid-cols-2">
                <ConditionTray activeConditions={playState.activeConditions} onToggleCondition={playStateView.toggleCondition} />
                <ConcentrationPanel
                  concentration={playState.concentration}
                  onEnd={playStateView.endConcentration}
                  onStart={playStateView.startConcentration}
                />
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="sheet-card p-4">
              <SectionHeader subtitle="Most-used resources stay in quick reach" title="Resources" />
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                {playStateView.resourceCounters.slice(0, 4).map((resource) => (
                  <ResourceBadge
                    key={`overview-badge-${resource.id}`}
                    label={resource.name}
                    max={resource.max}
                    rechargeLabel={resource.rechargeLabel}
                    remaining={resource.remaining}
                    source={resource.sourceName}
                  />
                ))}
              </div>
              <ResourceTracker
                onRestore={playStateView.restoreResource}
                onSpend={playStateView.spendResource}
                resources={playStateView.resourceCounters.slice(0, 6)}
              />
            </section>

            <section className="sheet-card p-4">
              <SectionHeader subtitle="Short and long rest controls" title="Quick Actions" />
              <div className="space-y-2 text-sm">
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

            <RollResultCard result={lastRoll} />

            <section className="sheet-card p-4">
              <SectionHeader title="Play Log" />
              <PlayLogPanel events={playState.playEvents} />
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === "actions" ? (
        <section aria-labelledby="actions-tab" className="sheet-card min-w-0 p-4" id="actions-panel" role="tabpanel">
          <SectionHeader subtitle="Attack, damage and profile cards with active buffs" title="Actions & Rolls" />
          <ActionRollPanel
            activeEffectCatalog={activeEffectCatalog}
            lastRoll={lastRoll}
            onActivateEffect={playStateView.addActiveEffect}
            onCreateCustomEffect={playStateView.addCustomActiveEffect}
            onDismissEffect={playStateView.dismissActiveEffect}
            onRoll={playStateView.roll}
            onSpendResource={playStateView.spendResource}
            resources={playStateView.resourceCounters}
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
        <div aria-labelledby="manage-tab" className="grid min-w-0 gap-4 xl:grid-cols-2" id="manage-panel" role="tabpanel">
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
  );
}
