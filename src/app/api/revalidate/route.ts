import { revalidateContent } from '@/server/revalidate';
import { resolveSecretValue } from '@/lib/secrets/manager';

let cachedSecret: string | null | undefined;
let secretPromise: Promise<string | null> | null = null;

async function getRevalidateSecret(): Promise<string | null> {
  if (cachedSecret !== undefined) {
    return cachedSecret;
  }

  if (!secretPromise) {
    secretPromise = resolveSecretValue('REVALIDATE_SECRET', { scope: 'repo', required: true })
      .then((value) => value ?? null)
      .finally(() => {
        secretPromise = null;
      });
  }

  cachedSecret = await secretPromise;
  return cachedSecret;
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const expectedSecret = await getRevalidateSecret();
    if (!expectedSecret) {
      console.error('[revalidate] Missing expected secret value');
      return Response.json({ ok: false, error: 'Server misconfiguration (missing revalidation secret)' }, { status: 500 });
    }

    const provided = req.headers.get('x-revalidate-secret');
    if (provided !== expectedSecret) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({ paths: [], tags: [] }));
    const paths = Array.isArray(payload.paths) ? payload.paths : [];
    const tags = Array.isArray(payload.tags) ? payload.tags : [];

    await revalidateContent({ paths, tags });
    return Response.json({ ok: true, paths, tags, durationMs: Date.now() - startedAt });
  } catch (error) {
    console.error('[revalidate] failed', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
