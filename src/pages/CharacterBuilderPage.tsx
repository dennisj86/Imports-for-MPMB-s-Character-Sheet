import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FormField, inputClassName } from "../components/ui/FormField";
import { Panel } from "../components/ui/Panel";
import type { AppliedCharacterRules } from "../domain/appliedRules";
import type { AbilityScores, CharacterDraft, HpGainMethod } from "../domain/character";
import type { DerivedCharacterStats } from "../domain/derivedStats";
import type { LevelProgressionResult } from "../domain/progression";
import type { RuleChoice } from "../domain/rules";
import type { BackgroundDefinition, ClassDefinition, EquipmentDefinition, SpeciesDefinition, SubclassDefinition } from "../domain/content";
import { AbilityScoreEditor } from "../features/character/components/AbilityScoreEditor";
import { InventoryEditor } from "../features/character/components/InventoryEditor";
import { FeatChoiceSection } from "../features/character-builder/wizard/components/FeatChoiceSection";
import { SpellChoiceSection } from "../features/character-builder/wizard/components/SpellChoiceSection";
import { WizardStepRail } from "../features/character-builder/wizard/components/WizardStepRail";
import type { SkillChoiceState, StartingEquipmentChoiceContext, WizardCompletionState, WizardStepId, WizardStepState, WizardStepValidation } from "../domain/builderWizard";
import { useWizardV2State } from "../features/wizardV2";
import { applySpellSelectionToDraft, useSpellManagement } from "../features/spellManagement";
import {
  ABILITY_KEYS,
  hpGainKey,
  setAbilityScoreIncreaseChoice,
  setAsiOrFeatOption,
  setHpGainMethod as setLevelUpHpGainMethod,
  setLevelUpFeatChoice,
} from "../services/levelUp";
import { setRuleChoiceSelection } from "../services/rules";
import { useCharacterStore } from "../store/characterStore";
import { useSourceStore } from "../store/sourceStore";

const WIZARD_STEP_STORAGE_PREFIX = "mpmb-builder:step:";
const ABILITY_METHODS = ["standard", "point-buy", "roll", "manual"] as const;

type AbilityMethod = (typeof ABILITY_METHODS)[number];

const STEP_IDS: WizardStepId[] = ["class", "species", "background", "abilities", "feats", "skills", "spells", "equipment", "review"];

type BuilderRequiredChoice = {
  id: string;
  kind: "origin-feat" | "ability-score-choice" | "skill-choice" | "subclass-selection" | "asi-or-feat" | "spell-selection" | "feature-choice";
  description: string;
  source: string;
  required: boolean;
};

