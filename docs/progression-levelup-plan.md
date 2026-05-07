# Progression / Level-Up Plan

## 1. Layering
- **Draft**: vom Nutzer gewählte Eingaben (`CharacterDraft`).
- **Applied Rules**: regelmodus-/provider-bereinigte Wirkung (Conversion, Proficiencies, Pflicht-Choices).
- **Derived Stats**: konkrete Zahlenwerte (Mods, Saves, Skills, AC/HP-Basis usw.).
- **Progression** (neu): Level-basierte Freischaltung + ausstehende Level-Choices.

Progression ist rein abgeleitet und wird nicht als Primärquelle persistiert.

## 2. Scope dieser Phase
Implementiert:
- zentraler `progressionResolver`
- Feature-Unlocks nach Level (Class + Subclass)
- Subclass-Requirement als echte Pending-Choice
- ASI/Feat-Opportunities als strukturierte Choices
- erste Spell-Progression (Slots/known/prepared/cantrips, soweit deklarativ sicher)
- Pending-Choice-Aggregation für Builder/Sheet

Nicht enthalten:
- vollständiges Multiclassing
- vollständige Hook-/Effect-Engine (`eval/removeeval/calcChanges`)
- vollständige Combat-/Condition-Engine

## 3. Progressionsmodell
Neue Domain-Datei:
- `src/domain/progression.ts`

Kernobjekte:
- `LevelProgressionResult`
- `SubclassSelectionRequirement`
- `AsiOrFeatChoice`
- `SpellProgressionState`
- `PendingLevelChoice`

## 4. Datenquellen je Progressionsaspekt
- Class/Subclass Features: normalisierte `features` mit `minLevel`
- Subclass Unlock: `classProgressionRules` + Feature-Fallback
- ASI/Feat Levels: `classProgressionRules` + Feature-Fallback
- Spell Progression:
  - `spellcastingFactor`
  - `spellcastingKnown` (cantrips/known/prepared arrays)
  - Slot-Basistabellen (full/half/third/warlock pact)

## 5. Pending/Partial Strategie
- Unklare oder nicht sicher ableitbare Fälle werden als `pending`/`partial` markiert.
- Keine stillschweigende Erfindung von Sonderregeln.
- Beispiel: Half-caster mit Level-1-Spellcasting in 2024 wird als Slot-`partial` markiert, wenn keine eindeutige Tabelle im Datensatz vorliegt.

## 6. Unterstützte Choice-Typen (Phase)
- `subclass-selection`
- `asi-or-feat`
- `spell-selection`
- bestehende Applied-Rules-Pflichten (z. B. Origin Feat) werden in den Progressions-Pending-Block gespiegelt

## 7. Integration
- Resolver:
  - `src/services/data/progressionResolver.ts`
- Adapter:
  - `getCharacterProgression(draft, context?)`
- UI:
  - Builder zeigt Level-Progression + auswählbare ASI/Feat-Entscheidungen
  - Sheet zeigt Progressionsstatus + Pending Choices

## 8. Persistenz
- Persistierte Primärdaten bleiben `CharacterDraft`.
- Progressions-Choices nutzen vorhandene `featureChoices` (persistiert bereits).
- Kein zusätzlicher Snapshot erforderlich.

## 9. Offene Punkte / nächste Phase
- Multiclass-Projektion (ClassLevel-Layer, kombinierte Slots)
- präzisere 2024-Half-Caster-Slottabellen aus strukturierten Klassentabellen
- detailliertere Feature-Choice-Abbildung (jenseits ASI/Feat)
- automatische Verknüpfung ASI-Auswahl -> konkrete Ability-Score-Verteilung
