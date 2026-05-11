import type { RuleMapping } from "./ruleMappingTypes";
import { FEATURE_RULE_MAPPINGS } from "./mappings/featureMappings";
import { FEAT_RULE_MAPPINGS } from "./mappings/featMappings";
import { ITEM_RULE_MAPPINGS } from "./mappings/itemMappings";
import { SPELL_RULE_MAPPINGS } from "./mappings/spellMappings";

export const RULE_MAPPINGS: RuleMapping[] = [
  ...FEATURE_RULE_MAPPINGS,
  ...FEAT_RULE_MAPPINGS,
  ...ITEM_RULE_MAPPINGS,
  ...SPELL_RULE_MAPPINGS,
].sort((left, right) => left.id.localeCompare(right.id));
