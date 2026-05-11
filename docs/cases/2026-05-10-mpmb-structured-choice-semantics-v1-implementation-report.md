# MPMB Structured Choice Semantics V1 Implementation Report

## 1. Ziel der Phase

Diese Phase behebt die falsche Semantik verschachtelter MPMB-Choices. Die bestehende Rule-/Choice-/Mapping-Pipeline wurde so erweitert, dass strukturierte MPMB-Felder nicht mehr zu globalen, ungefilterten Choice-Listen degenerieren.

Kernfall war Magic Initiate: Die Spell-List-Auswahl ist jetzt eine Parent Choice; Cantrip-, Level-1-Spell- und Spellcasting-Ability-Choices werden erst aus der gewählten Parent-Option erzeugt und entsprechend gefiltert.

## 2. Umgesetzter Scope

- MPMB-`structuredData` wird für Features und Feats aus den lokalen MPMB-Skriptlisten übernommen.
- Der Content-Merge erhält bevorzugte upstream-normalisierte Einträge, ergänzt aber strukturierte MPMB-Felder aus lokalen gleichwertigen Einträgen.
- `RuleChoice` und `CanonicalRuleChoice` unterstützen Parent-/Child-Beziehungen, `dependsOn`, `optionScope`, `generatedByOptionId`, `choiceStage` und blockierende/diagnostische Semantik.
- Ein MPMB Structured Choice Parser erzeugt Parent Choices aus `choices` und Child Choices aus ausgewählten nested option objects.
- `spellcastingBonus` erzeugt gefilterte Spell Choices.
- Spell-Optionen werden nach Spell List/Class, Level Range, provider/rulesMode-Kontext und Source-Katalog gefiltert.
- Magic Initiate wird generisch über MPMB-Struktur gelöst, nicht über einen Feat-Namens-Sonderfall.
- Blessed Warrior / Druidic Warrior nutzen dieselbe `spellcastingBonus`-Semantik.
- Weapon Mastery kann `extraTimes` als required count nutzen und Weapon-Optionen aus dem Equipment Catalog ziehen.
- Option-scoped MPMB-Felder wie `skills`, `scores`, `addMod` usw. werden zumindest erkannt und als Diagnostics/Future Apply Path geführt, wenn noch kein deterministischer Apply-Pfad existiert.

## 3. Geänderte Dateien/Module

- `scripts/generate-mpmb-data.cjs`
- `src/domain/content.ts`
- `src/domain/rules.ts`
- `src/services/data/schemas.ts`
- `src/services/data/rulesModeResolver.ts`
- `src/services/rules/ruleDescriptors.ts`
- `src/services/rules/mpmbStructuredChoices.ts`
- `src/services/rules/spellOptionFilter.ts`
- `src/services/rules/mappings/featMappings.ts`
- `src/pages/CharacterBuilderPage.tsx`
- `src/features/character/components/sheet/DiagnosticsPanel.tsx`
- `src/services/data/generated/mpmb-local-content.json`
- `src/services/data/generated/mpmb-content.json`
- `src/tests/mpmb-structured-choice-semantics.test.ts`

## 4. Neue/angepasste Choice-, Resolver-, Mapping-, Filter- oder View-Model-Strukturen

- `FeatureDefinition.structuredData` und `FeatDefinition.structuredData`
- `RuleChoiceDependency`
- Parent-/Child-Felder auf `RuleChoice` und `CanonicalRuleChoice`
- `resolveMpmbStructuredChoices(...)`
- `filterSpellOptions(...)`
- Generator-Support für `choices`, nested option objects, `spellcastingBonus`, `spellcastingAbility`, `choicesWeaponMasteries`, `choicesFightingStyles`, `extraTimes` und weitere strukturierte MPMB-Felder
- Merge-Supplementierung für strukturierte Felder ohne Aufgabe der bevorzugten upstream-normalisierten Einträge

## 5. Builder-/Sheet-/Manage-/Diagnostics-Änderungen

- Builder zeigt Child Choices eingerückt unter der Parent Choice.
- Spell Child Choices zeigen eine Filter Summary, z. B. Spell List und Level Range.
- Blocked/unsupported/complete/pending bleiben über die kanonische Choice Surface steuerbar.
- Diagnostics zeigen Parent Choice, generated option, dependency type und MPMB-Structured-Field-Hinweise.
- Es wurden keine neuen Sheet-Runtime-Pfade eingeführt; V2 Sheet bleibt auf `useCharacterEngine` + `useCharacterPlayState`.

## 6. Tests und Validierungsergebnisse

Neue Tests:

- 2024 Magic Initiate ist im resolved data path mit strukturierter MPMB-Choice-Datenbasis versehen.
- Magic Initiate erzeugt Parent Choice Cleric/Druid/Wizard.
- Cleric/Druid/Wizard filtern Cantrips und Level-1-Spells auf die jeweilige Spell List.
- Cantrip required count 2 und Level-1 required count 1 bleiben korrekt.
- Parent-Wechsel invalidiert alte Child-Auswahlen durch neue option-scoped Child Choice IDs.
- Blessed Warrior und Druidic Warrior erzeugen Cantrip Child Choices über dieselbe generische Semantik.
- Weapon Mastery nutzt `extraTimes: 2` als required count.
- Option-scoped Felder ohne Apply-Pfad werden diagnostiziert.

Validierung:

- `npm run test -- --run`: 38 Testdateien, 172 Tests bestanden.
- `npm run typecheck`: bestanden.
- `npm run build`: bestanden.
- Build meldet weiterhin nur den bekannten Vite chunk-size Hinweis.

## 7. Bekannte Lücken / bewusst nicht umgesetzt

- Keine vollständige Feat-Effect-Engine.
- Keine automatische Anwendung aller option-scoped Felder wie `skills`, `scores`, `toolProfs`, `languageProfs`, `addMod`, `extraAC`.
- Keine Ausführung von MPMB-Funktionsfeldern oder Hooks.
- Keine Combat-, Target-, Encounter- oder Duration-Automation.
- Kein vollständiger UI-Suchdialog für alle großen Choice-Listen; die wichtigste Fehlerquelle wurde durch Filterung reduziert.
- Spellcasting Ability wird bei mehreren Optionen als Choice sichtbar; ein vollständiger Spellcasting-Context für feat-granted spells bleibt ein separater Ausbau.

## 8. Empfohlene nächste Phase

Nächster sinnvoller Schritt: **Option-Scoped Apply Path V1**.

Fokus:

- `scores` als Ability-Score-Modifier anwenden.
- `skills`, `toolProfs`, `languageProfs`, `weaponProfs`, `armorProfs` als generische Proficiency Choices bzw. feste Proficiencies anwenden.
- `extraAC` und einfache `addMod`-Fälle in die bestehende Modifier Pipeline überführen.
- Weiterhin keine MPMB-Hook-Ausführung und keine Textheuristik als Regelengine.

## 9. Hinweise für den nächsten Codex-/Research-Handoff

- Die Choice-Semantik ist jetzt graphfähig genug für MPMB nested choices.
- Magic Initiate ist ein Regression Case, nicht die Architektur.
- Der nächste Engpass liegt nicht mehr bei globalen Spell-Listen, sondern bei der Anwendung option-scoped MPMB-Felder.
- Forschung/Planung sollte konkrete Apply-Pfade priorisieren: Ability/Proficiency/Modifier zuerst, komplexe Funktionsfelder nur als Diagnostics/Future Capability.
