import type { RulesMode } from "../../domain/content";

export const MPMB_CORE_VARIABLE_LOAD_ORDER = [
  "Lists.js",
  "ListsSources.js",
  "ListsClasses.js",
  "ListsRaces.js",
  "ListsBackgrounds.js",
  "ListsFeats.js",
  "ListsSpells.js",
  "ListsGear.js",
  "ListsMagicItems.js",
  "ListsCompanions.js",
  "ListsCreatures.js",
  "ListsPsionics.js",
] as const;

export const MPMB_CORE_FUNCTION_LOAD_ORDER = [
  "Startup.js",
  "DomParser.js",
  "Functions0.js",
  "Functions1.js",
  "Functions2.js",
  "Functions3.js",
  "FunctionsImport.js",
  "FunctionsResources.js",
  "FunctionsSpells.js",
  "AbilityScores.js",
  "AbilityScores_old.js",
  "ClassSelection.js",
  "Shutdown.js",
] as const;

export interface MpmbRuntimeRepositoryPaths {
  rulesMode: RulesMode;
  scriptRepoRoot: string;
  variablesDir: string;
  functionsDir: string;
  additionalContentDir: string;
  wotcMaterialDir: string;
  wotc2024Dir: string;
  localHomebrewDir: string;
}

export interface MpmbRuntimeLoadPlanStage {
  id: "core-variables" | "core-functions" | "core-additional-content" | "wotc-overlays" | "local-overlays";
  description: string;
  paths: string[];
}

export interface MpmbRuntimeLoadPlan {
  rulesMode: RulesMode;
  coreImportPreset: "mpmb-upstream-2014" | "mpmb-upstream-2024";
  repositoryPaths: MpmbRuntimeRepositoryPaths;
  stages: MpmbRuntimeLoadPlanStage[];
}

const SCRIPT_REPO_ROOT_BY_MODE: Record<RulesMode, string> = {
  "2014": "docs/Sheet skripte",
  "2024": "docs/Sheet skripte 2024",
};

export function getCoreImportPresetForRulesMode(
  rulesMode: RulesMode,
): "mpmb-upstream-2014" | "mpmb-upstream-2024" {
  return rulesMode === "2014" ? "mpmb-upstream-2014" : "mpmb-upstream-2024";
}

export function getMpmbRuntimeRepositoryPaths(rulesMode: RulesMode): MpmbRuntimeRepositoryPaths {
  const scriptRepoRoot = SCRIPT_REPO_ROOT_BY_MODE[rulesMode];
  return {
    rulesMode,
    scriptRepoRoot,
    variablesDir: `${scriptRepoRoot}/_variables`,
    functionsDir: `${scriptRepoRoot}/_functions`,
    additionalContentDir: `${scriptRepoRoot}/additional content`,
    wotcMaterialDir: "WotC material",
    wotc2024Dir: "WotC 2024",
    localHomebrewDir: "Homebrew",
  };
}

export function buildMpmbRuntimeLoadPlan(rulesMode: RulesMode): MpmbRuntimeLoadPlan {
  const paths = getMpmbRuntimeRepositoryPaths(rulesMode);
  const coreImportPreset = getCoreImportPresetForRulesMode(rulesMode);
  const wotcOverlayOrder =
    rulesMode === "2024"
      ? [paths.wotc2024Dir, paths.wotcMaterialDir]
      : [paths.wotcMaterialDir, paths.wotc2024Dir];

  return {
    rulesMode,
    coreImportPreset,
    repositoryPaths: paths,
    stages: [
      {
        id: "core-variables",
        description: "Load MPMB core registries from the copied script repository",
        paths: MPMB_CORE_VARIABLE_LOAD_ORDER.map((file) => `${paths.variablesDir}/${file}`),
      },
      {
        id: "core-functions",
        description: "Load MPMB helper/runtime functions required by additional scripts",
        paths: MPMB_CORE_FUNCTION_LOAD_ORDER.map((file) => `${paths.functionsDir}/${file}`),
      },
      {
        id: "core-additional-content",
        description: "Load optional additional content from the copied script repository",
        paths: [`${paths.additionalContentDir}/**/*.js`],
      },
      {
        id: "wotc-overlays",
        description: "Apply WotC overlays after core registries",
        paths: wotcOverlayOrder.map((dir) => `${dir}/*.js`),
      },
      {
        id: "local-overlays",
        description: "Apply local homebrew/project-specific overlays last",
        paths: [`${paths.localHomebrewDir}/*.js`],
      },
    ],
  };
}
