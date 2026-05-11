import type { SourceDefinition } from "../../domain/content";

export type SourceProvider = "open5e" | "mpmb";
export type SourceProviderSelection = SourceProvider | "all";

function isOpen5eKey(sourceKey: string): boolean {
  const key = sourceKey.toLowerCase();
  return key.startsWith("open5e") || key.startsWith("srd-2014") || key.startsWith("srd-2024");
}

export function resolveSourceProvider(source: Pick<SourceDefinition, "key" | "group">): SourceProvider {
  const group = (source.group ?? "").toLowerCase();
  if (group.startsWith("open5e") || isOpen5eKey(source.key)) {
    return "open5e";
  }
  return "mpmb";
}

export function sourceMatchesProvider(
  source: Pick<SourceDefinition, "key" | "group">,
  provider: SourceProviderSelection,
): boolean {
  if (provider === "all") {
    return true;
  }
  return resolveSourceProvider(source) === provider;
}

export function sourceKeysForProvider(
  sources: Array<Pick<SourceDefinition, "key" | "group">>,
  provider: SourceProviderSelection,
): string[] {
  return sources.filter((source) => sourceMatchesProvider(source, provider)).map((source) => source.key);
}
