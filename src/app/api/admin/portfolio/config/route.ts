import { NextResponse } from 'next/server';
import type { PortfolioRepoConfig } from '@/types/portfolio';
import { loadPortfolioConfig, savePortfolioConfig } from '@/server/portfolio/config-store';
import { getAdminRequestContext } from '@/server/admin/auth';
import { revalidateContent } from '@/server/revalidate';

export const runtime = 'nodejs';

function normalizeRepo(input: unknown): PortfolioRepoConfig | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const repo = input as Record<string, unknown>;
  const name = typeof repo.name === 'string' ? repo.name.trim() : '';
  if (!name) {
    return null;
  }

  const toString = (value: unknown) => (typeof value === 'string' ? value.trim() : undefined);
  const toStringArray = (value: unknown) => (Array.isArray(value) ? value.map((entry) => String(entry)) : undefined);

  return {
    name,
    owner: toString(repo.owner),
    publicRepo: toString(repo.publicRepo),
    description: toString(repo.description),
    isPrivate: Boolean(repo.isPrivate),
    isStarred: Boolean(repo.isStarred),
    icon: toString(repo.icon),
    techStack: toStringArray(repo.techStack),
    topics: toStringArray(repo.topics),
    screenshots: toStringArray(repo.screenshots),
    demoUrl: toString(repo.demoUrl),
    homepage: toString(repo.homepage),
    language: toString(repo.language),
    readme: toString(repo.readme),
  };
}

export async function GET() {
  const admin = await getAdminRequestContext();
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const config = await loadPortfolioConfig();
  return NextResponse.json({ config: config ?? { repositories: [] } });
}

export async function PUT(request: Request) {
  const admin = await getAdminRequestContext();
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const repositoriesInput = Array.isArray(body.repositories) ? body.repositories : [];
    const repositories: PortfolioRepoConfig[] = [];

    for (const entry of repositoriesInput) {
      const normalized = normalizeRepo(entry);
      if (normalized) {
        repositories.push(normalized);
      }
    }

    if (!repositories.length) {
      return NextResponse.json({ error: 'At least one repository is required.' }, { status: 400 });
    }

    const saved = await savePortfolioConfig({ repositories });
    await revalidateContent({ tags: ['github-repos'], paths: ['/projects'] });

    return NextResponse.json({ config: saved });
  } catch (error) {
    console.error('[api/admin/portfolio/config] Failed to save config', error);
    return NextResponse.json({ error: 'Failed to save portfolio config.' }, { status: 500 });
  }
}
