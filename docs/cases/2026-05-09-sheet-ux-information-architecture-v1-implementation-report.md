# Sheet UX / Information Architecture V1 Implementation Report

## 1. Ziel der Phase

Diese Phase sollte das Character Sheet von einer technischen Aggregationsseite zu einer klareren, spielbaren Sheet-Oberfläche umbauen. Der Fokus lag nicht auf einer neuen Regelengine, sondern auf Informationsarchitektur, Player-UI, kritischen Regeloberflächen und stabilen View Models.

Wichtige Leitplanken:
- V2 Sheet bleibt auf `useCharacterEngine` und `useCharacterPlayState`.
- Play-State, Rolls und Hit Dice / Rest V2 werden erhalten.
- Keine Rückkehr zum Legacy Adapter als Runtime-Pfad.
- Keine Ausführung von `eval`, `removeeval`, `changeeval` oder `calcChanges`.
- Keine Combat-/Encounter-/Target-Automation.

## 2. Umgesetzter Scope

Umgesetzt wurde:
- Tab-basierte Sheet-Struktur mit `Overview`, `Actions`, `Spells`, `Inventory`, `Features` und `Manage`.
- Core Header mit spielrelevanten Werten: Name, Class/Level, Origin, AC, HP, Temp HP, Initiative, Speed, Proficiency, Hit Dice, Spell Save DC und Spell Attack.
- Debug-/Resolver-Ausgaben aus dem normalen Player Flow entfernt und in ein explizit einschaltbares Diagnostics Panel verschoben.
- Konservative AC-Berechnung aus equipped Armor, equipped Shield, Armor-Dex-Regeln und einfachen AC-Bonus-Feldern.
- AC Breakdown in Overview und Inventory sichtbar gemacht.
- Spell-Klassifikation eingeführt, damit Support-Spells wie `Bless`, `Guidance` und `Resistance` nicht mehr als Damage-Spells behandelt werden.
- Spellbook-Ansicht mit Spell Summary, Tags, Cast Controls, Slot-Auswahl, Ritual-Option, Spell Attack, Save DC und Damage/Healing-Anzeige, soweit strukturiert verfügbar.
- Features & Traits in gruppierte, deduplizierte, einklappbare Cards überführt.
- Inventory nach Armor, Shields, Weapons und Other Items strukturiert; equipped State wird sichtbar und AC-relevant ausgewertet.
- Manage Tab für Progression, Pending Choices, HP-Gain-Method-Oberfläche und Missing-Capability-Hinweise.
- Hit Dice / Rest V2 in Overview/Manage integriert, ohne die Rest-Regeln neu zu modellieren.

## 3. Geänderte Dateien/Module

Wesentliche Änderungen:
- `src/pages/CharacterSheetPage.tsx`
- `src/features/character/components/sheet/ActionRollPanel.tsx`
- `src/features/character/components/sheet/ResourceTracker.tsx`
- `src/features/character/components/sheet/DiagnosticsPanel.tsx`
- `src/features/character/components/sheet/FeatureCardsPanel.tsx`
- `src/features/character/components/sheet/InventoryPanel.tsx`
- `src/features/character/components/sheet/SpellbookPanel.tsx`
- `src/features/character/viewModels/*`
- `src/services/equipment/armorClass.ts`
- `src/services/spells/spellClassifier.ts`
- `src/services/data/derivedStatsResolver.ts`
- `src/services/rolls/rollRequestFactory.ts`
- `src/tests/sheet-ux-information-architecture.test.ts`

Durch `npm run test -- --run` und `npm run build` wurden außerdem generierte Daten-/Build-Artefakte aktualisiert.

## 4. Neue/angepasste View Models / Services

Neu:
- `combatViewModel`: Core Sheet Summary, Core Stats, AC Breakdown, Passive Scores, Hit-Dice-Summary.
- `spellbookViewModel`: normalisierte Spell Cards, Klassifikation, Spell Attack/Save/Damage/Healing-Oberflächen.
- `inventoryViewModel`: Equipment-Gruppierung und AC-Verknüpfung.
- `featuresViewModel`: Feature-Gruppierung und Deduplikation.
- `progressionViewModel`: Pending Choices, HP-Gain-Method-Anzeige, Missing-Capability-Hinweise.
- `sheetTabs`: kanonische Sheet-Tabs.
- `armorClass` service: konservative AC-Berechnung aus Equipment.
- `spellClassifier` service: konservative Spell-Tags und Roll-Surface-Erkennung.

Angepasst:
- `derivedStatsResolver` nutzt die neue AC-Service-Schicht.
- `rollRequestFactory` nutzt `spellClassifier`, damit generische Würfelboni nicht automatisch Damage Rolls erzeugen.
- `ActionRollPanel` kann Spell Rolls ausblenden, damit der Spells Tab die kanonische Spell-Oberfläche wird.
- `ResourceTracker` zeigt technische Resource-Status nur noch bei explizitem Diagnostics-Modus.

## 5. UI-Änderungen

