export const normalizeValue = (value?: string): string => (typeof value === 'string' ? value.trim().toLowerCase() : '');

export function normalizeList(values?: string[]): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((value) => normalizeValue(value)).filter((value) => value.length > 0);
}

export function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function includesText(source: string | undefined, needle?: string): boolean {
  if (!source || !needle) {
    return false;
  }
  return source.toLowerCase().includes(needle);
}

export function collectRawList(values?: string[]): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter((value) => value.length > 0);
}

export function createNormalizedValueSet(values?: string[]): Set<string> {
  return new Set(normalizeList(values));
}

export function matchesAnyNormalizedValue(sourceValues: Set<string>, needles: string[]): boolean {
  if (!needles.length) {
    return true;
  }
  if (!sourceValues.size) {
    return false;
  }
  return needles.some((needle) => sourceValues.has(needle));
}

const tokenize = (value: string): string[] =>
  normalizeValue(value)
    .split(/[^a-z0-9+]+/)
    .filter((part) => part.length > 0);

export function normalizedTagMatches(source: string, needle: string): boolean {
  const normalizedNeedle = normalizeValue(needle);
  if (!normalizedNeedle) {
    return false;
  }
  const normalizedSource = normalizeValue(source);
  if (normalizedSource === normalizedNeedle) {
    return true;
  }
  return tokenize(normalizedSource).includes(normalizedNeedle);
}

export function matchesAnyNormalizedTag(sourceValues: Set<string>, needles: string[]): boolean {
  if (!needles.length) {
    return true;
  }
  if (!sourceValues.size) {
    return false;
  }
  return needles.some((needle) => {
    for (const source of sourceValues) {
      if (normalizedTagMatches(source, needle)) {
        return true;
      }
    }
    return false;
  });
}
