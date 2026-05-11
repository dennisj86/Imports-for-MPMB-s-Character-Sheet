![img.png](ui%20images/img.png)# Projektstatusbericht – D&D Character Builder

Stand: 2026-05-07

## 1. Kurzfazit
Das Projekt hat jetzt ein funktionsfähiges Fundament mit zwei Datenprovidern (`open5e`, `mpmb`), reproduzierbaren Ingestion-Pipelines, zentraler `rulesMode`-Auflösung (`2014 | 2024`) und einer lauffähigen lokalen Builder-/Sheet-UI.  
Die kritischen Runtime-Probleme in der MPMB-Generierung sind aktuell auf **0 Parse-Fehler** reduziert.

Neu gestartet ist die **V2-Phase `mpmb-core-first`**:
- getrennte MPMB-Core-Snapshots für `rulesMode=2014` und `rulesMode=2024`
- neue Layer `mpmbRuntime`, `mpmbCore`, `mpmbNormalization`, `characterEngine`
- Wizard-V2-, Spell-Management- und Dice-Basis als separater neuer Pfad
- PDF/Open5e bleiben erhalten, sind aber im V2-Pfad nicht mehr strukturelle Primärbasis für `provider=mpmb`

Aktueller UI-Status der Phase:
- Builder-Route `/builder/:id` läuft standardmäßig über `useWizardV2State` + `useSpellManagement`
- Sheet-Route `/sheet/:id` läuft standardmäßig über `useCharacterEngine`
- Content-Route `/content` läuft standardmäßig über `useContentBrowserV2State`
- Source-Selection läuft standardmäßig über `sourceSelectionService` + V2 `sourceStore`
- Legacy-Adapterpfade sind aus den Haupt-UI-Flows entfernt; Adapter bleibt als expliziter Compat-/Test-Layer

## 2. Was ist umgesetzt

### A) Datenprovider und Ingestion
- `open5e` ist über **Open5e API V2** eingebunden (kein HTML-Scraping).
- `mpmb` ist über lokale Registry-Ingestion + PDF-Extraktion/Capture eingebunden.
- `mpmb` hat zusätzlich lokale Upstream-Core-Ingestion:
  - `mpmb-upstream-2014`
  - `mpmb-upstream-2024`
- Additive Merge-Strategie ist aktiv (keine destruktive Überschreibung lokaler Daten).
- Generierte Snapshots:
  - `src/services/data/generated/mpmb-local-content.json`
  - `src/services/data/generated/mpmb-content.json`

### B) Rules-Mode-Logik (zentral)
- `provider` und `rulesMode` sind technisch getrennt modelliert.
- `CharacterDraft` trägt beides explizit.
- Zentrale Resolver-Schicht vorhanden:
  - `src/services/data/rulesModeResolver.ts`
- Implementiert:
  - Replacement-Priorisierung 2014/2024 für Classes/Subclasses/Spells/Feats/Equipment
  - Species-Conversion (Legacy-ASI in 2024 ignorieren)
  - Background-Conversion (2024-ASI-Regel + Origin-Feat-Anforderung bei Legacy ohne Feat)
  - Subclass-Handling inkl. 2024-Unlock-Level-Markierung

### C) Adapter-/State-Kompatibilität
- Adapterfunktionen unterstützen optionalen Context (`provider`, `rulesMode`, `selectedClassId`, `classLevel`) ohne alte Aufrufe zu brechen.
- Persistenz ist auf `CharacterDraft` v2 erweitert, inkl. Migration von v1.
- UI hat minimale Provider-/Rules-Mode-Auswahl und Markierung konvertierter Inhalte.

### D) MPMB-Runtime-Härtung
- Load-Order-Seeding (`core-seed` vor Supplements) ist definiert.
- Fault-tolerante Registries und gezielte Shims aktiv.
- Strukturierte Diagnoseartefakte:
  - `data/imports/mpmb-local/manifests/latest-runtime-diagnostics.json`
  - `data/imports/mpmb-local/manifests/latest-runtime-summary.json`

### E) MPMB Core-Tiering (neu)
- Innerhalb `provider=mpmb` wird Core nach `rulesMode` priorisiert:
  - `2014`: upstream-2014 core > mpmb-local overlay > mpmb-pdf fallback
  - `2024`: upstream-2024 core > mpmb-local overlay > mpmb-pdf fallback
