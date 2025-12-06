#!/usr/bin/env tsx

/**
 * Refresh Eval Fixtures
 *
 * Copies current generated/ files to tests/chat-evals/fixtures/
 * Run this when you intentionally want to update the eval baseline
 * to reflect new portfolio content.
 *
 * Usage: pnpm chat:evals:refresh-fixtures
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const GENERATED_DIR = resolve(process.cwd(), 'generated');
const FIXTURES_DIR = resolve(process.cwd(), 'tests/chat-evals/fixtures');

const FILES_TO_COPY = [
  'projects.json',
  'projects-embeddings.json',
  'resume.json',
  'resume-embeddings.json',
  'persona.json',
  'profile.json',
];

function main() {
  console.log('Refreshing eval fixtures from generated/ ...\n');

  // Ensure fixtures directory exists
  mkdirSync(FIXTURES_DIR, { recursive: true });

  for (const file of FILES_TO_COPY) {
    const src = join(GENERATED_DIR, file);
    const dest = join(FIXTURES_DIR, file);

    try {
      copyFileSync(src, dest);
      console.log(`  Copied: ${file}`);
    } catch (error) {
      console.error(`  Failed to copy ${file}:`, error);
      process.exit(1);
    }
  }

  console.log('\nEval fixtures updated successfully.');
  console.log('Remember to update golden responses in your eval test cases if needed.');
}

main();
