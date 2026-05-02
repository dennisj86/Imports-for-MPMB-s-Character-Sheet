# Projektstatusbericht – D&D Character Builder

Stand: 2026-05-02

## 1. Kurzfazit
Das Projekt hat jetzt ein funktionsfähiges Fundament mit zwei Datenprovidern (`open5e`, `mpmb`), reproduzierbaren Ingestion-Pipelines, zentraler `rulesMode`-Auflösung (`2014 | 2024`) und einer lauffähigen lokalen Builder-/Sheet-UI.  
Die kritischen Runtime-Probleme in der MPMB-Generierung sind aktuell auf **0 Parse-Fehler** reduziert.

## 2. Was ist umgesetzt

### A) Datenprovider und Ingestion
- `open5e` ist über **Open5e API V2** eingebunden (kein HTML-Scraping).
- `mpmb` ist über lokale Registry-Ingestion + PDF-Extraktion/Capture eingebunden.
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

## 3. Aktuelle Absicherungen

### A) Automatisierte Prüfungen
- `npm run typecheck` (TS strict compile pass)
- `npm run test` (Vitest)
- `npm run build` (inkl. `data:generate`)

### B) Testabdeckung (aktueller Stand)
- **14 Testdateien, 35 Tests, alle grün**.
- Abgedeckt u. a.:
  - Open5e-Client/Pagination/Normalisierung/Merge
  - MPMB-PDF-Extraktion/Normalisierung
  - Runtime-Fix-Regressionen
  - Adapterfunktionen
  - Rules-Mode-Resolver inkl. Provider-Unabhängigkeit
  - Persistence/Migration

### C) Laufzeit-Regressionen in der Generierung
- Baseline-Schwellen für Entity-Counts und Parse-Fehler sind im Generator verankert.
- Aktueller Lauf (`latest-runtime-summary.json`):
  - local: classes 15 / subclasses 230 / species 312 / backgrounds 132 / feats 227 / spells 264 / equipment 661
  - merged: classes 51 / subclasses 283 / species 352 / backgrounds 140 / feats 244 / spells 1243 / equipment 1522
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

### Empfohlene Phase 2 (priorisiert)
1. **Deterministische Normalisierung für Background/Feat-Verknüpfung**
   - origin-feat-/granted-feat-Auflösung über explizite Mapping-Tabelle statt nur Textmatch.
2. **Rules-Mode-Resolver weiter formalisieren**
   - Replacement- und Canonical-Mappings für strittige Klassen/Subclasses zentral konfigurieren.
3. **Anwendungs-Engine für „rechenbare Basisregeln“**
   - zuerst eng: Proficiency Bonus, Save-Proficiencies, Skill-Proficiencies, Spell-Preparation-Basis.
4. **Regressions-Gates im CI**
   - automatische Prüfung von Entity-Counts + Parse-Fehler + Resolver-Snapshots pro Commit.
5. **Performance/Bundling**
   - Code-Splitting für Content-Browser/Sheet, um Initial-Bundle zu verkleinern.

## 6. Praktische Priorität für sofort
Wenn nur ein nächster Schritt gestartet werden soll:  
**Background/Feat- und Species-Conversion in einen deterministischen „Applied Rules Output“ überführen** (statt primär als Notes/Markierung).  
Das ist der größte Hebel, um vom Daten- und Resolver-Fundament zu konsistenter Character-Build-Logik zu kommen.
