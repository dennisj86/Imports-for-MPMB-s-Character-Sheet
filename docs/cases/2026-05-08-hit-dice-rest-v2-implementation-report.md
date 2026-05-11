# Hit Dice / Rest V2 Implementation Report

## 1. Ziel der Phase

Diese Phase macht Short Rest und Long Rest im aktiven Sheet regelmechanisch vollstaendiger, ohne eine Combat Engine, Encounter-Automation oder Multiclass-Neuarchitektur zu starten.

Kernziel war: Hit Dice als session-orientierten `playState` modellieren, Short-Rest-Healing ueber Hit Dice ermoeglichen, Long-Rest-Hit-Dice-Recovery konservativ abbilden, Rest Summary und Play Log erweitern und die bestehende Play Loop V1.5 plus Action/Roll Workflow V1 intakt halten.

`docs/Spielerhandbuch.pdf` wurde als lokale Regelreferenz fuer Hit Dice, Short Rest und Long Rest verwendet. Es wurden keine langen Regeltexte aus der PDF in Code, Tests oder UI uebernommen.

## 2. Umgesetzter Scope

- `playState` enthaelt jetzt einen persistierten `hitDice`-Bereich mit Pools.
- Hit-Dice-Pools werden aus vorhandenen Engine-/Class-Daten abgeleitet, soweit `classDef.hitDie` und Level vorhanden sind.
- Bestehende Charaktere ohne Hit Dice erhalten automatisch normalisierten Hit-Dice-State.
- Inkonsistente Hit-Dice-Werte werden geclamped und gegen aktuelle Engine-Maxima gemerged.
- Short Rest gibt Hit Dice nicht automatisch aus.
- User koennen Hit Dice explizit im Rest-Bereich ausgeben.
- Pro Hit Die wird der passende Wuerfel ueber die bestehende Dice Utility gewuerfelt und der CON Modifier addiert.
- Healing wird auf `maxHp` geclamped und nicht unter 0 angewendet.
- Full-HP- und depleted-Faelle werden blockiert und als Play Events dokumentiert.
- Long Rest stellt wie vorher HP, Temp HP, Death Saves, Concentration, Ressourcen und Spell Slots her.
- Long Rest stellt zusaetzlich verbrauchte Hit Dice nach konservativer Grundregel wieder her: bis zur Haelfte der Gesamt-Hit-Dice, mindestens 1, ohne Max zu ueberschreiten.
- Bei mehreren Pools wird Recovery deterministisch auf die Pools mit dem hoechsten `spent`-Wert zuerst angewendet.
- Rest Summary enthaelt Hit-Dice-Verfuegbarkeit, Hit-Dice-Healing und Long-Rest-Recovery.
- Play Log zeigt `hit-die-spent`, `hit-die-spend-blocked` und `hit-dice-recovered`.

## 3. Geaenderte Dateien/Module

Neue Dateien:

- `src/services/playState/hitDice.ts`
- `src/features/character/components/sheet/HitDiceRestPanel.tsx`
- `docs/cases/2026-05-08-hit-dice-rest-v2-implementation-report.md`

Angepasste Dateien:

- `src/domain/playState.ts`
- `src/services/playState/index.ts`
- `src/services/playState/playStateReducer.ts`
- `src/services/playState/playStateService.ts`
- `src/services/persistence/characterPersistence.ts`
- `src/features/character/hooks/useCharacterPlayState.ts`
- `src/features/character/components/sheet/RestControls.tsx`
- `src/features/character/components/sheet/PlayLogPanel.tsx`
- `src/pages/CharacterSheetPage.tsx`
- `src/tests/play-state.test.ts`
- `src/tests/roll-workflow.test.ts`

Durch Test-/Build-Generierung aktualisierte Artefakte:

- `src/services/data/generated/mpmb-content.json`
- `src/services/data/generated/mpmb-local-content.json`
- `data/imports/mpmb-local/manifests/latest-runtime-summary.json`
- `data/imports/mpmb-local/manifests/latest-runtime-diagnostics.json`
- `dist/*`

## 4. Neue/angepasste Domain- oder Service-Modelle

`src/domain/playState.ts` wurde erweitert um:

