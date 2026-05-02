import { Link, useParams } from "react-router-dom";
import { useMemo } from "react";
import { Panel } from "../components/ui/Panel";
import { abilityModifier, deriveSummary } from "../domain/derived";
import {
  getBackgrounds,
  getAppliedCharacterRules,
  getClassById,
  getFeats,
  getFeaturesForClassLevel,
  getSpecies,
  getSpellById,
  getSubclassesForClass,
} from "../services/data/adapter";
import { useCharacterStore } from "../store/characterStore";
import { useSourceStore } from "../store/sourceStore";

const abilities = ["str", "dex", "con", "int", "wis", "cha"] as const;

export function CharacterSheetPage() {
  const generation = useSourceStore((state) => state.generation);
  const { id } = useParams<{ id: string }>();
  const characters = useCharacterStore((state) => state.characters);
  const draft = characters.find((entry) => entry.id === id);
  const dataContext = useMemo(
    () => ({
      provider: draft?.provider ?? "mpmb",
      rulesMode: draft?.rulesMode ?? "2024",
    }),
    [draft?.provider, draft?.rulesMode],
  );
  const speciesById = useMemo(() => new Map(getSpecies(dataContext).map((entry) => [entry.id, entry])), [dataContext, generation]);
  const backgroundById = useMemo(() => new Map(getBackgrounds(dataContext).map((entry) => [entry.id, entry])), [dataContext, generation]);
  const featById = useMemo(() => new Map(getFeats(dataContext).map((entry) => [entry.id, entry])), [dataContext, generation]);

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

  const classDef = draft.classSelection.classId ? getClassById(draft.classSelection.classId, dataContext) : undefined;
  const subclassDef = classDef
    ? getSubclassesForClass(classDef.id, {
        ...dataContext,
        classLevel: draft.classSelection.level,
      }).find((entry) => entry.id === draft.subclassSelection.subclassId)
    : undefined;
  const speciesDef = draft.speciesSelection.speciesId ? speciesById.get(draft.speciesSelection.speciesId) : undefined;
  const backgroundDef = draft.backgroundSelection.backgroundId ? backgroundById.get(draft.backgroundSelection.backgroundId) : undefined;
  const selectedFeats = draft.featIds.map((idValue) => featById.get(idValue)).filter(isDefined);
  const selectedSpells = draft.spellSelection.selectedSpellIds.map((idValue) => getSpellById(idValue, dataContext)).filter(isDefined);
  const features = getFeaturesForClassLevel(draft.classSelection.classId, draft.subclassSelection.subclassId, draft.classSelection.level, {
    ...dataContext,
    classLevel: draft.classSelection.level,
  });
  const derived = deriveSummary(draft, classDef, subclassDef);
  const appliedRules = getAppliedCharacterRules(draft, dataContext);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{draft.name}</h1>
        <div className="flex gap-2">
          <Link className="rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-800" to={`/builder/${draft.id}`}>
            Edit Builder
          </Link>
          <Link className="rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-800" to="/">
            Back
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Basics">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-600">Level</dt>
            <dd>{draft.classSelection.level}</dd>
            <dt className="text-slate-600">Provider</dt>
            <dd>{draft.provider}</dd>
            <dt className="text-slate-600">Rules Mode</dt>
            <dd>{draft.rulesMode}</dd>
            <dt className="text-slate-600">Class</dt>
            <dd>{classDef?.name ?? "—"}</dd>
            <dt className="text-slate-600">Subclass</dt>
            <dd>{subclassDef?.name ?? "—"}</dd>
            <dt className="text-slate-600">Species</dt>
            <dd>{speciesDef?.name ?? "—"}</dd>
            <dt className="text-slate-600">Background</dt>
            <dd>{backgroundDef?.name ?? "—"}</dd>
          </dl>
          {backgroundDef ? (
            <div className="mt-3 space-y-1 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
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
          {appliedRules.speciesResult.entity?.notes.length ? (
            <div className="mt-3 space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              {appliedRules.speciesResult.entity.notes.map((entry) => (
                <p key={entry}>{entry}</p>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel title="Ability Scores">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {abilities.map((ability) => (
              <div key={ability} className="rounded border border-slate-200 p-2 text-sm">
                <p className="text-xs uppercase text-slate-500">{ability}</p>
                <p className="text-lg font-semibold">{draft.abilityScores[ability]}</p>
                <p className="text-xs text-slate-600">
                  Modifier {abilityModifier(draft.abilityScores[ability]) >= 0 ? "+" : ""}
                  {abilityModifier(draft.abilityScores[ability])}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Features & Traits">
          {features.length === 0 ? (
            <p className="text-sm text-slate-500">No declarative features found.</p>
          ) : (
            <ul className="space-y-2">
              {features.map((feature) => (
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

        <Panel title="Spellcasting">
          <p className="mb-2 text-sm text-slate-700">{appliedRules.spellcasting.notes[0] ?? derived.spellcasting.notes}</p>
          {selectedSpells.length === 0 ? (
            <p className="text-sm text-slate-500">No spells selected.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {selectedSpells.map((spell) => (
                <li key={spell.id} className="rounded border border-slate-200 p-2">
                  <span className="font-medium">{spell.name}</span> · {spell.level === 0 ? "Cantrip" : `Level ${spell.level}`}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Feats">
          {selectedFeats.length === 0 ? (
            <p className="text-sm text-slate-500">No feats selected.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {selectedFeats.map((feat) => (
                <li key={feat.id} className="rounded border border-slate-200 p-2">
                  <span className="font-medium">{feat.name}</span>
                  {feat.prerequisite ? <span className="block text-xs text-slate-500">Prerequisite: {feat.prerequisite}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Inventory">
          {draft.inventory.items.length === 0 ? (
            <p className="text-sm text-slate-500">No items selected.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {draft.inventory.items.map((item) => (
                <li key={item.id} className="rounded border border-slate-200 p-2">
                  {item.name} × {item.quantity} {item.equipped ? "(equipped)" : ""}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Not Automated Yet">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>AC / HP / Saves / Skills remain manual in this phase.</li>
            <li>MPMB imperative hooks are not ported.</li>
            <li>Complex feature interactions require a future rules engine phase.</li>
          </ul>
        </Panel>

        <Panel title="Applied Rules Output">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-600">Proficiency Bonus</dt>
            <dd>+{appliedRules.classResult.proficiencyBonus}</dd>
            <dt className="text-slate-600">Save Proficiencies</dt>
            <dd>{appliedRules.proficiencies.savingThrows.join(", ") || "—"}</dd>
            <dt className="text-slate-600">Skill Proficiencies</dt>
            <dd>{appliedRules.proficiencies.skills.join(", ") || "—"}</dd>
            <dt className="text-slate-600">Tool Proficiencies</dt>
            <dd>{appliedRules.proficiencies.tools.join(", ") || "—"}</dd>
            <dt className="text-slate-600">Species Rule</dt>
            <dd>{appliedRules.speciesResult.entity?.conversionMode ?? "native"}</dd>
            <dt className="text-slate-600">Background Rule</dt>
            <dd>{appliedRules.backgroundResult.abilityScoreRule}</dd>
          </dl>
          {appliedRules.pendingChoices.length ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              {appliedRules.pendingChoices.map((choice) => (
                <p key={choice.id}>{choice.description}</p>
              ))}
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
