# Rules Mode Conversion Plan

## 1. Ziel und Begriffe
- `provider` und `rulesMode` sind getrennt:
  - `provider`: `open5e | mpmb` (Datenherkunft)
  - `rulesMode`: `2014 | 2024` (Regelmodus für Character Build)
- Ein CharacterDraft trägt beides explizit und unabhängig.

## 2. Aktueller Ist-Stand
- Provider-Auswahl ist bereits vorhanden (Source-Resolver + Source-Store).
- Entitäten haben bereits `sourceMeta` mit:
  - `sourceSystem`
  - `edition`
  - `sourceDocumentKey`
  - `sourceDocumentName`
- Klassen/Subclasses haben bereits `canonicalClassKey`.
- Zentrale Regelmodus-Schicht ist umgesetzt (`rulesModeResolver`) und steuert 2014/2024-Überschreibungen sowie Legacy-Konvertierungen.
- Offener Folgeschritt ist die Materialisierung als Applied Output (siehe `docs/applied-rules-plan.md`).

## 3. Zielmodell (Character + Entities)

### CharacterDraft
- `provider: "open5e" | "mpmb"`
- `rulesMode: "2014" | "2024"`

### Entity-Kompatibilitätsmetadaten (app-intern, optional)
- `contentVersion: "2014" | "2024" | "legacy" | "unknown"`
- `canonicalKey: string`
- `replacementGroup: string`
- `replacedBy2024?: boolean`
- `legacyCompatibleIn2024?: boolean`
- `conversionMode?: "native" | "2024-converted" | "legacy-only"`
- `notes?: string[]`
- `subclassUnlockLevel?: number` (relevant für subclasses)

Hinweis: Diese Felder werden kompatibel als optionale Felder ergänzt; bestehende Snapshots bleiben gültig.

## 4. Resolver-Regeln pro Entität

### Classes
- `rulesMode=2024`:
  - 2024-Core gewinnt innerhalb derselben Klasse (`replacementGroup`).
  - Falls keine 2024-Version existiert, bleibt ältere/legacy Version nutzbar.
- `rulesMode=2014`:
  - 2014/legacy wird bevorzugt.
  - 2024 wird nicht automatisch als Ersatz priorisiert.

### Subclasses
- `rulesMode=2024`:
  - ältere Subclasses erlaubt, wenn keine 2024-Version derselben Subclass existiert.
  - existiert eine 2024-Version derselben Subclass, wird diese bevorzugt.
  - Freischaltung folgt 2024-Klassenprogression (MVP: subclass unlock level).
- `rulesMode=2014`:
  - normale 2014/legacy Auswahl.

### Species
- `rulesMode=2024`:
  - ältere Species bleiben wählbar.
  - Species-ASI aus älteren Datensätzen werden ignoriert.
  - Ergebnis wird als `conversionMode="2024-converted"` markiert.
- `rulesMode=2014`:
  - native 2014/legacy-Interpretation.

### Backgrounds
- `rulesMode=2024`:
  - ältere Backgrounds bleiben wählbar.
  - Background-ASI-Logik wird auf 2024-Modell umgestellt.
  - falls kein Feat vorhanden: Origin-Feat erforderlich.
  - Ergebnis wird als `conversionMode="2024-converted"` markiert.
  - strukturierte Conversion-Ausgabe:
    - `abilityScoreRule`
    - `requiresOriginFeat`
    - `grantedFeatIds` (falls auflösbar)
- `rulesMode=2014`:
  - native 2014/legacy-Interpretation.

### Spells
- `rulesMode=2024`:
  - 2024-Version gewinnt bei gleichem canonical Spell.
- `rulesMode=2014`:
  - 2014/legacy-Version gewinnt.

### Feats / Equipment
- dieselbe Replacement-Mechanik (canonical + replacementGroup), ohne zusätzliche Spezialkonversion.

## 5. Technische Umsetzung
- Neue zentrale Schicht:
  - `src/services/data/rulesModeResolver.ts`
- Aufgaben:
  - provider-Filter
  - rulesMode-basierte Replacement-Auswahl
  - conversion/compatibility-Metadaten setzen
  - Hilfsfunktionen:
    - `getConvertedSpeciesTraits(species, rulesMode)`
    - `getConvertedBackgroundBenefits(background, rulesMode)`
- Applied-Rule-Materialisierung:
  - `src/services/data/appliedRulesResolver.ts`

## 6. Adapter-Integration
- Adapter-APIs werden optional um Context erweitert:
  - `provider`
  - `rulesMode`
  - `selectedClassId`
  - `classLevel`
- Bestehende Signaturen ohne Context bleiben nutzbar (Backward-Kompatibilität).

## 7. UI-/State-Integration
- Builder erhält getrennte Auswahlfelder:
  - Provider
  - Rules Mode
- Konvertierte Legacy-Einträge werden im UI markiert.
- Spezielle Hinweise:
  - ältere Species in 2024: ASI ignored
  - ältere Backgrounds in 2024: 2024 ASI + Origin Feat, falls nötig

## 8. Annahmen / offene Punkte
- Viele MPMB-2014-Datensätze tragen `edition=unknown`; diese werden als `legacy` behandelt.
- Subclass-Replacement erkennt Gleichheit über canonical Keys/normalisierte Namen; bei Ambiguität bleibt ältere Variante als Legacy markiert statt still zu verwerfen.
- Open5e-Snapshots enthalten aktuell nicht jede 2014-Background-Option (z. B. Outlander kann provider-abhängig fehlen). Regeln bleiben provider-unabhängig, Testfälle nutzen deshalb bei Bedarf provider-spezifische verfügbare Legacy-Beispiele.
- Vollständige 2024-Regelengine (AC/HP/Saves etc.) bleibt außerhalb dieser Phase.
