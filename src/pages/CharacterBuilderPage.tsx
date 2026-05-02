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
  findFeatByNameLike,
  getBackgroundById,
  getBackgrounds,
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
  const classes = useMemo(() => getClasses(), [generation]);
  const speciesOptions = useMemo(() => getSpecies(), [generation]);
  const backgrounds = useMemo(() => getBackgrounds(), [generation]);
  const feats = useMemo(() => getFeats(), [generation]);
  const spells = useMemo(() => getSpells(), [generation]);
  const equipmentCatalog = useMemo(() => getEquipmentCatalog(), [generation]);

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

  const selectedClass = getClassById(draft.classSelection.classId ?? "");
  const subclassOptions = selectedClass ? getSubclassesForClass(selectedClass.id) : [];
  const selectedSubclass = subclassOptions.find((entry) => entry.id === draft.subclassSelection.subclassId);
  const selectedBackground = getBackgroundById(draft.backgroundSelection.backgroundId ?? "");

  const derived = deriveSummary(draft, selectedClass, selectedSubclass);
  const levelFeatures = getFeaturesForClassLevel(draft.classSelection.classId, draft.subclassSelection.subclassId, draft.classSelection.level);

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
              <FormField label="Class">
                <select
                  className={inputClassName()}
                  value={draft.classSelection.classId ?? ""}
                  onChange={(event) =>
                    updateCharacter(draft.id, (current) => {
                      const classId = event.target.value || undefined;
                      const subclasses = classId ? getSubclassesForClass(classId) : [];
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
                      const background = backgroundId ? getBackgroundById(backgroundId) : undefined;
                      const nextFeatIds = [...current.featIds];
                      if (background?.bonusFeat) {
                        const resolvedFeat = findFeatByNameLike(background.bonusFeat);
                        if (resolvedFeat && !nextFeatIds.includes(resolvedFeat.id)) {
                          nextFeatIds.push(resolvedFeat.id);
                        }
                      }
                      return {
                        ...current,
                        backgroundSelection: { backgroundId },
                        featIds: nextFeatIds,
                      };
                    })
                  }
                >
                  <option value="">Select background</option>
                  {backgrounds.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            {selectedBackground ? (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <p className="font-medium">{selectedBackground.name}</p>
                {selectedBackground.bonusFeat ? <p>Bonus feat: {selectedBackground.bonusFeat}</p> : null}
                {selectedBackground.skillText ? <p>Skill proficiencies: {selectedBackground.skillText}</p> : null}
                {selectedBackground.toolText ? <p>Tool proficiencies: {selectedBackground.toolText}</p> : null}
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
              <dt className="text-slate-600">Passive Perception</dt>
              <dd>{derived.passivePerception}</dd>
              <dt className="text-slate-600">Passive Insight</dt>
              <dd>{derived.passiveInsight}</dd>
              <dt className="text-slate-600">Passive Investigation</dt>
              <dd>{derived.passiveInvestigation}</dd>
              <dt className="text-slate-600">Spellcasting</dt>
              <dd>{derived.spellcasting.available ? "Available (declarative)" : "Not detected"}</dd>
            </dl>
            <p className="mt-3 text-xs text-slate-500">{derived.spellcasting.notes}</p>
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
