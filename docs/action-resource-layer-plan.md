# Action/Resource Layer Plan

## 1. Abgrenzung der Layer
- **Applied Rules**: Regelmodus-/Provider-Auflösung und konvertierte Regelwirkung.
- **Derived Stats**: konkrete Zahlenwerte (Mods, Saves, AC/HP-Basis, Spell DC/Attack).
- **Progression**: Level-Freischaltungen und Pending Choices.
- **Action/Resource Layer (neu)**: tatsächlich nutzbare Handlungsoptionen + begrenzte Ressourcen inkl. Recharge.

Der neue Layer ist vollständig abgeleitet und enthält keine UI-spezifische Logik.

## 2. Scope dieser Phase
Unterstützt:
- Actions
- Bonus Actions
- Reactions
- Utility/Special Actions
- Limited-use Ressourcen mit Recharge-Regeln
- Spell-Slot-Ressourcen + Spell-Actions (aus ausgewählten Spells)

Nicht unterstützt:
- vollständige Combat-Engine
- Conditions/Status-Engine
- komplette Hook-Auswertung (`eval/removeeval/calcChanges`)
- vollständige situative Buff-/Debuff-Auflösung
- vollständiges stateful Encounter-Tracking

## 3. Datenquellen
- normalisierte Features (`minLevel`, `description`, `usages`, `recovery`)
- Klasse/Subclass aus rulesMode-resolved Daten
- Progression (Spell Slots, bekannte/vorbereitete Spells, Pending Choices)
- ausgewählte Spells (`castingTime`, `level`)
- Inventory + Equipment-Katalog (nur deklarativ erkennbare Item-Aktionen)
- Derived Stats (Ability-Mods, Proficiency, Spell DC/Attack)

## 4. Modell
Neue Domain-Datei:
- `src/domain/actionResources.ts`

Kernobjekte:
- `CharacterActionSet`
- `CharacterAction`
- `CharacterResourceSet`
- `CharacterResource`
- `RechargeRule`
- `LimitedUseFeature`
- `SpellcastingResourceState`
- `ActionPrerequisite`
- `ActionSourceRef`
- `CharacterActionResourceState`

## 5. Regeln in dieser Phase
1. **Feature Actions**
   - Aktionstyp primär aus Beschreibungstext (`as an action`, `bonus action`, `reaction`)
   - deterministische Fallback-Map für bekannte Features
2. **Feature Resources**
   - `usages`/`recovery` werden priorisiert ausgewertet
   - Fallbacks für bekannte Formeln (z. B. Lay on Hands, Bardic Inspiration)
   - wenn nicht sicher ableitbar: `partial/pending`
3. **Spellcasting**
   - Spell Slots als Ressourcen
   - Cantrips als at-will Spell Actions
   - ausgewählte Leveled Spells als Actions mit Slot-Prerequisite
4. **Items**
   - Waffen als einfache Attack-Action
   - weitere Item-Aktionen nur bei klarer deklarativer Erkennung

## 6. Recharge-Modell
Unterstützte Recharge-Typen:
- `at-will`
- `short-rest`
- `long-rest`
- `special`
- `manual`

Wenn kein sicherer Recharge ableitbar ist, wird `manual` gesetzt und der Status markiert.

## 7. Pending/Partial-Strategie
- Keine stillschweigend erfundenen Regeln
- Unsichere Fälle werden als `partial`/`pending` markiert
- Sheet zeigt diese Zustände explizit

## 8. Stateful Tracking
In dieser Phase **nicht** eingeführt.  
Es wird `usesMax` + initial `usesRemaining` abgeleitet; persistentes Verbrauchs-Tracking bleibt nächste Phase.

## 9. Integration
- Resolver:
  - `src/services/data/actionResourceResolver.ts`
- Adapter:
  - `getCharacterActionResources(draft, context?)`
- UI:
  - Character Sheet zeigt Actions, Bonus Actions, Reactions, Resources und Status

## 10. Offene Punkte für nächste Phase
- persistentes Resource-Tracking mit Rest-Reset-Funktionen
- feinere Item-/Feature-Interaktionslogik
- bessere Coverage komplexer Spellcasting-Sonderfälle pro Klasse/Subclass
- Encounter-/Combat-orientierte Ausführungslogik
