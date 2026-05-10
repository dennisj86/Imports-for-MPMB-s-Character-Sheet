import { useState } from "react";
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
import { equipItem, setHpGainMethod, unequipItem } from "../services/equipment";
import { setAsiOrFeatOption } from "../services/levelUp";
import { buildCharacterRollView, getLatestRollResult } from "../services/rolls";
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
          <div key={ability} className="rounded border border-slate-200 p-2 text-center text-sm">
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
    <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      <p className="text-xs uppercase text-slate-500">AC Breakdown</p>
      <p className="mt-1">
        Base {armorClass.armorBase}
        {armorClass.armorName ? ` (${armorClass.armorName})` : ""} · Dex {modifierLabel(armorClass.dexApplied)} · Shield +{armorClass.shieldBonus} · Bonus +
        {armorClass.bonus}
      </p>
      {armorClass.shieldName ? <p className="text-xs text-slate-600">Shield: {armorClass.shieldName}</p> : null}
    </div>
  );
}

function CoreStatGrid({ cards }: { cards: ReturnType<typeof buildCombatViewModel>["coreStats"] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.id} className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase text-slate-500">{card.label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{card.value}</p>
          {card.sublabel ? <p className="text-xs text-slate-600">{card.sublabel}</p> : null}
        </div>
      ))}
    </div>
  );
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
  const lastRoll = getLatestRollResult(playState.playEvents);
  const combat = buildCombatViewModel({
    draft,
    engine,
    playState,
    maxHp: playStateView.runtime.maxHp,
    hitDicePools: playStateView.hitDiceCounters,
  });
  const spellbook = buildSpellbookViewModel(engine, rollView.spellRolls);
  const inventory = buildInventoryViewModel(draft, engine);
  const featureGroups = buildFeatureGroupsViewModel(engine);
  const progression = buildProgressionViewModel(draft, engine);
  const equipInventoryItem = (itemInstanceId: string, slot?: Parameters<typeof equipItem>[3]) => {
    updateCharacter(draft.id, (current) => equipItem(current, engine.equipmentCatalog, itemInstanceId, slot).draft);
  };
  const unequipInventoryItem = (itemInstanceId: string) => {
    updateCharacter(draft.id, (current) => unequipItem(current, engine.equipmentCatalog, itemInstanceId).draft);
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
    <div className="space-y-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">{draft.name}</h1>
            <p className="text-sm text-slate-700">{combat.characterLine}</p>
            <p className="text-sm text-slate-600">{combat.originLine}</p>
          </div>
          <div className="flex gap-2">
            <Link className="rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-800" to={`/builder/${draft.id}`}>
              Edit Builder
            </Link>
            <Link className="rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-800" to="/">
              Back
            </Link>
          </div>
        </div>
        <CoreStatGrid cards={combat.coreStats} />
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded border border-slate-200 bg-white p-1">
        {SHEET_TABS.map((tab) => (
          <button
            key={tab}
            className={`rounded px-3 py-2 text-sm ${activeTab === tab ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {SHEET_TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr),minmax(320px,1fr)]">
          <div className="space-y-4">
            <Panel title="Vitals">
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
            </Panel>

            <Panel title="Core Combat">
              <div className="space-y-3">
                <ArmorBreakdown armorClass={combat.armorClass} />
                <AbilitySummary derivedStats={engine.derivedStats} />
                <p className="text-sm text-slate-700">{combat.passiveSummary}</p>
              </div>
            </Panel>

            <Panel title="Conditions & Concentration">
              <div className="grid gap-4 lg:grid-cols-2">
                <ConditionTray activeConditions={playState.activeConditions} onToggleCondition={playStateView.toggleCondition} />
                <ConcentrationPanel
                  concentration={playState.concentration}
                  onEnd={playStateView.endConcentration}
                  onStart={playStateView.startConcentration}
                />
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Resources">
              <ResourceTracker
                onRestore={playStateView.restoreResource}
                onSpend={playStateView.spendResource}
                resources={playStateView.resourceCounters.slice(0, 6)}
              />
            </Panel>

            <Panel title="Rest">
              <div className="space-y-2 text-sm">
                <p className="text-slate-700">Hit Dice {combat.hitDiceSummary}</p>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded bg-slate-700 px-3 py-2 text-sm text-white" onClick={playStateView.applyShortRest} type="button">
                    Short Rest
                  </button>
                  <button className="rounded bg-indigo-700 px-3 py-2 text-sm text-white" onClick={playStateView.applyLongRest} type="button">
                    Long Rest
                  </button>
                  <button className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-800" onClick={() => setActiveTab("manage")} type="button">
                    Rest Details
                  </button>
                </div>
              </div>
            </Panel>

            <Panel title="Last Roll">
              {lastRoll ? (
                <div className="rounded border border-indigo-200 bg-indigo-50 p-3 text-sm">
                  <p className="font-semibold">{lastRoll.label}</p>
                  <p>
                    {lastRoll.diceExpression} {modifierLabel(lastRoll.modifier)} = <span className="font-semibold">{lastRoll.total}</span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No rolls yet.</p>
              )}
            </Panel>

            <Panel title="Play Log">
              <PlayLogPanel events={playState.playEvents} />
            </Panel>
          </div>
        </div>
      ) : null}

      {activeTab === "actions" ? (
        <Panel title="Actions & Rolls">
          <ActionRollPanel
            lastRoll={lastRoll}
            onRoll={playStateView.roll}
            onSpendResource={playStateView.spendResource}
            resources={playStateView.resourceCounters}
            rollView={rollView}
            showSpellRolls={false}
          />
        </Panel>
      ) : null}

      {activeTab === "spells" ? (
        <Panel title="Spellbook">
          <SpellbookPanel
            onCastSpell={playStateView.castSpell}
            onRestoreSlot={playStateView.restoreSpellSlot}
            onRoll={playStateView.roll}
            onSpendSlot={playStateView.spendSpellSlot}
            slots={playStateView.spellSlotCounters}
            viewModel={spellbook}
          />
        </Panel>
      ) : null}

      {activeTab === "inventory" ? (
        <Panel title="Inventory & Equipment">
          <InventoryPanel onEquipItem={equipInventoryItem} onUnequipItem={unequipInventoryItem} viewModel={inventory} />
        </Panel>
      ) : null}

      {activeTab === "features" ? (
        <Panel title="Features & Traits">
          <FeatureCardsPanel groups={featureGroups} />
        </Panel>
      ) : null}

      {activeTab === "manage" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Level Progression">
            <div className="space-y-3 text-sm">
              <p>
                Level {progression.currentLevel} · {progression.className}
                {progression.subclassName ? ` (${progression.subclassName})` : ""}
              </p>
              <p className="text-xs text-slate-600">{progression.pendingChoiceCount} open level-up choice(s)</p>
              {progression.pendingChoices.length ? (
                <ul className="space-y-2">
                  {progression.pendingChoices.map((choice) => (
                    <li key={choice.id} className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
                      <p className="font-medium">{choice.label}</p>
                      <p className="text-xs">{choice.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-600">No required progression choices are exposed for this level.</p>
              )}
              <Link className="inline-block rounded bg-slate-800 px-3 py-2 text-sm text-white" to={`/builder/${draft.id}`}>
                Open Builder Choices
              </Link>
            </div>
          </Panel>

          <Panel title="Level-Up Choice Surface">
            <div className="space-y-3 text-sm">
              <div>
                <p className="mb-1 font-medium">Max HP Gain Method</p>
                {progression.hpGainChoices.length === 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {progression.hpGainMethods.map((method) => (
                      <button
                        key={method}
                        className={`rounded border px-2 py-1 text-xs ${
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
                      <div key={choice.level} className="rounded border border-slate-200 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium">Level {choice.level}</p>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{choice.status}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {progression.hpGainMethods.map((method) => (
                            <button
                              key={`${choice.level}-${method}`}
                              className={`rounded border px-2 py-1 text-xs ${
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
                              type="number"
                              value={choice.value ?? ""}
                              placeholder="Value"
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                chooseHpGainMethodForLevel(choice.level, choice.selectedMethod, Number.isFinite(value) && value > 0 ? value : undefined);
                              }}
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
                  <p className="text-xs text-slate-600">No structured ASI/Feat choice is exposed for the current level.</p>
                ) : (
                  <ul className="space-y-2">
                    {progression.asiOrFeatChoices.map((choice) => (
                      <li key={choice.id} className="rounded border border-slate-200 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">Level {choice.level} ASI / Feat</p>
                            <p className="text-xs text-slate-600">{choice.detail}</p>
                          </div>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{choice.status}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {choice.options.map((option) => (
                            <button
                              key={option}
                              className={`rounded border px-2 py-1 text-xs ${
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
              <ul className="space-y-2">
                {progression.missingCapabilities.map((entry) => (
                  <li key={entry.id} className="rounded border border-slate-200 p-2">
                    <p className="font-medium">{entry.label}</p>
                    <p className="text-xs text-slate-600">{entry.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="Rest & Hit Dice">
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
          </Panel>

          <Panel
            title="Diagnostics"
            rightSlot={
              <button className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800" onClick={() => setShowDiagnostics((value) => !value)} type="button">
                {showDiagnostics ? "Hide Diagnostics" : "Show Diagnostics"}
              </button>
            }
          >
            {showDiagnostics ? <DiagnosticsPanel engine={engine} inventory={inventory} /> : <p className="text-sm text-slate-600">Diagnostics are hidden for regular play.</p>}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
