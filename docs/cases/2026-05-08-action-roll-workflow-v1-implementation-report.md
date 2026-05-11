# Action/Roll Workflow V1 Implementation Report

## 1. Ziel der Phase

Diese Phase erweitert das V2 Character Sheet um einfache, regelnahe Wuerfelaktionen. Ziel war nicht eine Combat Engine, sondern eine direkt nutzbare Sheet-Oberflaeche fuer haeufige Rolls: Ability Checks, Skill Checks, Saving Throws, einfache Attack Rolls, Spell Attack Rolls, Spell Save DC-Anzeige, optionale Damage Rolls und Roll Events im bestehenden Play Log.

Der bestehende Stateful Play Loop V1.5 bleibt dabei die Runtime-Basis. Rolls werden als Play-State-Events persistiert, ueberschreiben aber keine Build-Daten und keine derived values aus `characterEngine`.

## 2. Umgesetzter Scope

- Ability Checks werden aus `derivedStats.abilityScores` als `1d20 + modifier` erzeugt.
- Saving Throws werden aus `derivedStats.savingThrows` erzeugt und uebernehmen vorhandene Proficiency-Informationen.
- Skill Checks werden aus `derivedStats.skills` erzeugt und uebernehmen vorhandene Proficiency-/Expertise-Metadaten.
- Advantage, Disadvantage und Normal Rolls sind zentral im Sheet auswaehlbar.
- Attack Rolls fuer strukturierte Waffen-/Action-Eintraege werden als einfache `1d20 + attack bonus` Rolls angeboten.
- Damage Rolls werden angeboten, wenn eine konservativ erkennbare Dice Formula vorhanden ist.
- Spell Attack Rolls werden fuer ausgewaehlte Spells angeboten, wenn ein Spell-Attack-Hinweis erkannt wird.
- Spell Save DC und Save Ability werden angezeigt, wenn sie aus Spell-Beschreibung und derived spellcasting stats ableitbar sind.
- Spell Damage Rolls werden angeboten, wenn eine Dice Formula konservativ erkennbar ist.
- Roll Results werden sofort im Sheet als letzter Roll angezeigt.
- Roll Results werden als `roll` Events im bestehenden `playEvents` Log persistiert.
- Ressourcenverknuepfte Actions koennen `Roll + Spend` anbieten, aber nur bei eindeutigem Resource-Key.
- Leere oder unbekannte Ressourcen erzeugen ein klares `resource-spend-blocked` Event.
- Uneindeutige Resource-Verknuepfungen werden nicht automatisch verbraucht.
- Der Cast Flow aus V1.5 bleibt getrennt: Slotverbrauch, Ritual/Cantrip/Slot Cast und Concentration werden nicht durch Roll Buttons ersetzt.

## 3. Geaenderte Dateien/Module

Neue Dateien:

- `src/domain/rolls.ts`
- `src/services/rolls/index.ts`
- `src/services/rolls/rollHistory.ts`
- `src/services/rolls/rollRequestFactory.ts`
- `src/services/rolls/rollService.ts`
- `src/features/character/components/sheet/ActionRollPanel.tsx`
- `src/tests/roll-workflow.test.ts`

Angepasste Dateien:

- `src/domain/playState.ts`
- `src/services/persistence/characterPersistence.ts`
- `src/services/playState/playStateReducer.ts`
- `src/services/playState/playStateService.ts`
- `src/features/character/hooks/useCharacterPlayState.ts`
- `src/pages/CharacterSheetPage.tsx`
- `src/features/character/components/sheet/PlayLogPanel.tsx`

Durch Build/Data-Generation aktualisierte Artefakte:

- `src/services/data/generated/mpmb-content.json`
- `src/services/data/generated/mpmb-local-content.json`
- `data/imports/mpmb-local/manifests/latest-runtime-summary.json`
- `data/imports/mpmb-local/manifests/latest-runtime-diagnostics.json`
- `dist/*`

## 4. Neue/angepasste Domain- oder Service-Modelle

`src/domain/rolls.ts` fuehrt ein kleines Roll-Modell ein:

- `RollRequest` beschreibt einen ausfuehrbaren Roll mit Typ, Label, Modifier, Dice Expression, Roll Mode, optionaler Ability/Skill/Source und Metadaten.
- `RollResult` beschreibt das Ergebnis inklusive Raw Rolls, kept roll bei Advantage/Disadvantage, Modifier, Total, Natural Roll und Outcome Label.
- `RollActionDescriptor` beschreibt eine Sheet-Action, die optional Attack Roll, Damage Roll, Spell Save DC und Resource-Verknuepfungen enthaelt.
- `CharacterRollView` buendelt Ability Checks, Saving Throws, Skill Checks, Action Rolls und Spell Rolls fuer die UI.

