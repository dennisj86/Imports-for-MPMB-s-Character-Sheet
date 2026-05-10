# Structured Rule Data Mapping V1 Implementation Report

## 1. Ziel der Phase

Diese Phase sollte die bereits vorhandene generische Rule-/Choice-/Modifier-Pipeline mit besseren strukturierten Eingabedaten versorgen. Ziel war nicht, eine neue Rule Engine zu bauen, sondern deklarative, testbare Mappings fuer haeufige einfache Regelmuster einzufuehren.

Der Fokus lag auf Fighting Styles, Weapon Masteries, Feat-Subchoices, einfachen permanenten Modifiern und einfachen Active Effects fuer Roll-Boni. Die bestehende Trennung bleibt erhalten: Build-/Character-State fuer dauerhafte Entscheidungen, `playState` fuer Session-Zustand und Active Effects, `characterEngine` fuer derived values.

## 2. Umgesetzter Scope

- Deklarative Mapping-Schicht fuer Rule Sources eingefuehrt.
- Mapping Resolver an `resolveCharacterRuleEngine(...)` angebunden.
- Fighting-Style-Mapping V1 umgesetzt:
  - Defense erzeugt `armor-class +1` mit Bedingung `wearing-armor`.
  - Dueling erzeugt `weapon-damage +2` mit Bedingung fuer einhaendige Nahkampfwaffe ohne Offhand.
  - Archery erzeugt `weapon-attack +2` fuer ranged attacks.
  - Great Weapon Fighting bleibt bewusst Note/Future Capability.
  - Protection/Interception bleiben manuelle Reaction-Hinweise.
  - Blessed Warrior erzeugt eine Cantrip-Subchoice, sofern Spell-Katalogdaten vorhanden sind.
- Weapon-Mastery-Mapping V1 umgesetzt:
  - erzeugt `weapon-mastery` Choices aus dem Weapon Catalog.
  - persistierte Auswahl erscheint als Badge in Inventory/Actions.
  - keine Combat-Automation fuer Mastery-Effekte.
- Feat-Subchoice-Mappings V1 umgesetzt:
  - Skilled und Skill Expert erzeugen Skill-Choices.
  - Linguist erzeugt Language-Choices mit ehrlicher Apply-Path-Diagnostic.
  - Magic Initiate erzeugt Cantrip-/Spell-Choices, wenn Spell-Katalogdaten verfuegbar sind.
- Item-Mapping V1 umgesetzt:
  - Cloak of Protection erzeugt einfache AC- und Saving-Throw-Modifier.
- Spell-Active-Effect-Mapping V1 umgesetzt:
  - Bless, Guidance und Resistance erzeugen einfache, concentration-linked Active-Effect-Definitionen fuer passende Rolltypen.
- Skill-Proficiency-Apply-Path fuer gemappte Skill-Choices an `derivedStatsResolver` angebunden.
- Diagnostics erweitert, damit angewendete Mapping-Refs, erzeugte Choices, Modifier und Effekte nachvollziehbar sind.

## 3. Geaenderte Dateien/Module

Neue Mapping-/Resolver-Module:

- `src/services/rules/ruleMappingTypes.ts`
- `src/services/rules/ruleMappingResolver.ts`
- `src/services/rules/ruleMappings.ts`
- `src/services/rules/mappings/featureMappings.ts`
- `src/services/rules/mappings/featMappings.ts`
- `src/services/rules/mappings/itemMappings.ts`
- `src/services/rules/mappings/spellMappings.ts`

Angepasste Domain-/Engine-/Service-Module:

- `src/domain/rules.ts`
- `src/domain/rolls.ts`
- `src/services/rules/ruleDescriptors.ts`
- `src/services/rules/modifierPipeline.ts`
- `src/services/rules/activeEffects.ts`
- `src/services/rules/weaponProfiles.ts`
- `src/services/rules/index.ts`
- `src/services/characterEngine/characterEngine.ts`
- `src/services/data/derivedStatsResolver.ts`
- `src/services/persistence/characterPersistence.ts`
- `src/services/rolls/rollRequestFactory.ts`

Angepasste ViewModels/UI-Komponenten:

- `src/features/character/viewModels/featuresViewModel.ts`
- `src/features/character/viewModels/inventoryViewModel.ts`
- `src/features/character/components/sheet/ActionRollPanel.tsx`
- `src/features/character/components/sheet/DiagnosticsPanel.tsx`
- `src/features/character/components/sheet/FeatureCardsPanel.tsx`
- `src/features/character/components/sheet/InventoryPanel.tsx`

Neue Tests:

- `src/tests/structured-rule-data-mapping.test.ts`

## 4. Neue/angepasste Mapping-, Resolver-, Service- oder View-Model-Strukturen

`RuleMapping` beschreibt deklarativ, welche Rule Source ein Mapping ergaenzt und welche Choices, Modifier, Active-Effect-Definitionen oder Diagnostics daraus entstehen. Matching laeuft ueber `sourceType`, `sourceId`, normalisierte Namen, Tags, `rulesMode` und `provider`.

Der Mapping Resolver fuehrt Mappings deterministisch aus und ergaenzt vorhandene Rule Sources, ohne strukturierte Daten blind zu ueberschreiben. Er unterstuetzt dynamische Option Sources fuer Skills, Tools, Languages, Weapon Catalog, Cantrips und Spells. Ausgewaehlte Optionen koennen weitere Modifier, Effekte oder Nested Choices erzeugen.

