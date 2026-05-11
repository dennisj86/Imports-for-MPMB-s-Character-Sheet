# Research Handoff: Stateful Play Loop V1.5 / Rules-Backed Hardening

Stand: 2026-05-08

## 1. Zweck dieser Übergabe

Diese Datei beschreibt den aktuellen Stand nach der Umsetzung von **Stateful Play Loop V1.5 / Rules-Backed Hardening**. Sie soll einer Research Engine schnell und belastbar erklären:

- was im Sheet-Play-Loop jetzt tatsächlich umgesetzt ist,
- welche Lücken bewusst offen bleiben,
- welche Risiken nicht durch Architekturumbau, sondern durch gezielte nächste Produktphasen adressiert werden sollten,
- und welche nächste Phase realistisch genug ist, um daraus einen Codex-Prompt abzuleiten.

Dies ist kein neues Produktkonzept und keine D&D-Beyond-Paritätsbehauptung. Der aktuelle Stand bleibt ein lokaler, V2-basierter Character Builder mit aktiv nutzbarem Sheet-Play-State.

## 2. Ausgangslage vor V1.5

Vor dieser Phase existierte bereits Stateful Play Loop V1:

- `playState` war persistent im Character Draft vorhanden.
- `/sheet/:id` nutzte `useCharacterEngine` plus `useCharacterPlayState`.
- HP, Temp HP, Death Saves, Ressourcen, Spell Slots, Conditions, Concentration, Rest Controls und Play Log waren im Sheet bedienbar.
- Play-State war von Build-Daten und derived values getrennt.
- Der Legacy Adapter war nicht wieder Runtime-Pfad.

Die V1 war bewusst konservativ. Sie machte das Sheet nutzbar, aber Rest-Regeln, Spell-Cast-Validierung, Condition-Taxonomie und Resource-Recharge-Metadaten waren noch relativ grob.

## 3. Was in V1.5 umgesetzt wurde

### 3.1 Rest-Regeln und Rest Summary

Umgesetzt:

- `restResolver` unterscheidet jetzt klarer zwischen:
  - `short-rest`
  - `long-rest`
  - `manual`
  - `special`
  - `none` / nicht automatisch wiederherstellbar
- Short Rest stellt nur Short-Rest-Ressourcen wieder her.
- Long Rest stellt Long-Rest- und Short-Rest-Ressourcen wieder her.
- Spell Slots werden über ihre Recharge-Metadaten behandelt:
  - normale Long-Rest-Slots bleiben bei Short Rest unverändert,
  - Short-Rest-Slotpools sind möglich, z. B. Pact-Magic-artige Slots.
- Manual/Special-Ressourcen werden nicht automatisch wiederhergestellt.
- Manual/Special-Ressourcen erscheinen als Skip-Hinweise in Rest Plan und Play Event.
- Long Rest setzt zusätzlich im Play-State:
  - `currentHp` auf max HP,
  - `tempHp` auf 0,
  - Death Saves zurück,
  - Concentration auf `null`,
  - passende Ressourcen und Spell Slots zurück.
- Conditions bleiben standardmäßig bestehen; `clearableOnRest` ist vorbereitet, aber keine aggressive Regelautomatik.

Bewusst nicht umgesetzt:

- Kein vollständiges Hit-Dice-System für Short-Rest-Heilung.
- Keine automatische Wiederherstellung unklarer `manual`/`special` Sonderfälle.
- Keine Ausführung von MPMB-Hooks wie `eval`, `removeeval`, `changeeval`, `calcChanges`.

### 3.2 Spell-Cast UX und Service-Validierung

Umgesetzt:

- Spell Cast unterscheidet jetzt im Service und in der UI:
  - Cantrip Cast,
  - Ritual Cast,
  - Slot Cast.
- Cantrips verbrauchen keinen Slot.
- Ritual Cast verbraucht keinen Slot und erzeugt ein Play Event.
- Slot Cast:
  - nutzt nur verfügbare Slot-Level,
  - blockiert leere oder nicht passende Slots,
  - erzeugt bei Blockierung ein `spell-cast-blocked` Event statt stillschweigend zu buchen.
- Cast Events enthalten strukturierte Payloads:
  - Spell-ID,
  - Spellname,
  - Cast-Modus,
  - Slot-Level, falls relevant,
  - Konzentrationsänderung.
- Wenn ein Concentration Spell gecastet wird und bereits Concentration aktiv ist, wird der Übergang explizit protokolliert:
  - `concentration-start`
  - oder `concentration-replace`
- Die UI zeigt bei Spells sichtbarer an:
  - Cantrip / Slot / Ritual,
  - kein verfügbarer Slot,
  - mögliche Concentration-Ersetzung.