Das Sheet rendert nicht mehr alle Engine-Ausgaben als eine lange Liste. Die neue Struktur:
- `Overview`: Vitals, Core Combat, AC Breakdown, Ability Scores, Conditions, Concentration, wichtigste Resources, Quick Rest und Play Log.
- `Actions`: Ability Checks, Saving Throws, Skill Checks, Attack/Feature Actions und Resource-linked Actions.
- `Spells`: Spellcasting Summary, Slots, Spell Cards, Cast Buttons und rollbare Spell-Oberflächen.
- `Inventory`: Armor/Shield/Weapons/Other Items mit Equipped-State und AC Breakdown.
- `Features`: gruppierte, deduplizierte Feature Cards.
- `Manage`: Progression, Pending Choices, HP-Gain-Method-Hinweise, Rest/Hit Dice Detailbereich und Diagnostics Toggle.

Normale Spieler sehen keine Roh-Panels wie Applied Rules Output, Action/Resource Status oder alte Status-Dumps mehr.

## 6. Tests und Validierungsergebnisse

Neue Tests decken ab:
- Sheet Tabs und versteckte Diagnostics.
- V2 Guardrails für Sheet/Builder/Content.
- AC-Regeln für unarmored, light, medium, heavy, shield und equipped state.
- Spell-Klassifikation für Support-, Attack-, Save-, Damage- und Healing-Spells.
- Inventory View Model mit Equipment/AC-Verknüpfung.
- Feature-Deduplikation und Gruppierung.
- Progression Missing-Capabilities ohne Fake-Completion.

Validierung:
- `npm run test -- --run`: bestanden, 32 Test Files / 132 Tests.
- `npm run typecheck`: bestanden.
- `npm run build`: bestanden.

## 7. Bekannte Lücken / bewusst nicht umgesetzt

Bewusst offen:
- Keine vollständige D&D Beyond Parität.
- Keine Combat Engine, Initiative, Encounter-Targets oder automatische Trefferentscheidung.
- Keine automatische Resistance/Vulnerability/Condition-Effects-Verarbeitung.
- AC V1 deckt normale Armor/Shield-Fälle ab, aber keine vollständigen Magic-Item-, Feature-, Fighting-Style- oder situativen AC-Regeln.
- Spell Classification ist konservativ und heuristisch; sie ist keine Spell Effect Engine.
- Inventory zeigt Equipped-State, bietet aber noch keine robuste UI zum Ausrüsten/Ablegen mit persistenter Equipment-State-Bearbeitung.
- Weapon/Attack-Daten bleiben abhängig von vorhandener strukturierter Engine-Ausgabe.
- Level-Up Choices werden sichtbar gemacht, aber Feats/ASI, Weapon Mastery, Fighting Style und HP Gain Method werden noch nicht vollständig im Sheet/Builder abgeschlossen.
- HP-Gain-Methoden werden als Oberfläche/Capability sichtbar, verändern aber noch keine Max-HP-Progression.
- Feature Cards reduzieren Duplikate, ersetzen aber noch keine vollständige Feature-Action-Modellierung.

## 8. Empfohlene nächste Phase

Empfohlene nächste Phase: **Equipment State + Level-Up Choice Completion V1**.

Begründung:
- Die neue Sheet-Struktur macht zwei verbleibende Produktlücken deutlich sichtbar: Equipment-State ist noch passiv, und Level-Up-Choices sind noch nicht sauber abschließbar.
- Equipment-State ist direkt mit AC und Attack-Oberflächen verbunden und liefert sofort sichtbaren Produktgewinn.
- Level-Up Choices wie HP Gain, ASI/Feat, Weapon Mastery und Fighting Style sind zentrale Builder-/Sheet-Brücken und sollten vor weiteren Spell-/Combat-Vertiefungen stabilisiert werden.
- Diese Phase kann bounded bleiben, ohne Combat Engine oder Multiclass-Neuarchitektur zu starten.

Nicht als nächste Phase empfohlen:
- Vollständige Spell Effect Engine.
- Encounter/Combat Automation.
- Campaign-/Account-/Sync-Funktionen.
- Vollständige Multiclass-Neumodellierung.

## 9. Hinweise für den nächsten Codex-/Research-Handoff

Der nächste Handoff sollte konkret entscheiden:
- Welche Equipment-State-Operationen V1 braucht: equip/unequip Armor, Shield, Weapon; Konfliktregeln; AC/Attack-Recompute.
- Welche Level-Up Choices im bestehenden Wizard/Progression-Modell bereits strukturiert vorhanden sind.
- Wie HP Gain Method persistiert werden soll, ohne Hit Dice / Rest V2 zu vermischen.
- Welche Weapon Mastery / Fighting Style / ASI / Feat Choices bounded editierbar werden sollen.

Guardrails für die nächste Phase:
- View Models weiterverwenden und erweitern.
- Keine Business-Logik in große React-Komponenten verschieben.
- `playState` bleibt Session-State, nicht Build-State.
- Max HP aus Level-Up bleibt Build-/Progression-State, nicht Hit-Dice-Rest-State.
- Keine Legacy-Adapter-Imports in produktiven V2 Pfaden.
- Keine MPMB-Hook-Ausführung.
- Keine langen Regeltexte aus `docs/Spielerhandbuch.pdf` in Source oder Tests übernehmen.
