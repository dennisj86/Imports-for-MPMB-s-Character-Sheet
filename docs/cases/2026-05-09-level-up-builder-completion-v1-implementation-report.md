# Level-Up Builder Completion V1 Implementation Report

## 1. Ziel der Phase

Diese Phase sollte Level-Up-Entscheidungen vom reinen Anzeigen oder partiellen Markieren in einen belastbaren Builder-/Progression-Pfad bringen. Der Fokus lag auf Max-HP-Gain, ASI-Verteilung und konkreter Feat-Auswahl, ohne Multiclass, Combat, Weapon-Mastery-Effekte oder Fighting-Style-Effekte neu zu modellieren.

## 2. Umgesetzter Scope

- Max-HP-Gain wird jetzt aus `CharacterDraft.levelUp.hpGainByLevel` in `derivedStats.hitPoints.max` eingerechnet.
- Unterstützte HP-Gain-Methoden: `fixed/default`, `max`, `rolled`, `manual`.
- `rolled` und `manual` speichern konkrete Werte; fehlende Werte bleiben pending und fallen konservativ auf fixed/default zurück.
- ASI ist jetzt eine echte Level-Up-Choice mit persistierter Verteilung:
  - `+2` auf eine Ability
  - `+1/+1` auf zwei unterschiedliche Abilities
- ASI-Boni fließen in Derived Ability Scores, Modifiers, Saves, Skills und davon abhängige Werte ein.
- ASI/Feat-Progression gilt erst als complete, wenn die gewählte Route wirklich abgeschlossen ist.
- Feat-Auswahl für ASI/Feat-Choices wird über bestehende Feat-Choice-Kontexte persistiert und aktualisiert `featIds`.
- Builder-Feats-Step enthält jetzt einen Level-Up-Choice-Bereich für HP-Gain und ASI/Feat.
- Sheet Manage Tab zeigt HP-Gain-Choices pro Level statt nur einen pauschalen aktuellen Status.
- Weapon Mastery und Fighting Style bleiben ehrlich `unsupported`, wenn keine strukturierten Choices vorliegen.

## 3. Geänderte Dateien/Module

- `src/domain/character.ts`
- `src/domain/defaults.ts`
- `src/services/levelUp/levelUpState.ts`
- `src/services/levelUp/index.ts`
- `src/services/equipment/equipmentState.ts`
- `src/services/data/derivedStatsResolver.ts`
- `src/services/data/progressionResolver.ts`
- `src/services/data/builderWizardResolver.ts`
- `src/services/persistence/characterPersistence.ts`
- `src/features/character/viewModels/progressionViewModel.ts`
- `src/pages/CharacterBuilderPage.tsx`
- `src/pages/CharacterSheetPage.tsx`
- `src/tests/level-up-builder-completion.test.ts`
- `src/tests/equipment-state-level-up-choice.test.ts`
- `src/tests/progression-resolver.test.ts`
- `src/tests/sheet-ux-information-architecture.test.ts`

Build/Test-Läufe haben außerdem generierte MPMB-Content-Dateien und `dist/` aktualisiert.

## 4. Neue/angepasste Domain-, Service-, Resolver- oder View-Model-Strukturen

- `LevelUpState` wurde erweitert um:
  - `abilityScoreIncreases`
  - `featChoices`
  - vorbereitende `weaponMasteryChoices`
  - vorbereitende `fightingStyleChoices`
- Neuer Service `src/services/levelUp/levelUpState.ts`:
  - `setHpGainMethod`
  - `setAsiOrFeatOption`
  - `setAbilityScoreIncreaseChoice`
  - `setLevelUpFeatChoice`
  - `resolveLevelUpAbilityScoreBonuses`
  - `normalizeLevelUpState`
- `derivedStatsResolver` nutzt Level-Up-ASI-Boni und HP-Gain-State.
- `progressionResolver` unterscheidet jetzt Auswahl der ASI/Feat-Route von vollständigem Abschluss.
- `builderWizardResolver` blockiert den Feats-Step und Review-Step, wenn ASI/Feat-Choices unvollständig sind.
- `progressionViewModel` zeigt HP-Gain-Choices pro Level und konkrete ASI/Feat-Completion-Details.
- Persistenzschema migriert/normalisiert alte Drafts ohne neue Level-Up-Felder.

## 5. Builder-/Sheet-/Manage-UI-Änderungen

