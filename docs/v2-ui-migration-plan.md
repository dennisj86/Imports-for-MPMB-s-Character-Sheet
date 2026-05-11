# V2 UI Migration Plan (`mpmb-core-first`)

Stand: 2026-05-07

## 1) Ziel dieser Phase

Die UI soll den V2-Pfad produktiv nutzen:

- Wizard UI -> `wizardV2Engine` (über `useWizardV2State`)
- Spell UI -> `spellManagementService` (über `useSpellManagement`)
- Character Sheet -> `characterEngine` (über `useCharacterEngine`)

Keine neue Business-Logik in Komponenten; Komponenten rendern nur noch Engine-/Service-Output.

## 2) Bestandsaufnahme (Altpfade vs. V2)

### Bereits auf V2 umgestellt

- `src/pages/CharacterBuilderPage.tsx`
  - nutzt `useWizardV2State(...)` und `useSpellManagement(...)`
  - Step-Sichtbarkeit, Completion, Pending Choices, Validations aus V2-Wizard-State
  - Spell-Toggles über `applySpellSelectionToDraft(...)` aus `spellManagementService`
  - Starting Equipment über `applyStartingEquipmentChoiceToDraft(...)` aus V2-State
- `src/pages/CharacterSheetPage.tsx`
  - nutzt `useCharacterEngine(...)`
  - Applied Rules, Derived Stats, Progression, Actions/Resources direkt aus `characterEngine`

### Noch Legacy/Kompatibilität

- `src/features/character/components/SpellSelectionPanel.tsx`
- `src/features/character/components/FeatSelectionPanel.tsx`
  - nach `src/features/character/legacy/` verschoben
  - nicht im Hauptflow verwendet
- `src/services/data/adapter.ts`
  - expliziter Compat-/Test-Layer, nicht mehr regulärer UI-Hauptpfad

## 3) Altpfad -> Zielpfad Mapping

| Bereich | Altpfad | Zielpfad (V2) | Status |
|---|---|---|---|
| Builder/Wizard Datenzugriff | `services/data/adapter` in Builder-Page | `features/wizardV2/useWizardV2State` | umgesetzt |
| Wizard Completion/Validierung | `builderWizardResolver` indirekt via Adapter | `wizardV2Engine` + `characterEngine.resolveCharacterWizardState` | umgesetzt |
| Spell Step Auswahl | direkte/alte Auswahlpfade im Builder | `features/spellManagement/useSpellManagement` + `applySpellSelectionToDraft` | umgesetzt |
| Subclass-Auflösung im Wizard | Adapter-Resolver | `characterEngine.resolveSubclassesForClassFromSnapshot` via `useWizardV2State` | umgesetzt |
| Sheet Applied/Derived/Progression | Adapter-Getter in Sheet-Page | `features/character/hooks/useCharacterEngine` | umgesetzt |
| Sheet Actions/Resources | Adapter-Getter in Sheet-Page | `characterEngine.actionResources` via Hook | umgesetzt |
| Content Browser / Source UI | Adapter direkt in UI | `useContentBrowserV2State` + `sourceSelectionService` | umgesetzt |

## 4) Migrationsreihenfolge (durchgeführt)

1. V2 Hooks zentralisiert (`useWizardV2State`, `useSpellManagement`, `useCharacterEngine`).
2. Builder-Page auf Wizard-/Spell-V2-State umgehängt.
3. Spell-Toggle-Logik in `spellManagementService` konsolidiert.
4. Sheet-Page auf `characterEngine`-Output umgehängt.
5. Integrationstests ergänzt (Wizard/Spell/Sheet/Save-Load).

## 5) Standardpfad / Legacy-Pfad

### Standardpfad (ab jetzt)

- Route `/builder/:id` -> V2 Builder-Flow (`wizardV2Engine` + `spellManagementService`)
- Route `/sheet/:id` -> V2 Character Sheet (`characterEngine`)
- Route `/content` -> V2 Content Browser (`useContentBrowserV2State`)
- Source Selection -> V2 Source Store (`sourceSelectionService`)
- `provider=mpmb` + `rulesMode` steuert MPMB-Core-Snapshot über `mpmbCore`

### Legacy-/Kompatibilitätspfad (vorerst)

- Adapter-Fassade (`services/data/adapter`) bleibt für:
  - bestehende Regressionstests
- Explizite Legacy-Panels in `src/features/character/legacy/`.

## 6) Risiken / Regressionen

1. Adapter und V2 dürfen semantisch nicht auseinanderlaufen; Compat-Tests bleiben nötig.
2. Legacy-Panels könnten versehentlich wieder eingebunden werden; daher explizite Kapselung unter `legacy/`.
3. Save/Load-Migration von v1 bleibt auf Persistenz-Mapping angewiesen (`provider=mpmb`, `rulesMode=2024` Default).
4. `provider=open5e` bleibt verfügbar; V2-Hooks müssen Provider-/RulesMode-Semantik unverändert halten.

## 7) Nach dieser Phase verbleibender Kompatibilitätsumfang

- Adapter bleibt als Test-/Compat-Layer.
- V2 ist Standard für Character Creation, Spell-Auswahl, Character Sheet, Content Browser und Source Selection.
- Kein gemischter Alt/V2-Datenpfad mehr in Builder- und Sheet-Komponenten.
