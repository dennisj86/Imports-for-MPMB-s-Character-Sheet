export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildId(prefix: string, rawKey: string): string {
  return `${prefix}:${toSlug(rawKey)}`;
}