- `HitDieSize`
- `HitDicePool`
- `CharacterHitDiceState`
- `CharacterPlayState.hitDice`
- neue Play Event Types:
  - `hit-die-spent`
  - `hit-die-spend-blocked`
  - `hit-dice-recovered`

`src/services/playState/hitDice.ts` kapselt:

- Ableitung von Hit-Dice-Pools aus `CharacterEngineState`;
- Normalisierung und Merge gegen aktuelle Source-Pools;
- Clamp-Regeln fuer `max`, `remaining` und `spent`;
- Long-Rest-Recovery-Strategie;
- View Counter fuer die UI;
- Auslesen des letzten Hit-Die-Healing-Ergebnisses aus dem bestehenden Play Log.

`src/services/playState/playStateService.ts` wurde erweitert um:

- `PlayStateRuntimeContext.constitutionModifier`;
- `PlayStateRuntimeContext.hitDicePools`;
- `spendHitDie(...)`;
- Hit-Dice-Daten in `createPlayStateFromEngine(...)`;
- Hit-Dice-Normalisierung in `ensureCharacterPlayState(...)`;
- Hit-Dice-Rest-Summary in `applyShortRest(...)`;
- Hit-Dice-Recovery in `applyLongRest(...)`.

Die Persistenz akzeptiert alte Drafts ohne `hitDice` und normalisiert kaputte/inkonsistente Hit-Dice-Felder beim Laden.

## 5. UI-Aenderungen

Der bestehende Rest-Bereich wurde gezielt erweitert, kein Redesign.

Neu im Sheet:

- Hit-Dice-Healing-Panel innerhalb der Rest Controls.
- Anzeige pro Pool:
  - Label
  - Die-Groesse
  - remaining / max
  - Spend-Button
- Anzeige von aktuellem HP / Max HP und CON Modifier.
- Anzeige des letzten Hit-Die-Healing-Ergebnisses.
- Blockierter Zustand bei vollem HP.
- Blockierter Zustand bei 0 remaining.
- Fallback-Hinweis, wenn keine Hit-Dice-Daten ableitbar sind.
- Long-Rest-Summary zeigt erwartbare Hit-Dice-Recovery.
- Play Log zeigt Hit-Dice-Healing, blockierte Hit-Dice-Spends und Recovery Events.

## 6. Tests und Validierungsergebnisse

Erweiterte Tests in `src/tests/play-state.test.ts` decken ab:

- Hit-Dice-Pool-Initialisierung aus Single-Class-Engine-Daten.
- Mehrere Hit-Dice-Pools bei strukturiert uebergebenen Source-Pools.
- Alte Drafts ohne Hit Dice laden weiter.
- Inkonsistente Hit-Dice-Werte werden normalisiert.
- Max-Aenderungen durch neue Source-Daten werden sauber gemerged.
- Hit Die Spend reduziert `remaining`, erhoeht `spent` und schreibt ein Event.
- Hit-Die-Healing nutzt Die Roll plus CON Modifier.
- Healing wird auf Max HP geclamped.
- Depleted Hit Dice werden blockiert und erzeugen ein Event.
- Full HP blockiert Hit-Die-Spend.
- Mehrere Hit Dice koennen nacheinander ausgegeben werden.
- Short Rest Summary enthaelt Hit-Dice-Verfuegbarkeit und Healing.
- Long Rest recovered Hit Dice nach implementierter Grundregel.
- Recovery ueberschreitet Max nicht.
- Recovery bei mehreren Pools ist deterministisch.
- Long Rest behaelt V1.5-Verhalten: HP max, Temp HP 0, Death Saves reset, Concentration end, Ressourcen/Slots restored.
- Hit-Dice-State bleibt im Persistence Roundtrip erhalten.
- Bisherige Roll-/Play-State-Guardrails bleiben bestehen.
- UI-Komponenten enthalten keine Dice-/Random-Business-Logik.
- Source/Tests enthalten keine langen PHB-Regeltexte fuer diese Phase.

Ausgefuehrte Validierung:

- `npm run test -- --run`: bestanden, 31 Testdateien, 124 Tests.
- `npm run typecheck`: bestanden.
- `npm run build`: bestanden.

