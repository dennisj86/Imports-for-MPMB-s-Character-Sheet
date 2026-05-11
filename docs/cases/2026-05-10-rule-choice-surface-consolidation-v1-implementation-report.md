# Rule Choice Surface Consolidation V1 Implementation Report

## 1. Ziel der Phase

Diese Phase konsolidiert die Choice-Oberflaechen fuer Builder, Manage Tab und Review Step. Der Schwerpunkt lag nicht auf neuen Regelmappings, sondern auf einer kanonischen, deduplizierten Sicht auf vorhandene Choice-Quellen.

Das Kernproblem war, dass rohe Rule Choices, Mapping-Choices, Legacy-Detections und alte Manage-only Panels nebeneinander angezeigt wurden. Dadurch konnten dieselben realen Auswahlpflichten mehrfach, widerspruechlich oder mit falschem Status erscheinen.

## 2. Umgesetzter Scope

- Eine kanonische `RuleChoiceSurfaceState` mit `CanonicalRuleChoice` eingefuehrt.
- Rule-Choice-Deduplizierung mit deterministischem Canonical Key und Precedence-Regeln umgesetzt.
- `CharacterRuleEngineState.choices` auf die kanonische Choice-Liste umgestellt.
- Roh-Choices bleiben ueber `ruleEngine.sources` und Diagnostics nachvollziehbar.
- Hidden duplicates werden nicht mehr in Builder/Player UI angezeigt, aber in Diagnostics sichtbar.
- Builder `Generic Rule Choices` nutzt jetzt `choiceSurface.choices`.
- Manage Tab trennt Level-Up-Progression-Choices von generischen Rule Choices.
- Alte Manage-only Spezialmeldungen fuer Weapon Mastery und Fighting Style entfernt.
- Review Step zeigt kanonische Rule Choices und blockiert weiterhin nur required pending canonical choices.
- Weapon-Mastery-Required-Count wird fuer einfache textuell strukturierte Quellen aus der Mapping-Schicht abgeleitet.
- Unknown Required Count bleibt ehrlich `unsupported`, statt durch Selection Count fake-complete zu werden.

## 3. Geaenderte Dateien/Module

Neue Module:

- `src/services/rules/ruleChoiceSurface.ts`
- `src/tests/rule-choice-surface-consolidation.test.ts`

Angepasste Domain-/Rule-Module:

- `src/domain/rules.ts`
- `src/services/rules/index.ts`
- `src/services/rules/ruleDescriptors.ts`
- `src/services/rules/ruleMappingResolver.ts`
- `src/services/rules/ruleMappingTypes.ts`
- `src/services/rules/mappings/featureMappings.ts`

Angepasste UI/ViewModel-/Validation-nahe Module:

- `src/pages/CharacterBuilderPage.tsx`
- `src/pages/CharacterSheetPage.tsx`
- `src/features/character/viewModels/progressionViewModel.ts`
- `src/features/character/components/sheet/DiagnosticsPanel.tsx`
- `src/tests/level-up-builder-completion.test.ts`

Build-/Generator-Laeufe haben ausserdem die bestehenden generierten Daten und `dist/`-Artefakte aktualisiert.

## 4. Neue/angepasste Choice-, Resolver-, View-Model- oder UI-Strukturen

Neu in `src/domain/rules.ts`:

- `CanonicalRuleChoice`
- `CanonicalChoiceStatus`
- `CanonicalChoiceOrigin`
- `HiddenRuleChoiceDuplicate`
- `RuleChoiceSurfaceState`

`buildRuleChoiceSurface(...)` erzeugt aus den Rule Sources:

- rohe Choice-Anzahl
- kanonische Choices
- hidden duplicates
- Diagnostics zur Merge-Entscheidung

Der Canonical Key basiert auf:

- Source Type
- normalisiertem Source ID/Name
- Choice Type
- Level
- `rulesMode`
- `provider`

Die Precedence priorisiert completed persisted Choices, strukturierte Choices und Mapping-Choices vor Legacy-/Fallback-Detections. Unsupported Legacy-Detections werden damit nicht mehr player-visible, wenn eine bessere Mapping-Choice fuer dasselbe Konzept existiert.

## 5. Builder-/Sheet-/Manage-/Diagnostics-Aenderungen

Builder:

- `GenericRuleChoicesStep` bekommt `CanonicalRuleChoice[]`.
- Duplicate Fighting Style / Weapon Mastery Cards werden nicht mehr gerendert.
- Pending Choices stehen durch die Surface-Sortierung oben.
- Mapping IDs und technische Diagnostics werden aus der normalen Builder UI herausgehalten.
- Multi-select deaktiviert weitere Auswahl, wenn `maxCount` erreicht ist.

Manage Tab:

