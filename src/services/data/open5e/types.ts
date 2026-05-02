import type { MpmContentSnapshot, SourceDefinition } from "../../../domain/content";

export type Open5ePreset = "open5e-2014" | "open5e-2024" | "open5e-both";
export type Open5eEdition = "2014" | "2024" | "unknown";

export interface Open5eDocument {
  key: string;
  name: string;
  display_name?: string;
  type?: string;
  publisher?: {
    name?: string;
    key?: string;
  };
  gamesystem?: {
    name?: string;
    key?: string;
  };
  licenses?: Array<{
    name?: string;
    key?: string;
  }>;
  permalink?: string;
}

export interface Open5ePresetSelection {
  preset: Open5ePreset;
  documents2014: Open5eDocument[];
  documents2024: Open5eDocument[];
  selectedDocuments: Open5eDocument[];
  warnings: string[];
}

export interface Open5eImportMeta {
  importTimestamp: string;
  apiVersion: "v2";
  preset: Open5ePreset;
  selectedDocumentKeys: string[];
  selectedDocuments: Array<{
    key: string;
    name: string;
    edition: Open5eEdition;
    publisher?: string;
    licenseKeys: string[];
  }>;
}

export interface Open5eRawSnapshot {
  meta: Open5eImportMeta;
  documents: Open5eDocument[];
  classes: unknown[];
  species: unknown[];
  spells: unknown[];
  backgrounds: unknown[];
  feats: unknown[];
  items: unknown[];
  weapons: unknown[];
  armor: unknown[];
}

export interface Open5eNormalizedResult {
  snapshot: MpmContentSnapshot;
  importMeta: Open5eImportMeta;
  warnings: string[];
  skipped: string[];
}

export interface MergeResult {
  merged: MpmContentSnapshot;
  warnings: string[];
}

export interface Open5eManifest {
  importTimestamp: string;
  apiVersion: "v2";
  preset: Open5ePreset;
  selectedDocumentKeys: string[];
  counts: {
    raw: Record<string, number>;
    normalized: {
      sources: number;
      classes: number;
      subclasses: number;
      species: number;
      backgrounds: number;
      feats: number;
      spells: number;
      equipment: number;
    };
  };
  warnings: string[];
  skipped: string[];
}

export function toOpen5eSourceDefinition(document: Open5eDocument): SourceDefinition {
  const gamesystemKey = document.gamesystem?.key;
  const editionGroup = gamesystemKey === "5e-2024" ? "Open5e 2024" : gamesystemKey === "5e-2014" ? "Open5e 2014" : "Open5e";
  return {
    key: document.key,
    name: document.display_name?.trim() || document.name || document.key,
    abbreviation: document.key,
    group: editionGroup,
    url: document.permalink,
    defaultExcluded: false,
  };
}
