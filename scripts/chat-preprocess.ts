#!/usr/bin/env tsx

import { runPreprocessCli } from '@portfolio/chat-preprocess-cli';

runPreprocessCli().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
