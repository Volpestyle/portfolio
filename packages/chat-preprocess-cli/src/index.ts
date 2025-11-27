#!/usr/bin/env node
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { DEFAULT_ENV_FILES, loadPreprocessEnv } from './env';
import {
  coerceEnvFileList,
  loadConfigFile,
  mergeConfigs,
  resolvePreprocessConfig,
} from './config';
import type {
  ChatPreprocessConfig,
  CliTask,
  PreprocessContext,
  PreprocessPaths,
  PreprocessTaskResult,
} from './types';
import { runProjectKnowledgeTask } from './tasks/project-knowledge';
import { runResumePdfTask } from './tasks/resume-pdf';
import { runResumeTask } from './tasks/resume';
import { runExperienceEmbeddingsTask } from './tasks/experience-embeddings';
import { runProfileTask } from './tasks/profile';
import { runPersonaTask } from './tasks/persona';
import { buildArtifactWriters } from './artifacts';
import { createArtifactManager } from './artifacts/manager';
import { PreprocessMetrics } from './metrics';

const FAIL_PREFIX = '\u274c';
const OK_PREFIX = '\u2705';
const INFO_PREFIX = '\ud83d\udd0d';

type ParsedCliArgs = {
  configPath?: string;
  envFiles?: string[];
};

const DEFAULT_CONFIG_PATHS = [
  'chat-preprocess.config.yml',
  'chat-preprocess.config.yaml',
  'chat-preprocess.config.json',
  'chat-preprocess.config.js',
  'chat-preprocess.config.cjs',
  'chat-preprocess.config.mjs',
];

function findDefaultConfigPath(): string | undefined {
  const cwd = process.cwd();
  for (const candidate of DEFAULT_CONFIG_PATHS) {
    const absolute = path.resolve(cwd, candidate);
    if (fs.existsSync(absolute)) {
      return absolute;
    }
  }
  return undefined;
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      config: { type: 'string' },
      env: { type: 'string', multiple: true },
    },
  });

  return {
    configPath: values.config,
    envFiles: values.env ? (Array.isArray(values.env) ? values.env : [values.env]) : undefined,
  };
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs.toFixed(0)}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

type TaskSummary = {
  label: string;
  durationMs: number;
  result: PreprocessTaskResult;
};

export type RunPreprocessCliOptions = {
  argv?: string[];
  config?: ChatPreprocessConfig;
};

function buildTaskList(): CliTask[] {
  return [
    { name: 'project-knowledge', label: 'Project knowledge (repos → embeddings)', run: runProjectKnowledgeTask },
    { name: 'resume-pdf', label: 'Resume ingestion (PDF → raw JSON)', run: runResumePdfTask },
    { name: 'resume', label: 'Resume parser (structured experiences)', run: runResumeTask },
    { name: 'resume-embeddings', label: 'Resume embeddings (LLM vectors)', run: runExperienceEmbeddingsTask },
    { name: 'profile', label: 'Profile builder (bio & featured experiences)', run: runProfileTask },
    { name: 'persona', label: 'Persona builder (profile + resume → persona summary)', run: runPersonaTask },
  ];
}

