# Choice Option Source Integrity + Fighting Style Canonicalization V1 Implementation Report

## 1. Ziel der Phase

Diese Phase behebt zwei konkrete Choice-Pipeline-Regressionen:

- Weapon Mastery durfte keine Spells, Cantrips oder sonstige Nicht-Waffen mehr als Optionen anbieten.
- Fighting Style musste wieder als eine einzige kanonische Choice-Familie erscheinen, statt nach einer Defense-Auswahl noch eine separate pending Feature Option fuer Blessed Warrior zu erzeugen.

Die Phase baut keine neue Rule Engine. Sie haertet Optionsquellen, Mapping-Resolver und Canonical Choice Status auf Basis der bestehenden Rule-/Choice-/Mapping-Pipeline.

## 2. Umgesetzter Scope

- Typisierte Option Sources fuer Rule Choices eingefuehrt.
- Weapon Mastery auf eine Weapon-Option-Source begrenzt.
- Spellartige Equipment-Eintraege wie Acid Splash, Fire Bolt, Booming Blade und Chill Touch werden aus Weapon-Mastery-Optionen ausgeschlossen.
- Magic Items, Gear und nicht belastbar als Weapon Definition erkennbare Eintraege werden nicht als Weapon-Mastery-Optionen verwendet.
- Weapon-Mastery-Optionen tragen Weapon-Metadaten wie type, weaponList, damage, range, mastery und masteryLabel.
- `ListsGear.js` aus den lokalen MPMB-Skriptordnern wird in die mpmb-core-first Datengenerierung aufgenommen, damit Weapon-Metadaten wie `mastery`, `damage`, `range` und `list` verfuegbar sind.
- Fighting Style Mapping wurde erweitert und bleibt eine Choice-Familie.
- Defense, Archery, Dueling, Great Weapon Fighting, Two-Weapon Fighting, Protection, Interception, Blessed Warrior und Druidic Warrior sind Fighting-Style-Optionen derselben kanonischen Choice.
- Blessed Warrior und Druidic Warrior erzeugen gefilterte Cantrip Child Choices nur als ausgewaehlter Fighting-Style-Pfad.
- Parent Choices bleiben pending, wenn der gewaehlte Parent-Pfad required Child Choices erzeugt, und werden complete, wenn keine required Child Choices offen sind.
- Builder Validation nutzt die kanonische Choice Surface statt rohe, potenziell doppelte Rule Choices.
- Builder UI zeigt grosse Optionslisten kompakter mit Suche/Filter; Weapon Mastery Rows zeigen Weapon-Metadaten und Mastery Badge.

## 3. Geaenderte Dateien/Module

- `scripts/generate-mpmb-data.cjs`
- `src/domain/content.ts`
- `src/domain/rules.ts`
- `src/services/data/schemas.ts`
- `src/services/data/builderWizardResolver.ts`
- `src/services/rules/optionSources.ts`
- `src/services/rules/ruleMappingTypes.ts`
- `src/services/rules/ruleMappingResolver.ts`
- `src/services/rules/mpmbStructuredChoices.ts`
- `src/services/rules/ruleChoiceSurface.ts`
- `src/services/rules/mappings/featureMappings.ts`
- `src/services/rules/spellOptionFilter.ts`
- `src/services/rules/index.ts`
- `src/pages/CharacterBuilderPage.tsx`
- `src/tests/mpmb-structured-choice-semantics.test.ts`
- `src/tests/rule-choice-surface-consolidation.test.ts`
- `src/tests/structured-rule-data-mapping.test.ts`
- `src/tests/generic-rules-choice-modifier-pipeline.test.ts`
- generierte Daten: `src/services/data/generated/mpmb-local-content.json`, `src/services/data/generated/mpmb-content.json`

## 4. Neue/angepasste Option-Source-, Choice-, Resolver-, Mapping- oder View-Model-Strukturen

- `RuleChoiceOption` enthaelt jetzt optionale strukturierte Metadaten:
  - `optionType`
  - `sourceId`
  - `sourceType`
  - `tags`
  - `metadata`
- `EquipmentDefinition` und Zod-Schema wurden um `weaponList`, `damage`, `range` und `mastery` erweitert.
- Neues `src/services/rules/optionSources.ts`:
  - `RuleOptionSource`
  - `ResolvedRuleOption`-aehnliche Option-Metadaten ueber `RuleChoiceOption`
  - `resolveWeaponMasteryOptions(...)`
  - `resolveSpellCatalogOptions(...)`
- `RuleChoiceTemplate` unterstuetzt `optionSourceFilters`.
- Spell-/Cantrip-Option Sources koennen nach Spell List/Class und Level Range filtern.
- Mapping-nested Choices bekommen Parent-/Dependency-Felder:
  - `parentChoiceId`
  - `dependsOn`
  - `selectedPath`
  - `optionScope`
  - `generatedByOptionId`
  - `choiceStage`
- `ruleChoiceSurface` beruecksichtigt required Child Choices fuer den Parent-Status.