Bewusst nicht umgesetzt:

- Keine vollständige Spell-Resolution Engine.
- Keine automatische Target-Auswahl.
- Keine automatische Damage-/Save-/Effect-Abwicklung.
- Keine vollständige Sonderfalllogik für einzelne Spells.

### 3.3 Condition-Taxonomie

Umgesetzt:

- Neues Modul `src/services/playState/conditionDefinitions.ts`.
- Standard-Condition-Presets mit stabilen IDs:
  - `condition:blinded`
  - `condition:charmed`
  - `condition:deafened`
  - `condition:frightened`
  - `condition:grappled`
  - `condition:incapacitated`
  - `condition:invisible`
  - `condition:paralyzed`
  - `condition:petrified`
  - `condition:poisoned`
  - `condition:prone`
  - `condition:restrained`
  - `condition:stunned`
  - `condition:unconscious`
  - `condition:exhaustion`
- Definitionen enthalten kurze technische Metadaten:
  - `id`
  - `label`
  - optionale Kategorie
  - optionale Quelle
  - kurzen rules hint ohne lange Regeltexte
  - optionales `clearableOnRest`
- Aktive Conditions werden im Play-State über IDs normalisiert.
- Alte/freeform Conditions werden beim Laden/Normalisieren sicher auf stabile IDs gemappt.
- `ConditionTray` zeigt Presets, Filter und aktive Condition Chips.

Bewusst nicht umgesetzt:

- Keine automatische Condition-Effects Engine.
- Keine automatische Advantage/Disadvantage-Verkabelung.
- Keine automatische Speed-/Attack-/Save-Modifikation.
- Exhaustion bleibt nur trackbar, nicht regelmechanisch voll integriert.

### 3.4 Resource-/Recharge-Metadaten

Umgesetzt:

- `ResourceRechargeType` unterstützt zusätzlich `none`.
- `PlayStateRuntimeContext` enthält jetzt stabilere Metadaten:
  - `resourceMaxByKey`
  - `resourceRechargeByKey`
  - `resourceNameByKey`
  - `spellSlotMaxByKey`
  - `spellSlotRechargeByKey`
- Resource Counter enthalten:
  - stabile ID,
  - Name,
  - Max/Spent/Remaining,
  - Recharge Type/Label,
  - Source Type/ID/Name,
  - Data Status.
- Tests sichern ab, dass gleichnamige Ressourcen aus unterschiedlichen Quellen nicht kollidieren.
- Rest-Verhalten wird über Recharge-Metadaten gesteuert, nicht über reine Label-Heuristik im UI.

Bewusst nicht umgesetzt:

- Keine vollständige Normalisierung aller möglichen MPMB-Sonderfälle.
- Keine automatische Auflösung unklarer Description-only Recharge-Regeln über neue Hook-Ausführung.
- Keine komplette Item-Charge-/Attunement-Engine.

### 3.5 Sheet-UI-Härtung

Gezielt verbessert, ohne Redesign:

- `RestControls` zeigt Short-/Long-Rest-Zusammenfassung und Manual/Special-Hinweise.
- `SpellSlotTracker` zeigt nur verfügbare Slot-Level für Slot Casts und blockiert offensichtliche Fehlbuchungen.
- `ConditionTray` nutzt stabile Presets plus Filter.
- `ResourceTracker` zeigt depleted-Zustände und deaktiviert nicht sinnvolle Spend/Restore-Aktionen.
- `PlayLogPanel` zeigt relevante Details für Spell Casts, Cast Blocks und Rests.

Bewusst nicht umgesetzt:

- Kein neues Layout-Konzept.
- Keine komplette visuelle Neuerfindung des Sheet.
- Keine Combat-Dashboard-Ansicht.

### 3.6 Guardrails und Tests

Erweitert:

- Play-State Tests decken jetzt V1.5-Fälle ab:
  - Cantrip Cast ohne Slotverbrauch,
  - Ritual Cast ohne Slotverbrauch,
  - Slot Cast mit korrektem Verbrauch,
  - blockierter Slot Cast bei fehlendem Slot,
  - Concentration Start/Replace Events,
  - Rest-Recovery nach Recharge-Metadaten,
  - Manual/Special Skip-Hinweise,
  - stabile Condition IDs,
  - Legacy/freeform Condition-Normalisierung,
  - same-label resource collision avoidance,
  - V2 Sheet/Builder/Content Guardrails.
