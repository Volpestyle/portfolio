#!/usr/bin/env tsx

import { Octokit } from '@octokit/rest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Color codes for console output
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

interface ParsedEnv {
    envVars: Record<string, string>;
    envSecrets: Record<string, string>;
    repoVars: Record<string, string>;
    repoSecrets: Record<string, string>;
}

interface Config {
    envFile: string;
    environment: string;
    owner: string;
    repo: string;
    token: string;
}

/**
 * Parse .env file with special headers
 */
function parseEnvFile(filePath: string): ParsedEnv {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const result: ParsedEnv = {
        envVars: {},
        envSecrets: {},
        repoVars: {},
        repoSecrets: {},
    };

    let currentSection: keyof ParsedEnv | null = null;

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and regular comments
        if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('# ENV') && !trimmed.startsWith('# REPO'))) {
            continue;
        }

        // Detect section headers
        if (trimmed === '# ENV VARS') {
            currentSection = 'envVars';
            continue;
        } else if (trimmed === '# ENV SECRETS') {
            currentSection = 'envSecrets';
            continue;
        } else if (trimmed === '# REPO VARS') {
            currentSection = 'repoVars';
            continue;
        } else if (trimmed === '# REPO SECRETS') {
            currentSection = 'repoSecrets';
            continue;
        }

        // Parse key=value pairs
        if (currentSection && trimmed.includes('=')) {
            const [key, ...valueParts] = trimmed.split('=');
            const value = valueParts.join('=').trim();

            // Remove quotes if present
            const cleanValue = value.replace(/^["']|["']$/g, '');

            result[currentSection][key.trim()] = cleanValue;
        }
    }

    return result;
}

/**
 * Encrypt a secret using GitHub's public key
 */
async function encryptSecret(publicKey: string, secretValue: string): Promise<string> {
    // Using libsodium-wrappers for encryption
    const sodiumModule = await import('libsodium-wrappers');
    const sodium = 'default' in sodiumModule ? sodiumModule.default : sodiumModule;
    await sodium.ready;

    // Convert the secret and key to Uint8Array
    const binkey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
    const binsec = sodium.from_string(secretValue);

    // Encrypt the secret using sealed box
    const encBytes = sodium.crypto_box_seal(binsec, binkey);

    // Convert encrypted bytes to base64
    return sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);
}

/**
 * Get repository public key for secrets encryption
 */
async function getRepoPublicKey(octokit: Octokit, owner: string, repo: string) {
    const { data } = await octokit.rest.actions.getRepoPublicKey({
        owner,
        repo,
    });
    return data;
}

/**
 * Get environment public key for secrets encryption
 */
async function getEnvPublicKey(
    octokit: Octokit,
    owner: string,
    repo: string,
    environmentName: string
) {
    const { data } = await octokit.rest.actions.getEnvironmentPublicKey({
        owner,
        repo,
        environment_name: environmentName,
    });
    return data;
}

/**
 * Get repository ID
 */
async function getRepoId(octokit: Octokit, owner: string, repo: string): Promise<number> {
    const { data } = await octokit.rest.repos.get({
        owner,
        repo,
    });
    return data.id;
}

/**
 * Ensure environment exists
 */
async function ensureEnvironment(
    octokit: Octokit,
    owner: string,
    repo: string,
    environmentName: string
) {
    try {
        await octokit.rest.repos.getEnvironment({
            owner,
            repo,
            environment_name: environmentName,
        });
        log.detail(`Environment '${environmentName}' exists`);
    } catch (error) {
        if ((error as { status?: number }).status === 404) {
            log.info(`Creating environment '${environmentName}'...`);
            await octokit.rest.repos.createOrUpdateEnvironment({
                owner,
                repo,
                environment_name: environmentName,
            });
            log.success(`Created environment '${environmentName}'`);
        } else {
            throw error;
        }
    }
}

/**
 * Clear all repository variables
 */
