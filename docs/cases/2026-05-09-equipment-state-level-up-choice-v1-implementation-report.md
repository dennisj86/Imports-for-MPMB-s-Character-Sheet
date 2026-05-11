# Equipment State + Level-Up Choice Completion V1 Implementation Report

## 1. Ziel der Phase

Ziel war, Equipment vom passiven Inventory-Anzeigestatus in verwaltbaren Character-/Build-State zu überführen und dabei den AC-Runtime-Fehler als P0 zu beheben. Zusätzlich sollten die sichtbarsten Level-Up-Choices im Manage Tab handlungsorientierter werden, ohne Combat Engine, vollständige Inventory Runtime oder Multiclass-Neuarchitektur zu bauen.

Leitplanken:
- Equipment-State gehört zu `CharacterDraft`, nicht zu `playState`.
- `playState` bleibt Session-State für HP, Resources, Spell Slots, Hit Dice, Conditions, Rolls und Play Log.
- V2 Sheet bleibt auf `useCharacterEngine` + `useCharacterPlayState`.
- Keine Legacy-Adapter-Rückkehr und keine MPMB-Hook-Ausführung.

## 2. Umgesetzter Scope

Umgesetzt wurde:
- P0 AC Runtime Regression Fix für Starting-Equipment-IDs wie `starting:...:catalog:equipment:...`.
- AC-Pfad erkennt Chain Mail + Shield im realen Produktpfad und liefert AC 18.
- Overview, Inventory View Model und `derivedStatsResolver` nutzen konsistent dieselbe AC-Service-Logik.
- Equipment-Items erhalten normalisierte persistente Felder wie `instanceId`, `itemDefinitionId`, `equipmentSlot`, `category` und `type`.
- Equip/Unequip-Service für Armor, Shields und Weapons.
- Konfliktregeln V1:
  - nur eine Armor equipped,
  - nur ein Shield equipped,
  - konservative Hand-/Shield-/Two-Handed-Konflikte.
- Inventory Tab zeigt Equip/Unequip Buttons.
- Builder `InventoryEditor` nutzt dieselben Equipment-State-Operationen statt direkter Checkbox-Mutation.
- Action/Resource Resolver löst equipped Weapons jetzt auch bei Starting-Equipment-Catalog-IDs korrekt auf.
- HP-Gain-Method-State für Level-Up wird persistiert.
- ASI/Feat-Optionen können, soweit bereits als Progression Choice vorhanden, im Manage Tab gesetzt werden.
- Unsupported Level-Up-Fähigkeiten bleiben explizit Missing Capability statt Fake-Completion.
- Diagnostics zeigt Equipment-/AC-Details und AC-Warnungen.

## 3. Geänderte Dateien/Module

Wesentliche Änderungen:
- `src/domain/character.ts`
- `src/domain/defaults.ts`
- `src/services/equipment/armorClass.ts`
- `src/services/equipment/equipmentState.ts`
- `src/services/equipment/index.ts`
- `src/services/data/derivedStatsResolver.ts`
- `src/services/data/actionResourceResolver.ts`
- `src/services/data/builderWizardResolver.ts`
- `src/services/persistence/characterPersistence.ts`
- `src/features/character/viewModels/combatViewModel.ts`
- `src/features/character/viewModels/inventoryViewModel.ts`
- `src/features/character/viewModels/progressionViewModel.ts`
- `src/features/character/components/sheet/InventoryPanel.tsx`
- `src/features/character/components/sheet/DiagnosticsPanel.tsx`
- `src/features/character/components/InventoryEditor.tsx`
- `src/pages/CharacterSheetPage.tsx`
- `src/tests/equipment-state-level-up-choice.test.ts`

Durch Test/Build wurden außerdem generierte Daten-/Build-Artefakte aktualisiert.

## 4. Neue/angepasste Domain-, Service- oder View-Model-Strukturen

Neu/erweitert im Domain-Modell:
- `EquipmentSlot`
- optionale Inventory-Felder: `instanceId`, `itemDefinitionId`, `equipmentSlot`, `category`, `type`
- `HpGainMethod`
- `LevelUpHpGainState`
- `LevelUpState`
- `CharacterDraft.levelUp`

Neue/angepasste Services:
- `normalizeInventoryState`
- `equipItem`
- `unequipItem`
- `toggleEquipped`
- `setInventoryItemEquipped`
- `setHpGainMethod`
- `setFeatureChoice`
- robuster Equipment-Definition-Lookup für normale Catalog-IDs, Starting-Equipment-IDs und Name-Fallbacks
- robusterer Shield-Bonus-Parser, der `bonus action` nicht mehr als AC-Bonus missdeutet

View Models:
- `inventoryViewModel` zeigt equipbare Items, Slots, Diagnostics und AC-Linkage.
- `combatViewModel` nutzt normalisierte Inventory-Daten.
- `progressionViewModel` unterscheidet complete/missing/unsupported/needs-builder und zeigt HP-Gain-/ASI-Choice-State.

