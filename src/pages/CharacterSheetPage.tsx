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
import { RuleDetailDrawer } from "../features/character/components/sheet/RuleDetailDrawer";
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
import type { CharacterAutomationSettings, CharacterPlayEvent } from "../domain/playState";
import type { RollEffectSelectionOrigin, RollMode, RollRequest, RollResult } from "../domain/rolls";
import { resolveCharacterEngineState } from "../services/characterEngine";
import {
  addInventoryItem,
  adjustCurrencyAmount as adjustInventoryCurrencyAmount,
  adjustInventoryItemQuantity,
  applyCurrencyNormalization,
  applyCurrencyTransaction,
  consumeInventoryItem,
  duplicateInventoryItem,
  equipItem,
  removeInventoryItem,
  setCurrencyAmount as setInventoryCurrencyAmount,
  setHpGainMethod,
  unequipItem,
  updateInventoryItem,
} from "../services/equipment";
import {
  addCharacterXp,
  applyLevelUpWithSnapshot,
  buildLevelUpPreviewDiff,
  canUndoLastLevelUp,
  setAsiOrFeatOption,
  setCharacterLevelSource,
  setCharacterMilestoneMode,
  setCharacterXp,
  undoLastLevelUp,
} from "../services/levelUp";
import { addResolvedActiveEffect } from "../services/playState";
import { buildBuilderDeepLinkHref, type BuilderDeepLinkTarget } from "../services/builderDeepLinks";
import { buildCharacterRollView, getLatestRollResult } from "../services/rolls";
import { activeEffectsForRollType, buildActiveEffectCatalog, resolveCombinedRuleProficiencies } from "../services/rules";
import { useCharacterStore } from "../store/characterStore";
import { usePartyStore } from "../store/partyStore";
import { useSourceStore } from "../store/sourceStore";
import type { ActiveEffectDefinition } from "../domain/rules";

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

function previewChoiceTone(status: "pending" | "complete" | "unsupported" | "blocked"): StatusTone {
  if (status === "complete") return "complete";
  if (status === "unsupported") return "unsupported";
  if (status === "blocked") return "blocked";
  return "pending";
}

function readinessTone(classification: "critical-blocker" | "pending-choice" | "unsupported-manual" | "informational"): StatusTone {
  if (classification === "critical-blocker") return "blocked";
  if (classification === "unsupported-manual") return "unsupported";
  if (classification === "informational") return "info";
  return "pending";
}

function readinessLabel(classification: "critical-blocker" | "pending-choice" | "unsupported-manual" | "informational"): string {
  if (classification === "critical-blocker") return "critical-blocker";
  if (classification === "unsupported-manual") return "unsupported-manual";
  if (classification === "informational") return "informational";
  return "pending-choice";
}

function builderActionLabel(input: {
  label: string;
  builderTarget?: {
    stepId: string;
  };
}): string {
  if (input.builderTarget?.stepId === "spells") {
    return "Open Builder Spells Tab";
  }
  if (/fighting style/i.test(input.label)) {
    return "Open Fighting Style Choice";
  }
  if (/weapon mastery/i.test(input.label)) {
    return "Open Weapon Mastery Choice";
  }
  if (/feat/i.test(input.label)) {
    return "Open Feat Choice";
  }
  if (/subclass/i.test(input.label)) {
    return "Open Subclass Choice";
  }
  if (input.builderTarget?.stepId === "skills") {
    return "Open Skill Choice";
  }
  return "Open Matching Choice";
}

function signedNumber(value: number): string {
  if (value === 0) {
    return "0";
  }
  return value > 0 ? `+${value}` : String(value);
}

function resolveRollEffectStrategy(settings: CharacterAutomationSettings): "manual" | "suggest" | "autoApply" {
  if (settings.rollBonuses === "manual" || settings.activeEffects === "manual") {
    return "manual";
  }
  if (settings.rollBonuses === "autoApply" && settings.activeEffects === "autoApply") {
    return "autoApply";
  }
  return "suggest";
}

function latestConcentrationPrompt(events: CharacterPlayEvent[]): CharacterPlayEvent | undefined {
  return [...events].reverse().find((event) => event.type === "concentration-check-prompt");
}

function levelUpHintDetail(input: {
  label: string;
  detail: string;
  classification: "critical-blocker" | "pending-choice" | "unsupported-manual" | "informational";
  manualHint?: string;
}) {
  return {
    name: input.label,
    gameplaySummary: input.detail,
    automationStatus: input.classification === "unsupported-manual" ? "unsupported" : input.classification === "critical-blocker" ? "manual" : "partial",
    manualInstructions: input.manualHint ?? input.detail,
    knownLimitations: input.classification === "critical-blocker" ? "Resolve this before confirming the level-up." : undefined,
  } as const;
}

