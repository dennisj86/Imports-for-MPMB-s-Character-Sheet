import { useCallback, useEffect, useMemo } from "react";
import type { CharacterDraft } from "../../../domain/character";
import type { CharacterPlayState } from "../../../domain/playState";
import type { RollRequest } from "../../../domain/rolls";
import type { ActiveEffectDefinition } from "../../../domain/rules";
import type { CharacterEngineState } from "../../../services/characterEngine";
import {
  addCustomActiveEffect,
  addResolvedActiveEffect,
  addActiveEffectFromSpell,
  applyDamage,
  applyHealing,
  applyLongRest,
  applyShortRest,
  buildPlayStateRuntimeContext,
  castSpell,
  createPlayStateFromEngine,
  dismissActiveEffect,
  endConcentration,
  ensureCharacterPlayState,
  getLatestHitDieSpendResult,
  recordDeathSave,
  replaceTempHp,
  resolveHitDiceCounters,
  resolveResourceCounters,
  resolveSpellSlotCounters,
  restoreResource,
  restoreSpellSlot,
  rollAndRecord,
  setCurrentHp,
  setTempHp,
  shouldBootstrapPlayStateFromEngine,
  spendHitDie,
  spendResource,
  spendSpellSlot,
  startConcentration,
  toggleCondition,
  type CastSpellOptions,
  type HitDieSpendResult,
  type PlayHitDicePoolCounter,
  type PlayResourceCounter,
  type PlaySpellSlotCounter,
  type PlayStateRuntimeContext,
} from "../../../services/playState";

type CharacterUpdater = (id: string, updater: (current: CharacterDraft) => CharacterDraft) => void;

export interface CharacterPlayStateViewState {
  playState: CharacterPlayState;
  runtime: PlayStateRuntimeContext;
  resourceCounters: PlayResourceCounter[];
  spellSlotCounters: PlaySpellSlotCounter[];
  hitDiceCounters: PlayHitDicePoolCounter[];
  lastHitDieResult?: HitDieSpendResult;
  applyDamage: (amount: number) => void;
  applyHealing: (amount: number) => void;
  setCurrentHp: (amount: number) => void;
  setTempHp: (amount: number) => void;
  replaceTempHp: (amount: number) => void;
  recordDeathSave: (result: "success" | "failure" | "critical-success" | "critical-failure") => void;
  spendResource: (resourceKey: string, amount?: number, label?: string) => void;
  restoreResource: (resourceKey: string, amount?: number, label?: string) => void;
  spendSpellSlot: (slotKey: string, amount?: number) => void;
  restoreSpellSlot: (slotKey: string, amount?: number) => void;
  spendHitDie: (poolId: string) => void;
  roll: (request: RollRequest, options?: { spendResourceKey?: string; resourceLabel?: string }) => void;
  castSpell: (spellId: string, options?: CastSpellOptions) => void;
  addActiveEffect: (effect: ActiveEffectDefinition, options?: { external?: boolean; sourceCasterName?: string; note?: string; diceExpression?: string }) => void;
  addActiveEffectFromSpell: (spellId: string, options?: { external?: boolean }) => void;
  addCustomActiveEffect: (options: { name: string; applicableRollTypes: RollRequest["type"][]; dice?: string; flat?: number; durationType?: "manual" | "until-used" | "one-roll"; note?: string; sourceCasterName?: string }) => void;
  dismissActiveEffect: (effectId: string, reason?: string) => void;
  toggleCondition: (conditionIdOrName: string, source?: string, notes?: string) => void;
  startConcentration: (name: string, sourceId?: string, notes?: string) => void;
  endConcentration: (reason?: string) => void;
  applyShortRest: () => void;
  applyLongRest: () => void;
}