- Zaehlung trennt jetzt `open level-up progression choice(s)` und `open rule choice(s)`.
- Kein Widerspruch mehr zwischen offenen Rule Choices und `No required progression choices`.
- Alte Spezialpanels `Weapon Mastery Choice Surface` und `Fighting Style Choice Surface` wurden entfernt.
- Rule Choices werden mit kanonischem Status angezeigt.

Review:

- Zeigt kanonische Rule Choices kompakt mit Status und Selection Count.
- Hidden duplicates blockieren Review nicht.
- Required pending canonical choices werden weiterhin ueber die bestehende Builder Validation blockiert.

Diagnostics:

- Zeigt raw choice count, canonical choice count und hidden duplicate count.
- Zeigt, welche Duplikate durch welche kanonische Choice versteckt wurden.
- Mapping-Refs bleiben dort sichtbar, nicht in der Player UI.

## 6. Tests und Validierungsergebnisse

Neue Tests in `src/tests/rule-choice-surface-consolidation.test.ts` pruefen:

- Fighting-Style-Fallback und Mapping werden zu einer Canonical Choice dedupliziert.
- Mapping-generated Choice versteckt Legacy Unsupported Duplicate.
- Completed persisted Choice hat Precedence vor raw pending Duplicate.
- `requiredCount` bleibt unabhaengig von `selectedCount`.
- Multi-choice requiredCount 2 bleibt bei 1 Auswahl pending und wird bei 2 Auswahl complete.
- Over-selection wird blockiert.
- Weapon Mastery Required Count wird aus Quelle abgeleitet.
- Unknown Required Count bleibt unsupported.
- Builder Validation nutzt canonical choices und blockiert hidden duplicates nicht.
- Builder/Manage verwenden die kanonische Surface statt alter Spezialpanels.

Ausgefuehrte Validierung:

- `npm run test -- --run src/tests/rule-choice-surface-consolidation.test.ts` bestanden: 6 Tests.
- Relevante Regression-Suite bestanden: 7 Testdateien, 48 Tests.
- `npm run test -- --run` bestanden: 37 Testdateien, 167 Tests.
- `npm run typecheck` bestanden.
- `npm run build` bestanden. Vite meldet weiterhin nur den bestehenden Chunk-Size-Hinweis.

## 7. Bekannte Luecken / bewusst nicht umgesetzt

- Keine neue Rule Engine.
- Keine breite neue Mapping Expansion.
- Keine class-, spell- oder feature-spezifische UI-Sonderloesung.
- Keine vollstaendige Weapon-Mastery-Effect-Automation.
- Keine vollstaendige Fighting-Style-Automation ueber die bisherigen einfachen Modifier hinaus.
- Keine Feat-Effect-Engine.
- Keine Combat-/Encounter-/Target-Automation.
- Unknown Required Count wird bewusst nicht geraten; solche Choices bleiben unsupported, bis strukturierte Daten oder Mapping-Regeln nachgezogen werden.
- Tool-/Language-/Weapon-/Armor-Proficiency Apply Paths bleiben weiterhin ein eigener naechster Scope.

## 8. Empfohlene naechste Phase

Empfohlen ist **Choice Apply-Path + Mapping Coverage V1**.

Nach der Surface-Konsolidierung ist die UI-Quelle fuer Choices sauberer. Der naechste sinnvolle Produktgewinn liegt darin, mehr bereits sichtbare und persistierte Choices tatsaechlich anzuwenden:

- Tool-/Language-/Weapon-/Armor-Proficiencies in derived data verdrahten.
- Weitere Feat-Subchoices deklarativ mappen.
- Weapon Mastery Required Counts fuer Quellen ohne explizite Count-Formulierung ueber strukturierte Class-Progression-Daten bestimmen.
- Fighting-Style-/Feat-/Item-Mappings erweitern, ohne neue UI-Sonderfaelle.
- Diagnostics fuer unsupported Apply Paths weiter schaerfen.

## 9. Hinweise fuer den naechsten Codex-/Research-Handoff

- Builder, Manage und Review sollen weiterhin nur `choiceSurface.choices` verwenden.
- Roh-Choices gehoeren in Diagnostics, nicht in Player-/Builder-Oberflaechen.
- Neue Mapping-Daten duerfen keine zweite Choice-UI erzeugen.
- `requiredCount` muss aus strukturierter Quelle oder Mapping stammen, nicht aus aktueller Auswahl.
- Hidden duplicates duerfen nicht validierungsblockierend sein.
- Unsupported ist korrekt, wenn Required Count, Optionen oder Apply Path nicht deterministisch sind.
- Guardrails bleiben unveraendert: kein Legacy Adapter als Runtime-Pfad, keine MPMB-Hook-Ausfuehrung, keine langen PHB-Texte im Source.
