import fs from 'node:fs';
import path from 'node:path';
import { Fn } from 'aws-cdk-lib';

export const EDGE_RUNTIME_HEADER_NAME = 'x-opn-runtime-config';
export const EDGE_ENV_SECRET_HEADER_NAME = 'x-opn-env-secret-id';
export const EDGE_REPO_SECRET_HEADER_NAME = 'x-opn-repo-secret-id';
export const EDGE_SECRETS_REGION_HEADER_NAME = 'x-opn-secrets-region';
export const EDGE_SECRETS_FALLBACK_REGION_HEADER_NAME = 'x-opn-secrets-fallback-region';

type EdgeRuntimeHeaderOptions = {
  runtimeHeaderName: string;
  entriesPerHeader?: number;
};

type EdgeBundlePatchOptions = {
  bundlePath: string;
  runtimeHeaders: Record<string, string>;
  runtimeHeaderName: string;
  envSecretHeaderName: string;
  repoSecretHeaderName: string;
  secretsRegionHeaderName: string;
  secretsFallbackRegionHeaderName: string;
};

export function buildEdgeRuntimeHeaders(
  env: Record<string, string>,
  { runtimeHeaderName, entriesPerHeader = 8 }: EdgeRuntimeHeaderOptions
): Record<string, string> {
  const entries = Object.entries(env);
  if (!entries.length) {
    return {};
  }

  const headers: Record<string, string> = {};
  const chunkSize = Math.max(1, entriesPerHeader);

  for (let start = 0; start < entries.length; start += chunkSize) {
    const chunkEntries = entries.slice(start, start + chunkSize);
    const templateParts: string[] = ['{'];
    const substitutions: Record<string, string> = {};

    chunkEntries.forEach(([key, value], index) => {
      const placeholder = `v${index}`;
      templateParts.push(`"${key}":"\${${placeholder}}"`);
      if (index < chunkEntries.length - 1) {
        templateParts.push(',');
      }
      substitutions[placeholder] = value;
    });

    templateParts.push('}');
    const jsonTemplate = templateParts.join('');
    const json = Fn.sub(jsonTemplate, substitutions);
    const encoded = Fn.base64(json);

    const chunkIndex = Math.floor(start / chunkSize);
    const headerName =
      chunkIndex === 0 && entries.length <= chunkSize ? runtimeHeaderName : `${runtimeHeaderName}-${chunkIndex + 1}`;

    headers[headerName] = encoded;
  }

  return headers;
}