export function useCharacterPlayState(
  draft: CharacterDraft | undefined,
  engine: CharacterEngineState | undefined,
  updateCharacter: CharacterUpdater,
): CharacterPlayStateViewState | undefined {
  const runtime = useMemo(() => (engine ? buildPlayStateRuntimeContext(engine) : undefined), [engine]);

  useEffect(() => {
    if (!draft || !engine || !runtime) {
      return;
    }
    const ensured = ensureCharacterPlayState(draft.playState, draft.id, { maxHp: runtime.maxHp, hitDicePools: runtime.hitDicePools });
    if (ensured !== draft.playState) {
      updateCharacter(draft.id, (current) => ({
        ...current,
        playState: ensured,
      }));
      return;
    }
    if (shouldBootstrapPlayStateFromEngine(ensured, runtime)) {
      updateCharacter(draft.id, (current) => ({
        ...current,
        playState: createPlayStateFromEngine(current.id, engine),
      }));
    }
  }, [draft, engine, runtime, updateCharacter]);

  const playState = useMemo(() => {
    if (!draft || !runtime) {
      return undefined;
    }
    return ensureCharacterPlayState(draft.playState, draft.id, { maxHp: runtime.maxHp, hitDicePools: runtime.hitDicePools });
  }, [draft, runtime]);

  const resourceCounters = useMemo(() => {
    if (!playState || !engine) {
      return [];
    }
    return resolveResourceCounters(playState, engine.actionResources);
  }, [playState, engine]);

  const spellSlotCounters = useMemo(() => {
    if (!playState || !engine) {
      return [];
    }
    return resolveSpellSlotCounters(playState, engine.actionResources);
  }, [playState, engine]);

  const hitDiceCounters = useMemo(() => {
    if (!playState) {
      return [];
    }
    return resolveHitDiceCounters(playState);
  }, [playState]);

  const lastHitDieResult = useMemo(() => {
    if (!playState) {
      return undefined;
    }
    return getLatestHitDieSpendResult(playState.playEvents);
  }, [playState]);

  const commit = useCallback(
    (mutate: (playStateValue: CharacterPlayState) => CharacterPlayState) => {
      if (!draft || !runtime) {
        return;
      }
      updateCharacter(draft.id, (current) => {
        const currentPlayState = ensureCharacterPlayState(current.playState, current.id, { maxHp: runtime.maxHp, hitDicePools: runtime.hitDicePools });
        return {
          ...current,
          playState: mutate(currentPlayState),
        };
      });
    },
    [draft, runtime, updateCharacter],
  );

  const applyDamageAction = useCallback((amount: number) => {
    commit((current) => applyDamage(current, amount));
  }, [commit]);

  const applyHealingAction = useCallback((amount: number) => {
    if (!runtime) {
      return;
    }
    commit((current) => applyHealing(current, amount, runtime));
  }, [commit, runtime]);

  const setCurrentHpAction = useCallback((amount: number) => {
    if (!runtime) {
      return;
    }
    commit((current) => setCurrentHp(current, amount, runtime));
  }, [commit, runtime]);

  const setTempHpAction = useCallback((amount: number) => {
    commit((current) => setTempHp(current, amount));
  }, [commit]);

  const replaceTempHpAction = useCallback((amount: number) => {
    commit((current) => replaceTempHp(current, amount));
  }, [commit]);

  const recordDeathSaveAction = useCallback((result: "success" | "failure" | "critical-success" | "critical-failure") => {
    commit((current) => recordDeathSave(current, result));
  }, [commit]);

  const spendResourceAction = useCallback((resourceKey: string, amount = 1, label?: string) => {
    if (!runtime) {
      return;
    }
    commit((current) => spendResource(current, runtime, resourceKey, amount, label));
  }, [commit, runtime]);

  const restoreResourceAction = useCallback((resourceKey: string, amount = 1, label?: string) => {
    if (!runtime) {
      return;
    }
    commit((current) => restoreResource(current, runtime, resourceKey, amount, label));
  }, [commit, runtime]);

  const spendSpellSlotAction = useCallback((slotKey: string, amount = 1) => {
    if (!runtime) {
      return;
    }
    commit((current) => spendSpellSlot(current, runtime, slotKey, amount));
  }, [commit, runtime]);

  const restoreSpellSlotAction = useCallback((slotKey: string, amount = 1) => {
    if (!runtime) {
      return;
    }
    commit((current) => restoreSpellSlot(current, runtime, slotKey, amount));
  }, [commit, runtime]);

  const spendHitDieAction = useCallback((poolId: string) => {
    if (!runtime) {
      return;
    }
    commit((current) => spendHitDie(current, runtime, poolId));
  }, [commit, runtime]);

  const rollAction = useCallback((request: RollRequest, options: { spendResourceKey?: string; resourceLabel?: string } = {}) => {
    if (!runtime) {
      return;
    }
    commit((current) => rollAndRecord(current, runtime, request, options).playState);
  }, [commit, runtime]);

  const castSpellAction = useCallback((spellId: string, options: CastSpellOptions = {}) => {
    if (!runtime || !engine) {
      return;
    }
    const spell =
      engine.selectedSpells.find((entry) => entry.id === spellId) ??
      engine.spellCatalog.find((entry) => entry.id === spellId);
    if (!spell) {
      return;
    }
    commit((current) => castSpell(current, runtime, spell, options));
  }, [commit, engine, runtime]);

  const addActiveEffectAction = useCallback((effect: ActiveEffectDefinition, options: { external?: boolean; sourceCasterName?: string; note?: string; diceExpression?: string } = {}) => {
    commit((current) =>
      addResolvedActiveEffect(current, effect, {
        target: "self",
        external: options.external ?? true,
        sourceCasterName: options.sourceCasterName,
        note: options.note,
        diceExpression: options.diceExpression,
      }),
    );
  }, [commit]);

  const addActiveEffectFromSpellAction = useCallback((spellId: string, options: { external?: boolean } = {}) => {
    if (!engine) {
      return;
    }
    const spell =
      engine.selectedSpells.find((entry) => entry.id === spellId) ??
      engine.spellCatalog.find((entry) => entry.id === spellId);
    if (!spell) {
      return;
    }
    commit((current) => addActiveEffectFromSpell(current, spell, { target: "self", external: options.external ?? true }));
  }, [commit, engine]);

  const addCustomActiveEffectAction = useCallback((options: {
    name: string;
    applicableRollTypes: RollRequest["type"][];
    dice?: string;
    flat?: number;
    durationType?: "manual" | "until-used" | "one-roll";
    note?: string;
    sourceCasterName?: string;
  }) => {
    commit((current) =>
      addCustomActiveEffect(current, options),
    );
  }, [commit]);

  const dismissActiveEffectAction = useCallback((effectId: string, reason?: string) => {
    commit((current) => dismissActiveEffect(current, effectId, reason));
  }, [commit]);

  const toggleConditionAction = useCallback((conditionIdOrName: string, source?: string, notes?: string) => {
    commit((current) => toggleCondition(current, { id: conditionIdOrName, name: conditionIdOrName, source, notes }));
  }, [commit]);

  const startConcentrationAction = useCallback((name: string, sourceId?: string, notes?: string) => {
    commit((current) => startConcentration(current, { name, sourceId, notes }));
  }, [commit]);

  const endConcentrationAction = useCallback((reason?: string) => {
    commit((current) => endConcentration(current, reason));
  }, [commit]);

  const shortRestAction = useCallback(() => {
    if (!runtime) {
      return;
    }
    commit((current) => applyShortRest(current, runtime));
  }, [commit, runtime]);

  const longRestAction = useCallback(() => {
    if (!runtime) {
      return;
    }
    commit((current) => applyLongRest(current, runtime));
  }, [commit, runtime]);

  if (!playState || !runtime || !engine) {
    return undefined;
  }

  return {
    playState,
    runtime,
    resourceCounters,
    spellSlotCounters,
    hitDiceCounters,
    lastHitDieResult,
    applyDamage: applyDamageAction,
    applyHealing: applyHealingAction,
    setCurrentHp: setCurrentHpAction,
    setTempHp: setTempHpAction,
    replaceTempHp: replaceTempHpAction,
    recordDeathSave: recordDeathSaveAction,
    spendResource: spendResourceAction,
    restoreResource: restoreResourceAction,
    spendSpellSlot: spendSpellSlotAction,
    restoreSpellSlot: restoreSpellSlotAction,
    spendHitDie: spendHitDieAction,
    roll: rollAction,
    castSpell: castSpellAction,
    addActiveEffect: addActiveEffectAction,
    addActiveEffectFromSpell: addActiveEffectFromSpellAction,
    addCustomActiveEffect: addCustomActiveEffectAction,
    dismissActiveEffect: dismissActiveEffectAction,
    toggleCondition: toggleConditionAction,
    startConcentration: startConcentrationAction,
    endConcentration: endConcentrationAction,
    applyShortRest: shortRestAction,
    applyLongRest: longRestAction,
  };
}