- Builder Feats-Step:
  - zeigt Level-Up-HP-Gain pro Level ab Level 2
  - erlaubt `fixed/default`, `max`, `rolled`, `manual`
  - erlaubt Werteingabe für `rolled` und `manual`
  - zeigt ASI/Feat-Choices pro Level
  - erlaubt `+2`-ASI und `+1/+1`-ASI über explizite Buttons
  - verweist bei Feat-Route auf die vorhandenen Feat Cards inklusive Subchoices
- Sheet Manage Tab:
  - zeigt HP-Gain-Choices pro Level
  - behält den Builder als kanonischen Ort für Choice Completion
  - zeigt Unsupported-Capabilities weiterhin als handlungsorientierte Lücken

## 6. Tests und Validierungsergebnisse

Ausgeführt:

- `npm run test -- --run`
- `npm run typecheck`
- `npm run build`

Ergebnis:

- Tests: 34 Test Files, 144 Tests, alle grün.
- Typecheck: erfolgreich.
- Build: erfolgreich.

Neue/angepasste Testabdeckung umfasst:

- HP-Gain `fixed/default`, `max`, `rolled`, `manual`
- CON-Modifikator in Max HP
- Max-HP-Recompute bei Methodenwechsel
- `playState.currentHp` wird nicht blind überschrieben
- ASI `+2` und `+1/+1`
- ungültige ASI-Verteilungen werden blockiert
- ASI persistiert und aktualisiert Derived Stats
- ASI bleibt pending bis zur konkreten Verteilung
- Feat-Auswahl persistiert und erscheint in `engine.selectedFeats`
- Weapon Mastery / Fighting Style bleiben unsupported ohne strukturierte Daten
- bestehende Equipment-/AC-, Sheet-UX- und Progression-Tests wurden an das strengere Completion-Modell angepasst

## 7. Bekannte Lücken / bewusst nicht umgesetzt

- Keine Multiclass-HP-Progression. HP-Gain nutzt weiter die aktuelle Single-Class-/ClassDef-Struktur.
- Keine vollständige Feat-Effect-Engine. Feats werden ausgewählt und angezeigt; mechanische Feat-Effekte werden nur angewendet, wenn bestehende Resolver sie bereits strukturiert unterstützen.
- Feat-Subchoices bleiben auf die vorhandenen strukturierten Subchoice-Kontexte beschränkt.
- Weapon Mastery wird nicht automatisch aus Text abgeleitet und erzeugt keine Combat-Effekte.
- Fighting Style wird nicht aus Beschreibungstext heuristisch in AC/Attacks eingerechnet.
- Keine Level-Up-Wizard-Neuarchitektur, kein Multiclass-Deep-Dive, keine Combat-/Encounter-Automation.
- HP-Gain-Werte werden konservativ behandelt; fehlende `rolled`/`manual` Werte erzeugen Pending-Status und keinen erfundenen Max-HP-Wert.

## 8. Empfohlene nächste Phase

Nächster sinnvoller Schritt: **Structured Feature Choice Expansion V1**.

Begründung:

- ASI/Feat und HP-Gain sind jetzt als Level-Up-State sauber angeschlossen.
- Die größten verbleibenden Builder-Lücken liegen nicht mehr im Speichern der Route, sondern in strukturierten Choice-Typen aus Features:
  - Fighting Style
  - Weapon Mastery
  - Feat-Subchoices
  - Skill/tool/language choices aus Features
  - begrenzte Feat-Mechaniken, wenn sie deklarativ sicher erkennbar sind
- Diese Phase sollte zuerst Daten-/Resolver-Fähigkeiten erweitern, nicht die UI neu erfinden.

## 9. Hinweise für den nächsten Codex-/Research-Handoff

- Builder und Manage Tab nutzen jetzt denselben Progression-Status; kein zweiter Sheet-Fake-State nötig.
- `playState` bleibt unverändert Session-State und wurde nicht für Level-Up-Daten genutzt.
- Equipment-/AC-Pfad wurde nicht umgebaut und bleibt intakt.
- Für Weapon Mastery und Fighting Style ist bewusst keine Textheuristik eingeführt worden.
- Wenn die nächste Phase Fighting Style oder Weapon Mastery angeht, sollte sie zuerst prüfen, ob MPMB/Core-Daten strukturierte Choice-Optionen liefern. Nur dann sollten Auswahl und Effekte aktiviert werden.
- Keine MPMB-Hooks (`eval`, `removeeval`, `changeeval`, `calcChanges`) ausführen.
