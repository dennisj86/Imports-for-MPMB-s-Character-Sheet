# Derived Stats Plan

## 1. Scope and Layering
This phase adds a deterministic **Derived Stats** layer on top of:
1. `CharacterDraft` (user choices)
2. `AppliedCharacterRules` (resolved + converted rules output)

`Derived Stats` computes concrete character values for sheet/builder display.  
It does not replace Draft or Applied Rules persistence.

## 2. Applied Rules vs Derived Stats
- **Applied Rules** answers: _which rules and conversions apply_.
- **Derived Stats** answers: _which numbers/state result right now_.

Examples:
- Species conversion note -> Derived layer now explicitly excludes legacy species ASI in 2024.
- Background conversion note -> Derived layer now materializes origin-feat requirement and pending choices impact.

## 3. Values computed in this phase
- Ability modifiers (from final scores = draft base + applied fixed adjustments)
- Proficiency bonus
- Saving throw modifiers
- Skill modifiers
- Passive Perception / Investigation / Insight
- Initiative
- Speed baseline (walking + parsed movement types where available)
- HP max baseline
- AC baseline
- Spell attack modifier / spell save DC
- Basic spellcasting basis (available, prep mode hints, slot table pending)

## 4. Data sources per value
- Ability scores: draft + `appliedRules.abilityScoreAdjustments`
- Proficiency bonus: class level
- Saves/skills/proficiencies: `appliedRules.proficiencies`
- Speed: species `speed` + species trait text
- HP: class hit die + CON mod + fixed-average progression assumption
- AC: equipped armor/shield from inventory + equipment catalog + armor profile parsing/mapping
- Spell stats: applied spellcasting availability + class/subclass spellcasting ability mapping/parsing

## 5. Partial / Pending / Manual handling
- No species selected -> speed pending
- Missing class hit die -> HP pending/manual
- Unresolvable armor profile -> AC partial with baseline fallback
- Spell slots/preparation tables -> table-pending notes/pending entries
- Unselected ability/skill/origin-feat choices -> pending entries

## 6. Explicit non-goals in this phase
- Full item/feature hook execution
- Complete AC/HP edge-case engine
- Exhaustive spell-slot table engine for all classes/subclasses
- Temporary/situational combat modifiers

## 7. Assumptions
- Single-class baseline is primary target.
- HP uses fixed-average mode above level 1.
- Expertise and temporary bonuses are not inferred unless explicitly materialized in applied rules.

## 8. Integration
- Central resolver: `src/services/data/derivedStatsResolver.ts`
- Adapter entrypoint: `getDerivedCharacterStats(draft, context?)`
- Character Sheet and Builder consume resolver output; no ad-hoc stat math in components.

