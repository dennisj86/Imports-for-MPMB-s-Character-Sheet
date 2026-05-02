import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { FormField, inputClassName } from "../components/ui/FormField";
import { AbilityScoreEditor } from "../features/character/components/AbilityScoreEditor";
import { FeatSelectionPanel } from "../features/character/components/FeatSelectionPanel";
import { InventoryEditor } from "../features/character/components/InventoryEditor";
import { SpellSelectionPanel } from "../features/character/components/SpellSelectionPanel";
import { deriveSummary } from "../domain/derived";
import {
  getBackgrounds,
  getAppliedCharacterRules,
  getClassById,
  getClasses,
  getEquipmentCatalog,
  getFeats,
  getFeaturesForClassLevel,
  getSpecies,
  getSpells,
  getSubclassesForClass,
} from "../services/data/adapter";
import { useCharacterStore } from "../store/characterStore";
import { useSourceStore } from "../store/sourceStore";

export function CharacterBuilderPage() {
  const generation = useSourceStore((state) => state.generation);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const characters = useCharacterStore((state) => state.characters);
  const updateCharacter = useCharacterStore((state) => state.updateCharacter);
  const draft = useMemo(() => characters.find((entry) => entry.id === id), [characters, id]);
  const dataContext = useMemo(
    () => ({
      provider: draft?.provider ?? "mpmb",
      rulesMode: draft?.rulesMode ?? "2024",
    }),
    [draft?.provider, draft?.rulesMode],
  );
  const classes = useMemo(() => getClasses(dataContext), [dataContext, generation]);
  const speciesOptions = useMemo(() => getSpecies(dataContext), [dataContext, generation]);
  const backgrounds = useMemo(() => getBackgrounds(dataContext), [dataContext, generation]);
  const feats = useMemo(() => getFeats(dataContext), [dataContext, generation]);
  const spells = useMemo(() => getSpells({}, dataContext), [dataContext, generation]);
  const equipmentCatalog = useMemo(() => getEquipmentCatalog({}, dataContext), [dataContext, generation]);

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

  const selectedClass = getClassById(draft.classSelection.classId ?? "", dataContext);
  const subclassOptions = selectedClass
    ? getSubclassesForClass(selectedClass.id, {
        ...dataContext,
        classLevel: draft.classSelection.level,
      })
    : [];
  const selectedSubclass = subclassOptions.find((entry) => entry.id === draft.subclassSelection.subclassId);
  const appliedRules = getAppliedCharacterRules(draft, dataContext);

  const derived = deriveSummary(draft, selectedClass, selectedSubclass);
  const levelFeatures = getFeaturesForClassLevel(
    draft.classSelection.classId,
    draft.subclassSelection.subclassId,
    draft.classSelection.level,
    {
      ...dataContext,
      classLevel: draft.classSelection.level,
    },
  );

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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Panel title="Identity">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Name">
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
                <input
                  className={inputClassName()}
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
                        ? getSubclassesForClass(classId, {
                            provider: current.provider,
                            rulesMode: current.rulesMode,
                            classLevel: current.classSelection.level,
                          })
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
                  disabled={!selectedClass}
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
              <FormField label="Background">
                <select
                  className={inputClassName()}
                  value={draft.backgroundSelection.backgroundId ?? ""}
                  onChange={(event) =>
                    updateCharacter(draft.id, (current) => {
                      const backgroundId = event.target.value || undefined;
                      return {
                        ...current,
                        backgroundSelection: { backgroundId },
                      };
                    })
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
            </div>
            {selectedSubclass?.compatibility?.notes?.length ? (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                {selectedSubclass.compatibility.notes.map((entry) => (
                  <p key={entry}>{entry}</p>
                ))}
              </div>
            ) : null}
            {appliedRules.speciesResult.entity?.notes.length ? (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                {appliedRules.speciesResult.entity.notes.map((entry) => (
                  <p key={entry}>{entry}</p>
                ))}
              </div>
            ) : null}
            {appliedRules.backgroundResult.entity ? (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <p className="font-medium">{appliedRules.backgroundResult.entity.name}</p>
                {appliedRules.backgroundResult.grantedFeatNames.length ? (
                  <p>Granted feat(s): {appliedRules.backgroundResult.grantedFeatNames.join(", ")}</p>
                ) : null}
                {appliedRules.backgroundResult.originFeatRequirement?.required && !appliedRules.backgroundResult.originFeatRequirement.satisfied ? (
                  <p>Origin feat selection required.</p>
                ) : null}
                {appliedRules.backgroundResult.skillProficiencies.length ? (
                  <p>Skill proficiencies: {appliedRules.backgroundResult.skillProficiencies.join(", ")}</p>
                ) : null}
                {appliedRules.backgroundResult.toolProficiencies.length ? (
                  <p>Tool proficiencies: {appliedRules.backgroundResult.toolProficiencies.join(", ")}</p>
                ) : null}
                {appliedRules.backgroundResult.notes.map((entry) => (
                  <p key={entry}>{entry}</p>
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel title="Ability Scores">
            <AbilityScoreEditor
              value={draft.abilityScores}
              onChange={(next) =>
                updateCharacter(draft.id, (current) => ({
                  ...current,
                  abilityScores: next,
                }))
              }
            />
          </Panel>

          <Panel title="Feats">
            <FeatSelectionPanel
              feats={feats}
              selectedFeatIds={draft.featIds}
              onChange={(next) =>
                updateCharacter(draft.id, (current) => ({
                  ...current,
                  featIds: next,
                }))
              }
            />
          </Panel>

          <Panel title="Spells">
            <SpellSelectionPanel
              classKey={selectedClass?.key}
              selectedSpellIds={draft.spellSelection.selectedSpellIds}
              spells={spells}
              onChange={(next) =>
                updateCharacter(draft.id, (current) => ({
                  ...current,
                  spellSelection: { selectedSpellIds: next },
                }))
              }
            />
          </Panel>

          <Panel title="Inventory">
            <InventoryEditor
              catalog={equipmentCatalog}
              inventory={draft.inventory}
              onChange={(next) =>
                updateCharacter(draft.id, (current) => ({
                  ...current,
                  inventory: next,
                }))
              }
            />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Derived Summary">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-600">Total Level</dt>
              <dd>{derived.levelTotal}</dd>
              <dt className="text-slate-600">Proficiency Bonus</dt>
              <dd>+{appliedRules.classResult.proficiencyBonus}</dd>
              <dt className="text-slate-600">Passive Perception</dt>
              <dd>{derived.passivePerception}</dd>
              <dt className="text-slate-600">Passive Insight</dt>
              <dd>{derived.passiveInsight}</dd>
              <dt className="text-slate-600">Passive Investigation</dt>
              <dd>{derived.passiveInvestigation}</dd>
              <dt className="text-slate-600">Spellcasting</dt>
              <dd>{appliedRules.spellcasting.available ? "Available (declarative)" : "Not detected"}</dd>
            </dl>
            <p className="mt-3 text-xs text-slate-500">{appliedRules.spellcasting.notes[0] ?? derived.spellcasting.notes}</p>
            {appliedRules.pendingChoices.length ? (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                {appliedRules.pendingChoices.map((choice) => (
                  <p key={choice.id}>{choice.description}</p>
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel title="Applied Rules Output">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-600">Species Conversion</dt>
              <dd>{appliedRules.speciesResult.entity?.conversionMode ?? "native"}</dd>
              <dt className="text-slate-600">Background Rule</dt>
              <dd>{appliedRules.backgroundResult.abilityScoreRule}</dd>
              <dt className="text-slate-600">Save Proficiencies</dt>
              <dd>{appliedRules.proficiencies.savingThrows.join(", ") || "—"}</dd>
              <dt className="text-slate-600">Skill Proficiencies</dt>
              <dd>{appliedRules.proficiencies.skills.join(", ") || "—"}</dd>
              <dt className="text-slate-600">Tool Proficiencies</dt>
              <dd>{appliedRules.proficiencies.tools.join(", ") || "—"}</dd>
            </dl>
            {Object.keys(appliedRules.abilityScoreAdjustments.fixed).length ? (
              <div className="mt-3 text-xs text-slate-700">
                <p className="font-medium">Applied Ability Adjustments</p>
                {Object.entries(appliedRules.abilityScoreAdjustments.fixed).map(([ability, value]) => (
                  <p key={ability}>
                    {ability.toUpperCase()}: {value >= 0 ? `+${value}` : value}
                  </p>
                ))}
              </div>
            ) : null}
            {appliedRules.abilityScoreAdjustments.ignored.length ? (
              <div className="mt-3 text-xs text-slate-700">
                <p className="font-medium">Ignored Adjustments</p>
                {appliedRules.abilityScoreAdjustments.ignored.map((entry) => (
                  <p key={`${entry.source}-${entry.reason}`}>{entry.reason}</p>
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel title="Features by Level">
            {levelFeatures.length === 0 ? (
              <p className="text-sm text-slate-500">No declarative features found for current selection.</p>
            ) : (
              <ul className="space-y-2">
                {levelFeatures.map((feature) => (
                  <li key={feature.id} className="rounded border border-slate-200 p-2">
                    <p className="text-sm font-medium">
                      L{feature.minLevel} · {feature.name}
                    </p>
                    {feature.description ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{feature.description}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Not Automated Yet">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>AC calculation is manual in Phase 1.</li>
              <li>HP calculation is manual in Phase 1.</li>
              <li>Saves and skills are manual in Phase 1.</li>
              <li>MPMB runtime hooks (`eval`, `calcChanges`, etc.) are intentionally not executed.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(20, Math.max(1, Math.round(value)));
}