export function CharacterSheetPage() {
  const generation = useSourceStore((state) => state.generation);
  const activeSourceKeys = useSourceStore((state) => state.activeSourceKeys);
  const { id: routeId, characterId, partyId } = useParams<{ id?: string; characterId?: string; partyId?: string }>();
  const id = routeId ?? characterId;
  const characters = useCharacterStore((state) => state.characters);
  const updateCharacter = useCharacterStore((state) => state.updateCharacter);
  const partyMode = usePartyStore((state) => state.mode);
  const party = usePartyStore((state) => state.party);
  const [activeTab, setActiveTab] = useState<SheetTabId>("overview");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [selectedEffectIds, setSelectedEffectIds] = useState<string[]>([]);
  const [xpDeltaInput, setXpDeltaInput] = useState("300");
  const [xpSetInput, setXpSetInput] = useState("");
  const [levelUpPreviewOpen, setLevelUpPreviewOpen] = useState(false);
  const [openLevelUpHintId, setOpenLevelUpHintId] = useState<string>();
  const [pendingDeathSave, setPendingDeathSave] = useState<
    { rollId: string; resolution: "success" | "failure" | "critical-success" | "critical-failure"; total: number } | undefined
  >();
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
  const partyAllies = useMemo(
    () =>
      partyId && party
        ? characters
          .filter((entry) => entry.id !== draft.id && party.characterIds.includes(entry.id))
          .map((entry) => ({ id: entry.id, name: entry.name }))
        : [],
    [characters, draft.id, party, partyId],
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
  const levelUpPreview = useMemo(() => {
    const targetLevel = Math.min(20, draft.classSelection.level + 1);
    if (targetLevel <= draft.classSelection.level) {
      return undefined;
    }
    const leveledDraft = {
      ...draft,
      classSelection: {
        ...draft.classSelection,
        level: targetLevel,
      },
    };
    const afterEngine = resolveCharacterEngineState(engineView.snapshot, leveledDraft, engineView.context);
    return buildLevelUpPreviewDiff(engine, afterEngine);
  }, [draft, engine, engineView.context, engineView.snapshot]);
  useEffect(() => {
    if (!progression.xp.levelUpAvailable) {
      setLevelUpPreviewOpen(false);
    }
  }, [progression.xp.levelUpAvailable]);
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
  const concentrationPromptEvent = useMemo(
    () => latestConcentrationPrompt(playState.playEvents),
    [playState.playEvents],
  );
  const concentrationPromptDc = typeof concentrationPromptEvent?.payload.dc === "number" ? concentrationPromptEvent.payload.dc : undefined;
  const concentrationSaveRequest = useMemo(
    () => rollView.savingThrows.find((entry) => entry.ability === "con"),
    [rollView.savingThrows],
  );
  const rollWithSelectedEffects = useCallback(
    (
      request: RollRequest,
      options?: { spendResourceKey?: string; resourceLabel?: string; spendResourceMode?: "manual" | "auto-safe" | "auto-unsafe" },
    ): RollResult | undefined => {
      const allApplicable = activeEffectsForRollType(selectableRollEffects, request.type);
      const manuallySelected = allApplicable.filter((effect) => selectedEffectIds.includes(effect.id));
      const effectStrategy = resolveRollEffectStrategy(playStateView.automationSettings);
      const autoCandidates = allApplicable.filter((effect) => allApplicable.length === 1 || !effect.requiresPrompt);
      const appliedEffects =
        effectStrategy === "autoApply"
          ? Array.from(new Map([...manuallySelected, ...autoCandidates].map((entry) => [entry.id, entry])).values())
          : manuallySelected;
      const suggestedEffects =
        effectStrategy === "suggest"
          ? allApplicable.filter((effect) => !manuallySelected.some((selected) => selected.id === effect.id))
          : [];
      const temporaryModifiers = appliedEffects.flatMap((effect) => effect.modifiers);
      const activeEffectOrigins = new Map<string, RollEffectSelectionOrigin>();
      for (const effect of manuallySelected) {
        activeEffectOrigins.set(effect.id, "manual");
      }
      if (effectStrategy === "autoApply") {
        for (const effect of autoCandidates) {
          if (!activeEffectOrigins.has(effect.id)) {
            activeEffectOrigins.set(effect.id, "auto");
          }
        }
      }
      const requestWithSelectedEffects: RollRequest = {
        ...request,
        temporaryModifiers: [...(request.temporaryModifiers ?? []), ...temporaryModifiers],
        selectedActiveEffectIds: Array.from(new Set([...(request.selectedActiveEffectIds ?? []), ...appliedEffects.map((effect) => effect.id)])),
        selectedActiveEffects: Array.from(
          new Map(
            [...(request.selectedActiveEffects ?? []), ...appliedEffects.map((effect) => ({
              id: effect.id,
              label: effect.label,
              sourceName: effect.sourceName,
              origin: activeEffectOrigins.get(effect.id),
            }))].map((entry) => [entry.id, entry]),
          ).values(),
        ),
        metadata: {
          ...(request.metadata ?? {}),
          effectSelectionMode: effectStrategy,
          suggestedActiveEffects: suggestedEffects.map((effect) => ({
            id: effect.id,
            label: effect.label,
            sourceName: effect.sourceName,
          })),
        },
      };
      const rollResult = playStateView.roll(requestWithSelectedEffects, options);
      if (requestWithSelectedEffects.type === "death-save" && rollResult && playState.currentHp <= 0 && !playState.deathSaves.dead) {
        const resolution = resolveDeathSaveRollResolution(rollResult);
        if (playStateView.automationSettings.deathSaves === "autoApplyResult") {
          playStateView.recordDeathSave(resolution);
          if (resolution === "critical-success") {
            playStateView.applyHealing(1);
          }
          setPendingDeathSave(undefined);
        } else {
          setPendingDeathSave({
            rollId: rollResult.id,
            resolution,
            total: rollResult.total,
          });
        }
      }
      return rollResult;
    },
    [playState, playStateView, selectableRollEffects, selectedEffectIds],
  );
  const activateEffectOnAlly = useCallback((
    allyId: string,
    effect: ActiveEffectDefinition,
    options: { external?: boolean; sourceCasterName?: string; note?: string; diceExpression?: string } = {},
  ) => {
    if (!partyId || partyMode !== "shared-server") {
      return;
    }
    updateCharacter(allyId, (current) => ({
      ...current,
      playState: addResolvedActiveEffect(current.playState, effect, {
        target: "self",
        external: options.external ?? true,
        sourceCasterName: options.sourceCasterName,
        note: options.note,
        diceExpression: options.diceExpression,
      }),
    }));
  }, [partyId, partyMode, updateCharacter]);
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
  const rollConcentrationSave = useCallback(() => {
    if (!concentrationSaveRequest) {
      return;
    }
    const metadata = {
      ...(concentrationSaveRequest.metadata ?? {}),
      utility: "concentration-check",
      concentrationPromptId: concentrationPromptEvent?.id,
      concentrationDc: concentrationPromptDc,
    };
    rollWithSelectedEffects({
      ...concentrationSaveRequest,
      label: concentrationPromptDc ? `Concentration Save (DC ${concentrationPromptDc})` : "Concentration Save",
      metadata,
      rollMode,
    });
  }, [concentrationPromptDc, concentrationPromptEvent?.id, concentrationSaveRequest, rollMode, rollWithSelectedEffects]);
  const applyPendingDeathSaveResult = useCallback(() => {
    if (!pendingDeathSave) {
      return;
    }
    playStateView.recordDeathSave(pendingDeathSave.resolution);
    if (pendingDeathSave.resolution === "critical-success") {
      playStateView.applyHealing(1);
    }
    setPendingDeathSave(undefined);
  }, [pendingDeathSave, playStateView]);
  const dismissPendingDeathSaveResult = useCallback(() => {
    setPendingDeathSave(undefined);
  }, []);
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
  const normalizeCurrency = () => {
    updateCharacter(draft.id, (current) => ({
      ...current,
      inventory: applyCurrencyNormalization(current.inventory),
    }));
  };
  const applyCurrencyTx = (input: { mode: "add" | "subtract"; denomination: "cp" | "sp" | "ep" | "gp" | "pp"; amount: number; note?: string }) => {
    updateCharacter(draft.id, (current) => ({
      ...current,
      inventory: applyCurrencyTransaction(current.inventory, input),
    }));
    playStateView.recordCurrencyTransaction(input);
  };
  const addInventoryEntry = (input: {
    name: string;
    quantity: number;
    itemType: "weapon" | "armor" | "shield" | "gear" | "tool" | "focus" | "consumable" | "ammunition" | "magic-item" | "spell-component" | "custom";
    category?: string;
    type?: string;
    notes?: string;
    equipped?: boolean;
  }) => {
    updateCharacter(draft.id, (current) => ({
      ...current,
      inventory: addInventoryItem(current.inventory, input, engine.equipmentCatalog),
    }));
  };
  const updateInventoryEntry = (
    itemInstanceId: string,
    patch: {
      name?: string;
      quantity?: number;
      itemType?: "weapon" | "armor" | "shield" | "gear" | "tool" | "focus" | "consumable" | "ammunition" | "magic-item" | "spell-component" | "custom";
      category?: string;
      type?: string;
      notes?: string;
      equipped?: boolean;
    },
  ) => {
    updateCharacter(draft.id, (current) => ({
      ...current,
      inventory: updateInventoryItem(current.inventory, itemInstanceId, patch, engine.equipmentCatalog),
    }));
  };
  const removeInventoryEntry = (itemInstanceId: string) => {
    updateCharacter(draft.id, (current) => ({
      ...current,
      inventory: removeInventoryItem(current.inventory, itemInstanceId, engine.equipmentCatalog),
    }));
  };
  const duplicateInventoryEntry = (itemInstanceId: string) => {
    updateCharacter(draft.id, (current) => ({
      ...current,
      inventory: duplicateInventoryItem(current.inventory, itemInstanceId, engine.equipmentCatalog),
    }));
  };
  const consumeInventoryEntry = (itemInstanceId: string, amount = 1) => {
    let consumedName: string | undefined;
    let consumedAmount = amount;
    let consumedRemaining: number | undefined;
    let consumedType: string | undefined;
    updateCharacter(draft.id, (current) => {
      const result = consumeInventoryItem(current.inventory, itemInstanceId, amount, engine.equipmentCatalog);
      if (result.consumed) {
        consumedName = result.itemName;
        consumedAmount = result.amount;
        consumedRemaining = result.remainingQuantity;
        consumedType = current.inventory.items.find((item) => item.instanceId === itemInstanceId || item.id === itemInstanceId)?.itemType;
      }
      return {
        ...current,
        inventory: result.inventory,
      };
    });
    if (consumedName) {
      playStateView.recordInventoryItemUse({
        itemName: consumedName,
        amount: consumedAmount,
        remainingQuantity: consumedRemaining,
        itemType: consumedType,
      });
    }
  };
  const adjustInventoryEntryQuantity = (itemInstanceId: string, delta: number) => {
    updateCharacter(draft.id, (current) => ({
      ...current,
      inventory: adjustInventoryItemQuantity(current.inventory, itemInstanceId, delta, engine.equipmentCatalog),
    }));
  };
  const addSpellComponentNeedToInventory = (need: ReturnType<typeof buildInventoryViewModel>["neededSpellComponents"][number]) => {
    addInventoryEntry({
      name: need.addSuggestionName,
      quantity: 1,
      itemType: "spell-component",
      category: "gear",
      type: "spell component",
      notes: `${need.spellName}: ${need.componentText}`,
      equipped: false,
    });
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
  const setXpValue = () => {
    const parsed = Number(xpSetInput);
    if (!Number.isFinite(parsed)) {
      return;
    }
    updateCharacter(draft.id, (current) => setCharacterXp(current, parsed));
    setXpSetInput(String(Math.max(0, Math.floor(parsed))));
  };
  const addXpValue = () => {
    const parsed = Number(xpDeltaInput);
    if (!Number.isFinite(parsed) || parsed === 0) {
      return;
    }
    updateCharacter(draft.id, (current) => addCharacterXp(current, parsed));
  };
  const confirmLevelUp = () => {
    if (!levelUpPreview?.canConfirm) {
      return;
    }
    updateCharacter(draft.id, (current) => applyLevelUpWithSnapshot(current, {
      targetLevel: levelUpPreview.toLevel,
    }));
    setLevelUpPreviewOpen(false);
  };
  const undoLevelUpStep = () => {
    updateCharacter(draft.id, (current) => undoLastLevelUp(current));
  };
  const updateCharacterMedia = (updates: Partial<Pick<typeof draft, "portraitUrl" | "portraitData" | "backgroundImageUrl" | "backgroundImageData" | "themeColor">>) => {
    updateCharacter(draft.id, (current) => ({
      ...current,
      ...updates,
    }));
  };
  const readImageFile = (file: File | undefined, field: "portraitData" | "backgroundImageData") => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateCharacterMedia({ [field]: reader.result } as Partial<Pick<typeof draft, "portraitData" | "backgroundImageData">>);
      }
    };
    reader.readAsDataURL(file);
  };

  const renderLevelUpActions = (choice: {
    id: string;
    label: string;
    detail: string;
    classification: "critical-blocker" | "pending-choice" | "unsupported-manual" | "informational";
    builderTarget?: BuilderDeepLinkTarget;
    manualHint?: string;
  }, options: {
    previewTargetLevel?: number;
  } = {}) => {
    const builderHref = choice.builderTarget
      ? buildBuilderDeepLinkHref(draft.id, {
        ...choice.builderTarget,
        levelUpTarget: options.previewTargetLevel ?? choice.builderTarget.levelUpTarget,
        mode: options.previewTargetLevel ? "level-up-preview" : choice.builderTarget.mode,
        pendingChoiceId: options.previewTargetLevel ? choice.id : choice.builderTarget.pendingChoiceId,
      })
      : undefined;
    const showHintButton = choice.classification === "unsupported-manual" || choice.classification === "critical-blocker";
    if (!builderHref && !showHintButton) {
      return null;
    }
    return (
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-2">
          {builderHref ? (
            <Link className="sheet-focus-ring inline-block rounded bg-slate-800 px-2 py-1 text-xs text-white" to={builderHref}>
              {options.previewTargetLevel ? "Resolve now" : builderActionLabel(choice)}
            </Link>
          ) : null}
          {showHintButton ? (
            <button
              className="sheet-focus-ring rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
              onClick={() => setOpenLevelUpHintId((current) => current === choice.id ? undefined : choice.id)}
              type="button"
            >
              {openLevelUpHintId === choice.id ? "Hide manual hint" : "Show manual hint"}
            </button>
          ) : null}
        </div>
        {openLevelUpHintId === choice.id ? <RuleDetailDrawer detail={levelUpHintDetail(choice)} heading="Manual / Detail Hint" /> : null}
      </div>
    );
  };

  const inPartyShell = Boolean(partyId);

  return (
    <div
      className={
        inPartyShell
          ? "min-h-0 min-w-0 lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr),340px] lg:items-stretch lg:gap-3 lg:overflow-hidden"
          : "min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr),minmax(300px,360px)] lg:items-start lg:gap-4"
      }
    >
      <div className={inPartyShell ? "min-h-0 min-w-0 space-y-4 overflow-y-auto pb-44 pr-1 lg:pb-0" : "min-w-0 space-y-4 pb-44 lg:pb-0"}>
        <CharacterHeroHeader
          actions={
            <>
              <Link className="sheet-focus-ring rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-800" to={`/builder/${draft.id}`}>
                Edit Builder
              </Link>
              <Link className="sheet-focus-ring rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-800" to={partyId ? `/party/${partyId}` : "/"}>
                Back
              </Link>
            </>
          }
          characterLine={combat.characterLine}
          footer={<CoreStatGrid cards={combat.coreStats} />}
          name={draft.name}
          originLine={combat.originLine}
        />
        <section className="sheet-card grid gap-3 p-3 md:grid-cols-3">
          <label className="text-xs font-medium text-slate-700">
            Portrait URL
            <input
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              onChange={(event) => updateCharacterMedia({ portraitUrl: event.target.value, portraitData: undefined })}
              placeholder="https://..."
              value={draft.portraitUrl ?? ""}
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Background URL
            <input
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              onChange={(event) => updateCharacterMedia({ backgroundImageUrl: event.target.value, backgroundImageData: undefined })}
              placeholder="https://..."
              value={draft.backgroundImageUrl ?? ""}
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Theme
            <input
              className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-1"
              onChange={(event) => updateCharacterMedia({ themeColor: event.target.value })}
              type="color"
              value={draft.themeColor ?? "#334155"}
            />
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-3">
            <label className="sheet-focus-ring cursor-pointer rounded bg-slate-200 px-3 py-1.5 text-xs text-slate-800">
              Upload Portrait
              <input hidden accept="image/*" type="file" onChange={(event) => readImageFile(event.target.files?.[0], "portraitData")} />
            </label>
            <label className="sheet-focus-ring cursor-pointer rounded bg-slate-200 px-3 py-1.5 text-xs text-slate-800">
              Upload Background
              <input hidden accept="image/*" type="file" onChange={(event) => readImageFile(event.target.files?.[0], "backgroundImageData")} />
            </label>
            <button
              className="sheet-focus-ring rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
              onClick={() => updateCharacterMedia({ portraitUrl: undefined, portraitData: undefined, backgroundImageUrl: undefined, backgroundImageData: undefined, themeColor: undefined })}
              type="button"
            >
              Clear Images
            </button>
          </div>
        </section>

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
                {pendingDeathSave ? (
                  <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-slate-800">
                    <p className="font-medium text-amber-900">Death Save Result Pending</p>
                    <p className="mt-1">
                      Roll total {pendingDeathSave.total} · resolution {pendingDeathSave.resolution}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        aria-label="Apply pending death save result"
                        className="sheet-focus-ring rounded bg-amber-700 px-2 py-1 text-xs text-white"
                        onClick={applyPendingDeathSaveResult}
                        type="button"
                      >
                        Apply Result
                      </button>
                      <button
                        aria-label="Dismiss pending death save result"
                        className="sheet-focus-ring rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                        onClick={dismissPendingDeathSaveResult}
                        type="button"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : null}
                {playState.concentration && concentrationPromptEvent ? (
                  <div className="mt-3 rounded border border-indigo-300 bg-indigo-50 p-2 text-xs text-slate-800">
                    <p className="font-medium text-indigo-900">
                      Concentration Check {concentrationPromptDc ? `DC ${concentrationPromptDc}` : ""}
                    </p>
                    <p className="mt-1">After taking damage while concentrating on {playState.concentration.name}, roll your CON save.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        aria-label="Roll concentration save"
                        className="sheet-focus-ring rounded bg-indigo-700 px-2 py-1 text-xs text-white"
                        disabled={!concentrationSaveRequest}
                        onClick={rollConcentrationSave}
                        type="button"
                      >
                        Roll Concentration Save
                      </button>
                    </div>
                  </div>
                ) : null}
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
              inventoryAmmunition={inventory.ammunition}
              lastRoll={lastRoll}
              onActivateEffect={playStateView.addActiveEffect}
              onActivateEffectOnAlly={partyMode === "shared-server" ? activateEffectOnAlly : undefined}
              onCreateCustomEffect={playStateView.addCustomActiveEffect}
              onRecordAttackResolution={playStateView.recordAttackResolution}
              onRoll={rollWithSelectedEffects}
              onRollModeChange={setRollMode}
              onSpendResource={playStateView.spendResource}
              partyAllies={partyAllies}
              automationSettings={playStateView.automationSettings}
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
              onAddItem={addInventoryEntry}
              onAdjustCurrency={adjustCurrencyAmount}
              onAdjustItemQuantity={adjustInventoryEntryQuantity}
              onAddSpellComponentItem={addSpellComponentNeedToInventory}
              onApplyCurrencyTransaction={applyCurrencyTx}
              onConsumeItem={consumeInventoryEntry}
              onDuplicateItem={duplicateInventoryEntry}
              onEquipItem={equipInventoryItem}
              onNormalizeCurrency={normalizeCurrency}
              onRemoveItem={removeInventoryEntry}
              onSetCurrency={setCurrencyAmount}
              onUnequipItem={unequipInventoryItem}
              onUpdateItem={updateInventoryEntry}
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
              <SectionHeader subtitle="Control how rolls, effects, resources and death saves are handled." title="Automation Settings" />
              <div className="mt-3 space-y-3 text-sm">
                <label className="block">
                  <span className="font-medium">Roll Bonuses</span>
                  <select
                    aria-label="Automation setting for roll bonuses"
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
                    onChange={(event) => playStateView.updateAutomationSettings({ rollBonuses: event.target.value as CharacterAutomationSettings["rollBonuses"] })}
                    value={playStateView.automationSettings.rollBonuses}
                  >
                    <option value="manual">manual</option>
                    <option value="suggest">suggest</option>
                    <option value="autoApply">autoApply</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-600">Manual keeps bonus selection explicit; suggest highlights candidates; autoApply uses unambiguous bonuses automatically.</p>
                </label>

                <label className="block">
                  <span className="font-medium">Active Effects</span>
                  <select
                    aria-label="Automation setting for active effects"
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
                    onChange={(event) => playStateView.updateAutomationSettings({ activeEffects: event.target.value as CharacterAutomationSettings["activeEffects"] })}
                    value={playStateView.automationSettings.activeEffects}
                  >
                    <option value="manual">manual</option>
                    <option value="suggest">suggest</option>
                    <option value="autoApply">autoApply</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-600">Controls whether matching active effects are only selected manually, suggested, or auto-applied.</p>
                </label>

                <label className="block">
                  <span className="font-medium">Resource Spending</span>
                  <select
                    aria-label="Automation setting for resource spending"
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
                    onChange={(event) => playStateView.updateAutomationSettings({ resourceSpending: event.target.value as CharacterAutomationSettings["resourceSpending"] })}
                    value={playStateView.automationSettings.resourceSpending}
                  >
                    <option value="ask">ask</option>
                    <option value="autoSpendWhenSafe">autoSpendWhenSafe</option>
                    <option value="neverAutoSpend">neverAutoSpend</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-600">Auto spend only runs on safe deterministic paths; ask and neverAutoSpend keep costs manual.</p>
                </label>

                <label className="block">
                  <span className="font-medium">On-Hit Riders</span>
                  <select
                    aria-label="Automation setting for on-hit riders"
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
                    onChange={(event) => playStateView.updateAutomationSettings({ onHitRiders: event.target.value as CharacterAutomationSettings["onHitRiders"] })}
                    value={playStateView.automationSettings.onHitRiders}
                  >
                    <option value="ask">ask</option>
                    <option value="autoSuggest">autoSuggest</option>
                    <option value="manualOnly">manualOnly</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-600">Choose whether rider options are prompted, pre-suggested, or hidden for fully manual handling.</p>
                </label>

                <label className="block">
                  <span className="font-medium">Concentration</span>
                  <select
                    aria-label="Automation setting for concentration checks"
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
                    onChange={(event) => playStateView.updateAutomationSettings({ concentration: event.target.value as CharacterAutomationSettings["concentration"] })}
                    value={playStateView.automationSettings.concentration}
                  >
                    <option value="manual">manual</option>
                    <option value="suggestCheck">suggestCheck</option>
                    <option value="autoPromptOnDamage">autoPromptOnDamage</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-600">When you take damage while concentrating, suggestCheck and autoPromptOnDamage emit a concentration-check prompt.</p>
                </label>

                <label className="block">
                  <span className="font-medium">Death Saves</span>
                  <select
                    aria-label="Automation setting for death saves"
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
                    onChange={(event) => playStateView.updateAutomationSettings({ deathSaves: event.target.value as CharacterAutomationSettings["deathSaves"] })}
                    value={playStateView.automationSettings.deathSaves}
                  >
                    <option value="autoApplyResult">autoApplyResult</option>
                    <option value="askBeforeApply">askBeforeApply</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-600">autoApplyResult writes roll outcomes immediately; askBeforeApply keeps a confirmation prompt.</p>
                </label>
              </div>
            </section>

            <section className="sheet-card p-4">
              <SectionHeader subtitle="Progression and rule-choice completion state" title="Level Progression" />
              <div className="mt-3 space-y-3 text-sm">
                <div className="sheet-card border-indigo-200 bg-indigo-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900">XP Management</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <label className="text-xs text-slate-700">
                      Level Source
                      <select
                        aria-label="Select level source"
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
                        onChange={(event) =>
                          updateCharacter(draft.id, (current) =>
                            setCharacterLevelSource(current, event.target.value === "manual" ? "manual" : "xp"),
                          )
                        }
                        value={progression.xp.levelSource}
                      >
                        <option value="xp">xp</option>
                        <option value="manual">manual</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 pt-5 text-xs text-slate-700">
                      <input
                        checked={progression.xp.milestoneMode}
                        onChange={(event) =>
                          updateCharacter(draft.id, (current) => setCharacterMilestoneMode(current, event.target.checked))
                        }
                        type="checkbox"
                      />
                      milestone mode
                    </label>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr),auto]">
                    <input
                      aria-label="Set current XP"
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
                      min={0}
                      onChange={(event) => setXpSetInput(event.target.value)}
                      placeholder={`Current XP (${progression.xp.currentXp})`}
                      type="number"
                      value={xpSetInput}
                    />
                    <button
                      className="sheet-focus-ring rounded bg-slate-800 px-3 py-1.5 text-xs text-white"
                      onClick={setXpValue}
                      type="button"
                    >
                      Set XP
                    </button>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr),auto]">
                    <input
                      aria-label="Add XP delta"
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
                      onChange={(event) => setXpDeltaInput(event.target.value)}
                      type="number"
                      value={xpDeltaInput}
                    />
                    <button
                      className="sheet-focus-ring rounded bg-indigo-700 px-3 py-1.5 text-xs text-white"
                      onClick={addXpValue}
                      type="button"
                    >
                      Add XP
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-700">
                    Current XP {progression.xp.currentXp.toLocaleString()} · Level from XP {progression.xp.levelFromXp}
                    {progression.xp.nextLevelThreshold !== null ? ` · Next level at ${progression.xp.nextLevelThreshold.toLocaleString()} XP` : " · Max level reached"}
                  </p>
                  <div className="mt-2 h-2 rounded bg-indigo-100">
                    <div
                      className="h-2 rounded bg-indigo-600"
                      style={{ width: `${Math.round(progression.xp.progressToNextLevel * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {progression.xp.nextLevelThreshold === null
                      ? "No further level thresholds."
                      : `${progression.xp.remainingToNextLevel.toLocaleString()} XP remaining to next level.`}
                  </p>
                  {progression.xp.diagnostics.length ? (
                    <p className="mt-1 text-xs text-slate-600">{progression.xp.diagnostics.join(" ")}</p>
                  ) : null}
                  {progression.xp.levelUpAvailable ? (
                    <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">
                      <p>Level-up available from XP.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="sheet-focus-ring rounded bg-emerald-700 px-2 py-1 text-xs text-white"
                          onClick={() => setLevelUpPreviewOpen((value) => !value)}
                          type="button"
                        >
                          {levelUpPreviewOpen ? "Hide Level-Up Preview" : "Open Level-Up Preview"}
                        </button>
                        <button
                          className="sheet-focus-ring rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 disabled:opacity-60"
                          disabled={!canUndoLastLevelUp(draft)}
                          onClick={undoLevelUpStep}
                          type="button"
                        >
                          Undo Last Level-Up
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-600">
                      {progression.xp.levelSource === "manual"
                        ? "Level source is manual; XP does not auto-enable level-up."
                        : progression.xp.milestoneMode
                          ? "Milestone mode is active; XP threshold checks are informational."
                          : "No XP-triggered level-up available yet."}
                    </p>
                  )}
                  {!progression.xp.levelUpAvailable ? (
                    <div className="mt-2">
                      <button
                        className="sheet-focus-ring rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 disabled:opacity-60"
                        disabled={!canUndoLastLevelUp(draft)}
                        onClick={undoLevelUpStep}
                        type="button"
                      >
                        Undo Last Level-Up
                      </button>
                    </div>
                  ) : null}
                </div>
                {levelUpPreviewOpen && levelUpPreview ? (
                  <div className="sheet-card border-emerald-200 bg-emerald-50/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-emerald-900">
                        Level-Up Preview L{levelUpPreview.fromLevel} {"->"} L{levelUpPreview.toLevel}
                      </p>
                      <div className="flex gap-2">
                        <button
                          className="sheet-focus-ring rounded bg-emerald-700 px-2 py-1 text-xs text-white disabled:opacity-60"
                          disabled={!levelUpPreview.canConfirm}
                          onClick={confirmLevelUp}
                          type="button"
                        >
                          {levelUpPreview.confirmLabel}
                        </button>
                        <button
                          className="sheet-focus-ring rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                          onClick={() => setLevelUpPreviewOpen(false)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">
                      HP {levelUpPreview.hpBefore} {"->"} {levelUpPreview.hpAfter} ({signedNumber(levelUpPreview.hpDelta)})
                      {" · "}Proficiency Bonus {levelUpPreview.proficiencyBonusBefore} {"->"} {levelUpPreview.proficiencyBonusAfter}
                      {" "}({signedNumber(levelUpPreview.proficiencyBonusDelta)})
                      {levelUpPreview.hitDiceGain ? ` · Hit Dice ${levelUpPreview.hitDiceGain}` : ""}
                    </p>
                    {levelUpPreview.newFeatures.length ? (
                      <p className="mt-1 text-xs text-slate-700">New Features: {levelUpPreview.newFeatures.join(", ")}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-700">New Features: none detected in structured content.</p>
                    )}
                    {levelUpPreview.spellSlotChanges.length ? (
                      <p className="mt-1 text-xs text-slate-700">
                        Spell Slots: {levelUpPreview.spellSlotChanges.map((slot) => `L${slot.level} ${slot.before}->${slot.after}`).join(" · ")}
                      </p>
                    ) : null}
                    {levelUpPreview.spellPreparationChanges.length ? (
                      <p className="mt-1 text-xs text-slate-700">
                        Spell Prep/Known: {levelUpPreview.spellPreparationChanges.join(" · ")}
                      </p>
                    ) : null}
                    {levelUpPreview.resourceChanges.length ? (
                      <p className="mt-1 text-xs text-slate-700">
                        Resources: {levelUpPreview.resourceChanges.map((entry) => `${entry.name} ${entry.before ?? 0}->${entry.after ?? 0}`).join(" · ")}
                      </p>
                    ) : null}
                    {levelUpPreview.choiceStatuses.length ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-medium text-slate-800">Choice Status</p>
                        {levelUpPreview.choiceStatuses.map((choice) => (
                          <div key={choice.id} className="rounded border border-emerald-200 bg-white/80 px-2 py-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs text-slate-700">{choice.label}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge label={choice.status} status={previewChoiceTone(choice.status)} />
                                {choice.status !== "complete" ? <StatusBadge label={readinessLabel(choice.classification)} status={readinessTone(choice.classification)} /> : null}
                              </div>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">{choice.detail}</p>
                            {choice.status !== "complete" ? renderLevelUpActions(choice, { previewTargetLevel: levelUpPreview.toLevel }) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {levelUpPreview.canConfirm && levelUpPreview.openEntries.some((entry) => entry.classification === "pending-choice" || entry.classification === "unsupported-manual") ? (
                      <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                        Confirm remains enabled. Pending choices and manual issues stay visible after the level-up and can be resolved from the linked Builder sections.
                      </p>
                    ) : null}
                    {levelUpPreview.warnings.length ? (
                      <div className="mt-2 space-y-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                        {levelUpPreview.openEntries
                          .filter((entry) => !levelUpPreview.choiceStatuses.some((choice) => choice.id === entry.id))
                          .map((entry) => (
                            <div key={entry.id} className="rounded border border-amber-200 bg-white/60 p-2 text-slate-800">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium">{entry.label}</p>
                                <StatusBadge label={readinessLabel(entry.classification)} status={readinessTone(entry.classification)} />
                              </div>
                              <p className="mt-1 text-xs text-slate-700">{entry.detail}</p>
                              {renderLevelUpActions(entry, { previewTargetLevel: levelUpPreview.toLevel })}
                            </div>
                          ))}
                      </div>
                    ) : null}
                    {levelUpPreview.unsupportedNotes.length ? (
                      <div className="mt-2 rounded border border-slate-300 bg-white p-2 text-xs text-slate-700">
                        {levelUpPreview.unsupportedNotes.slice(0, 4).map((note) => (
                          <p key={note}>{note}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
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
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge label={choiceLabel(choice.status)} status={choiceTone(choice.status)} />
                            <StatusBadge label={readinessLabel(choice.classification)} status={readinessTone(choice.classification)} />
                          </div>
                        </div>
                        <p className="text-xs text-slate-600">{choice.detail}</p>
                        {renderLevelUpActions(choice)}
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
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge label={choiceLabel(choice.status)} status={choiceTone(choice.status)} />
                            <StatusBadge label={readinessLabel(choice.classification)} status={readinessTone(choice.classification)} />
                          </div>
                        </div>
                        <p className="text-xs text-slate-600">{choice.detail}</p>
                        {choice.status !== "complete" ? renderLevelUpActions(choice) : null}
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
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge label={choiceLabel(entry.status)} status={choiceTone(entry.status)} />
                            <StatusBadge label={readinessLabel(entry.classification)} status={readinessTone(entry.classification)} />
                          </div>
                        </div>
                        {renderLevelUpActions(entry)}
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
              <DiagnosticsPanel engine={engine} inventory={inventory} rollDiagnostics={rollView.diagnostics} />
            </DiagnosticsDrawer>
          </div>
        ) : null}
      </div>

      <aside className={inPartyShell ? "hidden min-h-0 min-w-0 lg:block" : "hidden min-w-0 lg:block"}>
        <div className={inPartyShell ? "h-full overflow-y-auto pr-1" : "sticky top-3 max-h-[calc(100vh-1rem)] overflow-y-auto pr-1"}>
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
