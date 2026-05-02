# Open5e Ingestion Plan (API V2)

## Scope
- Ziel: additive Open5e-Datenquelle für den lokalen Character Builder.
- Kein HTML-Scraping, nur Open5e API V2.
- Presets:
  - `open5e-2014`
  - `open5e-2024`
  - `open5e-both`

## Internes Zielschema (bestehend + minimal erweitert)
- Snapshot bleibt kompatibel zu `src/services/data/schemas.ts` und Adapter-APIs.
- Beibehaltene Entitäten:
  - `sources`, `classes`, `subclasses`, `species`, `backgrounds`, `feats`, `spells`, `equipment`
- Minimal ergänzt:
  - `sourceMeta` (optional) auf Entitäten
  - `canonicalClassKey` (optional) auf `classes`/`subclasses`

`sourceMeta` Felder:
- `sourceSystem`: `mpmb | open5e`
- `sourceDocumentKey`, `sourceDocumentName`
- `edition`: `2014 | 2024 | unknown`
- `importPreset`
- `license` (falls vorhanden)
- `rawSourceRef`
- `dataStatus`: `complete | partial | pending | manual`

## Open5e Mapping

### Discovery
- Endpoint: `/v2/documents`
- Editionsermittlung:
  - primär über `document.gamesystem.key` (`5e-2014`, `5e-2024`)
  - fallback heuristisch über `document.key`
- Preset-Selektion:
  - 2014 bevorzugt `srd-2014`, `open5e`
  - 2024 bevorzugt `srd-2024`, `open5e-2024`
  - fallback: verfügbare `SOURCE`-Dokumente je Edition

### Entitäts-Endpoints
- `classes` (inkl. Subclasses via `subclass_of`)
- `species`
- `spells`
- `backgrounds`
- `feats`
- `items`, `weapons`, `armor` (für Equipment-Katalog)

### Normalisierung
- Klassen:
  - `canonicalClassKey` via Resolver (`src/services/data/resolvers/classResolver.ts`)
  - Trennung 2014/2024 im Namen (`(2014)/(2024)`) und in `sourceMeta.edition`
- Subclasses:
  - Parent-Kopplung über `subclass_of` + canonical key
- Spells:
  - Klassenreferenzen auf canonical class keys normalisiert
- Equipment:
  - Kategorie-Mapping auf bestehende App-Kategorien:
    - `magic-item | weapon | armor | gear | ammo`
- Unvollständige Felder:
  - `dataStatus=partial|manual|pending` setzen

## Merge-Strategie (additiv)
- Lokale MPMB-Daten werden nicht gelöscht.
- Open5e wird additiv gemerged.
- Dedupe nur bei stabiler Identität:
  - Klassen: `canonicalClassKey + edition`
  - Subclasses: `key + canonicalClassKey + edition`
  - übrige Entitäten: `key + edition`
- Source-Precedence:
  - `mpmb` leicht bevorzugt bei Konflikt
  - danach Open5e, mit Bonus für `srd-*`
- Unsichere Fälle: beide Einträge behalten (über unterschiedliche IDs/Keys + Source-Meta nachvollziehbar).

## Subclass-Kopplung (Kernpunkt)
- Lokale Subclasses werden nicht nur über `classId`, sondern auch über `canonicalClassKey`/`classKey` an Klassen gebunden.
- Dadurch erscheinen lokale Subclasses unter importierten Open5e-Classes mit gleichem canonical key.

## Artefakte
- Raw:
  - `data/imports/open5e/raw/open5e-<preset>-<timestamp>.json`
  - `data/imports/open5e/raw/latest-open5e-raw.json`
- Normalized:
  - `data/imports/open5e/normalized/open5e-<preset>-<timestamp>.json`
  - `data/imports/open5e/normalized/latest-open5e-content.json`
- Manifest:
  - `data/imports/open5e/manifests/open5e-<preset>-<timestamp>.json`
  - `data/imports/open5e/manifests/latest-open5e-manifest.json`
- App-merged Snapshot:
  - `src/services/data/generated/mpmb-content.json`

## Risiken / Annahmen
- Open5e-Dokumentfilter über API kann inkonsistent sein; deshalb Discovery + lokale Filterung.
- Hintergrund-/Feat-Abdeckung in SRD 2014 ist deutlich kleiner als 2024.
- Equipment-Daten enthalten Duplikate zwischen `items` und spezialisierten Endpoints.
- Nicht alle Open5e-Felder sind direkt in das MVP-Schema abbildbar; diese bleiben bewusst `partial/pending`.