export function CharacterBuilderPage() {
  const generation = useSourceStore((state) => state.generation);
  const activeSourceKeys = useSourceStore((state) => state.activeSourceKeys);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const characters = useCharacterStore((state) => state.characters);
  const updateCharacter = useCharacterStore((state) => state.updateCharacter);
  const draft = useMemo(() => characters.find((entry) => entry.id === id), [characters, id]);
  const [abilityMethod, setAbilityMethod] = useState<AbilityMethod>("manual");
  const wizardView = useWizardV2State(draft, activeSourceKeys, generation);
  const spellManagementView = useSpellManagement(draft, activeSourceKeys, generation);

  if (!id || !draft) {
    return (
      <Panel title="Character not found">
        <p className="text-sm text-slate-600">The selected character does not exist.</p>
        <button className="mt-2 rounded bg-slate-800 px-3 py-2 text-sm text-white" onClick={() => navigate("/")} type="button">
          Back to list
        </button>
      </Panel>
    );
  }

  if (!wizardView || !spellManagementView) {
    return (
      <Panel title="V2 state unavailable">
        <p className="text-sm text-slate-600">The V2 builder state could not be resolved for this character.</p>
      </Panel>
    );
  }

  const classes = wizardView.classes;
  const speciesOptions = wizardView.speciesOptions;
  const backgrounds = wizardView.backgrounds;
  const equipmentCatalog = wizardView.engine.equipmentCatalog;
  const selectedClass = wizardView.selectedClass;
  const subclassOptions = wizardView.subclassOptions;
  const selectedSubclass = wizardView.selectedSubclass;
  const selectedSpecies = wizardView.selectedSpecies;
  const selectedBackground = wizardView.selectedBackground;
  const selectedFeatEntries = wizardView.engine.selectedFeats;
  const selectedSpellEntries = spellManagementView.spellManagement.selectedSpells;

  const appliedRules = wizardView.engine.appliedRules;
  const derivedStats = wizardView.engine.derivedStats;
  const progression = wizardView.engine.progression;
  const featChoiceContexts = wizardView.wizard.featContexts;
  const spellChoiceContexts = spellManagementView.spellManagement.contexts;
  const skillChoiceStates = wizardView.wizard.skillChoiceStates;
  const startingEquipmentChoices = wizardView.wizard.equipmentChoices;
  const requiredChoices = wizardView.wizard.requiredChoices;
  const validations = wizardView.wizard.validations;
  const completion = wizardView.wizard.completion;
  const visibleSteps = wizardView.wizardUi.steps;

  const [currentStepId, setCurrentStepId] = useState<WizardStepId>(() => {
    const key = `${WIZARD_STEP_STORAGE_PREFIX}${draft.id}`;
    if (typeof window === "undefined") {
      return "class";
    }
    const stored = window.sessionStorage.getItem(key) as WizardStepId | null;
    if (stored && STEP_IDS.includes(stored)) {
      return stored;
    }
    return "class";
  });

  useEffect(() => {
    const visibleStepIds = new Set(visibleSteps.map((step) => step.id));
    if (!visibleStepIds.has(currentStepId)) {
      const fallback = findFirstActionableStep(visibleSteps, validations);
      setCurrentStepId(fallback);
      return;
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(`${WIZARD_STEP_STORAGE_PREFIX}${draft.id}`, currentStepId);
    }
  }, [currentStepId, draft.id, visibleSteps, validations]);

  const currentStepIndex = Math.max(0, visibleSteps.findIndex((step) => step.id === currentStepId));
  const currentStepDefinition = visibleSteps[currentStepIndex];
  const currentValidation = validations[currentStepId] ?? {
    stepId: currentStepId,
    completed: false,
    blocked: false,
    pending: false,
    errors: [],
    warnings: [],
  };
  const stepStates: WizardStepState[] = visibleSteps.map((step) => {
    const validation = validations[step.id] ?? {
      stepId: step.id,
      completed: false,
      blocked: false,
      pending: false,
      errors: [],
      warnings: [],
    };
    return {
      id: step.id,
      title: step.title,
      order: step.order,
      visible: true,
      substeps: [],
      imageRefs: [...step.imageRefs],
      validation,
      status:
        step.id === currentStepId
          ? "current"
          : validation.blocked
            ? "blocked"
            : validation.pending
              ? "pending"
              : "completed",
    };
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{draft.name}</h1>
        <div className="flex gap-2">
          <Link className="rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-800" to={`/sheet/${draft.id}`}>
            Open Sheet
          </Link>
          <button className="rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-800" onClick={() => navigate("/")} type="button">
            Back
          </button>
        </div>
      </header>

      <WizardStepRail steps={stepStates} onSelectStep={setCurrentStepId} />

      <Panel
        title={currentStepDefinition?.title ?? "Character Builder"}
        rightSlot={
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>
              Step {currentStepIndex + 1} / {visibleSteps.length}
            </span>
            <span>•</span>
            <span>{currentStepDefinition?.imageRefs.join(", ")}</span>
          </div>
        }
      >
        {currentValidation.errors.length > 0 ? (
          <div className="mb-3 space-y-1 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
            {currentValidation.errors.map((entry) => (
              <p key={entry}>{entry}</p>
            ))}
          </div>
        ) : null}
        {currentValidation.errors.length === 0 && currentValidation.warnings.length > 0 ? (
          <div className="mb-3 space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            {currentValidation.warnings.map((entry) => (
              <p key={entry}>{entry}</p>
            ))}
          </div>
        ) : null}

        {currentStepId === "class" ? (
          <ClassStep
            classes={classes}
            draft={draft}
            resolveSubclassesForClass={wizardView.resolveSubclassesForClass}
            subclassOptions={subclassOptions}
            updateCharacter={updateCharacter}
          />
        ) : null}

        {currentStepId === "species" ? (
          <SpeciesStep
            appliedRules={appliedRules}
            draft={draft}
            speciesOptions={speciesOptions}
            updateCharacter={updateCharacter}
          />
        ) : null}

        {currentStepId === "background" ? (
          <BackgroundStep
            appliedRules={appliedRules}
            backgrounds={backgrounds}
            draft={draft}
            updateCharacter={updateCharacter}
          />
        ) : null}

        {currentStepId === "abilities" ? (
          <AbilitiesStep
            abilityMethod={abilityMethod}
            appliedRules={appliedRules}
            derivedStats={derivedStats}
            draft={draft}
            setAbilityMethod={setAbilityMethod}
            updateCharacter={updateCharacter}
          />
        ) : null}

        {currentStepId === "feats" ? (
          <div className="space-y-4">
            <LevelUpChoicesStep
              draft={draft}
              progression={progression}
              updateCharacter={updateCharacter}
            />
            <GenericRuleChoicesStep
              choices={wizardView.engine.ruleEngine.choices}
              draft={draft}
              updateCharacter={updateCharacter}
            />
            <FeatChoiceSection
              contexts={featChoiceContexts}
              onSelectFeat={(contextId, featId) =>
                updateCharacter(draft.id, (current) => {
                  const asiChoiceId = contextId.startsWith("feat-choice:asi:") ? contextId.slice("feat-choice:asi:".length) : undefined;
                  const asiChoice = asiChoiceId ? progression.asiOrFeatChoices.find((entry) => entry.id === asiChoiceId) : undefined;
                  if (asiChoiceId && asiChoice) {
                    return setLevelUpFeatChoice(current, asiChoiceId, asiChoice.level, featId);
                  }
                  const previousContextual = contextualFeatIds(current.featureChoices);
                  const nextFeatureChoices = setFeatureChoice(current.featureChoices, contextId, featId);
                  const nextContextual = contextualFeatIds(nextFeatureChoices);
                  const nonContextual = current.featIds.filter((entry) => !previousContextual.has(entry));
                  return {
                    ...current,
                    featureChoices: nextFeatureChoices,
                    featIds: Array.from(new Set([...nonContextual, ...nextContextual])),
                  };
                })
              }
              onSelectSubchoice={(subchoiceId, optionId) =>
                updateCharacter(draft.id, (current) => ({
                  ...current,
                  featureChoices: setFeatureChoice(current.featureChoices, subchoiceId, optionId),
                }))
              }
            />
          </div>
        ) : null}

        {currentStepId === "skills" ? (
          <SkillsStep
            appliedRules={appliedRules}
            derivedStats={derivedStats}
            draft={draft}
            skillChoiceStates={skillChoiceStates}
            updateCharacter={updateCharacter}
          />
        ) : null}

        {currentStepId === "spells" ? (
          <SpellChoiceSection
            contexts={spellChoiceContexts}
            onToggleSpell={(contextId, spellId, selected) => {
              updateCharacter(draft.id, (current) => {
                return applySpellSelectionToDraft(current, spellManagementView.spellManagement, contextId, spellId, selected);
              });
            }}
          />
        ) : null}

        {currentStepId === "equipment" ? (
          <EquipmentStep
            applyStartingEquipmentChoiceToDraft={wizardView.applyStartingEquipmentChoiceToDraft}
            catalog={equipmentCatalog}
            draft={draft}
            startingEquipmentChoices={startingEquipmentChoices}
            updateCharacter={updateCharacter}
          />
        ) : null}

        {currentStepId === "review" ? (
          <ReviewStep
            appliedRules={appliedRules}
            completion={completion}
            draft={draft}
            progression={progression}
            requiredChoices={requiredChoices}
            selectedBackground={selectedBackground?.name}
            selectedClass={selectedClass?.name}
            selectedFeats={selectedFeatEntries.map((entry) => entry.name)}
            selectedSpecies={selectedSpecies?.name}
            selectedSpells={selectedSpellEntries.map((entry) => entry.name)}
            selectedSubclass={selectedSubclass?.name}
            setCurrentStepId={setCurrentStepId}
            validations={validations}
          />
        ) : null}
      </Panel>

      <footer className="flex items-center justify-between gap-2">
        <button
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-40"
          disabled={currentStepIndex === 0}
          onClick={() => {
            const previousStep = visibleSteps[currentStepIndex - 1];
            if (previousStep) {
              setCurrentStepId(previousStep.id);
            }
          }}
          type="button"
        >
          Back
        </button>
        <div className="text-xs text-slate-600">
          {completion.complete ? "Creation complete." : `Blocking: ${completion.blockingSteps.length}, Pending: ${completion.pendingSteps.length}`}
        </div>
        {currentStepIndex === visibleSteps.length - 1 ? (
          <button
            className="rounded bg-slate-800 px-3 py-2 text-sm text-white disabled:bg-slate-300"
            disabled={!completion.complete}
            onClick={() => navigate(`/sheet/${draft.id}`)}
            type="button"
          >
            Open Sheet
          </button>
        ) : (
          <button
            className="rounded bg-slate-800 px-3 py-2 text-sm text-white disabled:bg-slate-300"
            disabled={currentValidation.blocked}
            onClick={() => {
              const nextStep = visibleSteps[currentStepIndex + 1];
              if (nextStep) {
                setCurrentStepId(nextStep.id);
              }
            }}
            type="button"
          >
            Next
          </button>
        )}
      </footer>
    </div>
  );
}