`src/services/rolls/rollService.ts` ist die zentrale Roll-Ausfuehrung:

- nutzt die vorhandene Dice Utility `rollDiceExpression`;
- behandelt Advantage/Disadvantage fuer `1d20`;
- markiert Natural 20 und Natural 1 nur fuer Attack-/Spell-Attack-Rolls;
- erzeugt aus Roll Results kompatible Play Log Events.

`src/services/rolls/rollRequestFactory.ts` erzeugt Roll Requests aus bestehenden Engine-Ausgaben:

- Ability/Saving/Skill Requests aus `derivedStats`;
- Action Descriptors aus `characterEngine.actionResources`;
- Spell Roll Descriptors aus `engine.selectedSpells` und `derivedStats.spellcasting`.

`src/services/playState/playStateService.ts` wurde um `rollAndRecord` erweitert:

- fuehrt einen Roll aus;
- schreibt ein `roll` Event;
- kann optional genau eine eindeutig uebergebene Ressource verbrauchen;
- schreibt bei leerer/unbekannter Ressource ein `resource-spend-blocked` Event.

Die Persistenz akzeptiert die neuen Play Event Types `roll` und `resource-spend-blocked`.

## 5. UI-Aenderungen

Das Sheet hat einen neuen Panel-Bereich `Rolls / Actions`.

Enthalten sind:

- Roll Mode Selector fuer Normal, Advantage und Disadvantage.
- Last Roll Card mit Label, Mode, Dice Expression, Modifier, Total und Natural-Outcome-Hinweis.
- kompakte Buttons fuer Ability Checks.
- kompakte Buttons fuer Saving Throws.
- kompakte Buttons fuer Skill Checks.
- Action-Liste mit Roll-, Damage-, Spend- oder Roll+Spend-Aktionen, soweit strukturiert verfuegbar.
- Spell-Roll-Liste mit Spell Attack, Spell Save DC und optional Damage Formula.
- sichtbare Hinweise fuer fehlende strukturierte Rolls, fehlende Damage Formula oder uneindeutige Ressourcen.

Das Play Log zeigt Roll Events mit Roll Mode, Dice Expression, Modifier, Total und Natural-Outcome-Hinweis. Blockierte Resource-Spends werden ebenfalls lesbar angezeigt.

## 6. Tests und Validierungsergebnisse

Neue Tests in `src/tests/roll-workflow.test.ts` decken ab:

- normaler d20 Roll plus Modifier;
- Advantage behaelt den hoeheren d20;
- Disadvantage behaelt den niedrigeren d20;
- Natural 20 und Natural 1 werden bei Attack Rolls markiert;
- RollResult enthaelt Dice, Modifier, Total, Label und Timestamp;
- Ability Check nutzt den passenden Modifier;
- Saving Throw nutzt den passenden Modifier;
- Skill Check nutzt vorhandene Skill-Modifikatoren inklusive Expertise-Metadaten;
- Attack Roll nutzt vorhandene Engine-/Action-Ausgaben konservativ;
- Damage Roll nutzt vorhandene Damage Formula, wenn strukturiert erkennbar;
- fehlende Damage Formula blockiert Attack Roll nicht;
- Spell Attack nutzt den Spell Attack Modifier;
- Spell Save DC wird angezeigt, ohne gegnerische Saves zu wuerfeln;
- Spell Damage Roll funktioniert, wenn eine Formula erkennbar ist;
- Cast und Roll erzeugen keine doppelte Slotbuchung;
- Roll Events werden in `playEvents` gespeichert;
- Roll Events bleiben nach Persistence Roundtrip erhalten;
- alte Drafts ohne Roll Events laden weiterhin;
- bounded Play Log bleibt begrenzt;
- eindeutig verknuepfte Ressourcen koennen mit Roll verbraucht werden;
- leere Ressourcen blockieren Spend und erzeugen ein klares Event;
- uneindeutige Ressourcen werden nicht automatisch verbraucht;
- V2 Sheet bleibt auf `useCharacterEngine` und `useCharacterPlayState`;
- produktive V2 Pfade bekommen keine direkten Adapter-Imports;
- keine Runtime-Ausfuehrung von `eval/removeeval/changeeval/calcChanges`;
- Roll-Business-Logik liegt im Service, nicht in der UI-Komponente.

Ausgefuehrte Validierung:

- `npm run test -- --run`: bestanden, 31 Testdateien, 117 Tests.
- `npm run typecheck`: bestanden.
- `npm run build`: bestanden.

Hinweis: Der Build meldet weiterhin die bestehende Vite-Warnung zu einem grossen Bundle-Chunk. Das blockiert die Phase nicht und wurde nicht als Teil dieser Phase geloest.

## 7. Bekannte Luecken / bewusst nicht umgesetzt

