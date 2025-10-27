#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { PortfolioStack } from '../lib/portfolio-stack';

const app = new App();

const envFileFromCli = process.env.CDK_ENV_FILE;
const defaultEnvFile = path.resolve(process.cwd(), '..', '..', '.env.cdk');
const envFileToUse = envFileFromCli && fs.existsSync(envFileFromCli) ? envFileFromCli : defaultEnvFile;
if (fs.existsSync(envFileToUse)) {
  dotenv.config({ path: envFileToUse });
}

const inferredAppDirectory = path.resolve(process.cwd(), '..', '..');
const appDirectory = process.env.NEXT_APP_PATH ?? inferredAppDirectory;

const numberOrUndefined = (value?: string) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const stringList = (value?: string) =>
  value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const collectContainerEnv = () => {
  const prefixes = (process.env.APP_ENV_PREFIXES ?? 'NEXT_,OPENAI_,UPSTASH_,PORTFOLIO_,GH_,ACCESS_,SECRET_,REGION')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const explicitKeys = (process.env.APP_ENV_VARS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      result[key] = value;
    }
  }
  for (const key of explicitKeys) {
    const value = process.env[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
};

new PortfolioStack(app, 'PortfolioStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  domainName: process.env.APP_DOMAIN_NAME,
  hostedZoneDomain: process.env.APP_HOSTED_ZONE_DOMAIN,
  certificateArn: process.env.APP_CERTIFICATE_ARN,
  alternateDomainNames: stringList(process.env.APP_ALTERNATE_DOMAINS),
  desiredCount: numberOrUndefined(process.env.APP_DESIRED_COUNT),
  cpu: numberOrUndefined(process.env.APP_TASK_CPU),
  memoryMiB: numberOrUndefined(process.env.APP_TASK_MEMORY),
  containerEnvironment: collectContainerEnv(),
  appDirectory,
});
