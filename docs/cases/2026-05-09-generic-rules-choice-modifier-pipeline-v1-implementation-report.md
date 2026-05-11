# Generic Rules Choice + Modifier Pipeline V1 Implementation Report

## 1. Ziel der Phase

Diese Phase sollte den naechsten generischen Regel-Layer schaffen, damit Features, Feats, Items und Spells nicht nur als Text im Sheet erscheinen. Ziel war eine gemeinsame Pipeline fuer Rule Sources, generische Choices, permanente Modifier, einfache temporare Roll-Boni, Weapon-/Attack-/Damage-Profile und Diagnostics.

Die Phase sollte bewusst keine Combat Engine, keine vollstaendige Spell Effect Engine und keine klassen- oder spell-spezifischen Sonderloesungen bauen.

## 2. Umgesetzter Scope

- Neues generisches Rule-Descriptor-Modell fuer:
  - class-feature
  - subclass-feature
  - species-feature
  - background-feature
  - feat
  - item
  - spell
  - condition/custom als vorbereitete Source Types
- Generische Choice-Pipeline mit persistiertem `CharacterDraft.ruleChoices`.
- Builder Feats-Step zeigt generische Rule Choices und erlaubt deren Abschluss, wenn deterministische Optionen vorhanden sind.
- Builder- und Review-Validierung blockieren required pending generic choices.
- Manage/Progression View Model spiegelt generic choice status.
- Permanente Modifier-Pipeline fuer einfache flat/dice/set/advantage/note Modifier mit Bedingungen.
- `derivedStatsResolver` wendet generische Modifier fuer unterstuetzte Ziele an:
  - ability-score
  - saving-throw
  - skill-check
  - spell-attack
  - spell-save-dc
  - armor-class ueber den AC-Service
- `armorClass` akzeptiert generische AC-Modifier und zeigt Modifier-Sources im Breakdown.
- Active Effects wurden als session-orientierter `playState`-Teil ergaenzt.
- Spell Cast kann einfache strukturierte/erkannte Roll-Bonus-Effekte als Active Effect erzeugen.
- Concentration-linked Active Effects werden beim Ende der Concentration dismissed.
- Roll Pipeline akzeptiert permanente und temporaere Modifier, Bonuswuerfel und Active-Effect-Auswahl.
- Roll Results und Play Log enthalten Basis-Modifikator, permanente Modifier, temporaere Modifier und Bonus Dice.
- Weapon-/Attack-/Damage-Profile wurden generisch fuer equipped weapons aufgebaut:
  - attack ability
  - proficiency on attack
  - damage dice
  - ability modifier on damage
  - no proficiency on damage
  - flat weapon attack/damage modifiers
  - properties/range/diagnostics
- DiagnosticsPanel zeigt erkannte Rule Sources, Choices, Modifier, Effects und Status.

## 3. Geaenderte Dateien/Module

- `src/domain/rules.ts`
- `src/domain/character.ts`
- `src/domain/defaults.ts`
- `src/domain/playState.ts`
- `src/domain/rolls.ts`
- `src/services/rules/*`
- `src/services/characterEngine/characterEngine.ts`
- `src/services/data/derivedStatsResolver.ts`
- `src/services/data/builderWizardResolver.ts`
- `src/services/equipment/armorClass.ts`
- `src/services/persistence/characterPersistence.ts`
- `src/services/playState/playStateReducer.ts`
- `src/services/playState/playStateService.ts`
- `src/services/rolls/rollRequestFactory.ts`
- `src/services/rolls/rollService.ts`
- `src/features/character/viewModels/combatViewModel.ts`
- `src/features/character/viewModels/inventoryViewModel.ts`
- `src/features/character/viewModels/progressionViewModel.ts`
- `src/features/character/components/sheet/ActionRollPanel.tsx`
- `src/features/character/components/sheet/DiagnosticsPanel.tsx`
- `src/features/character/components/sheet/PlayLogPanel.tsx`
- `src/pages/CharacterBuilderPage.tsx`
- `src/pages/CharacterSheetPage.tsx`
- `src/tests/generic-rules-choice-modifier-pipeline.test.ts`