async function clearRepoVariables(octokit: Octokit, owner: string, repo: string) {
    const { data } = await octokit.rest.actions.listRepoVariables({
        owner,
        repo,
    });

    for (const variable of data.variables) {
        await octokit.rest.actions.deleteRepoVariable({
            owner,
            repo,
            name: variable.name,
        });
        log.detail(`Deleted repo variable: ${variable.name}`);
    }
}

/**
 * Clear all repository secrets
 */
async function clearRepoSecrets(octokit: Octokit, owner: string, repo: string) {
    const { data } = await octokit.rest.actions.listRepoSecrets({
        owner,
        repo,
    });

    for (const secret of data.secrets) {
        await octokit.rest.actions.deleteRepoSecret({
            owner,
            repo,
            secret_name: secret.name,
        });
        log.detail(`Deleted repo secret: ${secret.name}`);
    }
}

/**
 * Clear all environment variables
 */
async function clearEnvVariables(
    octokit: Octokit,
    owner: string,
    repo: string,
    environmentName: string
) {
    const { data } = await octokit.rest.actions.listEnvironmentVariables({
        owner,
        repo,
        environment_name: environmentName,
    });

    for (const variable of data.variables) {
        await octokit.rest.actions.deleteEnvironmentVariable({
            owner,
            repo,
            environment_name: environmentName,
            name: variable.name,
        });
        log.detail(`Deleted env variable: ${variable.name}`);
    }
}

/**
 * Clear all environment secrets
 */
async function clearEnvSecrets(
    octokit: Octokit,
    owner: string,
    repo: string,
    environmentName: string
) {
    const { data } = await octokit.rest.actions.listEnvironmentSecrets({
        owner,
        repo,
        environment_name: environmentName,
    });

    for (const secret of data.secrets) {
        await octokit.rest.actions.deleteEnvironmentSecret({
            owner,
            repo,
            environment_name: environmentName,
            secret_name: secret.name,
        });
        log.detail(`Deleted env secret: ${secret.name}`);
    }
}

/**
 * Sync repository variables
 */
async function syncRepoVariables(
    octokit: Octokit,
    owner: string,
    repo: string,
    variables: Record<string, string>
) {
    log.section('📦 Syncing Repository Variables');

    if (Object.keys(variables).length === 0) {
        log.info('No repository variables to sync');
        return;
    }

    await clearRepoVariables(octokit, owner, repo);

    for (const [name, value] of Object.entries(variables)) {
        await octokit.rest.actions.createRepoVariable({
            owner,
            repo,
            name,
            value,
        });
        log.success(`Set repo variable: ${name}`);
    }
}

/**
 * Sync repository secrets
 */
async function syncRepoSecrets(
    octokit: Octokit,
    owner: string,
    repo: string,
    secrets: Record<string, string>
) {
    log.section('🔐 Syncing Repository Secrets');

    if (Object.keys(secrets).length === 0) {
        log.info('No repository secrets to sync');
        return;
    }

    await clearRepoSecrets(octokit, owner, repo);

    const publicKey = await getRepoPublicKey(octokit, owner, repo);

    for (const [name, value] of Object.entries(secrets)) {
        const encryptedValue = await encryptSecret(publicKey.key, value);
        await octokit.rest.actions.createOrUpdateRepoSecret({
            owner,
            repo,
            secret_name: name,
            encrypted_value: encryptedValue,
            key_id: publicKey.key_id,
        });
        log.success(`Set repo secret: ${name}`);
    }
}

/**
 * Sync environment variables
 */
async function syncEnvVariables(
    octokit: Octokit,
    owner: string,
    repo: string,
    environmentName: string,
    variables: Record<string, string>
) {
    log.section(`🌍 Syncing Environment Variables (${environmentName})`);

    if (Object.keys(variables).length === 0) {
        log.info('No environment variables to sync');
        return;
    }

    await ensureEnvironment(octokit, owner, repo, environmentName);
    await clearEnvVariables(octokit, owner, repo, environmentName);

    for (const [name, value] of Object.entries(variables)) {
        await octokit.rest.actions.createEnvironmentVariable({
            owner,
            repo,
            environment_name: environmentName,
            name,
            value,
        });
        log.success(`Set env variable: ${name}`);
    }
}