function ClassStep({
  draft,
  classes,
  resolveSubclassesForClass,
  subclassOptions,
  updateCharacter,
}: {
  draft: CharacterDraft;
  classes: ClassDefinition[];
  resolveSubclassesForClass: (classId: string, classLevel?: number) => SubclassDefinition[];
  subclassOptions: SubclassDefinition[];
  updateCharacter: (id: string, updater: (current: CharacterDraft) => CharacterDraft) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <FormField label="Character Name">
        <input
          className={inputClassName()}
          value={draft.name}
          onChange={(event) =>
            updateCharacter(draft.id, (current) => ({
              ...current,
              name: event.target.value,
            }))
          }
        />
      </FormField>
      <FormField label="Level">
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700"
            type="button"
            onClick={() =>
              updateCharacter(draft.id, (current) => ({
                ...current,
                classSelection: {
                  ...current.classSelection,
                  level: clampLevel(current.classSelection.level - 1),
                },
              }))
            }
          >
            -
          </button>
          <input
            className={`${inputClassName()} text-center`}
            min={1}
            max={20}
            type="number"
            value={draft.classSelection.level}
            onChange={(event) =>
              updateCharacter(draft.id, (current) => ({
                ...current,
                classSelection: {
                  ...current.classSelection,
                  level: clampLevel(Number(event.target.value)),
                },
              }))
            }
          />
          <button
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700"
            type="button"
            onClick={() =>
              updateCharacter(draft.id, (current) => ({
                ...current,
                classSelection: {
                  ...current.classSelection,
                  level: clampLevel(current.classSelection.level + 1),
                },
              }))
            }
          >
            +
          </button>
        </div>
      </FormField>
      <FormField label="Provider">
        <select
          className={inputClassName()}
          value={draft.provider}
          onChange={(event) =>
            updateCharacter(draft.id, (current) => ({
              ...current,
              provider: event.target.value === "open5e" ? "open5e" : "mpmb",
            }))
          }
        >
          <option value="mpmb">MPMB</option>
          <option value="open5e">Open5e</option>
        </select>
      </FormField>
      <FormField label="Rules Mode">
        <select
          className={inputClassName()}
          value={draft.rulesMode}
          onChange={(event) =>
            updateCharacter(draft.id, (current) => ({
              ...current,
              rulesMode: event.target.value === "2014" ? "2014" : "2024",
            }))
          }
        >
          <option value="2014">2014</option>
          <option value="2024">2024</option>
        </select>
      </FormField>
      <FormField label="Class">
        <select
          className={inputClassName()}
          value={draft.classSelection.classId ?? ""}
          onChange={(event) =>
            updateCharacter(draft.id, (current) => {
              const classId = event.target.value || undefined;
              const subclasses = classId
                ? resolveSubclassesForClass(classId, current.classSelection.level)
                : [];
              const keepsCurrentSubclass = subclasses.some((entry) => entry.id === current.subclassSelection.subclassId);
              return {
                ...current,
                classSelection: { ...current.classSelection, classId },
                subclassSelection: {
                  subclassId: keepsCurrentSubclass ? current.subclassSelection.subclassId : undefined,
                },
              };
            })
          }
        >
          <option value="">Select class</option>
          {classes.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
              {entry.compatibility?.conversionMode === "legacy-only" ? " · legacy" : ""}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Subclass">
        <select
          className={inputClassName()}
          disabled={!draft.classSelection.classId}
          value={draft.subclassSelection.subclassId ?? ""}
          onChange={(event) =>
            updateCharacter(draft.id, (current) => ({
              ...current,
              subclassSelection: { subclassId: event.target.value || undefined },
            }))
          }
        >
          <option value="">Select subclass</option>
          {subclassOptions.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
              {entry.compatibility?.conversionMode === "2024-converted" ? " · legacy→2024" : ""}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  );
}

function SpeciesStep({
  draft,
  speciesOptions,
  appliedRules,
  updateCharacter,
}: {
  draft: CharacterDraft;
  speciesOptions: SpeciesDefinition[];
  appliedRules: AppliedCharacterRules;
  updateCharacter: (id: string, updater: (current: CharacterDraft) => CharacterDraft) => void;
}) {
  return (
    <div className="space-y-3">
      <FormField label="Species">
        <select
          className={inputClassName()}
          value={draft.speciesSelection.speciesId ?? ""}
          onChange={(event) =>
            updateCharacter(draft.id, (current) => ({
              ...current,
              speciesSelection: { speciesId: event.target.value || undefined },
            }))
          }
        >
          <option value="">Select species</option>
          {speciesOptions.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
              {entry.compatibility?.conversionMode === "2024-converted" ? " · legacy→2024" : ""}
            </option>
          ))}
        </select>
      </FormField>
      {appliedRules.speciesResult.traits.length > 0 ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium">Resolved Traits</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {appliedRules.speciesResult.traits.slice(0, 8).map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {appliedRules.speciesResult.entity?.notes.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {appliedRules.speciesResult.entity.notes.map((entry) => (
            <p key={entry}>{entry}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BackgroundStep({
  draft,
  backgrounds,
  appliedRules,
  updateCharacter,
}: {
  draft: CharacterDraft;
  backgrounds: BackgroundDefinition[];
  appliedRules: AppliedCharacterRules;
  updateCharacter: (id: string, updater: (current: CharacterDraft) => CharacterDraft) => void;
}) {
  const selectedBackground = draft.backgroundSelection.backgroundId
    ? backgrounds.find((entry) => entry.id === draft.backgroundSelection.backgroundId)
    : undefined;
  return (
    <div className="space-y-3">
      <FormField label="Background">
        <select
          className={inputClassName()}
          value={draft.backgroundSelection.backgroundId ?? ""}
          onChange={(event) =>
            updateCharacter(draft.id, (current) => ({
              ...current,
              backgroundSelection: { backgroundId: event.target.value || undefined },
            }))
          }
        >
          <option value="">Select background</option>
          {backgrounds.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
              {entry.compatibility?.conversionMode === "2024-converted" ? " · legacy→2024" : ""}
            </option>
          ))}
        </select>
      </FormField>
      {appliedRules.backgroundResult.entity ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium">{appliedRules.backgroundResult.entity.name}</p>
          <p className="text-xs text-slate-600">
            Ability rule: {appliedRules.backgroundResult.abilityScoreRule === "background-2024" ? "2024 background ASI" : "native"}
            {appliedRules.backgroundResult.entity.conversionMode === "2024-converted" ? " · legacy->2024 converted" : ""}
          </p>
          {appliedRules.backgroundResult.grantedFeatNames.length ? (
            <p>Granted feat(s): {appliedRules.backgroundResult.grantedFeatNames.join(", ")}</p>
          ) : null}
          {appliedRules.backgroundResult.unresolvedGrantedFeatNames.length ? (
            <p>Unresolved feat references: {appliedRules.backgroundResult.unresolvedGrantedFeatNames.join(", ")}</p>
          ) : null}
          {appliedRules.backgroundResult.skillProficiencies.length ? (
            <p>Skill proficiencies: {appliedRules.backgroundResult.skillProficiencies.join(", ")}</p>
          ) : null}
          {appliedRules.backgroundResult.toolProficiencies.length ? (
            <p>Tool proficiencies: {appliedRules.backgroundResult.toolProficiencies.join(", ")}</p>
          ) : null}
          {appliedRules.backgroundResult.languagesGranted.length ? (
            <p>Languages: {appliedRules.backgroundResult.languagesGranted.join(", ")}</p>
          ) : null}
          {selectedBackground?.equipmentText ? (
            <p>Equipment package: {selectedBackground.equipmentText.replace(/\s*\n+\s*/g, ", ")}</p>
          ) : null}
          {selectedBackground?.traitText ? (
            <p>Feature: {selectedBackground.traitText.replace(/\s*\n+\s*/g, " ").trim()}</p>
          ) : null}
          {appliedRules.backgroundResult.originFeatRequirement?.required && !appliedRules.backgroundResult.originFeatRequirement.satisfied ? (
            <p className="mt-1 text-amber-700">Origin feat selection is required for this background in {draft.rulesMode} mode.</p>
          ) : null}
          {appliedRules.backgroundResult.notes.length ? (
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              {appliedRules.backgroundResult.notes.map((entry) => (
                <p key={entry}>{entry}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AbilitiesStep({
  draft,
  abilityMethod,
  setAbilityMethod,
  appliedRules,
  derivedStats,
  updateCharacter,
}: {
  draft: CharacterDraft;
  abilityMethod: AbilityMethod;
  setAbilityMethod: (method: AbilityMethod) => void;
  appliedRules: AppliedCharacterRules;
  derivedStats: DerivedCharacterStats;
  updateCharacter: (id: string, updater: (current: CharacterDraft) => CharacterDraft) => void;
}) {
  const originModes = appliedRules.abilityScoreAdjustments.availableOriginModes ?? [];
  const originModeChoiceId = appliedRules.abilityScoreAdjustments.originModeChoiceId;
  const selectedOriginMode = appliedRules.abilityScoreAdjustments.originMode;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ABILITY_METHODS.map((method) => (
          <button
            key={method}
            className={`rounded px-3 py-1.5 text-sm ${abilityMethod === method ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-800"}`}
            onClick={() => setAbilityMethod(method)}
            type="button"
          >
            {method === "point-buy" ? "Point Buy" : method.charAt(0).toUpperCase() + method.slice(1)}
          </button>
        ))}
      </div>
      {abilityMethod !== "manual" ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {abilityMethod === "standard"
            ? "Standard-array interaction is not fully automated yet; manual values remain the deterministic source of truth."
            : abilityMethod === "point-buy"
              ? "Point-buy budget automation is pending. Use manual values for deterministic build state."
              : "Roll-based automation is pending. Use manual values for deterministic build state."}
        </p>
      ) : null}
      <AbilityScoreEditor
        value={draft.abilityScores}
        onChange={(next) =>
          updateCharacter(draft.id, (current) => ({
            ...current,
            abilityScores: next,
          }))
        }
      />

      {originModeChoiceId && originModes.length > 1 ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium">Origin Ability Mode</p>
          <p className="text-xs text-slate-600">Choose whether ability increases are taken from species or 2024 background conversion.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {originModes.map((mode) => (
              <button
                key={mode}
                className={`rounded px-3 py-1.5 text-sm ${selectedOriginMode === mode ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-800"}`}
                onClick={() =>
                  updateCharacter(draft.id, (current) => ({
                    ...current,
                    featureChoices: setFeatureChoice(current.featureChoices, originModeChoiceId, mode),
                  }))
                }
                type="button"
              >
                {mode === "species" ? "Use Species ASI" : "Use 2024 Background ASI"}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {appliedRules.abilityScoreAdjustments.choiceStates.length ? (
        <div className="rounded border border-slate-200 p-3 text-sm">
          <p className="font-medium">Ability Bonus Choices</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {appliedRules.abilityScoreAdjustments.choiceStates.map((choice) => {
              const usedByOther = appliedRules.abilityScoreAdjustments.choiceStates
                .filter((entry) => entry.id !== choice.id && entry.source === choice.source)
                .map((entry) => entry.selectedAbility)
                .filter((entry): entry is keyof CharacterDraft["abilityScores"] => entry !== undefined);
              return (
                <div key={choice.id} className="rounded border border-slate-200 p-2">
                  <p className="text-xs font-medium text-slate-700">
                    {choice.reason} (+{choice.amount})
                  </p>
                  <select
                    className={`${inputClassName()} mt-1`}
                    value={choice.selectedAbility ?? ""}
                    onChange={(event) =>
                      updateCharacter(draft.id, (current) => ({
                        ...current,
                        featureChoices: setFeatureChoice(current.featureChoices, choice.id, event.target.value || undefined),
                      }))
                    }
                  >
                    <option value="">Select ability</option>
                    {choice.allowedAbilities.map((ability) => {
                      const blocked = usedByOther.includes(ability);
                      return (
                        <option key={ability} value={ability} disabled={blocked}>
                          {ability.toUpperCase()}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="rounded border border-slate-200 p-3 text-sm">
        <p className="font-medium">Final Ability Scores</p>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {Object.values(derivedStats.abilityScores).map((score) => (
            <div key={score.ability} className="rounded border border-slate-200 px-2 py-1 text-xs">
              <p className="font-medium">{score.ability.toUpperCase()}</p>
              <p>
                Base {score.baseScore} + Bonus {score.appliedBonus >= 0 ? `+${score.appliedBonus}` : score.appliedBonus} ={" "}
                <span className="font-semibold">{score.finalScore}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {appliedRules.abilityScoreAdjustments.pendingChoices.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {appliedRules.abilityScoreAdjustments.pendingChoices.map((choice, index) => (
            <p key={`${choice.reason}-${index}`}>
              Pending ASI choice: {choice.reason} (choose {choice.count} ability value(s), +{choice.amount} each)
            </p>
          ))}
        </div>
      ) : null}
      {appliedRules.abilityScoreAdjustments.ignored.length ? (
        <div className="rounded border border-slate-300 bg-slate-100 p-2 text-xs text-slate-700">
          {appliedRules.abilityScoreAdjustments.ignored.map((entry, index) => (
            <p key={`${entry.reason}-${index}`}>{entry.reason}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LevelUpChoicesStep({
  draft,
  progression,
  updateCharacter,
}: {
  draft: CharacterDraft;
  progression: LevelProgressionResult;
  updateCharacter: (id: string, updater: (current: CharacterDraft) => CharacterDraft) => void;
}) {
  const hpLevels = Array.from({ length: Math.max(0, draft.classSelection.level - 1) }, (_, index) => index + 2);
  const abilityPairs: Array<[keyof AbilityScores, keyof AbilityScores]> = [];
  for (let leftIndex = 0; leftIndex < ABILITY_KEYS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ABILITY_KEYS.length; rightIndex += 1) {
      abilityPairs.push([ABILITY_KEYS[leftIndex], ABILITY_KEYS[rightIndex]]);
    }
  }

  return (
    <div className="space-y-3">
      <section className="rounded border border-slate-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Level-Up HP Gain</h3>
            <p className="text-xs text-slate-600">Controls max HP progression. This is separate from Hit Dice used during rests.</p>
          </div>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{hpLevels.length} level(s)</span>
        </div>
        {hpLevels.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No level-up HP choices are needed at level 1.</p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {hpLevels.map((level) => {
              const state = draft.levelUp?.hpGainByLevel?.[hpGainKey(level)];
              const method = state?.method ?? "fixed/default";
              return (
                <div key={level} className="rounded border border-slate-200 p-2">
                  <p className="text-xs font-medium text-slate-700">Level {level}</p>
                  <div className="mt-1 grid gap-2 sm:grid-cols-[minmax(0,1fr),96px]">
                    <select
                      className={inputClassName()}
                      value={method}
                      onChange={(event) => {
                        const nextMethod = event.target.value as HpGainMethod;
                        updateCharacter(draft.id, (current) => setLevelUpHpGainMethod(current, level, nextMethod, state?.value));
                      }}
                    >
                      <option value="fixed/default">fixed/default</option>
                      <option value="max">max</option>
                      <option value="rolled">rolled</option>
                      <option value="manual">manual</option>
                    </select>
                    <input
                      className={inputClassName()}
                      disabled={method !== "rolled" && method !== "manual"}
                      min={1}
                      type="number"
                      value={state?.value ?? ""}
                      placeholder="Value"
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        updateCharacter(draft.id, (current) =>
                          setLevelUpHpGainMethod(current, level, method, Number.isFinite(value) && value > 0 ? value : undefined),
                        );
                      }}
                    />
                  </div>
                  {(method === "rolled" || method === "manual") && state?.value === undefined ? (
                    <p className="mt-1 text-xs text-amber-700">Enter a value before this HP choice is complete.</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded border border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-900">ASI / Feat Choices</h3>
        <p className="text-xs text-slate-600">Choose ASI or Feat for each level-up opportunity, then complete the selected path.</p>
        {progression.asiOrFeatChoices.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No structured ASI/Feat choices are exposed for the current level.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {progression.asiOrFeatChoices.map((choice) => {
              const asiState = draft.levelUp?.abilityScoreIncreases?.[choice.id];
              const statusLabel = choice.satisfied ? "complete" : "pending";
              return (
                <div key={choice.id} className="rounded border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Level {choice.level}</p>
                      <p className="text-xs text-slate-600">{choice.notes.join(" ") || "Select one level-up benefit."}</p>
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs ${choice.satisfied ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {choice.options.map((option) => (
                      <button
                        key={option}
                        className={`rounded px-3 py-1.5 text-xs ${
                          choice.selectedOption === option ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-800"
                        }`}
                        onClick={() => updateCharacter(draft.id, (current) => setAsiOrFeatOption(current, choice.id, option))}
                        type="button"
                      >
                        {option === "ability-score-improvement" ? "Ability Score Improvement" : "Feat"}
                      </button>
                    ))}
                  </div>
                  {choice.selectedOption === "ability-score-improvement" ? (
                    <div className="mt-3 space-y-2 rounded border border-slate-200 bg-slate-50 p-2">
                      <p className="text-xs font-medium text-slate-700">
                        Allocation {asiState ? formatAbilityIncreases(asiState.increases) : "pending"}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {ABILITY_KEYS.map((ability) => (
                          <button
                            key={`${choice.id}-plus2-${ability}`}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                            onClick={() => updateCharacter(draft.id, (current) => setAbilityScoreIncreaseChoice(current, choice.id, choice.level, { [ability]: 2 }))}
                            type="button"
                          >
                            +2 {ability.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {abilityPairs.map(([left, right]) => (
                          <button
                            key={`${choice.id}-split-${left}-${right}`}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                            onClick={() =>
                              updateCharacter(draft.id, (current) =>
                                setAbilityScoreIncreaseChoice(current, choice.id, choice.level, { [left]: 1, [right]: 1 }),
                              )
                            }
                            type="button"
                          >
                            +1 {left.toUpperCase()} / +1 {right.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {choice.selectedOption === "feat" ? (
                    <p className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                      Select the exact feat in the feat card below. Feat subchoices stay visible there if the feat exposes structured subchoices.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function GenericRuleChoicesStep({
  choices,
  draft,
  updateCharacter,
}: {
  choices: RuleChoice[];
  draft: CharacterDraft;
  updateCharacter: (id: string, updater: (current: CharacterDraft) => CharacterDraft) => void;
}) {
  if (choices.length === 0) {
    return null;
  }

  return (
    <section className="rounded border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Generic Rule Choices</h3>
          <p className="text-xs text-slate-600">Feature-, feat-, item- and spell-driven choices resolved from rule descriptors.</p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{choices.length} choice(s)</span>
      </div>
      <div className="mt-3 space-y-2">
        {choices.map((choice) => {
          const selected = new Set(choice.selectedOptionIds);
          const statusClass =
            choice.status === "complete"
              ? "bg-emerald-100 text-emerald-800"
              : choice.status === "unsupported"
                ? "bg-slate-200 text-slate-700"
                : "bg-amber-100 text-amber-800";
          return (
            <div key={choice.id} className="rounded border border-slate-200 p-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{formatChoiceType(choice.choiceType)}</p>
                  <p className="text-xs text-slate-600">
                    {choice.sourceType} · required {choice.requiredCount} · {choice.options.length} option(s)
                  </p>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs ${statusClass}`}>{choice.status}</span>
              </div>
              {choice.status === "unsupported" ? (
                <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                  {choice.diagnostics.length ? choice.diagnostics.map((entry) => <p key={entry}>{entry}</p>) : <p>No deterministic option data is available.</p>}
                </div>
              ) : choice.maxCount <= 1 ? (
                <select
                  className={`${inputClassName()} mt-2`}
                  value={choice.selectedOptionIds[0] ?? ""}
                  onChange={(event) =>
                    updateCharacter(draft.id, (current) => setRuleChoiceSelection(current, choice, event.target.value ? [event.target.value] : []))
                  }
                >
                  <option value="">Select option</option>
                  {choice.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {choice.options.map((option) => {
                    const checked = selected.has(option.id);
                    return (
                      <label key={option.id} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1 text-xs">
                        <input
                          checked={checked}
                          type="checkbox"
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...choice.selectedOptionIds, option.id]
                              : choice.selectedOptionIds.filter((entry) => entry !== option.id);
                            updateCharacter(draft.id, (current) => setRuleChoiceSelection(current, choice, next));
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {choice.diagnostics.length && choice.status !== "unsupported" ? (
                <div className="mt-2 text-xs text-slate-500">
                  {choice.diagnostics.map((entry) => (
                    <p key={entry}>{entry}</p>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SkillsStep({
  draft,
  skillChoiceStates,
  appliedRules,
  derivedStats,
  updateCharacter,
}: {
  draft: CharacterDraft;
  skillChoiceStates: SkillChoiceState[];
  appliedRules: AppliedCharacterRules;
  derivedStats: DerivedCharacterStats;
  updateCharacter: (id: string, updater: (current: CharacterDraft) => CharacterDraft) => void;
}) {
  return (
    <div className="space-y-3">
      {skillChoiceStates.length > 0 ? (
        skillChoiceStates.map((choiceState) => {
          const selected = Array.from(
            { length: choiceState.requiredCount },
            (_, index) => getFeatureChoiceValue(draft.featureChoices, `${choiceState.choiceKeyPrefix}:${index}`) ?? "",
          );
          return (
            <div key={choiceState.id} className="rounded border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-900">{choiceState.title}</h3>
              <p className="mt-1 text-xs text-slate-600">
                Required: {choiceState.requiredCount} · Missing: {choiceState.missingCount}
                {choiceState.reason ? ` · ${choiceState.reason}` : ""}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {Array.from({ length: choiceState.requiredCount }, (_, index) => (
                  <select
                    key={`${choiceState.id}-${index}`}
                    className={inputClassName()}
                    value={selected[index]}
                    onChange={(event) =>
                      updateCharacter(draft.id, (current) => ({
                        ...current,
                        featureChoices: setFeatureChoice(current.featureChoices, `${choiceState.choiceKeyPrefix}:${index}`, event.target.value || undefined),
                      }))
                    }
                  >
                    <option value="">Select a skill</option>
                    {choiceState.options.map((option) => {
                      const usedByAnother = selected.some((entry, otherIndex) => otherIndex !== index && entry === option);
                      return (
                        <option key={option} value={option} disabled={usedByAnother}>
                          {option}
                        </option>
                      );
                    })}
                  </select>
                ))}
              </div>
            </div>
          );
        })
      ) : (
        <p className="text-sm text-slate-500">No class skill choices are required at the current state.</p>
      )}
      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <p className="font-medium">Applied Proficiencies</p>
        <p>Skills: {appliedRules.proficiencies.skills.length ? appliedRules.proficiencies.skills.join(", ") : "none"}</p>
        <p>Tools: {appliedRules.proficiencies.tools.length ? appliedRules.proficiencies.tools.join(", ") : "none"}</p>
        <p>Languages: {appliedRules.proficiencies.languages.length ? appliedRules.proficiencies.languages.join(", ") : "none"}</p>
      </div>
      <div className="rounded border border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-900">Skill Totals</h3>
        <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {Object.values(derivedStats.skills).map((skill) => (
            <div key={skill.key} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1">
              <span>
                {skill.label} ({skill.ability.toUpperCase()})
                {skill.proficient ? " *" : ""}
              </span>
              <span className="font-medium">{skill.total >= 0 ? `+${skill.total}` : skill.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EquipmentStep({
  draft,
  catalog,
  startingEquipmentChoices,
  applyStartingEquipmentChoiceToDraft,
  updateCharacter,
}: {
  draft: CharacterDraft;
  catalog: EquipmentDefinition[];
  startingEquipmentChoices: StartingEquipmentChoiceContext[];
  applyStartingEquipmentChoiceToDraft: (draft: CharacterDraft, contextId: string, selectedOptionId: string) => CharacterDraft;
  updateCharacter: (id: string, updater: (current: CharacterDraft) => CharacterDraft) => void;
}) {
  return (
    <div className="space-y-3">
      {startingEquipmentChoices.length > 0 ? (
        <div className="space-y-2 rounded border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-900">Starting Equipment Choices</h3>
          {startingEquipmentChoices.map((context) => {
            const selectedOptionId = getFeatureChoiceValue(draft.featureChoices, `equipment-choice:${context.id}`) ?? context.selectedOptionId ?? "";
            return (
              <div key={context.id} className="rounded border border-slate-200 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{context.title}</p>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      context.satisfied ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {context.satisfied ? "complete" : "pending"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{context.description}</p>
                <select
                  className={`${inputClassName()} mt-2`}
                  value={selectedOptionId}
                  onChange={(event) =>
                    updateCharacter(draft.id, (current) => ({
                      ...current,
                      featureChoices: setFeatureChoice(current.featureChoices, `equipment-choice:${context.id}`, event.target.value || undefined),
                    }))
                  }
                >
                  <option value="">Select option</option>
                  {context.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  className="mt-2 rounded bg-slate-800 px-2 py-1 text-xs text-white disabled:bg-slate-300"
                  disabled={!selectedOptionId}
                  onClick={() => {
                    updateCharacter(draft.id, (current) => applyStartingEquipmentChoiceToDraft(current, context.id, selectedOptionId));
                  }}
                  type="button"
                >
                  Apply to Inventory
                </button>
                {context.notes.length > 0 ? (
                  <div className="mt-2 text-xs text-slate-600">
                    {context.notes.map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No deterministic starting equipment choices found for the current class/background.</p>
      )}

      <InventoryEditor
        catalog={catalog}
        inventory={draft.inventory}
        onChange={(next) =>
          updateCharacter(draft.id, (current) => ({
            ...current,
            inventory: next,
          }))
        }
      />
    </div>
  );
}

function ReviewStep({
  draft,
  selectedClass,
  selectedSubclass,
  selectedSpecies,
  selectedBackground,
  selectedFeats,
  selectedSpells,
  appliedRules,
  progression,
  requiredChoices,
  validations,
  completion,
  setCurrentStepId,
}: {
  draft: CharacterDraft;
  selectedClass?: string;
  selectedSubclass?: string;
  selectedSpecies?: string;
  selectedBackground?: string;
  selectedFeats: string[];
  selectedSpells: string[];
  appliedRules: AppliedCharacterRules;
  progression: LevelProgressionResult;
  requiredChoices: BuilderRequiredChoice[];
  validations: Record<WizardStepId, WizardStepValidation>;
  completion: WizardCompletionState;
  setCurrentStepId: (stepId: WizardStepId) => void;
}) {
  return (
    <div className="space-y-4">
      <div className={`rounded border p-3 ${completion.complete ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
        <p className="text-sm font-semibold">{completion.complete ? "Character creation is complete." : "Character creation is not complete yet."}</p>
        {completion.notes.map((note) => (
          <p key={note} className="text-xs">
            {note}
          </p>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-slate-200 p-3 text-sm">
          <h3 className="font-semibold">Summary</h3>
          <dl className="mt-2 grid grid-cols-2 gap-1">
            <dt className="text-slate-600">Name</dt>
            <dd>{draft.name || "—"}</dd>
            <dt className="text-slate-600">Provider</dt>
            <dd>{draft.provider}</dd>
            <dt className="text-slate-600">Rules Mode</dt>
            <dd>{draft.rulesMode}</dd>
            <dt className="text-slate-600">Level</dt>
            <dd>{draft.classSelection.level}</dd>
            <dt className="text-slate-600">Class</dt>
            <dd>{selectedClass ?? "—"}</dd>
            <dt className="text-slate-600">Subclass</dt>
            <dd>{selectedSubclass ?? "—"}</dd>
            <dt className="text-slate-600">Species</dt>
            <dd>{selectedSpecies ?? "—"}</dd>
            <dt className="text-slate-600">Background</dt>
            <dd>{selectedBackground ?? "—"}</dd>
          </dl>
        </div>
        <div className="rounded border border-slate-200 p-3 text-sm">
          <h3 className="font-semibold">Selections</h3>
          <p className="mt-2 text-xs text-slate-600">Feats</p>
          <p>{selectedFeats.length ? selectedFeats.join(", ") : "—"}</p>
          <p className="mt-2 text-xs text-slate-600">Spells</p>
          <p>{selectedSpells.length ? selectedSpells.join(", ") : "—"}</p>
          {appliedRules.conversionSummary.notes.length ? (
            <>
              <p className="mt-2 text-xs text-slate-600">Conversion Notes</p>
              {appliedRules.conversionSummary.notes.filter(Boolean).map((entry) => (
                <p key={entry}>{entry}</p>
              ))}
            </>
          ) : null}
          {progression.pendingChoices.length ? (
            <>
              <p className="mt-2 text-xs text-slate-600">Progression Pending Choices</p>
              {progression.pendingChoices.map((choice) => (
                <p key={choice.id}>{choice.description}</p>
              ))}
            </>
          ) : null}
        </div>
      </div>

      {requiredChoices.length > 0 ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Open Required Choices</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {requiredChoices.map((choice) => (
              <li key={choice.id}>{choice.description}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded border border-slate-200 p-3 text-sm">
        <h3 className="font-semibold">Step Validation</h3>
        <div className="mt-2 space-y-2">
          {STEP_IDS.map((stepId) => {
            const validation = validations[stepId];
            if (!validation) {
              return null;
            }
            const hasIssues = validation.errors.length > 0 || validation.warnings.length > 0;
            return (
              <div key={stepId} className="rounded border border-slate-200 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{stepId}</p>
                  <button className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-800" onClick={() => setCurrentStepId(stepId)} type="button">
                    Go to Step
                  </button>
                </div>
                {!hasIssues ? <p className="text-xs text-emerald-700">No issues.</p> : null}
                {validation.errors.map((entry) => (
                  <p key={entry} className="text-xs text-red-700">
                    {entry}
                  </p>
                ))}
                {validation.warnings.map((entry) => (
                  <p key={entry} className="text-xs text-amber-700">
                    {entry}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-medium">About Step Scope</p>
        <p>
          The reference images include deep profile/about subforms. The current draft schema does not persist those fields yet, so this phase keeps the
          review/completion logic deterministic and documents profile persistence as the next schema extension.
        </p>
      </div>
    </div>
  );
}

function findFirstActionableStep(
  steps: Array<{ id: WizardStepId; completed: boolean }>,
  validations: Record<WizardStepId, WizardStepValidation>,
): WizardStepId {
  for (const step of steps) {
    const validation = validations[step.id];
    if (!validation.completed) {
      return step.id;
    }
  }
  return steps[0]?.id ?? "class";
}

function contextualFeatIds(featureChoices: Array<{ featureId: string; optionId: string }>): Set<string> {
  const output = new Set<string>();
  for (const choice of featureChoices) {
    if (choice.featureId !== "feat-choice:origin" && !choice.featureId.startsWith("feat-choice:asi:")) {
      continue;
    }
    if (choice.optionId) {
      output.add(choice.optionId);
    }
  }
  return output;
}

function setFeatureChoice(
  existing: Array<{ featureId: string; optionId: string }>,
  featureId: string,
  optionId: string | undefined,
) {
  const without = existing.filter((entry) => entry.featureId !== featureId);
  if (!optionId) {
    return without;
  }
  return [...without, { featureId, optionId }];
}

function getFeatureChoiceValue(existing: Array<{ featureId: string; optionId: string }>, featureId: string): string | undefined {
  return existing.find((entry) => entry.featureId === featureId)?.optionId;
}

function formatAbilityIncreases(increases: Partial<Record<keyof AbilityScores, number>>): string {
  const parts = ABILITY_KEYS
    .map((ability) => {
      const value = increases[ability] ?? 0;
      return value > 0 ? `+${value} ${ability.toUpperCase()}` : undefined;
    })
    .filter((entry): entry is string => Boolean(entry));
  return parts.length ? parts.join(", ") : "pending";
}

function formatChoiceType(value: RuleChoice["choiceType"]): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(20, Math.max(1, Math.round(value)));
}
