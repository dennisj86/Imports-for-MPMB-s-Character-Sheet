export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function sortByName<T extends { name: string }>(values: T[]): T[] {
  return [...values].sort((a, b) => a.name.localeCompare(b.name));
}