- Vergleichsreports für Upstream-Promotion werden erzeugt:
  - `data/imports/mpmb-upstream-2014/manifests/comparison-report.json`
  - `data/imports/mpmb-upstream-2024/manifests/comparison-report.json`

### F) Content/Source V2 (neu)
- `sourceStore` nutzt V2-Source-Selection-Service statt Adapter-Regeneration.
- `SourceSelectionPanel` liest verfügbare Quellen aus dem V2-Store.
- `ContentBrowserPage` nutzt V2-Core-Registry-Auflösung (`provider` + `rulesMode`) statt Adapter-Getter.
- Legacy-Panels (`SpellSelectionPanel`, `FeatSelectionPanel`) sind in `src/features/character/legacy/` gekapselt.

## 3. Aktuelle Absicherungen

### A) Automatisierte Prüfungen
- `npm run typecheck` (TS strict compile pass)
- `npm run test` (Vitest)
- `npm run build` (inkl. `data:generate`)

### B) Testabdeckung (aktueller Stand)
- **29 Testdateien, 90 Tests, alle grün**.
- Abgedeckt u. a.:
  - Open5e-Client/Pagination/Normalisierung/Merge
  - MPMB-PDF-Extraktion/Normalisierung
  - Runtime-Fix-Regressionen
  - Adapterfunktionen
  - V2 Core/CharacterEngine/WizardV2/SpellManagement
  - V2 Content-Browser/Source-Selection
  - V2 UI-Integrationspfad (Wizard/Spell/Sheet/Save-Load)
  - Rules-Mode-Resolver inkl. Provider-Unabhängigkeit
  - Persistence/Migration

### C) Laufzeit-Regressionen in der Generierung
- Baseline-Schwellen für Entity-Counts und Parse-Fehler sind im Generator verankert.
- Aktueller Lauf (`latest-runtime-summary.json`):
  - local: classes 15 / subclasses 230 / species 312 / backgrounds 132 / feats 227 / spells 264 / equipment 661
  - merged: classes 75 / subclasses 307 / species 404 / backgrounds 145 / feats 261 / spells 1925 / equipment 2349
  - parseErrors: **0**

### D) Fachliche Guardrails
- Keine Portierung von `eval/removeeval/calcChanges` als Regelengine.
- Keine Rules-Logik in UI-Komponenten verteilt.
- Konfliktauflösung über Resolver-Metadaten/Notes, nicht stillschweigend.

## 4. Bekannte Grenzen / offene Punkte
- Vollständige Regelengine (AC/HP/Saves/Skills, komplexe Feature-Interaktionen) ist bewusst noch nicht umgesetzt.
- Nicht alle Open5e-Snapshots enthalten jede Legacy-Option (z. B. einzelne 2014-Backgrounds provider-abhängig).
- Feat-Zuordnung aus freien Textfeldern ist teilweise nur heuristisch auflösbar.
- Bundlegröße im Build ist aktuell groß (Vite-Warnung zu Chunk-Größe).

## 5. Empfehlung: nächster sinnvoller Schritt

### Empfohlene Folgephase (nach UI-Umschaltung)
1. **Adapter-Compat-Layer weiter reduzieren**
   - nur noch explizite Legacy-/Test-Zugriffe behalten, produktive Aufrufe weiter abbauen.
2. **Legacy-UI-Bausteine aufräumen**
   - gekapselte Legacy-Module mittelfristig entfernen, sobald keine Consumer mehr existieren.
3. **Persistenzschema für tiefere Wizard-Profile erweitern**
   - derzeit noch nicht persistierte tiefere Profile/About-Felder modellieren.
4. **Regressions-Gates im CI für V2-Standardpfad verpflichtend machen**
   - feste Tests für Builder-/Sheet-/Content-/Source-Pfad ohne Adapter-Abhängigkeit.
5. **Performance/Bundling**
   - weiteres Code-Splitting für nicht-kritische Legacy-/Support-Bereiche.

## 6. Praktische Priorität für sofort
Wenn nur ein nächster Schritt gestartet werden soll:  
**CI-Gates auf den V2-Standardpfad festziehen** (inkl. Guards gegen neue UI-Adapter-Imports), damit kein stiller Rückfall in Altpfade mehr möglich ist.