/**
 * Sync environment secrets
 */
async function syncEnvSecrets(
    octokit: Octokit,
    owner: string,
    repo: string,
    environmentName: string,
    secrets: Record<string, string>
) {
    log.section(`🔒 Syncing Environment Secrets (${environmentName})`);

    if (Object.keys(secrets).length === 0) {
        log.info('No environment secrets to sync');
        return;
    }

    await ensureEnvironment(octokit, owner, repo, environmentName);
    await clearEnvSecrets(octokit, owner, repo, environmentName);

    const publicKey = await getEnvPublicKey(octokit, owner, repo, environmentName);

    for (const [name, value] of Object.entries(secrets)) {
        const encryptedValue = await encryptSecret(publicKey.key, value);
        await octokit.rest.actions.createOrUpdateEnvironmentSecret({
            owner,
            repo,
            environment_name: environmentName,
            secret_name: name,
            encrypted_value: encryptedValue,
            key_id: publicKey.key_id,
        });
        log.success(`Set env secret: ${name}`);
    }
}

/**
 * Main sync function
 */
async function sync(config: Config, parsedEnvOverride?: ParsedEnv) {
    log.section(`🚀 Starting sync from ${config.envFile} to ${config.environment} environment`);

    const envFilePath = resolve(process.cwd(), config.envFile);

    try {
        const parsed = parsedEnvOverride ?? parseEnvFile(envFilePath);

        log.info(`Parsed ${config.envFile}:`);
        log.detail(`  ENV VARS: ${Object.keys(parsed.envVars).length}`);
        log.detail(`  ENV SECRETS: ${Object.keys(parsed.envSecrets).length}`);
        log.detail(`  REPO VARS: ${Object.keys(parsed.repoVars).length}`);
        log.detail(`  REPO SECRETS: ${Object.keys(parsed.repoSecrets).length}`);

        const octokit = new Octokit({
            auth: config.token,
        });

        // Sync in order
        await syncRepoVariables(octokit, config.owner, config.repo, parsed.repoVars);
        await syncRepoSecrets(octokit, config.owner, config.repo, parsed.repoSecrets);
        await syncEnvVariables(octokit, config.owner, config.repo, config.environment, parsed.envVars);
        await syncEnvSecrets(octokit, config.owner, config.repo, config.environment, parsed.envSecrets);

        log.section('✨ Sync completed successfully!');
    } catch (error) {
        log.error(`Failed to sync: ${(error as Error).message}`);
        throw error;
    }
}

// CLI execution
const main = async () => {
    const args = process.argv.slice(2);
    const envFileArg = args.find((arg) => arg.startsWith('--env='));
    const environmentArg = args.find((arg) => arg.startsWith('--environment='));

    if (!envFileArg || !environmentArg) {
        log.error('Usage: tsx sync-env-to-github.ts --env=.env.local --environment=dev');
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

    // Read config strictly from process.env to avoid leaking credentials contained in the synced file
    const token = process.env.GH_TOKEN;
    const owner = process.env.GH_OWNER;
    const repo = process.env.GH_REPO;

    if (!token || !owner || !repo) {
        log.error('Missing required environment variables:');
        if (!token) log.error('  GH_TOKEN - Your GitHub personal access token');
        if (!owner) log.error('  GH_OWNER - Repository owner (user or org)');
        if (!repo) log.error('  GH_REPO - Repository name');
        process.exit(1);
    }

    const config: Config = {
        envFile,
        environment,
        owner,
        repo,
        token,
    };

    try {
        await sync(config, parsedEnv);
    } catch (error) {
        log.error(`Sync failed: ${(error as Error).message}`);
        process.exit(1);
    }
};

main();