## 5. Builder-/Sheet-/Manage-/Diagnostics-Aenderungen

- Builder rendert kanonische Choices aus `choiceSurface.choices`, nicht rohe `ruleEngine.choices`.
- Builder zeigt Child Choices eingerueckt und mit Parent-Kontext.
- Weapon Mastery Options haben Suche und kompakte Rows mit Weapon Name, Mastery, Damage und Tags.
- Spell Choices behalten ihre Spell-List-/Level-Filter.
- Review und Builder Validation blockieren required pending kanonische Choices, aber nicht versteckte Duplikate.
- Manage nutzt weiterhin die kanonische Progression-/Rule-Choice-Sicht.
- Diagnostics behalten Source-/Option-Source-Hinweise, Hidden Duplicates und Filter-Entscheidungen; normale Player UI zeigt keine Mapping-IDs als primaere Bedienoberflaeche.

## 6. Tests und Validierungsergebnisse

Ergaenzte/angepasste Tests decken ab:

- Weapon Mastery nutzt Weapon Option Source.
- Weapon Mastery enthaelt keine Cantrips oder Level-Spells.
- Acid Splash, Fire Bolt, Booming Blade und Chill Touch erscheinen nicht als Weapon-Mastery-Optionen.
- Magic-/Gear-artige Nicht-Weapon-Definitionen erscheinen nicht als Weapon-Mastery-Optionen.
- Longsword, Battleaxe und Club erscheinen, wenn sie als Weapon Definition vorhanden sind.
- Weapon Mastery `requiredCount: 2` bleibt erhalten; eine Auswahl bleibt pending, zwei Auswahlen complete.
- Weapon-Mastery-Optionen zeigen Mastery-Metadaten.
- Fighting Style erzeugt genau eine kanonische Choice.
- Defense schliesst Fighting Style ab und erzeugt keine pending Blessed-Warrior-only Sibling Choice.
- Blessed Warrior und Druidic Warrior erzeugen Cantrip Child Choices unter dem Fighting-Style-Parent.
- Parent Completion beruecksichtigt Child Completion.
- Builder/Review Validierung nutzt canonical choices.
- Bestehende Magic-Initiate-Spell-Filtering-, Mapping-, Modifier-, Equipment-, Roll-, Hit-Dice- und Sheet-Regressionspfade bleiben intakt.

Validierung:

- `npm run test -- --run`: 38 Testdateien, 173 Tests bestanden.
- `npm run typecheck`: bestanden.
- `npm run build`: bestanden.
- Build meldet weiterhin nur den bekannten Vite chunk-size Hinweis.

## 7. Bekannte Luecken / bewusst nicht umgesetzt

- Keine automatische Weapon-Mastery-Combat-Automation fuer Sap, Push, Slow, Nick usw.
- Keine vollstaendige Fighting-Style-Effect-Engine ueber vorhandene einfache Modifier/Notes hinaus.
- Keine neue Rule Engine.
- Keine Target-, Encounter-, Turn- oder Duration-Automation.
- Keine MPMB-Hook-Ausfuehrung.
- Keine vollstaendige Anwendung aller MPMB-Optionsfelder wie `addMod`, `extraAC`, `skills`, `scores`, `toolProfs` oder `languageProfs`.
- Weapon-Mastery-Optionen priorisieren echte Weapon Definitions; Spezialfaelle ohne strukturierte Weapon-Metadaten bleiben bewusst ausgeschlossen oder diagnostisch.

## 8. Empfohlene naechste Phase

Naechster sinnvoller Schritt: **Option-Scoped Apply Path V1**.

Prioritaet:

- `scores` als Ability-Score-Choice oder Modifier anwenden.
- `skills`, `toolProfs`, `languageProfs`, `weaponProfs` und `armorProfs` als generische Proficiency-Auswirkungen anbinden.
- einfache `extraAC` und `addMod` Faelle in die bestehende Modifier Pipeline ueberfuehren.
- Diagnostics fuer funktionale MPMB-Felder weiterfuehren, ohne Hooks auszufuehren.

Das waere der naechste Produktgewinn, weil Choices dann nicht nur korrekt angezeigt und gefiltert werden, sondern auch mehr einfache, deterministische Auswirkungen auf Derived Stats und Rolls haben.

## 9. Hinweise fuer den naechsten Codex-/Research-Handoff

- Die Choice Surface ist jetzt kanonisch genug fuer Builder, Manage und Review.
- Fighting Style sollte kuenftig als eine Choice-Familie behandelt werden, nicht als Sammlung einzelner Feature Options.
- Weapon Mastery darf ausschliesslich typisierte Weapon Options nutzen.
- Blessed Warrior/Druidic Warrior sind Regression Cases fuer option-scoped Child Choices, nicht UI-Sonderfaelle.
- Die groesste verbleibende Luecke liegt bei Apply Paths fuer strukturierte MPMB-Felder, nicht mehr bei Optionsquellen oder Choice-Dedupe.
