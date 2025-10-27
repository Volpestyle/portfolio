#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { PortfolioStack } from '../lib/portfolio-stack';

const app = new App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? 'us-east-1';

if (region !== 'us-east-1') {
  throw new Error(
    "This stack uses Lambda@Edge and must be deployed in 'us-east-1'. Set CDK_DEFAULT_REGION=us-east-1 (or pass --profile configured for us-east-1)."
  );
}

const envFileFromCli = process.env.CDK_ENV_FILE;
const defaultEnvFile = path.resolve(process.cwd(), '..', '..', '.env.cdk');
const envFileToUse = envFileFromCli && fs.existsSync(envFileFromCli) ? envFileFromCli : defaultEnvFile;
if (fs.existsSync(envFileToUse)) {
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

const collectLambdaEnv = () => {
  const prefixes = (
    process.env.APP_ENV_PREFIXES ??
    'NEXT_,UPSTASH_,PORTFOLIO_,GH_,SECRETS_,AWS_ENV_,AWS_REPO_,AWS_SECRETS_,AWS_REGION'
  )
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const explicitKeys = (process.env.APP_ENV_VARS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const blockedKeys = (
    process.env.APP_ENV_BLOCKLIST ??
    'OPENAI_API_KEY,AWS_SECRET_ACCESS_KEY,AWS_ACCESS_KEY_ID,GH_TOKEN,UPSTASH_REDIS_REST_TOKEN'
  )
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

  for (const key of blockedKeys) {
    delete result[key];
  }

  return result;
};

const openNextPath = path.resolve(process.cwd(), '..', '..', '.open-next');
const inferredOpenNextPath = fs.existsSync(openNextPath) ? openNextPath : undefined;

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
  environment: collectLambdaEnv(),
});
