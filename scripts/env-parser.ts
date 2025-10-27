import { readFileSync } from 'fs';

export interface ParsedEnv {
    envVars: Record<string, string>;
    envSecrets: Record<string, string>;
    repoVars: Record<string, string>;
    repoSecrets: Record<string, string>;
}

/**
 * Parse .env file with special headers to separate variables and secrets.
 */
export function parseEnvFile(filePath: string): ParsedEnv {
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

        if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('# ENV') && !trimmed.startsWith('# REPO'))) {
            continue;
        }

        if (trimmed === '# ENV VARS') {
            currentSection = 'envVars';
            continue;
        }

        if (trimmed === '# ENV SECRETS') {
            currentSection = 'envSecrets';
            continue;
        }

        if (trimmed === '# REPO VARS') {
            currentSection = 'repoVars';
            continue;
        }

        if (trimmed === '# REPO SECRETS') {
            currentSection = 'repoSecrets';
            continue;
        }

        if (currentSection && trimmed.includes('=')) {
            const [key, ...valueParts] = trimmed.split('=');
            const value = valueParts.join('=').trim();
            const cleanValue = value.replace(/^["']|["']$/g, '');

            result[currentSection][key.trim()] = cleanValue;
        }
    }

    return result;
}