`RuleSourceDescriptor` enthaelt nun Mapping-Referenzen und optionalen Source-Text fuer Diagnosezwecke. Die neue Modifier-Bedingung `weapon-is-melee-one-handed-no-offhand` wird zentral in der Modifier Pipeline ausgewertet, nicht in UI-Komponenten.

Weapon Profiles tragen jetzt Mapping-Badges, damit Weapon Mastery Choices sichtbar werden, ohne Mastery-Effekte zu automatisieren. Feature Cards zeigen gewaehlte Rule-Choice-Optionen als kurze Labels.

## 5. Builder-/Sheet-/Diagnostics-Aenderungen

Der Builder konsumiert weiterhin die generische Choice-Pipeline. Neu ist, dass die Mapping-Schicht mehr Choices in diese Pipeline einspeist. Required Choices bleiben dadurch im bestehenden Review-/Completion-Modell sichtbar und blockierbar.

Im Sheet wurden keine neuen Sonderfall-UIs gebaut. Stattdessen zeigen bestehende Panels bessere Ergebnisse:

- Features zeigen gewaehlte Mapping-Choices.
- Inventory und Actions zeigen Weapon-Mastery-Badges.
- Roll/Action-Profile koennen gemappte Attack-/Damage-Modifier nutzen.
- Spell-Casts koennen gemappte Active Effects erzeugen.
- Diagnostics zeigt angewendete Mapping-IDs und Quellen.

Die normale Player UI bleibt frei von technischen Mapping-Rohdaten.

## 6. Tests und Validierungsergebnisse

Ergaenzt wurde ein fokussierter Testblock fuer Structured Rule Data Mapping:

- deterministische Mapping-Auswertung und Diagnostics
- Defense AC Modifier und AC Breakdown
- Dueling/Archery/GWF Fighting Style Verhalten
- Blessed Warrior Cantrip-Subchoice
- Weapon Mastery Persistenz und Badges in Inventory/Actions
- Skill-Choice Apply-Path und Language-Diagnostics
- Bless Active Effect, Concentration-Ende und Bonus Dice im Roll
- Guardrails gegen UI-/Hook-Sonderlogik

Ausgefuehrte Validierung:

- `npm run test -- --run src/tests/structured-rule-data-mapping.test.ts` bestanden: 8 Tests.
- `npm run test -- --run` bestanden: 36 Testdateien, 161 Tests.
- `npm run typecheck` bestanden.
- `npm run build` bestanden. Vite meldet weiterhin nur den bestehenden Chunk-Size-Hinweis.

## 7. Bekannte Luecken / bewusst nicht umgesetzt

- Keine neue Rule Engine.
- Keine MPMB-Hook-Ausfuehrung.
- Keine Combat-, Encounter-, Target- oder Turn-Automation.
- Weapon Mastery Effekte sind nur als Choice/Badge/Info sichtbar, nicht mechanisch automatisiert.
- Great Weapon Fighting ist bewusst Note/Future Capability, keine Dice-Reroll-Engine.
- Protection/Interception sind manuelle Reaction-Hinweise, keine Reaction-Automation.
- Language- und Tool-Choices persistieren, haben aber noch keinen vollstaendigen Apply-Path in derived proficiencies.
- Magic Initiate und Blessed Warrior haengen von verfuegbaren Spell-Katalogdaten ab; es gibt keine harte Spell-Heuristik.
- Feat-Effekte bleiben auf einfache, deklarative Muster begrenzt.
- Keine Ally-/Party-Zielauswahl und keine Round-/Duration-Engine fuer Active Effects.

## 8. Empfohlene naechste Phase

Empfohlen ist **Rule Mapping Expansion + Proficiency Apply-Path V1**.

Die Mapping-Schicht ist jetzt vorhanden und getestet. Der naechste Produktgewinn entsteht nicht durch erneute Architekturarbeit, sondern durch gezielte Erweiterung der deklarativen Daten und durch Apply-Paths fuer bereits persistierte Choices:

- Tool-, Language-, Weapon- und Armor-Proficiencies in derived data anwenden.
- Weitere haeufige Feats und Fighting Styles deklarativ mappen.
- Weitere einfache Magic-Item-Modifier abbilden.
- Spell-/Cantrip-Optionen besser nach Source Selection, `rulesMode` und Spellcasting Context filtern.
- Diagnostics fuer unsupported Apply-Targets weiter schaerfen.

## 9. Hinweise fuer den naechsten Codex-/Research-Handoff

- Neue Regeln sollen ueber Mapping-Dateien und den Mapping Resolver kommen, nicht ueber UI-Sonderfaelle.
- Reale Klassen, Feats, Items oder Spells duerfen Regression Cases sein, aber nicht die Architektur treiben.
- Unsupported bleibt besser als ein stiller falscher Bonus.
- Alle Modifier brauchen Breakdown/Diagnostics.
- Active Effects bleiben `playState`; dauerhafte Entscheidungen bleiben `CharacterDraft.ruleChoices`.
- Die bestehenden Guardrails bleiben verbindlich: kein Legacy Adapter als Runtime-Pfad, keine `eval/removeeval/changeeval/calcChanges`-Ausfuehrung, keine langen PHB-Texte im Source.
