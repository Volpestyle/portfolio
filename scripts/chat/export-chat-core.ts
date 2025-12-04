import fs from 'fs/promises';
import path from 'path';

/**
 * Export the core chat implementation files into a single markdown file.
 *
 * Usage:
 *   pnpm tsx scripts/chat/export-chat-core.ts [--out ./path/to/file.md] [--add relative/path.ts ...]
 *
 * - Files included by default are listed in CORE_CHAT_PATHS below.
 * - Use --add to append extra relative paths (relative to repo root).
 * - Output defaults to debug/chat-exports/chat-implementation-<timestamp>.md
 */

const CORE_CHAT_PATHS = [
  // Orchestrator
  'packages/chat-orchestrator/src/pipelinePrompts.ts',
  'packages/chat-orchestrator/src/pipelineTypes.ts',
  'packages/chat-orchestrator/src/index.ts',

  // API surface
  'src/app/api/chat/route.ts',

  // Data wiring
  'src/server/chat/dataProviders.ts',
  'src/server/chat/pipeline.ts',

  // Search services + semantic ranking
  'packages/chat-next-api/src/semanticRanking.ts',
  'packages/chat-next-api/src/experienceSemanticRanking.ts',
  'packages/chat-data/src/search/createSearcher.ts',
  'packages/chat-data/src/search/utils.ts',
  'packages/chat-data/src/search/projectSearcher.ts',
  'packages/chat-data/src/search/semantic.ts',
  'packages/chat-data/src/search/experienceSemantic.ts',

  // Shared contract + UI client
  'packages/chat-contract/src/index.ts',
  'packages/chat-next-ui/src/chatStreamParser.ts',
  'packages/chat-next-ui/src/chatUiState.ts',
  'packages/chat-next-ui/src/useChatStream.ts',
  'packages/chat-next-ui/src/ChatProvider.tsx',
];

const ROOT_DIR = path.resolve(process.cwd());

function toPosix(relPath: string): string {
  return relPath.split(path.sep).join('/');
}

function detectFence(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.ts') return 'ts';
  if (ext === '.tsx') return 'tsx';
  if (ext === '.md') return 'md';
  if (ext === '.json') return 'json';
  return '';
}

function parseArgs(argv: string[]): { outFile?: string; extraPaths: string[] } {
  const extraPaths: string[] = [];
  let outFile: string | undefined;

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg === '--out' && argv[idx + 1]) {
      outFile = argv[idx + 1];
      idx += 1;
    } else if (arg === '--add' && argv[idx + 1]) {
      extraPaths.push(argv[idx + 1]);
      idx += 1;
    }
  }

  return { outFile, extraPaths };
}

async function main() {
  const { outFile, extraPaths } = parseArgs(process.argv.slice(2));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultOutput = path.join(ROOT_DIR, 'debug', 'chat-exports', `chat-implementation-${timestamp}.md`);
  const outputPath = outFile ? path.resolve(ROOT_DIR, outFile) : defaultOutput;

  const combinedPaths = Array.from(new Set([...CORE_CHAT_PATHS, ...extraPaths]));
  const resolvedPaths = combinedPaths.map((rel) => ({
    rel: toPosix(rel.replace(/^\.\//, '')),
    abs: path.resolve(ROOT_DIR, rel),
  }));

  const sections: string[] = [];
  const included: string[] = [];
  const missing: string[] = [];

  for (const entry of resolvedPaths) {
    try {
      const content = await fs.readFile(entry.abs, 'utf8');
      included.push(entry.rel);
      const fence = detectFence(entry.rel);
      const trimmed = content.trimEnd();
      sections.push(['## ' + entry.rel, '```' + fence, trimmed, '```'].join('\n'));
    } catch (error) {
      missing.push(entry.rel);
      console.warn(`Skipped missing/unreadable file: ${entry.rel} (${String(error)})`);
    }
  }

  const headerLines = [
    '# Chat implementation export',
    `Generated: ${new Date().toISOString()}`,
    `Output file: ${toPosix(path.relative(ROOT_DIR, outputPath))}`,
    '',
    'Included files:',
    ...included.map((rel) => `- ${rel}`),
  ];

  if (missing.length) {
    headerLines.push('', 'Skipped (missing/unreadable):', ...missing.map((rel) => `- ${rel}`));
  }

  const output = [...headerLines, '', ...sections].join('\n');

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, output, 'utf8');

  console.log(`Exported ${included.length} file(s) to ${outputPath}`);
  if (missing.length) {
    console.log(`Skipped ${missing.length} file(s).`);
  }
}

main().catch((error) => {
  console.error('Failed to export chat implementation code.', error);
  process.exit(1);
});
