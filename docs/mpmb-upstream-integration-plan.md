# MPMB Upstream Integration Plan

Stand: 2026-05-02

## 1. Ziel
- Neue Core-Quellen für `provider=mpmb` aus lokalen Upstream-Repos integrieren:
  - 2014: `/home/dennis/IdeaProjects/MPMBs-Character-Record-Sheet`
  - 2024: `/home/dennis/IdeaProjects/2024_MPMBs-Character-Record-Sheet`
- Interne Trennung bleibt:
  - `provider` = Datenherkunft (`open5e | mpmb`)
  - `rulesMode` = Regelsystem (`2014 | 2024`)
- Innerhalb von `mpmb` wird je `rulesMode` ein Standard-Core gewählt.

## 2. Aktueller Ist-Stand (Projekt)
- Zielschema ist stabil und wird bereits von Adapter/Resolver/UI verwendet:
  - `sources`, `classes`, `subclasses`, `species`, `backgrounds`, `feats`, `spells`, `equipment`
- `sourceMeta`, `compatibility`, `canonicalClassKey`, `replacementGroup` sind bereits vorhanden.
- Bestehende Datenpfade:
  - lokaler MPMB-Import/Normalisierung: `scripts/generate-mpmb-data.cjs`
  - Open5e-Import: `scripts/import-open5e.ts`
  - PDF-Import: `scripts/import-mpmb-pdf.cjs`
- Aktueller Endsnapshot für App:
  - `src/services/data/generated/mpmb-content.json`

## 3. Geplante Upstream-Core-Quellen
Aus beiden Upstream-Repos werden primär `_variables`-Dateien ingestiert (nicht `additional content` als Core):

- `ListsSources.js`
- `ListsClasses.js`
- `ListsRaces.js`
- `ListsBackgrounds.js`
- `ListsFeats.js`
- `ListsSpells.js`
- `ListsGear.js`
- `ListsMagicItems.js`
- plus `Lists.js` als vorbereitende Basis (Hilfsvariablen/Konstanten)

Diese Dateien liefern direkt `Base_*`-Registries (z. B. `Base_ClassList`, `Base_SpellsList`, ...), die für den Character Builder relevant sind.

## 4. Geplante Ingestion-Pipeline
Neue Skripte:
- `npm run import:mpmb:upstream:2014`
- `npm run import:mpmb:upstream:2024`
- `npm run import:mpmb:upstream:all`

Pro Lauf:
1. Rohdateien inventarisieren (Manifest)
2. in Sandbox/Capture ausführen (ohne Voll-Runtime-Nachbau)
3. `Base_*`-Registries + registrierte Subclasses/Varianten erfassen
4. in bestehendes Zielschema normalisieren
5. Artefakte schreiben
6. Vergleichsreport gegen bisherigen `mpmb`-Stand schreiben
7. merged Snapshot neu erzeugen

## 5. Artefaktstruktur
- `data/imports/mpmb-upstream-2014/raw/`
- `data/imports/mpmb-upstream-2014/normalized/`
- `data/imports/mpmb-upstream-2014/manifests/`
- `data/imports/mpmb-upstream-2024/raw/`
- `data/imports/mpmb-upstream-2024/normalized/`
- `data/imports/mpmb-upstream-2024/manifests/`

Je Lauf mindestens:
- raw manifest (Dateiliste, Reihenfolge, Hash/Status)
- normalized snapshot
- import manifest (Counts/Warnungen/Skipped)
- `comparison-report.json` (neuer Core vs bisheriger Core)

## 6. Normalisierung und Metadaten
Alle Upstream-Entitäten bleiben schema-kompatibel und tragen mindestens:
- `sourceMeta.sourceSystem = "mpmb"`
- `sourceMeta.sourceDocumentKey` (aus Source-Key/Registry ableitbar)
- `sourceMeta.sourceDocumentName` (Upstream-Quelle)
- `sourceMeta.edition = "2014" | "2024" | "unknown"`
- `sourceMeta.importPreset = "mpmb-upstream-2014" | "mpmb-upstream-2024"`
- `sourceMeta.rawSourceRef`
- `sourceMeta.dataStatus`
- `canonicalClassKey` (wo relevant)

## 7. Merge-/Prioritätsstrategie im Provider `mpmb`
### rulesMode=2014
1. `mpmb-upstream-2014` (Core)
2. `mpmb-local` (Overlay/Addons)
3. `mpmb-pdf` (Fallback)

### rulesMode=2024
1. `mpmb-upstream-2024` (Core)
2. `mpmb-local` (Overlay/Addons)
3. `mpmb-pdf` (Fallback)

Wichtig:
- `mpmb-local` ergänzt Core-Inhalte, überschreibt sie nicht blind.
- `mpmb-pdf` ergänzt nur bei Lücken.
- `open5e` bleibt getrennt und unverändert.

## 8. Resolver-/Adapter-Integration
- Bestehende APIs bleiben kompatibel:
  - `getClasses()`, `getClassById()`, `getSubclassesForClass()`, `getSpecies()`, `getBackgrounds()`, `getFeats()`, `getSpells()`, `getSpellById()`, `getEquipmentCatalog()`
- Implementierungsdetail: `mpmb`-Subtier-Auswahl erfolgt zentral im Service-/Resolver-Layer, nicht in UI-Komponenten.
- Subclass-Linking bleibt über `canonicalClassKey` + bestehenden Class-Resolver erhalten.

## 9. Regressionsschutz
- Erst Import + Diffreport, danach Prioritätsumschaltung.
- Tests:
  - Ingestion (2014/2024 läuft, Artefakte vorhanden)
  - Resolver (`mpmb + rulesMode` nutzt passenden Core)
  - Overlay/Fallback-Logik
  - Subclass-Linking gegen neuen Core
  - Open5e-Regression bleibt grün

## 10. Risiken / Annahmen
- **Annahme:** `_variables` reichen für deklarative Core-Entitäten; tiefe Runtime-Logik aus `_functions` wird nicht voll benötigt.
- **Risiko:** einzelne Dateien erwarten zusätzliche Runtime-Globals; dafür werden gezielte Shims + Diagnose genutzt.
- **Risiko:** Identitätskollisionen bei doppelt benannten Legacy-/2024-Objekten; wird über canonical/replacementGroup + Source-Tier entschärft.
- **Risiko:** 2014/2024 Editionserkennung bei `unknown`-Einträgen; Fallback über Source-Keys/Dateiherkunft.
- **Lizenz/Provenance:** Upstream-Repos werden nur lokal gelesen, nicht verändert; Herkunft bleibt über `sourceMeta.rawSourceRef` nachvollziehbar.