Build/Test-Laeufe haben ausserdem generierte MPMB-Content-Dateien und `dist/` aktualisiert.

## 4. Neue/angepasste Domain-, Resolver-, Service- oder View-Model-Strukturen

- `RuleSourceDescriptor`
  - normalisiert regelmechanische Quellen ueber Source Type, Provider, Rules Mode, Tags, Choices, Modifiers, Effects und Diagnostics.
- `RuleChoice`
  - generische Auswahlpflichten mit `choiceType`, `requiredCount`, `minCount`, `maxCount`, Optionen, selected IDs, Status und Diagnostics.
- `RuleModifier`
  - generische permanente oder rollbezogene Modifier mit Target, Value Type, Value, Condition, Stacking Key und Diagnostics.
- `ActiveEffectDefinition` / `ActiveEffectState`
  - einfache temporaere Effekte fuer Rolls, im `playState` persistiert.
- `CharacterDraft.ruleChoices`
  - persistierter Build-State fuer generische Rule Choices.
- `CharacterPlayState.activeEffects`
  - persistierter Session-State fuer aktive temporaere Effekte.
- `resolveCharacterRuleEngine(...)`
  - sammelt Descriptoren, Choices, Modifier und Effects aus dem aktuellen Draft/Engine-Kontext.
- `buildWeaponAttackProfiles(...)`
  - erzeugt generische Weapon Attack/Damage Profiles aus equipped Inventory und Modifiern.
- `executeRollRequest(...)`
  - wertet permanent/temporary modifier breakdowns und bonus dice aus.

## 5. Builder-/Sheet-/Manage-UI-Aenderungen

- Builder Feats-Step:
  - zeigt `Generic Rule Choices`
  - Single-Choice als Select
  - Multi-Choice als Checkbox-Gruppe
  - Unsupported Choices bleiben sichtbar, aber nicht fake-complete
- Builder Validation:
  - Feats-Step und Review-Step blockieren required pending generic choices.
- Sheet Actions:
  - Roll UI zeigt anwendbare Active Effects als optionale Toggles.
  - Roll Result zeigt Bonus Dice.
- Play Log:
  - Roll Events zeigen Bonus Dice und Modifier-Zusammenfassung.
  - Active Effect Start/Dismiss Events werden lesbar dargestellt.
- Manage Tab:
  - Progression View Model zaehlt generic pending/unsupported choices mit.
- Diagnostics:
  - zeigt Rule Descriptor Pipeline Counts und Details fuer Choices/Modifier.

## 6. Tests und Validierungsergebnisse

Ausgefuehrt:

- `npm run test -- --run`
- `npm run typecheck`
- `npm run build`

Ergebnis:

- Tests: 35 Test Files, 153 Tests, alle gruen.
- Typecheck: erfolgreich.
- Build: erfolgreich.
- Build-Hinweis: Vite meldet weiterhin grosse Chunks nach Minification. Das ist ein bestehender Bundle-Size-Hinweis, kein Fehler dieser Phase.

Neue Testabdeckung:

- RuleSourceDescriptor fuer Class Feature, Feat, Item und Spell.
- Generic Choice requiredCount, pending/complete, over-selection blocking und Persistence.
- Builder/Review blockiert required generic pending choices.
- Conditional AC Modifier wird nur bei erfuellter Bedingung angewendet.
- Modifier Diagnostics fuer nicht angewendete Modifier.
- Weapon Attack enthaelt Proficiency Bonus.
- Weapon Damage enthaelt Ability Modifier, aber keinen Proficiency Bonus.
- Flat weapon attack/damage modifiers erscheinen im Profil.
- Active Effects werden im `playState` gespeichert.
- Concentration-linked Active Effects enden mit Concentration.
- Roll Result enthaelt base modifier, permanent breakdown, temporary breakdown, bonus dice, total und natural-20 handling.
- Active Effects persistieren im bestehenden `playEvents`/`playState`-Modell ohne zweite History.
- Guardrails gegen `eval/removeeval/changeeval/calcChanges` und UI-seitige Roll-Randomness.

