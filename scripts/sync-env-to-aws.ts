#!/usr/bin/env tsx

import { resolve } from 'path';
import {
  SecretsManagerClient,
  CreateSecretCommand,
  PutSecretValueCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import { parseEnvFile, ParsedEnv } from '../infra/cdk/scripts/env-parser';
import {
  log,
  firstNonEmpty,
  deriveSecretIds,
  resolveOwnerRepo,
} from './shared';

// using shared utilities for repo detection and secret id derivation

interface Config {
  envFile: string;
  environment: string;
  region: string;
  envSecretName: string;
  repoSecretName: string;
}

async function secretExists(client: SecretsManagerClient, secretId: string): Promise<boolean> {
  try {
    await client.send(new DescribeSecretCommand({ SecretId: secretId }));
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

async function createOrUpdateSecret(options: {
  client: SecretsManagerClient;
  secretId: string;
  value: Record<string, string>;
  description: string;
}) {
  const { client, secretId, value, description } = options;
  const secretString = JSON.stringify(value, null, 2);

  const exists = await secretExists(client, secretId);

  if (!exists) {
    log.info(`Creating secret '${secretId}'`);
    await client.send(
      new CreateSecretCommand({
        Name: secretId,
        Description: description,
        SecretString: secretString,
      })
    );
    log.success(`Created secret: ${secretId}`);
  } else {
    await client.send(
      new PutSecretValueCommand({
        SecretId: secretId,
        SecretString: secretString,
      })
    );
    log.success(`Updated secret: ${secretId}`);
  }
}

function resolveAwsConfig(options: {
  environment: string;
  region?: string;
  envSecretName?: string;
  repoSecretName?: string;
}) {
  const { environment, region, envSecretName, repoSecretName } = options;
  const normalizedEnvSecret = envSecretName?.trim();
  const normalizedRepoSecret = repoSecretName?.trim();

  if (!region?.trim()) {
    log.error('Missing AWS region. Add AWS_REGION to your .env file or export it before running.');
    process.exit(1);
  }

  if (!normalizedEnvSecret) {
    log.error(
      `Missing Secrets Manager environment secret id. Add SECRETS_MANAGER_ENV_SECRET_ID to ${environment}'s .env file or pass --env-secret=...`
    );
    process.exit(1);
  }

  if (!normalizedRepoSecret) {
    log.error(
      'Missing Secrets Manager repository secret id. Add SECRETS_MANAGER_REPO_SECRET_ID to your .env file or pass --repo-secret=...'
    );
    process.exit(1);
  }

  return {
    region: region.trim(),
    envSecretName: normalizedEnvSecret,
    repoSecretName: normalizedRepoSecret,
  };
}

function logSecretKeys(title: string, secrets: Record<string, string>) {
  const keys = Object.keys(secrets);
  if (keys.length === 0) {
    return;
  }

  log.detail(`${title}:`);
  for (const key of keys) {
    log.detail(`  - ${key}`);
  }
}

async function syncSecrets(config: Config, parsed: ParsedEnv) {
  log.section(`🔑 Syncing secrets to AWS Secrets Manager (${config.environment})`);

  const client = new SecretsManagerClient({ region: config.region });

  const envSecretKeys = Object.keys(parsed.envSecrets);
  const repoSecretKeys = Object.keys(parsed.repoSecrets);

  if (envSecretKeys.length === 0 && repoSecretKeys.length === 0) {
    log.warn('No secrets found in the provided .env file. Nothing to sync.');
    return;
  }

  if (envSecretKeys.length > 0) {
    log.section(`🌍 Environment secrets → ${config.envSecretName}`);
    logSecretKeys('Keys', parsed.envSecrets);

    await createOrUpdateSecret({
      client,
      secretId: config.envSecretName,
      value: parsed.envSecrets,
      description: `Environment secrets for ${config.environment}`,
    });
  } else {
    log.info('No environment secrets to sync');
  }

  if (repoSecretKeys.length > 0) {
    log.section(`📦 Repository secrets → ${config.repoSecretName}`);
    logSecretKeys('Keys', parsed.repoSecrets);

    await createOrUpdateSecret({
      client,
      secretId: config.repoSecretName,
      value: parsed.repoSecrets,
      description: 'Repository-level secrets',
    });
  } else {
    log.info('No repository secrets to sync');
  }

  log.section('✨ AWS Secrets Manager sync completed successfully!');
}

const main = async () => {
  const args = process.argv.slice(2);
  const envFileArg = args.find((arg) => arg.startsWith('--env='));
  const environmentArg = args.find((arg) => arg.startsWith('--environment='));
  const secretPrefixArg = args.find((arg) => arg.startsWith('--secret-prefix='));
  const envSecretArg = args.find((arg) => arg.startsWith('--env-secret='));
  const repoSecretArg = args.find((arg) => arg.startsWith('--repo-secret='));

  if (!envFileArg || !environmentArg) {
    log.error('Usage: tsx sync-env-to-aws.ts --env=.env.production --environment=production');
    process.exit(1);
  }

  if (secretPrefixArg) {
    log.warn('--secret-prefix is no longer supported; define explicit Secrets Manager ids instead.');
  }

  const envFile = envFileArg.split('=')[1];
  const environment = environmentArg.split('=')[1];
  const envFilePath = resolve(process.cwd(), envFile);

  let parsedEnv: ParsedEnv;

  try {
    parsedEnv = parseEnvFile(envFilePath);
  } catch (error) {
    log.error(`Unable to read ${envFile}: ${(error as Error).message}`);
    process.exit(1);
  }

  const envSecretNameOverride = envSecretArg ? envSecretArg.split('=')[1] : undefined;
  const repoSecretNameOverride = repoSecretArg ? repoSecretArg.split('=')[1] : undefined;

  const derivedRegion =
    parsedEnv.repoVars.AWS_REGION ??
    parsedEnv.envVars.AWS_REGION ??
    parsedEnv.repoSecrets.AWS_REGION ??
    parsedEnv.envSecrets.AWS_REGION ??
    process.env.AWS_REGION;

  const repoNameCandidate = firstNonEmpty(
    parsedEnv.repoVars.GH_REPO,
    parsedEnv.envVars.GH_REPO,
    parsedEnv.repoSecrets.GH_REPO,
    parsedEnv.envSecrets.GH_REPO
  );

  let detectedRepo = repoNameCandidate;
  if (!detectedRepo) {
    const detected = resolveOwnerRepo({
      envVars: parsedEnv.envVars,
      envSecrets: parsedEnv.envSecrets,
      repoVars: parsedEnv.repoVars,
      repoSecrets: parsedEnv.repoSecrets,
    });
    if (detected.repo) {
      detectedRepo = detected.repo;
      const repoDisplay = detected.owner ? `${detected.owner}/${detected.repo}` : detected.repo;
      log.info(`Using repository: ${repoDisplay}`);
    }
  }

  const existingEnvSecret = firstNonEmpty(
    envSecretNameOverride,
    parsedEnv.envVars.SECRETS_MANAGER_ENV_SECRET_ID,
    parsedEnv.repoVars.SECRETS_MANAGER_ENV_SECRET_ID,
    parsedEnv.envSecrets.SECRETS_MANAGER_ENV_SECRET_ID,
    parsedEnv.repoSecrets.SECRETS_MANAGER_ENV_SECRET_ID
  );

  const existingRepoSecret = firstNonEmpty(
    repoSecretNameOverride,
    parsedEnv.envVars.SECRETS_MANAGER_REPO_SECRET_ID,
    parsedEnv.repoVars.SECRETS_MANAGER_REPO_SECRET_ID,
    parsedEnv.envSecrets.SECRETS_MANAGER_REPO_SECRET_ID,
    parsedEnv.repoSecrets.SECRETS_MANAGER_REPO_SECRET_ID
  );

  let envSecretName = existingEnvSecret;
  let repoSecretName = existingRepoSecret;

  if ((!envSecretName || !repoSecretName) && !detectedRepo) {
    log.error(
      'Unable to derive Secrets Manager ids. Provide --env-secret/--repo-secret or ensure GH_REPO (and optionally GH_OWNER) are set.'
    );
    process.exit(1);
  }

  if (detectedRepo) {
    const derivedSecrets = deriveSecretIds(detectedRepo, environment);
    if (!envSecretName) {
      envSecretName = derivedSecrets.envSecretId;
      log.info(`Derived SECRETS_MANAGER_ENV_SECRET_ID=${envSecretName}`);
    }
    if (!repoSecretName) {
      repoSecretName = derivedSecrets.repoSecretId;
      log.info(`Derived SECRETS_MANAGER_REPO_SECRET_ID=${repoSecretName}`);
    }
  }

  const awsConfig = resolveAwsConfig({
    environment,
    region: derivedRegion,
    envSecretName,
    repoSecretName,
  });

  parsedEnv.envVars.SECRETS_MANAGER_ENV_SECRET_ID = awsConfig.envSecretName;
  parsedEnv.repoVars.SECRETS_MANAGER_REPO_SECRET_ID = awsConfig.repoSecretName;

  const config: Config = {
    envFile,
    environment,
    region: awsConfig.region,
    envSecretName: awsConfig.envSecretName,
    repoSecretName: awsConfig.repoSecretName,
  };

  log.info(`Parsed ${envFile}:`);
  log.detail(`  ENV SECRETS: ${Object.keys(parsedEnv.envSecrets).length}`);
  log.detail(`  REPO SECRETS: ${Object.keys(parsedEnv.repoSecrets).length}`);
  log.detail(`  AWS REGION: ${config.region}`);
  log.detail(`  ENV SECRET NAME: ${config.envSecretName}`);
  log.detail(`  REPO SECRET NAME: ${config.repoSecretName}`);

  try {
    await syncSecrets(config, parsedEnv);
  } catch (error) {
    log.error(`AWS sync failed: ${(error as Error).message}`);
    process.exit(1);
  }
};

main();