async function resetGeneratedDir(paths: PreprocessPaths): Promise<void> {
  const rootDir = path.resolve(paths.rootDir);
  const generatedDir = path.resolve(paths.generatedDir);
  const relative = path.relative(rootDir, generatedDir);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Refusing to reset generated directory outside root (${generatedDir}). Check paths.rootDir/generatedDir.`
    );
  }

  console.log(`${INFO_PREFIX} Resetting generated directory at ${relative}`);
  await fsPromises.rm(generatedDir, { recursive: true, force: true });
  await fsPromises.mkdir(generatedDir, { recursive: true });
}

export async function runPreprocessCli(options?: RunPreprocessCliOptions): Promise<void> {
  const argv = options?.argv ?? process.argv.slice(2);
  const cliArgs = parseCliArgs(argv);
  const configPath = cliArgs.configPath ?? findDefaultConfigPath();
  const fileConfig = configPath ? await loadConfigFile(configPath) : undefined;
  const mergedConfig = mergeConfigs([fileConfig, options?.config]);
  const envFileOverride = coerceEnvFileList(cliArgs.envFiles, mergedConfig.envFiles);
  const envFiles = envFileOverride ?? mergedConfig.envFiles ?? DEFAULT_ENV_FILES;
  mergedConfig.envFiles = envFiles;

  const loadedEnv = loadPreprocessEnv(envFiles);
  const loadedList = loadedEnv
    .filter((entry) => entry.loaded)
    .map((entry) => entry.path)
    .join(', ');
  if (loadedList) {
    console.log(`${INFO_PREFIX} Loaded env files: ${loadedList}`);
  } else {
    console.log(`${INFO_PREFIX} No preprocess-specific env files found (falling back to process env)`);
  }

  const resolvedConfig = resolvePreprocessConfig(mergedConfig);
  await resetGeneratedDir(resolvedConfig.paths);

  if (resolvedConfig.repos.gistId) {
    process.env.PORTFOLIO_GIST_ID = resolvedConfig.repos.gistId;
  }

  const writers = buildArtifactWriters(resolvedConfig.artifacts.writerConfigs);
  const artifactManager = createArtifactManager({
    writers,
    rootDir: resolvedConfig.paths.rootDir,
  });
  const metrics = new PreprocessMetrics({
    outputDir: path.join(resolvedConfig.paths.generatedDir, 'metrics'),
    ownerId: process.env.CHAT_OWNER_ID || 'portfolio-owner',
  });

  const context: PreprocessContext = {
    config: resolvedConfig,
    paths: resolvedConfig.paths,
    models: resolvedConfig.models,
    envFiles: loadedEnv,
    repoSelection: resolvedConfig.repos,
    artifacts: artifactManager,
    metrics,
  };

  const tasks = buildTaskList();
  const summaries: TaskSummary[] = [];

  const requestedTasksEnv = process.env.CHAT_PREPROCESS_TASKS ?? process.env.CHAT_PREPROCESS_TASK;
  const requestedTasks = requestedTasksEnv
    ? requestedTasksEnv
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : null;
  const tasksToRun =
    requestedTasks && requestedTasks.length
      ? tasks.filter((task) => requestedTasks.includes(task.name))
      : tasks;

  if (requestedTasks && requestedTasks.length && !tasksToRun.length) {
    throw new Error(`No preprocess tasks matched ${requestedTasks.join(', ')}`);
  }

  let metricsPath: string | null = null;
  try {
    for (const task of tasksToRun) {
      console.log(`\n${INFO_PREFIX} ${task.label}`);
      const start = performance.now();
      try {
        const result = await task.run(context);
        const durationMs = performance.now() - start;
        summaries.push({ label: task.label, durationMs, result });
        console.log(`${OK_PREFIX} Completed in ${formatDuration(durationMs)}`);
        if (result.description) {
          console.log(`   ${result.description}`);
        }
        for (const count of result.counts ?? []) {
          console.log(`   • ${count.label}: ${count.value}`);
        }
        for (const artifact of result.artifacts ?? []) {
          const note = artifact.note ? ` (${artifact.note})` : '';
          console.log(`   • wrote ${artifact.path}${note}`);
        }
      } catch (error) {
        console.error(`${FAIL_PREFIX} ${task.label} failed`);
        console.error(error);
        throw error;
      }
    }
  } finally {
    try {
      const { filePath } = await metrics.flush();
      metricsPath = path.relative(resolvedConfig.paths.rootDir, filePath);
    } catch (error) {
      console.warn('[metrics] Failed to write preprocess metrics', error);
    }
  }

  console.log('\nSummary');
  for (const summary of summaries) {
    const stat = summary.result.counts?.map((c) => `${c.label}: ${c.value}`).join(', ');
    const extra = stat ? ` – ${stat}` : '';
    console.log(` - ${summary.label}: ${formatDuration(summary.durationMs)}${extra}`);
  }
  if (metricsPath) {
    metrics.printSummary(metricsPath);
  }
}

export type { ChatPreprocessConfig, PreprocessContext, PreprocessTaskResult } from './types';
export { loadConfigFile, resolvePreprocessConfig };
