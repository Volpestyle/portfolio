import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_ENV_FILES = ['scripts/chat-preprocess.env', '.env.local', '.env'];

export type LoadedEnvFile = {
  path: string;
  loaded: boolean;
};

type ParsedEntry = {
  key: string;
  value: string;
};

function parseLine(line: string): ParsedEntry | null {
  if (!line || line.trim().startsWith('#')) {
    return null;
  }

  const [rawKey, ...rest] = line.split('=');
  if (!rawKey || rest.length === 0) {
    return null;
  }

  const key = rawKey.trim();
  if (!key) {
    return null;
  }

  const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  return { key, value };
}

export function loadPreprocessEnv(customPaths?: string[]): LoadedEnvFile[] {
  const envFiles = customPaths?.length ? customPaths : DEFAULT_ENV_FILES;
  const loaded: LoadedEnvFile[] = [];

  for (const relativePath of envFiles) {
    const filePath = path.resolve(process.cwd(), relativePath);
    if (!fs.existsSync(filePath)) {
      loaded.push({ path: relativePath, loaded: false });
      continue;
    }

    const contents = fs.readFileSync(filePath, 'utf-8');
    for (const line of contents.split(/\r?\n/)) {
      const parsed = parseLine(line);
      if (!parsed) {
        continue;
      }

      if (process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }

    loaded.push({ path: relativePath, loaded: true });
  }

  return loaded;
}

export function requireEnv(key: string, errorMessage?: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(errorMessage ?? `${key} is required`);
  }
  return value;
}