export function patchEdgeServerBundle({
  bundlePath,
  runtimeHeaders,
  runtimeHeaderName,
  envSecretHeaderName,
  repoSecretHeaderName,
  secretsRegionHeaderName,
  secretsFallbackRegionHeaderName,
}: EdgeBundlePatchOptions) {
  const indexPath = path.join(bundlePath, 'index.mjs');
  const handlerPath = path.join(bundlePath, 'server-handler.mjs');

  if (!fs.existsSync(handlerPath)) {
    if (!fs.existsSync(indexPath)) {
      throw new Error(`Expected OpenNext server bundle at ${indexPath}`);
    }
    fs.renameSync(indexPath, handlerPath);
  }

  const runtimeHeaderNames = Object.keys(runtimeHeaders ?? {});
  if (!runtimeHeaderNames.length) {
    throw new Error('Edge runtime configuration headers missing; ensure buildEdgeRuntimeHeaders ran first.');
  }
  const runtimeHeaderLiteral = JSON.stringify(runtimeHeaderNames);

  const wrapperSource = `import { Buffer } from 'node:buffer';

const RUNTIME_CONFIG_HEADERS = ${runtimeHeaderLiteral};
const RUNTIME_CONFIG_BASE_HEADER = '${runtimeHeaderName}';
const ENV_SECRET_HEADER = '${envSecretHeaderName}';
const REPO_SECRET_HEADER = '${repoSecretHeaderName}';
const SECRETS_REGION_HEADER = '${secretsRegionHeaderName}';
const SECRETS_FALLBACK_REGION_HEADER = '${secretsFallbackRegionHeaderName}';
let cachedHandlerPromise;

function readCustomHeader(origin, name) {
  const entries = origin?.customHeaders?.[name];
  if (!entries || entries.length === 0) {
    return undefined;
  }
  return entries[0]?.value;
}

function extractRuntimeConfig(event) {
  try {
    const record = event?.Records?.[0];
    const request = record?.cf?.request;
    if (!request) {
      return undefined;
    }
    const origin = request.origin?.s3 ?? request.origin?.custom;
    const encodedChunks = [];
    for (const headerName of RUNTIME_CONFIG_HEADERS) {
      const value = readCustomHeader(origin, headerName);
      if (value) {
        encodedChunks.push(value);
      }
    }
    if (encodedChunks.length === 0) {
      const fallback = readCustomHeader(origin, RUNTIME_CONFIG_BASE_HEADER);
      if (fallback) {
        encodedChunks.push(fallback);
      }
    }
    if (encodedChunks.length === 0) {
      console.error('Lambda@Edge runtime config header missing');
      return undefined;
    }
    const runtimeConfig = {};
    for (const encoded of encodedChunks) {
      const json = Buffer.from(encoded, 'base64').toString('utf-8');
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === 'object') {
        Object.assign(runtimeConfig, parsed);
      }
    }

    const envSecretId = readCustomHeader(origin, ENV_SECRET_HEADER);
    if (envSecretId) {
      runtimeConfig.SECRETS_MANAGER_ENV_SECRET_ID = envSecretId;
    }

    const repoSecretId = readCustomHeader(origin, REPO_SECRET_HEADER);
    if (repoSecretId) {
      runtimeConfig.SECRETS_MANAGER_REPO_SECRET_ID = repoSecretId;
    }

    const primaryRegion = readCustomHeader(origin, SECRETS_REGION_HEADER);
    if (primaryRegion) {
      runtimeConfig.AWS_SECRETS_MANAGER_PRIMARY_REGION = primaryRegion;
    }

    const fallbackRegion = readCustomHeader(origin, SECRETS_FALLBACK_REGION_HEADER);
    if (fallbackRegion) {
      runtimeConfig.AWS_SECRETS_MANAGER_FALLBACK_REGION = fallbackRegion;
    }

    return runtimeConfig;
  } catch (error) {
    console.error('Failed to parse Lambda@Edge runtime configuration', error);
    return undefined;
  }
}

	function applyRuntimeConfig(config) {
	  if (!config) {
	    return;
	  }

	  const configuredRegion = config.AWS_REGION;
	  if (typeof configuredRegion === 'string' && configuredRegion.length > 0) {
	    process.env.AWS_REGION = configuredRegion;
	    process.env.AWS_DEFAULT_REGION = configuredRegion;
	  }

	  for (const [key, value] of Object.entries(config)) {
	    if (typeof value !== 'string') continue;
	    if (key === 'AWS_REGION' || key === 'AWS_DEFAULT_REGION') continue;
	    if (process.env[key] === undefined) process.env[key] = value;
	  }
	}

async function loadHandler(event) {
  if (!cachedHandlerPromise) {
    const config = extractRuntimeConfig(event);
    if (!config) {
      throw new Error('Missing Lambda@Edge runtime configuration header');
    }
    applyRuntimeConfig(config);
    cachedHandlerPromise = import('./server-handler.mjs').then((mod) => mod.handler);
  }
  return cachedHandlerPromise;
}

export const handler = async (event, context, callback) => {
  if (!event?.Records?.[0]?.cf?.request) {
    if (event?.type === 'warmer') {
      return { type: 'warmer', serverId: 'edge' };
    }
  }

  const actualHandler = await loadHandler(event);
  return actualHandler(event, context, callback);
};
`;

  fs.writeFileSync(indexPath, wrapperSource, { encoding: 'utf-8' });
}

export function buildEdgeSecretHeaders(runtimeEnvironment: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {};

  const envSecretId = runtimeEnvironment['SECRETS_MANAGER_ENV_SECRET_ID'];
  if (envSecretId) {
    headers[EDGE_ENV_SECRET_HEADER_NAME] = envSecretId;
  }

  const repoSecretId = runtimeEnvironment['SECRETS_MANAGER_REPO_SECRET_ID'];
  if (repoSecretId) {
    headers[EDGE_REPO_SECRET_HEADER_NAME] = repoSecretId;
  }

  const primaryRegion =
    runtimeEnvironment['AWS_SECRETS_MANAGER_PRIMARY_REGION'] ?? runtimeEnvironment['AWS_REGION'];
  if (primaryRegion) {
    headers[EDGE_SECRETS_REGION_HEADER_NAME] = primaryRegion;
  }

  const fallbackRegion = runtimeEnvironment['AWS_SECRETS_MANAGER_FALLBACK_REGION'];
  if (fallbackRegion && fallbackRegion !== primaryRegion) {
    headers[EDGE_SECRETS_FALLBACK_REGION_HEADER_NAME] = fallbackRegion;
  }

  return headers;
}
