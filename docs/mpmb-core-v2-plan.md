# MPMB Core V2 Plan (`mpmb-core-first`)

Stand: 2026-05-07

## 1) Zielbild

Die V2-Architektur macht die kopierten MPMB-Script-Repos zur primären Regelbasis und trennt klar:

- `rulesMode=2014` -> eigener 2014-Core
- `rulesMode=2024` -> eigener 2024-Core

Darauf aufbauend laufen Wizard, Choice-Resolution, Applied Rules, Derived Stats und Progression.  
PDF/Open5e bleiben als sekundäre Quellen/Fallback bzw. optionaler Provider, nicht als strukturelles Primärfundament.

## 2) Primäre Core-Repos und Overlay-Schichten

### Primäre Core-Repos

- `docs/Sheet skripte` -> MPMB 2014 Core
- `docs/Sheet skripte 2024` -> MPMB 2024 Core

Diese Pfade sind jetzt auch Default für den Upstream-Import (`scripts/import-mpmb-upstream.cjs`).

### Overlay-Reihenfolge je Rules Mode

1. Core-Snapshot aus `mpmb-upstream-2014` bzw. `mpmb-upstream-2024`
2. additive Overlay-Schicht `mpmb-local` (lokale/additional Inhalte)
3. fallback `mpmb-pdf`
4. sonstige manuelle/legacy Fragmente

WotC-Inhalte werden als additive Script-Overlay-Schicht modelliert:

- `WotC material`
- `WotC 2024`

## 3) Analyse: Wiederverwendung vs. Ersatz

### Stabil genug für V2-Wiederverwendung

- `rulesModeResolver.ts` (kanonische 2014/2024-Auswahl + Conversion-Metadaten)
- `appliedRulesResolver.ts`
- `derivedStatsResolver.ts`
- `progressionResolver.ts`
- `actionResourceResolver.ts`
- `builderWizardResolver.ts` (Choice-/Validation-Logik)
- Domain-Modelle in `src/domain/*`
- Persistenz/Store-Strukturen

### Fragil und in V2 ersetzt/entkoppelt

- direkte Snapshot-Nutzung im alten Adapter als einziger Laufzeitanker
- implizite Mischlogik der Quellen ohne explizite Core-Schicht
- alte MVP-Pfade, die PDF/Open5e strukturell wie Primärquellen behandeln

### Sekundärpfade (weiterhin vorhanden, aber nicht primär)

- PDF-basierte Daten (`mpmb-pdf`) -> Fallback
- Open5e -> separater Provider, optional additive Sicht in `provider=all`

## 4) V2-Modulstruktur (neu)

- `src/services/mpmbRuntime/`
  - `runtimeLoadPlan.ts` (deterministische Lade-Reihenfolge für `_variables`, `_functions`, additional content, WotC)
  - `registrySummary.ts` (Registry-/Preset-Summary)
- `src/services/mpmbCore/`
  - `coreRegistry.ts` (Core-Registry, rulesMode/provider-abhängige Snapshot-Auswahl)
- `src/services/mpmbNormalization/`
  - `snapshotMerge.ts` (Layer-Merge, Filter, mode-spezifische Snapshot-Bildung)
- `src/services/characterEngine/`
  - `characterEngine.ts` (Applied/Derived/Progression/Action + Wizard-State aus Core-Snapshot)
- `src/features/wizardV2/`
  - `wizardV2Engine.ts` (V2-Step-State aus Character-Engine)
- `src/features/spellManagement/`
  - `spellManagementService.ts` (Spell-Choice-Verwaltung auf Engine-Basis)
- `src/features/dice/`
  - `diceRoller.ts` (deterministische Dice-Utility als V2-Basis)

## 5) Migrationsstrategie (parallel, kein Big Bang)

1. Neue Core-Layer parallel einführen (`mpmbRuntime`, `mpmbCore`, `mpmbNormalization`).
2. Adapter intern auf Core-Registry umstellen (ohne alte API-Signaturen zu brechen).
3. Character-Engine-Facade einziehen und Resolver dort bündeln.
4. Wizard V2 Engine parallel bereitstellen; alter Wizard bleibt referenzierbar.
5. Tests auf Core-Layer + Adapter-Verhalten + Regression erweitern.
6. Altes MVP schrittweise nur noch als Kompatibilitätspfad behalten.

## 6) Aktuelle Implementierungsentscheidungen

- `provider=mpmb` nutzt je `rulesMode` explizit den MPMB-Core-Modus-Snapshot.
- `provider=open5e` nutzt explizit den Open5e-Snapshot.
- `provider=all` nutzt mode-spezifisch kombinierten Snapshot (`mpmb(mode)+open5e`).
- Source-Selection wirkt auf den Core-Registry-Snapshot, nicht nur auf eine flache Liste.

## 7) Risiken / offene Fragen

1. **Source-Key-Kollisionen**
   - Gleichnamige Source-Keys zwischen Layern können unbeabsichtigt Filtereffekte erzeugen.
2. **Declarative Coverage-Lücken**
   - Nicht alle MPMB-Hooks sind deklarativ; einige Features bleiben „partial/manual“.
3. **Performance**
   - Mehrere mode-/provider-Snapshots im Speicher erhöhen Laufzeit-/Bundle-Druck.
4. **Wizard-Regel-Tiefe**
   - Komplexe Subchoice-Bäume (insb. Feat/Spell-Unterentscheidungen) müssen iterativ ausgebaut werden.
5. **Konfliktregeln 2014 vs 2024**
   - Für Spezialfälle sind zusätzliche Canonical-/Replacement-Mappings nötig.

## 8) Nächste Phase (technisch sinnvoll)

Status der vorherigen Folgephase:

1. Wizard-V2-UI auf `wizardV2Engine` umgehängt. ✅
2. Spell-Management-UI auf `spellManagementService` umgehängt. ✅
3. Character-Sheet auf `characterEngine`-Output konsolidiert. ✅

Nächster Schwerpunkt:

4. Content-/Source-Selection-Schicht vom Adapter auf V2-Core-APIs migrieren (Adapter nur noch Compat). ✅
5. Legacy-UI-Bausteine explizit kapseln/abbauen, damit keine impliziten Mischpfade zurückkehren. ✅
6. Regressionsgates für V2-Standardpfad und mode-spezifische Snapshot-Diffs erweitern. ✅

Folgephase:

7. Adapter-Compat-Layer weiter verschlanken (nur noch explizite Legacy/Test-Use-Cases).
8. Optionales per-route code-splitting für weitere nicht-kritische Legacy-Bereiche.
9. CI-Gates auf V2-Pfad verpflichtend machen (inkl. file-level guard gegen UI-Adapter-Imports).
