#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { PortfolioStack } from '../lib/portfolio-stack';
import { parseEnvFile } from '../scripts/env-parser';

const app = new App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? 'us-east-1';

if (region !== 'us-east-1') {
  throw new Error(
    "This stack uses Lambda@Edge and must be deployed in 'us-east-1'. Set CDK_DEFAULT_REGION=us-east-1 (or pass --profile configured for us-east-1)."
  );
}

const envFileFromCli = process.env.CDK_ENV_FILE;
const productionEnvFile = path.resolve(process.cwd(), '..', '..', '.env.production');
const defaultEnvFile = path.resolve(process.cwd(), '..', '..', '.env.cdk');
const envFileCandidates = [envFileFromCli, productionEnvFile, defaultEnvFile].filter(
  (p): p is string => typeof p === 'string' && p.length > 0
);
const envFileToUse = envFileCandidates.find((p) => fs.existsSync(p));
if (envFileToUse) {
  dotenv.config({ path: envFileToUse });
}

const inferredAppDirectory = path.resolve(process.cwd(), '..', '..');
const appDirectory = process.env.NEXT_APP_PATH ?? inferredAppDirectory;

const stringList = (value?: string) =>
  value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const collectLambdaEnv = (parsedFileEnv?: {
  envVars: Record<string, string>;
  repoVars: Record<string, string>;
}): Record<string, string> => {
  if (parsedFileEnv) {
    const combined: Record<string, string> = { ...parsedFileEnv.envVars, ...parsedFileEnv.repoVars };
    for (const key of Object.keys(combined)) {
      const override = process.env[key];
      if (typeof override === 'string' && override.length > 0) {
        combined[key] = override;
      } else if (combined[key] === undefined || combined[key] === null) {
        delete combined[key];
      }
    }
    for (const [key, value] of Object.entries(combined)) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        delete combined[key];
      } else {
        combined[key] = value.trim();
      }
    }
    return combined;
  }

  // When no env file is present, avoid dumping the entire runner env (PATH, GITHUB_*, etc.)
  // into the Lambda environment. Only keep keys we actually use at runtime.
  const allowedPrefixes = [
    'APP_',
    'NEXT_',
    'SECRETS_MANAGER_',
    'OPENAI_',
    'CHAT_',
    'GH_',
    'E2E_',
    'ADMIN_',
    'PORTFOLIO_',
    'UPSTASH_',
    'REVALIDATE_',
    'BLOG_',
  ];
  const allowedKeys = new Set([
    'NODE_ENV',
    'CDK_DEPLOY_ROLE_ARN',
    'PORTFOLIO_GIST_ID',
    'ADMIN_EMAILS',
    'REVALIDATE_SECRET',
  ]);

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== 'string' || value.length === 0) continue;
    const isAllowedPrefix = allowedPrefixes.some((prefix) => key.startsWith(prefix));
    if (isAllowedPrefix || allowedKeys.has(key)) {
      result[key] = value;
    }
  }
  return result;
};

const openNextPath = path.resolve(process.cwd(), '..', '..', '.open-next');
const inferredOpenNextPath = fs.existsSync(openNextPath) ? openNextPath : undefined;

const parsedEnvFile = envFileToUse ? parseEnvFile(envFileToUse) : undefined;
const lambdaEnvironment = collectLambdaEnv(
  parsedEnvFile ? { envVars: parsedEnvFile.envVars, repoVars: parsedEnvFile.repoVars } : undefined
);

new PortfolioStack(app, 'PortfolioStack', {
  env: {
    account,
    region: 'us-east-1',
  },
  domainName: process.env.APP_DOMAIN_NAME,
  hostedZoneDomain: process.env.APP_HOSTED_ZONE_DOMAIN,
  certificateArn: process.env.APP_CERTIFICATE_ARN,
  alternateDomainNames: stringList(process.env.APP_ALTERNATE_DOMAINS),
  appDirectory,
  openNextPath: inferredOpenNextPath,
  environment: lambdaEnvironment,
});