Hinweis: Der Build meldet weiterhin die bestehende Vite-Warnung zu einem grossen Bundle-Chunk. Das wurde nicht als Teil dieser Phase adressiert.

## 7. Bekannte Luecken / bewusst nicht umgesetzt

Bewusst nicht umgesetzt:

- keine Combat Engine;
- kein Initiative-/Turn-System;
- kein Encounter Manager;
- keine Monster-/Target-Verwaltung;
- keine automatische Trefferentscheidung;
- keine automatische Damage-Anwendung auf Ziele;
- keine Resistance-/Vulnerability-/Immunity-Automation;
- keine vollstaendige Spell Effect Engine;
- keine vollstaendige Condition Effects Engine;
- keine vollstaendige strukturierte Attack-Daten-Engine;
- kein Crit-Damage-Automatismus;
- kein Level-Up-/Multiclass-Deep-Dive;
- keine komplette Multiclass-Neumodellierung;
- kein Quickbuilder;
- keine Premades;
- keine Campaigns;
- keine Accounts;
- kein Realtime Sync;
- kein Backend-Audit/Event-Sourcing;
- keine Homebrew-Publishing-Plattform;
- keine Rueckkehr zum Legacy Adapter;
- keine MPMB-Hook-Ausfuehrung ueber `eval/removeeval/changeeval/calcChanges`;
- kein grosses UI-Redesign.

Fachliche Grenzen:

- Das aktuelle Character-Draft-Modell ist weiterhin single-class. Die Hit-Dice-Schicht kann mehrere Pools normalisieren und recovern, aber die Runtime-Ableitung aus echten Multiclass-Builddaten ist noch nicht vorhanden.
- Hit-Dice-Recovery bei mehreren Pools nutzt eine transparente, deterministische Strategie, ist aber kein vollstaendiges Multiclass-Regelmodell.
- Features wie Durable, Song of Rest oder andere Sonderregeln fuer Hit-Dice-Healing sind noch nicht automatisiert.
- Hit-Dice-Healing ist lokal im Sheet und im Play Log persistiert; es gibt kein Backend-Audit oder Sync.

## 8. Empfohlene naechste Phase

Empfohlene naechste Phase: **Structured Attack Data V1**.

Begruendung:

- Play Loop, Rests, Hit Dice und Rolls sind jetzt fuer einfache Sessions nutzbar.
- Der groesste verbleibende Alltags-Reibungspunkt liegt bei Attack-/Damage-Daten: Aktuell werden manche Attack Boni und Damage Formulas noch konservativ oder heuristisch aus vorhandenen Daten abgeleitet.
- Structured Attack Data V1 wuerde den bestehenden Action/Roll Workflow stabilisieren, ohne eine Combat Engine zu bauen.

Vorgeschlagener Scope:

- Action-/Weapon-Daten in `characterEngine`/`actionResources` strukturierter ausgeben.
- Attack Bonus, Damage Dice, Damage Type, Range/Reach und Source stabiler modellieren.
- UI weiter nur als Roll-/Sheet-Workflow behandeln.
- Keine Ziel-AC, keine automatische Trefferentscheidung, keine Encounter Targets.

## 9. Hinweise fuer den naechsten Codex-/Research-Handoff

- `characterEngine` bleibt Quelle fuer derived stats, Class-Daten und Action-/Resource-Ausgaben.
- `playState` bleibt Quelle fuer session-orientierte Current-/Spent-Zustaende.
- Hit-Dice-Maxima werden aus Runtime-/Engine-Daten abgeleitet; `remaining` und `spent` leben im Play-State.
- Short Rest gibt Hit Dice nur explizit auf User-Aktion aus.
- Long Rest recovered Hit Dice konservativ und deterministisch.
- Roll Events, Hit-Dice-Events und Rest Events teilen weiter das bestehende `playEvents` Log.
- Keine zweite History-Infrastruktur einfuehren.
- Legacy Adapter darf nicht Runtime-Pfad werden.
- MPMB-Hook-Ausfuehrung bleibt verboten.
- Die naechste Phase sollte die vorhandenen Sheet-Workflows haerten, nicht in Encounter-/Campaign-/Backend-Scope wechseln.
