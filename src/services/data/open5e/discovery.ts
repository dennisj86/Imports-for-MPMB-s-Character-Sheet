import type { Open5eDocument, Open5eEdition, Open5ePreset, Open5ePresetSelection } from "./types";
import { Open5eClient } from "./client";

const preferredDocumentKeysByEdition: Record<Exclude<Open5eEdition, "unknown">, string[]> = {
  "2014": ["srd-2014", "open5e"],
  "2024": ["srd-2024", "open5e-2024"],
};

export function inferEditionFromDocument(document: Pick<Open5eDocument, "key" | "gamesystem">): Open5eEdition {
  const gsKey = document.gamesystem?.key?.toLowerCase();
  if (gsKey === "5e-2014") {
    return "2014";
  }
  if (gsKey === "5e-2024") {
    return "2024";
  }
  if (document.key.includes("2024")) {
    return "2024";
  }
  if (document.key.includes("2014") || document.key.startsWith("srd")) {
    return "2014";
  }
  return "unknown";
}

function pickPreferredDocuments(documents: Open5eDocument[], edition: Exclude<Open5eEdition, "unknown">): Open5eDocument[] {
  const sourceDocuments = documents.filter((document) => (document.type ?? "SOURCE").toUpperCase() === "SOURCE");
  const preferredKeys = preferredDocumentKeysByEdition[edition];
  const preferredMatches = sourceDocuments.filter((document) => preferredKeys.includes(document.key));
  if (preferredMatches.length > 0) {
    return preferredMatches;
  }
  return sourceDocuments;
}

export async function discoverDocuments(client = new Open5eClient()): Promise<Open5eDocument[]> {
  const { entries } = await client.fetchAllPages<Open5eDocument>("documents", {
    fields: "key,name,display_name,type,publisher,gamesystem,licenses,permalink",
    ordering: "key",
  });
  return entries;
}

export function buildPresetSelection(documents: Open5eDocument[], preset: Open5ePreset): Open5ePresetSelection {
  const warnings: string[] = [];
  const docs2014 = documents.filter((document) => inferEditionFromDocument(document) === "2014");
  const docs2024 = documents.filter((document) => inferEditionFromDocument(document) === "2024");
  const preferred2014 = pickPreferredDocuments(docs2014, "2014");
  const preferred2024 = pickPreferredDocuments(docs2024, "2024");

  const selectedDocuments =
    preset === "open5e-2014" ? preferred2014 : preset === "open5e-2024" ? preferred2024 : [...preferred2014, ...preferred2024];

  if (selectedDocuments.length === 0) {
    warnings.push(`No documents discovered for preset ${preset}.`);
  }

  for (const edition of ["2014", "2024"] as const) {
    const available = edition === "2014" ? docs2014 : docs2024;
    const selected = edition === "2014" ? preferred2014 : preferred2024;
    if (available.length > 0 && selected.length === 0) {
      warnings.push(`No source documents selected for edition ${edition} although documents exist in discovery.`);
    }
  }

  return {
    preset,
    documents2014: preferred2014,
    documents2024: preferred2024,
    selectedDocuments,
    warnings,
  };
}
