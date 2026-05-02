# Applied Rules Plan

## 1. Problem Statement
Der aktuelle Stand trennt Datenherkunft (`provider`) und Regelmodus (`rulesMode`) bereits sauber, aber viele Ergebnisse liegen noch nur als:
- Resolver-Markierungen (`conversionMode`, `notes`)
- UI-Hinweise
- heuristische Auflösung (z. B. Background -> Feat per Name-Match)

vor.  
Für den Character Builder fehlt noch ein deterministischer, materialisierter Ausgabeblock: **welche Regeln wurden tatsächlich angewendet**.

## 2. Aktuelle Lücke
Unterschied zwischen drei Ebenen:
1. **Draft**: Nutzerwahl (Klasse, Species, Background, Feats, Spells)
2. **Resolved Option**: rulesMode-/provider-bereinigt (z. B. 2024 ersetzt 2014)
3. **Applied Rules Output**: konkrete Build-Wirkung

Beispiele der ursprünglichen Lücke:
- Species-Conversion in 2024: bisher „ASI ignored“ als Note, aber nicht als explizites Applied-Ergebnis.
- Background-Conversion in 2024: Origin-Feat-Bedarf nur implizit, nicht als strukturierte Requirement.
- Proficiencies/Skill-Choices: noch nicht zentral materialisiert.

## 3. Zielbild
Ein zentraler Resolver liefert aus `CharacterDraft + resolved entities`:
- `AppliedCharacterRules`
- deterministisch, provider-/rulesMode-konsistent
- UI konsumiert nur diesen Output

## 4. Scope dieser Phase
### Enthalten
- Applied-Rules-Modell (domain-typisiert)
- zentraler `appliedRulesResolver`
- deterministische Species-/Background-Conversion
- explizite Mapping-Tabellen (Background-Feat-Regeln, Klassen-Basisproficiencies, Species-ASI-Overrides)
- erste enge Basisregeln:
  - Proficiency Bonus
  - Save-Proficiencies
  - Skills/Tools/Languages (soweit sicher)
  - einfache Spell-Basis (available + source)

### Nicht enthalten
- volle AC/HP/Saves/Skills-Automation inkl. aller Sonderfälle
- Hook-Ausführung (`eval`, `calcChanges`, etc.)
- vollständige 5e-Regelengine

## 5. Determinismusstrategie
1. **Explizite Mapping-Tabellen** zuerst
2. strukturierte Fallbacks (z. B. Textparser) nur sekundär
3. Fallback immer markieren (`notes`, `dataStatus`, `pendingChoices`)

## 6. Persistenzstrategie
- `CharacterDraft` bleibt primäre, persistierte Wahrheit.
- Applied Output wird zur Laufzeit neu berechnet (deterministisch).
- Keine Pflicht-Persistenz des Applied Outputs im Draft.

## 7. Teststrategie
- Beispielbuilds (Half-Elf + Outlander + Paladin L1)
- provider/rulesMode-Matrix (mit provider-spezifischer Datenverfügbarkeit dokumentiert)
- explizite Mapping-Tests (Background -> Feat)
- Regression: bestehende Tests bleiben grün

## 8. Implementierungsstand
Umgesetzt:
- `src/domain/appliedRules.ts`
- `src/services/data/appliedRulesResolver.ts`
- Mapping-Dateien:
  - `src/services/data/mappings/backgroundRules.ts`
  - `src/services/data/mappings/classBaseRules.ts`
  - `src/services/data/mappings/speciesRules.ts`
  - `src/services/data/mappings/featNameAliases.ts`
- Adapter-Integration über `getAppliedCharacterRules(...)`
- UI konsumiert Applied Output in Builder + Sheet
- Testabdeckung in `src/tests/applied-rules-resolver.test.ts`
