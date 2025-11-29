const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((token) => token.length > 0);

export function tokenizeWeighted(strings: Array<{ value?: string | string[]; weight?: number }>): string[] {
  const tokens: string[] = [];
  for (const { value, weight = 1 } of strings) {
    if (!value) continue;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      const reps = Math.max(1, Math.floor(weight));
      for (let i = 0; i < reps; i += 1) {
        tokens.push(...tokenize(item));
      }
    }
  }
  return tokens;
}
