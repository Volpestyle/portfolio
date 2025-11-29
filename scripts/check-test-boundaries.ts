import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['src', 'packages'];
const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  '.open-next',
  'dist',
  'generated',
  '.turbo',
  'playwright-report',
]);
const ALLOWLIST = ['packages/test-support', 'e2e'];

type Violation = { file: string; line: number; snippet: string };

const restrictedPatterns = [
  /from ['"]@portfolio\/test-support(?:\/[^'"]*)?['"]/,
  /require\(['"]@portfolio\/test-support(?:\/[^'"]*)?['"]\)/,
];

function isAllowed(filePath: string): boolean {
  return ALLOWLIST.some((allowed) => filePath.includes(allowed));
}

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function collectViolations(): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const root of SCAN_ROOTS) {
    const absRoot = path.join(ROOT, root);
    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(absRoot);
    } catch {
      continue;
    }
    if (!stats.isDirectory()) {
      continue;
    }
    const files = await walk(absRoot);
    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) {
        continue;
      }
      if (isAllowed(file)) {
        continue;
      }
      const content = await readFile(file, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        for (const pattern of restrictedPatterns) {
          if (pattern.test(line)) {
            violations.push({ file: path.relative(ROOT, file), line: idx + 1, snippet: line.trim() });
            break;
          }
        }
      });
    }
  }
  return violations;
}

async function main() {
  const violations = await collectViolations();
  if (violations.length === 0) {
    console.log('✅ No static imports from @portfolio/test-support in production code.');
    return;
  }

  console.error('🚫 Found forbidden imports of @portfolio/test-support:');
  for (const violation of violations) {
    console.error(` - ${violation.file}:${violation.line} :: ${violation.snippet}`);
  }
  process.exit(1);
}

void main();