Bewusst nicht umgesetzt:

- keine Combat Engine;
- kein Initiative-/Turn-System;
- kein Encounter Manager;
- keine Monster-, Target- oder Ziel-AC-Verwaltung;
- keine automatische Trefferentscheidung;
- keine gegnerischen Saving Throws;
- keine automatische Damage-Anwendung auf Ziele;
- keine Resistance-/Vulnerability-/Immunity-Automation;
- keine vollstaendige Spell Effect Engine;
- keine vollstaendige Condition Effects Engine;
- kein Crit-Damage-Automatismus;
- kein Hit-Dice-/Rest-V2;
- kein Level-Up-/Multiclass-Deep-Dive;
- keine Quickbuilder- oder Premade-Arbeit;
- keine Campaign-, Account-, Sharing- oder Sync-Plattform;
- keine Homebrew-Publishing-Plattform;
- keine Rueckkehr zum Legacy Adapter;
- keine Ausfuehrung von MPMB `eval/removeeval/changeeval/calcChanges` Hooks.

Fachliche Grenzen der aktuellen V1:

- Weapon Attack Bonus ist fuer Waffen-Actions derzeit ein konservativer Baseline-Wert aus besserem STR/DEX Modifier plus Proficiency. Vollstaendige Waffen-Property-, Finesse-, Ranged-, Magic-Item- und Fighting-Style-Logik ist noch nicht abgebildet.
- Damage Formula Detection ist absichtlich konservativ und liest einfache Dice Expressions aus Beschreibungstexten. Es gibt noch keine vollstaendige strukturierte Damage-Model-Schicht.
- Spell Attack, Save Ability und Damage werden heuristisch aus Spell-Beschreibungen erkannt, soweit die vorhandenen Daten das hergeben. Das ist nuetzlich fuer V1, aber keine vollstaendige Spell-Rule-Engine.
- Resource-linked Actions verbrauchen nur dann automatisch Ressourcen, wenn der Resource-Key eindeutig ist. Ambigue Faelle bleiben bewusst manuell.
- Roll Events sind lokale Play Log Events. Es gibt kein Backend-Audit, kein Event Sourcing und keine Sync-Konfliktloesung.

## 8. Empfohlene naechste Phase

Empfohlene naechste Phase: **Hit Dice / Rest V2 oder Structured Attack Data V1**, wobei Hit Dice / Rest V2 wahrscheinlich den groesseren unmittelbaren Produktgewinn liefert.

Begruendung:

- Der Sheet-Play-Loop kann jetzt HP, Ressourcen, Spell Slots, Conditions, Concentration, Rests und Rolls bedienen.
- Short Rest bleibt ohne Hit-Dice-Healing noch fachlich sichtbar unvollstaendig.
- Hit Dice / Rest V2 wuerde eine vorhandene Luecke im aktiven Session-Flow schliessen, ohne Campaign-, Combat- oder Encounter-Scope zu starten.
- Structured Attack Data V1 waere danach sinnvoll, um die aktuellen konservativen Attack-/Damage-Heuristiken durch stabilere Engine-Ausgaben zu ersetzen.

Vorgeschlagener Scope fuer Hit Dice / Rest V2:

- Hit Dice als Play-State-nahe Session-Ressource modellieren, ohne Build-Daten zu ueberschreiben.
- Short Rest HP-Healing ueber Hit Dice UI ermoeglichen.
- Long Rest Hit-Dice-Recovery konservativ abbilden.
- bestehende Rest Summary erweitern.
- keine neue Combat Engine und kein Multiclass-Deep-Dive.

## 9. Hinweise fuer den naechsten Codex-/Research-Handoff

Der naechste Handoff sollte die folgenden Punkte explizit machen:

- Action/Roll Workflow V1 ist ein Sheet-Workflow, keine Encounter-Automation.
- `characterEngine` bleibt Quelle fuer derived stats und Action-/Resource-Ausgaben.
- `playState` bleibt Quelle fuer fluechtig-persistente Session-Zustaende und lokale Events.
- Roll Results werden im vorhandenen `playEvents` Log gespeichert; keine zweite Roll-History-Infrastruktur einfuehren.
- Automatischer Resource-Spend ist nur bei eindeutigem Resource-Key erlaubt.
- Die aktuellen Attack-/Spell-Roll-Daten sind teilweise heuristisch; ein naechster Ausbau sollte entweder Hit Dice / Rest V2 priorisieren oder bewusst strukturierte Attack-/Damage-Ausgaben in der Engine haerten.
- Legacy Adapter darf nicht wieder Runtime-Pfad werden.
- MPMB Hook-Ausfuehrung ueber `eval/removeeval/changeeval/calcChanges` bleibt Non-Goal und Guardrail.