- Persistenzschema akzeptiert ältere/freeform Condition-Formen und normalisiert sie über `ensureCharacterPlayState`.
- Guardrails halten `/sheet/:id` auf `useCharacterEngine` + `useCharacterPlayState`.
- Produktive V2-Pfade bleiben ohne direkte Adapter-Imports.
- Keine Runtime-Ausführung von `eval/removeeval/changeeval/calcChanges`.

## 4. Relevante geänderte Bereiche

Domain:

- `src/domain/playState.ts`
- `src/domain/actionResources.ts`

Play-State Services:

- `src/services/playState/conditionDefinitions.ts`
- `src/services/playState/restResolver.ts`
- `src/services/playState/playStateReducer.ts`
- `src/services/playState/playStateService.ts`
- `src/services/playState/index.ts`

Persistence:

- `src/services/persistence/characterPersistence.ts`

Sheet Hook und UI:

- `src/features/character/hooks/useCharacterPlayState.ts`
- `src/pages/CharacterSheetPage.tsx`
- `src/features/character/components/sheet/SpellSlotTracker.tsx`
- `src/features/character/components/sheet/ConditionTray.tsx`
- `src/features/character/components/sheet/RestControls.tsx`
- `src/features/character/components/sheet/ResourceTracker.tsx`
- `src/features/character/components/sheet/PlayLogPanel.tsx`

Tests:

- `src/tests/play-state.test.ts`

## 5. Validierung

Lokale Validierung nach Umsetzung:

- `npm run test -- --run`: bestanden
  - 30 Test Files
  - 108 Tests
- `npm run typecheck`: bestanden
- `npm run build`: bestanden

Bekannte Build-Hinweise:

- Vite meldet weiterhin einen großen Bundle-Chunk. Das ist kein neuer fachlicher Fehler dieser Phase.
- `npm run test` und `npm run build` führen `npm run data:generate` aus und aktualisieren dadurch generierte MPMB-Daten/Manifeste sowie Build-Artefakte.

## 6. Was jetzt praktisch nutzbar ist

Ein Charakter im Sheet kann lokal und persistent während einer Session genutzt werden für:

- Schaden, Heilung und HP-Setzung,
- Temp HP,
- Death Saves,
- Ressourcenverbrauch und Wiederherstellung,
- Spell Slots,
- Cantrip/Ritual/Slot Casts mit Slot-Validierung,
- Concentration Start/End/Replace,
- Conditions über stabile Presets,
- Short Rest und Long Rest mit transparentem Reset-Verhalten,
- lokale Play-Event-History.

Das Sheet bleibt dabei technisch sauber getrennt:

- Build-Daten bleiben Build-Daten.
- Derived Values kommen weiter aus `characterEngine`.
- Session-Zustand liegt in `playState`.

## 7. Weiter offene Lücken

### Hohe Relevanz, aber nicht in V1.5 gelöst

- Hit Dice:
  - Short-Rest-Heilung über Hit Dice ist noch nicht modelliert.
  - Long-Rest-Recovery von Hit Dice ist noch nicht modelliert.
- Action/Roll Workflow:
  - Actions und Resources werden angezeigt/gebucht, aber es gibt noch keine durchgängigen Action Buttons mit Würfelwurf, DC/Attack-Bonus-Ausgabe und Play-Log-Verknüpfung.
- Spell Effects:
  - Casten verbucht Slots und Concentration, löst aber keine Damage-/Save-/Target-Mechanik aus.
- Inventory Runtime:
  - Ausrüstung und Items sind im Sheet sichtbar, aber Charges, Attunement, Consumables und Item-Aktionen sind nicht als Play-State-Workflow umgesetzt.
- Conditions:
  - Conditions sind trackbar, aber nicht regelmechanisch aktiv.
- Resource Fidelity:
  - Manual/Special bleibt bewusst konservativ.
  - Einige MPMB-Feature-Sonderfälle werden nicht automatisch interpretiert.

### Größere Themen, aktuell weiter nicht empfohlen

- vollständige Combat-/Encounter-/Initiative-Engine,
- Target-/Defense-/Resistance-/Vulnerability-Automation,
- vollständige Multiclass- und Level-Up-Tiefe,
- Quickbuilder/Premades,
- Campaigns, Accounts, Sharing, Permissions,
- Backend-Audit/Event-Sourcing,
- Offline-Sync/Conflict-Engine,
- Homebrew-Publishing-Plattform,
- Rückkehr zum Legacy Adapter als Runtime-Pfad,
- MPMB-Hook-Ausführungssystem für `eval/removeeval/changeeval/calcChanges`.

## 8. Aktuelle technische Risiken

