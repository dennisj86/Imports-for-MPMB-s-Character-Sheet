import { Link, useParams } from "react-router-dom";
import { Panel } from "../components/ui/Panel";
import { useCharacterEngine } from "../features/character/hooks";
import { useCharacterStore } from "../store/characterStore";
import { useSourceStore } from "../store/sourceStore";

const abilities = ["str", "dex", "con", "int", "wis", "cha"] as const;

export function CharacterSheetPage() {
  const generation = useSourceStore((state) => state.generation);
  const activeSourceKeys = useSourceStore((state) => state.activeSourceKeys);
  const { id } = useParams<{ id: string }>();
  const characters = useCharacterStore((state) => state.characters);
  const draft = characters.find((entry) => entry.id === id);
  const engineView = useCharacterEngine(draft, activeSourceKeys, generation);

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
      <Panel title="V2 state unavailable">
        <p className="text-sm text-slate-600">The V2 character engine state could not be resolved for this character.</p>
      </Panel>
    );
  }

  const classDef = engineView.engine.classDef;
  const subclassDef = engineView.engine.subclassDef;
  const speciesDef = engineView.engine.speciesDef;
  const backgroundDef = engineView.engine.backgroundDef;
  const selectedFeats = engineView.engine.selectedFeats;
  const selectedSpells = engineView.engine.selectedSpells;
  const features = engineView.engine.progression.unlockedFeatures;
  const appliedRules = engineView.engine.appliedRules;
  const derivedStats = engineView.engine.derivedStats;
  const progression = engineView.engine.progression;
  const actionResources = engineView.engine.actionResources;

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
            <dt className="text-slate-600">Initiative</dt>
            <dd>{derivedStats.initiative >= 0 ? "+" : ""}{derivedStats.initiative}</dd>
            <dt className="text-slate-600">Speed</dt>
            <dd>{derivedStats.speed.walking ? `${derivedStats.speed.walking} ft` : "—"}</dd>
            <dt className="text-slate-600">Armor Class</dt>
            <dd>{derivedStats.armorClass.value}</dd>
            <dt className="text-slate-600">HP Max (Base)</dt>
            <dd>{derivedStats.hitPoints.max}</dd>
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
                <p className="text-lg font-semibold">{derivedStats.abilityScores[ability].finalScore}</p>
                <p className="text-xs text-slate-600">
                  Modifier {derivedStats.abilityScores[ability].modifier >= 0 ? "+" : ""}
                  {derivedStats.abilityScores[ability].modifier}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Saves">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {abilities.map((ability) => {
              const save = derivedStats.savingThrows[ability];
              return (
                <div key={ability} className="rounded border border-slate-200 p-2 text-sm">
                  <p className="text-xs uppercase text-slate-500">{ability}</p>
                  <p className="font-semibold">
                    {save.total >= 0 ? "+" : ""}
                    {save.total}
                  </p>
                  <p className="text-xs text-slate-600">{save.proficient ? "Proficient" : "Not proficient"}</p>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Skills">
          <div className="grid gap-1 text-sm">
            {Object.values(derivedStats.skills).map((skill) => (
              <div key={skill.key} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1">
                <span>
                  {skill.label} ({skill.ability.toUpperCase()})
                  {skill.proficient ? " *" : ""}
                </span>
                <span className="font-medium">
                  {skill.total >= 0 ? "+" : ""}
                  {skill.total}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Passive Perception {derivedStats.passivePerception} · Passive Investigation {derivedStats.passiveInvestigation} · Passive Insight{" "}
            {derivedStats.passiveInsight}
          </p>
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
          <p className="mb-2 text-sm text-slate-700">{derivedStats.spellcasting.notes[0] ?? "No spellcasting basis resolved."}</p>
          {derivedStats.spellcasting.available ? (
            <dl className="mb-2 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-600">Spellcasting Ability</dt>
              <dd>{derivedStats.spellcasting.ability?.toUpperCase() ?? "Pending"}</dd>
              <dt className="text-slate-600">Spell Save DC</dt>
              <dd>{derivedStats.spellcasting.spellSaveDC ?? "Pending"}</dd>
              <dt className="text-slate-600">Spell Attack</dt>
              <dd>
                {derivedStats.spellcasting.spellAttackModifier === undefined
                  ? "Pending"
                  : `${derivedStats.spellcasting.spellAttackModifier >= 0 ? "+" : ""}${derivedStats.spellcasting.spellAttackModifier}`}
              </dd>
              <dt className="text-slate-600">Progression Mode</dt>
              <dd>{progression.spellProgression.mode}</dd>
            </dl>
          ) : null}
          {Object.keys(progression.spellProgression.spellSlots).length ? (
            <p className="mb-2 text-xs text-slate-700">
              Slots:{" "}
              {Object.entries(progression.spellProgression.spellSlots)
                .map(([slotLevel, count]) => `${slotLevel}:${count}`)
                .join(" · ")}
            </p>
          ) : null}
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

        <Panel title="Level Progression">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-600">Current Level</dt>
            <dd>{progression.currentLevel}</dd>
            <dt className="text-slate-600">Subclass Requirement</dt>
            <dd>
              {progression.subclassRequirement
                ? progression.subclassRequirement.satisfied
                  ? "Satisfied"
                  : `Required at L${progression.subclassRequirement.unlockLevel}`
                : "—"}
            </dd>
            <dt className="text-slate-600">ASI / Feat Choices</dt>
            <dd>{progression.asiOrFeatChoices.length}</dd>
            <dt className="text-slate-600">Pending Progression Choices</dt>
            <dd>{progression.pendingChoices.length}</dd>
          </dl>
          {progression.pendingChoices.length ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              {progression.pendingChoices.map((choice) => (
                <p key={choice.id}>{choice.description}</p>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel title="Actions">
          {actionResources.actionSet.actions.length === 0 ? (
            <p className="text-sm text-slate-500">No explicit action entries resolved.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {actionResources.actionSet.actions.map((entry) => (
                <li key={entry.id} className="rounded border border-slate-200 p-2">
                  <p className="font-medium">{entry.name}</p>
                  {entry.requiresResourceIds.length ? <p className="text-xs text-slate-600">Uses resource(s)</p> : null}
                  {entry.dataStatus !== "complete" ? <p className="text-xs text-amber-700">Status: {entry.dataStatus}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Bonus Actions / Reactions">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-slate-500">Bonus Actions</p>
              {actionResources.actionSet.bonusActions.length === 0 ? (
                <p className="text-sm text-slate-500">—</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {actionResources.actionSet.bonusActions.map((entry) => (
                    <li key={entry.id} className="rounded border border-slate-200 p-2">
                      {entry.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-slate-500">Reactions</p>
              {actionResources.actionSet.reactions.length === 0 ? (
                <p className="text-sm text-slate-500">—</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {actionResources.actionSet.reactions.map((entry) => (
                    <li key={entry.id} className="rounded border border-slate-200 p-2">
                      {entry.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {actionResources.actionSet.utilityActions.length ? (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium uppercase text-slate-500">Utility / Special</p>
              <ul className="space-y-1 text-sm">
                {actionResources.actionSet.utilityActions.map((entry) => (
                  <li key={entry.id} className="rounded border border-slate-200 p-2">
                    {entry.name}
                    {entry.dataStatus !== "complete" ? <span className="ml-2 text-xs text-amber-700">({entry.dataStatus})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>

        <Panel title="Resources">
          {actionResources.resourceSet.resources.length === 0 ? (
            <p className="text-sm text-slate-500">No limited-use resources resolved.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {actionResources.resourceSet.resources.map((resource) => (
                <li key={resource.id} className="rounded border border-slate-200 p-2">
                  <p className="font-medium">{resource.name}</p>
                  <p className="text-xs text-slate-600">
                    Max: {resource.usesMax ?? "—"} · Recharge: {resource.recharge.label}
                  </p>
                  {resource.dataStatus !== "complete" ? <p className="text-xs text-amber-700">Status: {resource.dataStatus}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Not Automated Yet">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>AC / HP / Saves / Skills now provide deterministic baseline values.</li>
            <li>Complex exceptions, temporary modifiers, and advanced feature interactions remain pending.</li>
            <li>MPMB imperative hooks are not ported.</li>
            <li>Spell slots/prepared tables are still table-pending in this phase.</li>
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

        <Panel title="Derived Status">
          <p className="text-sm text-slate-700">Data Status: {derivedStats.dataStatus}</p>
          {derivedStats.pending.length ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              {derivedStats.pending.map((entry) => (
                <p key={entry.id}>{entry.description}</p>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel title="Action/Resource Status">
          <p className="text-sm text-slate-700">Data Status: {actionResources.dataStatus}</p>
          {actionResources.pending.length ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              {actionResources.pending.map((entry) => (
                <p key={entry.id}>{entry.description}</p>
              ))}
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
