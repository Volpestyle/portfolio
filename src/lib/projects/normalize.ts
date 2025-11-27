export function normalizeProjectKey(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}