- Die Rest-Logik ist robuster, aber noch nicht vollständig regelumfassend, solange Hit Dice und Sonder-Recharge nicht sauber modelliert sind.
- Die Condition-Taxonomie hat stabile IDs, aber keine mechanische Wirkung. Das ist korrekt für V1.5, kann aber später zu Erwartungsdruck führen.
- Spell Casting ist jetzt gegen offensichtliche Slot-Fehlbuchungen geschützt, aber noch kein Zauberauflösungsmodell.
- Resource Keys sind stabiler, hängen aber weiterhin an der Qualität des action/resource resolver outputs.
- Weitere Feature-Tiefe sollte inkrementell auf bestehenden Services erfolgen, nicht durch neue UI-seitige Sonderlogik.

## 9. Wahrscheinliche nächste sinnvolle Kandidaten

### Kandidat A: Action/Roll Workflow V1

Nutzen:

- Größter direkter Produktgewinn nach Play-State V1.5.
- Macht `actionResources`, `dice` und Play Log gemeinsam nutzbar.
- Könnte Aktionen, Ressourcenverbrauch, Angriffswürfe, Saving-Throw-DC-Anzeigen und einfache Roll-History verbinden.

Risiko:

- Kann schnell in Combat-/Target-Automation ausufern.

Warum sinnvoll:

- Nutzt bestehende Bausteine, ohne Encounter Engine zu bauen.

Nicht-Ziele:

- keine Initiative,
- keine Target Defense,
- keine Resistance/Vulnerability,
- keine automatische Spell Effect Engine.

### Kandidat B: Hit Dice / Rest V2

Nutzen:

- Schließt die sichtbarste Rest-Lücke.
- Ergänzt Short-Rest-Heilung sauber.

Risiko:

- Benötigt verlässliche Hit-Die-/Class-Level-Daten und wird bei Multiclass schnell komplex.

Warum sinnvoll:

- Kleiner als Combat, aber regelrelevant.

Nicht-Ziel:

- keine komplette Multiclass-Neumodellierung.

### Kandidat C: Inventory Runtime V1

Nutzen:

- Consumables, Item Charges, Attunement und einfache Item-Aktionen wären sehr nützlich für Sessions.

Risiko:

- Item-Datenqualität und Sonderfälle können breit werden.

Warum sinnvoll:

- Ergänzt den Play Loop ohne Plattform-Scope.

Nicht-Ziel:

- keine vollständige Magic-Item-Rule-Engine.

### Kandidat D: Level-Up / Multiclass Hardening

Nutzen:

- Erhöht Regelabdeckung und Langzeitnutzung.

Risiko:

- Hohe Komplexität; kann schnell mehrere Phasen binden.

Warum noch nicht zwingend:

- Weniger unmittelbarer Sheet-Session-Gewinn als Action/Roll oder Hit Dice.

### Kandidat E: Quickbuilder / Premades

Nutzen:

- Bessere Onboarding-Experience.

Risiko:

- Kann oberflächliche UX verbessern, ohne Play-/Rules-Lücken zu schließen.

Warum eher später:

- V1.5 hat den Sheet-Loop verbessert; die nächste Phase sollte wahrscheinlich dessen Nutzbarkeit vertiefen.

## 10. Frage an die Research Engine

Welche nächste Phase liefert nach Stateful Play Loop V1.5 den größten Produktgewinn, ohne das Projekt wieder in Architektur- oder D&D-Beyond-Totalparitäts-Scope zu ziehen?

Bitte bewerte insbesondere:

1. Sollte als Nächstes **Action/Roll Workflow V1** umgesetzt werden?
2. Oder ist **Hit Dice / Rest V2** der bessere nächste kleine Schritt?
3. Welche 1-3 Phasen-Reihenfolge ist strategisch sinnvoll?
4. Welche Non-Goals müssen im nächsten Codex-Prompt explizit stehen?

## 11. Erwartete Ausgabe der Research Engine

Bitte liefere:

- klare Empfehlung für genau eine nächste Phase,
- kurze Begründung bezogen auf den aktuellen Repo-Stand,
- wichtigste Risiken,
- explizite Nicht-Ziele,
- und einen Codex-Prompt für die nächste Phase mit:
  - Ziel,
  - Scope,
  - relevante Module,
  - Test-/Validierungsanforderungen,
  - Guardrails gegen Scope Creep.

Vorbereitete Arbeitshypothese:

> Wahrscheinlich stärkste Richtung ist **Action/Roll Workflow V1**: einfache, dice-backed Action Buttons im Sheet, gekoppelt an bestehende `characterEngine` Action/Resource Outputs und `playState` Events, aber ohne Encounter-/Combat-/Target-Automation.

