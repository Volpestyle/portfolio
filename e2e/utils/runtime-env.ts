const TEST_MODE_HEADER = 'x-portfolio-test-mode';
const LOCAL_BASE_FALLBACK = 'http://localhost:3000';

type TestRuntimeMode = 'mock' | 'integration' | 'real';

type TestRuntime = {
  baseUrl: string;
  mode: TestRuntimeMode;
  isLocalBase: boolean;
};

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

function normalizeUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function coerceUrlCandidate(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeUrl(trimmed);
  }
  return normalizeUrl(`https://${trimmed}`);
}

function pickFirstUrl(): string {
  const candidates: Array<string | undefined> = [
    process.env.PLAYWRIGHT_TEST_BASE_URL?.trim(),
    process.env.E2E_API_BASE_URL?.trim(),
    process.env.APP_DOMAIN_NAME?.split(',')[0]?.trim(),
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
  ];

  for (const candidate of candidates) {
    const coerced = coerceUrlCandidate(candidate);
    if (coerced) {
      return coerced;
    }
  }

  return LOCAL_BASE_FALLBACK;
}

function resolveBaseUrl(): string {
  return pickFirstUrl();
}

function isLocalUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    if (LOCAL_HOSTNAMES.has(hostname)) {
      return true;
    }
    return hostname.endsWith('.local');
  } catch {
    return true;
  }
}

function normalizeModeInput(value?: string | null): TestRuntimeMode | undefined {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case 'mock':
    case 'mocks':
    case 'local':
    case 'e2e':
      return 'mock';
    case 'integration':
    case 'remote':
    case 'deploy':
      return 'integration';
    case 'real':
    case 'live':
    case 'prod':
    case 'production':
      return 'real';
    default:
      return undefined;
  }
}

export function resolveTestRuntime(): TestRuntime {
  const baseUrl = resolveBaseUrl();
  const isLocalBase = isLocalUrl(baseUrl);

  const forcedMode = normalizeModeInput(process.env.E2E_TEST_MODE);
  if (forcedMode) {
    return { baseUrl, isLocalBase, mode: forcedMode };
  }

  if (process.env.E2E_USE_REAL_APIS === 'true') {
    return { baseUrl, isLocalBase, mode: 'real' };
  }

  if (isLocalBase) {
    return { baseUrl, isLocalBase, mode: 'mock' };
  }

  return { baseUrl, isLocalBase, mode: 'integration' };
}

export function buildProjectHeaders(project: 'ui' | 'api', runtime: TestRuntime): Record<string, string> {
  if (runtime.mode === 'mock') {
    return {
      [TEST_MODE_HEADER]: project === 'ui' ? 'e2e' : 'integration',
    };
  }
  return {};
}

export function usingRealApis(runtime: TestRuntime): boolean {
  return runtime.mode === 'integration' || runtime.mode === 'real';
}