## 5. UI-Änderungen

Inventory:
- Armor, Shield und Weapon Cards haben `Equip`/`Unequip`.
- Equipped- und Slot-Badges sind sichtbar.
- AC Breakdown bleibt im Inventory sichtbar.
- Änderungen persistieren über den Character Store.

Manage:
- Progression Status zeigt offene Choice-Anzahl.
- HP-Gain-Methoden `fixed/default`, `manual`, `rolled`, `max` sind auswählbar und persistent.
- ASI/Feat Choices zeigen Status und erlauben vorhandene Optionen.
- Feat-Detailauswahl bleibt bewusst im Builder, wenn nur die ASI/Feat-Option im Progression-Modell strukturiert ist.

Diagnostics:
- AC-Pfad, Dex-Modus, Dex-Verwendung, Item-Matches und AC-Warnungen sind nur im Diagnostics Panel sichtbar.

## 6. Tests und Validierungsergebnisse

Neue Tests decken ab:
- realer Paladin-Level-3-Produktpfad mit Chain Mail + Shield ergibt AC 18.
- Chain Mail ohne Shield ergibt AC 16.
- Shield-only bei DEX 10 ergibt AC 12.
- Armor/Shield Unequip triggert unmittelbaren AC-Recompute.
- nur eine Armor kann equipped sein.
- Equipment-State persistiert nach Serialization Roundtrip.
- equipped Weapons erscheinen als Attack Actions, unequipped Weapons nicht.
- HP-Gain-Method-State persistiert.
- ASI/Feat-Option aktualisiert Progression Status.
- Guardrails gegen Adapter-Importe, Hook-Ausführung und UI-Business-Logik.

Validierung:
- `npm run test -- --run`: bestanden, 33 Test Files / 138 Tests.
- `npm run typecheck`: bestanden.
- `npm run build`: bestanden.

## 7. Bekannte Lücken / bewusst nicht umgesetzt

Bewusst offen:
- Keine vollständige Inventory Runtime.
- Keine Attunement Engine.
- Keine Encumbrance-/Weight-/Container-Engine.
- Keine Consumable-/Charges-Runtime.
- Keine vollständige Weapon-Set- oder Hand-Slot-Engine.
- Keine vollständige Magic-Item-AC-Engine; nur konservative eindeutige Boni.
- Keine automatische Fighting-Style-/Defense-AC-Verarbeitung.
- HP-Gain-Method wird persistiert, aber Max HP wird noch nicht aus dieser Auswahl abgeleitet.
- ASI/Feat-Option ist setzbar; konkrete Feat-Auswahl und ASI-Ability-Verteilung bleiben im Builder-Kontext.
- Weapon Mastery und Fighting Style werden weiterhin als Missing/Unsupported angezeigt, wenn keine strukturierte Choice vorhanden ist.
- Keine Combat-/Encounter-/Target-Automation.
- Keine vollständige Multiclass-Neumodellierung.

## 8. Empfohlene nächste Phase

Empfohlene nächste Phase: **Level-Up Builder Completion V1**.

Begründung:
- Equipment/AC ist jetzt im Produktpfad stabiler und bedienbar.
- Die größte verbleibende Player-/Builder-Lücke liegt bei Level-Up-Completion:
  - Max-HP-Gain tatsächlich in HP-Progression einbinden,
  - ASI-Ability-Verteilung modellieren,
  - konkrete Feat-Auswahl aus ASI/Feat vollständig abschließen,
  - Weapon Mastery und Fighting Style als strukturierte Choices anbinden.
- Diese Phase sollte im Builder/Progression-Modell stattfinden, nicht im Sheet als Fake-Completion.

Nicht als nächste Phase empfohlen:
- Combat Engine.
- Encounter Manager.
- vollständige Spell Effect Engine.
- vollständige Magic-Item-/Attunement-Engine.

## 9. Hinweise für den nächsten Codex-/Research-Handoff

Wichtige Anschlussfragen:
- Wie soll `LevelUpState` in die Max-HP-Berechnung eingebunden werden, ohne Hit Dice / Rest V2 zu vermischen?
- Welche vorhandenen Builder Choice APIs können für ASI-Verteilung und Feat-Subchoices wiederverwendet werden?
- Wo sollen Weapon Mastery und Fighting Style strukturiert herkommen: Progression Resolver, Builder Wizard oder MPMB-Core-Normalisierung?
- Soll Equipment-State künftig Slot-Assignments für Weapon Sets ausbauen oder vorerst bei Equipped/Unequipped bleiben?

Guardrails:
- Equipment bleibt Build-/Character-State.
- `playState` bleibt Session-State.
- Derived Values bleiben aus `characterEngine` berechnet.
- Keine Legacy-Adapter-Imports in produktiven V2 Pfaden.
- Keine MPMB-Hook-Ausführung.
- Keine langen PHB-Texte in Source oder Tests.
