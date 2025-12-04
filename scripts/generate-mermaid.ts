#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

type Resolution = 'low' | 'medium' | 'high';

const RESOLUTION_SCALES: Record<Resolution, number> = {
  low: 0.8,
  medium: 1,
  high: 2,
};

const MERMAID_PACKAGE = '@mermaid-js/mermaid-cli@10.9.1';
const DIAGRAM_DIR = path.resolve(process.cwd(), 'generated-diagrams');

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listMermaidFiles(): Promise<string[]> {
  const entries = await fs.readdir(DIAGRAM_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mmd'))
    .map((entry) => path.join(DIAGRAM_DIR, entry.name));
}

function parseResolution(argv: string[]): Resolution {
  let value: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--resolution' || arg === '-r') {
      value = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--resolution=')) {
      value = arg.split('=')[1];
      continue;
    }
  }

  const normalized = (value ?? 'medium').toLowerCase() as Resolution;
  if (!Object.hasOwn(RESOLUTION_SCALES, normalized)) {
    throw new Error(`Invalid resolution "${value}". Use one of: ${Object.keys(RESOLUTION_SCALES).join(', ')}.`);
  }
  return normalized;
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function main() {
  if (!(await fileExists(DIAGRAM_DIR))) {
    throw new Error(`Diagram directory not found: ${DIAGRAM_DIR}`);
  }

  const mmdFiles = await listMermaidFiles();
  if (mmdFiles.length === 0) {
    console.log('No Mermaid .mmd files found in generated-diagrams/. Nothing to render.');
    return;
  }

  const resolution = parseResolution(process.argv.slice(2));
  const scale = RESOLUTION_SCALES[resolution];
  const localMmdc = path.join(process.cwd(), 'node_modules', '.bin', 'mmdc');
  const useLocal = await fileExists(localMmdc);
  const command = useLocal ? localMmdc : 'pnpm';
  const baseArgs = useLocal ? [] : ['dlx', MERMAID_PACKAGE];

  console.log(`Rendering ${mmdFiles.length} Mermaid diagrams at "${resolution}" resolution (scale=${scale}).`);
  console.log(`Renderer: ${useLocal ? localMmdc : `pnpm dlx ${MERMAID_PACKAGE}`}`);

  for (const inputPath of mmdFiles) {
    const outputPath = inputPath.replace(/\.mmd$/, '.png');
    const args = [...baseArgs, '-i', inputPath, '-o', outputPath, '--scale', String(scale), '--quiet'];

    console.log(`• ${path.basename(inputPath)} → ${path.basename(outputPath)}`);
    await run(command, args);
  }

  console.log('Done.');
}

main().catch((error) => {
  console.error('[generate-mermaid] Failed:', error?.message ?? error);
  process.exit(1);
});
