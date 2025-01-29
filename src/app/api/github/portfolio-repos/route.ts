import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { GITHUB_CONFIG } from '@/lib/constants';

export async function GET(
    request: NextRequest
): Promise<NextResponse> {
    const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
    });

    try {
        // Fetch gist containing portfolio config
        const gistResponse = await octokit.rest.gists.get({
            gist_id: process.env.PORTFOLIO_GIST_ID!,
        });

        const portfolioFile = gistResponse.data.files?.[GITHUB_CONFIG.PORTFOLIO_CONFIG_FILENAME];
        const portfolioConfig = JSON.parse(portfolioFile?.content || '{"repositories":[]}');

        // Get all repos
        const repos = await octokit.rest.repos.listForUser({
            username: GITHUB_CONFIG.USERNAME,
            per_page: 100,
        });

        // Create sets for quick lookup
        const portfolioRepoNames = new Set(portfolioConfig.repositories.map((r: any) => r.name));
        const starredRepoNames = new Set(
            portfolioConfig.repositories.filter((r: any) => r.isStarred).map((r: any) => r.name)
        );

        const result = {
            starred: repos.data
                .filter((repo) => starredRepoNames.has(repo.name))
                .map((repo) => ({
                    ...repo,
                    isStarred: true,
                })),
            normal: repos.data
                .filter((repo) => portfolioRepoNames.has(repo.name) && !starredRepoNames.has(repo.name))
                .map((repo) => ({
                    ...repo,
                    isStarred: false,
                })),
        };

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error fetching portfolio repos:', error);
        return NextResponse.json({ error: 'Failed to fetch repos' }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic'; 