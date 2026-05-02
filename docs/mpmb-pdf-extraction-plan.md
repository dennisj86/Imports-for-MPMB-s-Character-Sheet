# MPMB PDF Extraction Plan

## 1. Aktueller Architektur-Stand
- Das interne Zielschema bleibt identisch mit Open5e:
  - `sources`, `classes`, `subclasses`, `species`, `backgrounds`, `feats`, `spells`, `equipment`
- Weiterhin gültig:
  - Adapter-APIs (`getClasses`, `getSubclassesForClass`, `getSpells`, ...)
  - `sourceMeta` pro Entität
  - `canonicalClassKey` für Klassen/Subclasses
  - Resolver-Kopplung lokaler Subclasses an importierte Basisklassen

## 2. Einpassung von `mpmb` in dieselbe Pipeline
- `mpmb` ist ein additiver Provider, kein Ersatz.
- Open5e-Pipeline bleibt unverändert nutzbar.
- MPMB-PDF läuft parallel über eigene Artefakte:
  - `data/imports/mpmb-pdf/raw/*`
  - `data/imports/mpmb-pdf/normalized/*`
  - `data/imports/mpmb-pdf/manifests/*`
- Merge in den App-Snapshot erfolgt additiv in `scripts/generate-mpmb-data.cjs`:
  - lokal (`mpmb-local`) + Open5e + MPMB-PDF.

## 3. PDF-Extraktionsstrategie
1. Quelle: `docs/DnD.pdf` (Fallback auf `docs/dnd.pdf`).
2. Reproduzierbare Extraktion via `pdfinfo -js`.
3. Zerlegung in deterministische Segmente anhand Headern:
   - `Name Dictionary "..."` (inkl. `Lists*`, `Functions*`, `DomParser`, etc.)
   - Document/Form-Action-Segmente (`Before Close Document`, `Field Modified`, ...)
4. Speicherung:
   - pro Segment eine stabile JS-Datei im Run-Ordner
   - vollständiger `pdfinfo -js` Dump
   - Raw-Manifest mit Reihenfolge, Dateinamen, Segmentheadern.

## 4. Capture-Strategie (Sandbox + Shims)
- Ausführung in isolierter VM, ohne PDF-UI-Runtime nachzubauen.
- Gestubbte Registrierungs-Helfer:
  - `AddSubClass`
  - `AddRacialVariant`
  - `AddFeatureChoice`
  - `RequiredSheetVersion` (noop)
- Noop-Fallback für unbekannte globale Runtime-Symbole.
- Primär ausgewertete Segmente:
  - `Name Dictionary "Lists*"` (inkl. `ListsClasses`, `ListsSpells`, ...)
  - ergänzend `AbilityScores`, `ClassSelection`, `FunctionsImport`, `FunctionsResources`, `FunctionsSpells`, `DomParser`.
- Fallback-Strategie je Registry:
  - zuerst direkte Registry (`ClassList`, `SpellsList`, ...)
  - dann `Base_*` Registry (`Base_ClassList`, `Base_SpellsList`, ...).

## 5. Normalisierung und Mapping
- Jede Entität wird ins bestehende App-Schema überführt.
- `sourceMeta` für MPMB-PDF:
  - `sourceSystem = "mpmb"`
  - `sourceDocumentName = "DnD.pdf"`
  - `importPreset = "mpmb-pdf"`
  - `rawSourceRef` mit Registry-Herkunft (z. B. `ClassList:fighter`)
  - `dataStatus = "partial"` solange Felder nicht vollständig ableitbar sind
- Source-Key-Kollisionsschutz:
  - PDF-Sources werden auf `mpmbpdf-<slug>` namespaced
  - `sourceRefs` werden entsprechend remapped (z. B. `SRD:70` → `mpmbpdf-srd:70`)
- Klassen/Subclasses:
  - `canonicalClassKey` wird gesetzt (z. B. `fighter`, `wizard`), damit Resolver-kompatibel.

## 6. Provider-Auswahl `open5e | mpmb`
- Zentrale Provider-Auflösung in `src/services/data/sourceProvider.ts`.
- Quelle wird aus Source-Key/Group abgeleitet:
  - Open5e: `srd-2014`, `srd-2024`, `open5e*`, Group `Open5e*`
  - sonst `mpmb`.
- Source-UI unterstützt Presets:
  - `Provider: Open5e`
  - `Provider: MPMB`
  - weiterhin Book-/UA-/Open5e-spezifische Presets.

## 7. Derzeitige Capture-Ergebnisse (aktueller Lauf)
- Extraktion: 590 Skriptsegmente aus `docs/DnD.pdf`.
- Normalisiert (MPMB-PDF):
  - `sources`: 5
  - `classes`: 12
  - `subclasses`: 12
  - `species`: 19
  - `backgrounds`: 1
  - `feats`: 1
  - `spells`: 319
  - `equipment`: 431
- Manifest erfasst zusätzlich Registry-Counts und Execution-Log pro Segment.

## 8. Risiken / Annahmen / offene Punkte
- `pdfinfo -js` liefert keine stabilen PDF-Objekt-IDs; Herkunft wird über Segmentheader + Reihenfolge dokumentiert.
- Einige PDF-Runtime-abhängige Segmente bleiben partiell und werden nicht voll simuliert.
- MPMB-PDF liefert primär SRD-nahe Basisdaten; vollständige Breite lokaler Addon-Skripte kommt weiterhin aus `mpmb-local`.
- Datenstatus bleibt für viele Felder `partial`; komplexe imperative Hooks (`eval`, `calcChanges`) werden bewusst nicht automatisiert.

## 9. Runtime-Fix-Status (MPMB Local Capture)
- Ergänzend zur PDF-Extraktion wurde die `mpmb-local`-Sandbox gehärtet:
  - Core-first Load-Reihenfolge
  - Base-Registry-Aliase (`Base_*`)
  - fault-tolerante `MagicItemsList`-/`CompanionList`-/`CreatureList`-Defaults
  - Realm-lokaler `capitalize`-Shim
  - strukturierte Diagnostik + Regression-Schwellen
- Details und Fehlertyp-Analyse: `docs/mpmb-runtime-fixes.md`.
- Laufartefakte:
  - `data/imports/mpmb-local/manifests/latest-runtime-diagnostics.json`
  - `data/imports/mpmb-local/manifests/latest-runtime-summary.json`
