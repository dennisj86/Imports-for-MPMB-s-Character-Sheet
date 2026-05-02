export interface BackgroundConversionRule {
  requiresOriginFeatIn2024?: boolean;
  defaultFeatNameIn2024?: string;
}

export const BACKGROUND_CONVERSION_RULES: Record<string, BackgroundConversionRule> = {
  acolyte: {
    defaultFeatNameIn2024: "Magic Initiate (Cleric)",
  },
  criminal: {
    defaultFeatNameIn2024: "Alert",
  },
  sage: {
    defaultFeatNameIn2024: "Magic Initiate (Wizard)",
  },
  soldier: {
    defaultFeatNameIn2024: "Savage Attacker",
  },
  outlander: {
    requiresOriginFeatIn2024: true,
  },
  "outlander-wanderer-custom": {
    defaultFeatNameIn2024: "Magic Initiate (Cleric)",
  },
};

