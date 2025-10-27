#!/usr/bin/env tsx

import { resolve } from 'path';
import {
    SecretsManagerClient,
    CreateSecretCommand,
    PutSecretValueCommand,
    DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import { parseEnvFile, ParsedEnv } from './env-parser';

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

const log = {
    success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
    warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    section: (msg: string) => console.log(`\n${colors.cyan}${colors.bright}${msg}${colors.reset}`),
    detail: (msg: string) => console.log(`  ${colors.dim}${msg}${colors.reset}`),
};

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

function sanitizePrefix(prefix: string | undefined): string {
    if (!prefix) {
        return '';
    }

    return prefix.replace(/\/+$/, '');
}

function resolveSecretNameWithPrefix(prefix: string, suffix: string): string {
    if (!prefix) {
        return suffix;
    }

    return `${prefix}/${suffix}`.replace(/\/{2,}/g, '/');
}

function resolveAwsConfig(options: {
    environment: string;
    region?: string;
    secretPrefixArg?: string;
    envSecretArg?: string;
    repoSecretArg?: string;
}) {
    const { environment, region, secretPrefixArg, envSecretArg, repoSecretArg } = options;
    const upperEnv = environment.toUpperCase();

    if (!region) {
        log.error('Missing AWS region. Set AWS_REGION/AWS_DEFAULT_REGION or include AWS_REGION in your .env file.');
        process.exit(1);
    }

    const prefixEnvVar = process.env.AWS_SECRET_PREFIX;
    const envSecretOverrideEnv = process.env[`AWS_ENV_SECRET_NAME_${upperEnv}`];
    const repoSecretOverrideEnv = process.env[`AWS_REPO_SECRET_NAME_${upperEnv}`];

    const prefix = sanitizePrefix(secretPrefixArg ?? prefixEnvVar ?? 'portfolio');

    const envSecretName =
        envSecretArg ??
        envSecretOverrideEnv ??
        process.env.AWS_ENV_SECRET_NAME ??
        resolveSecretNameWithPrefix(prefix, `${environment}/env`);

    const repoSecretName =
        repoSecretArg ??
        repoSecretOverrideEnv ??
        process.env.AWS_REPO_SECRET_NAME ??
        resolveSecretNameWithPrefix(prefix, 'repository');

    return {
        region,
        envSecretName,
        repoSecretName,
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

    const secretPrefix = secretPrefixArg ? secretPrefixArg.split('=')[1] : undefined;
    const envSecretNameOverride = envSecretArg ? envSecretArg.split('=')[1] : undefined;
    const repoSecretNameOverride = repoSecretArg ? repoSecretArg.split('=')[1] : undefined;

    const derivedRegion =
        process.env.AWS_REGION ??
        process.env.AWS_DEFAULT_REGION ??
        parsedEnv.repoVars.AWS_REGION ??
        parsedEnv.envVars.AWS_REGION ??
        parsedEnv.repoSecrets.AWS_REGION ??
        parsedEnv.envSecrets.AWS_REGION;

    const awsConfig = resolveAwsConfig({
        environment,
        region: derivedRegion,
        secretPrefixArg: secretPrefix,
        envSecretArg: envSecretNameOverride,
        repoSecretArg: repoSecretNameOverride,
    });

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