## 7. Bekannte Luecken / bewusst nicht umgesetzt

- Keine vollstaendige Rule-Effect-Engine.
- Keine class-, spell- oder feature-name-basierte Sonderloesung.
- Choice-Ableitung ist konservativ. Ohne strukturierte Optionen bleibt eine Choice `unsupported`.
- Die Descriptor-Pipeline nutzt derzeit kleine Fallback-Parser fuer Choice-Hinweise, einfache flat AC Modifier und optionale Roll-Bonus-Dice. Das ist keine allgemeine Beschreibungstext-Regelengine.
- Permanente Modifier sind nur fuer unterstuetzte Ziele verdrahtet. `initiative`, `speed`, `hit-point-max`, `resource-max`, `passive-score` und weitere Targets sind vorbereitet, aber nicht voll integriert.
- Active Effects unterstuetzen einfache optionale Roll-Boni. Keine Ziel-/Party-Auswahl, keine Round-/Duration-Engine, keine automatische Ally-Verteilung.
- Spell Cast kann einfache Roll-Bonus-Effekte erzeugen, aber keine vollstaendige Spell Effect Resolution.
- Weapon Mastery und Fighting Style werden nicht automatisch aus Text in mechanische Effekte uebersetzt.
- Feat Effects und Feat Subchoices sind nicht generisch vollstaendig geloest.
- Keine automatische Trefferentscheidung, keine Ziel-AC, keine Damage-Anwendung, keine Resistances/Vulnerabilities.
- Multiclass wurde nicht neu modelliert.

## 8. Empfohlene naechste Phase

Naechster sinnvoller Schritt: **Structured Rule Data Mapping V1**.

Begruendung:

- Die Pipeline ist jetzt vorhanden, aber sie braucht bessere strukturierte Eingabedaten.
- Die groesste Produktluecke liegt nicht mehr im Rendern von Choices/Modifiern, sondern darin, welche Features/Feats/Items/Spells verlaesslich maschinenlesbare Deskriptoren liefern.
- Eine sinnvolle Folgephase sollte deklarative Mapping-Daten fuer haeufige, einfache Regelmuster aufbauen:
  - Fighting Style Choices
  - Weapon Mastery Choices
  - Feat Subchoices
  - Skill/tool/language/proficiency choices
  - einfache flat AC / attack / damage / save / skill modifiers
  - einfache Roll-Bonus Active Effects
- Diese Mappings sollten generisch nach Descriptor/Source-Daten arbeiten und weiterhin keine MPMB-Hooks ausfuehren.

## 9. Hinweise fuer den naechsten Codex-/Research-Handoff

- Die neue Pipeline sitzt in `src/services/rules/*` und wird in `characterEngine` als `engine.ruleEngine` ausgegeben.
- `ruleChoices` gehoeren zum Character-/Build-State, nicht zum `playState`.
- `activeEffects` gehoeren zum session-orientierten `playState`.
- Permanente Modifier werden aus Rule Sources abgeleitet und nicht redundant als Runtime-State persistiert.
- Weapon Damage enthaelt jetzt den Ability Modifier; Proficiency wird nur auf Attack angewendet.
- Existing AC, Equipment, HP-Gain, ASI/Feat, Hit Dice, Roll Workflow und Sheet Tabs blieben in der Regression intakt.
- Der naechste Ausbau sollte keine neue UI-Grossphase sein, sondern strukturierte Rule-Descriptor-Mappings und klare Unsupported-Diagnostics erweitern.
- Keine MPMB-Hook-Ausfuehrung (`eval`, `removeeval`, `changeeval`, `calcChanges`).
