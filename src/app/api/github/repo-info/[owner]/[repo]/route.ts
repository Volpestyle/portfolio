import { NextRequest } from 'next/server';
import { Octokit } from '@octokit/rest';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ owner: string; repo: string }> }
) {
    const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
    });

    const { owner, repo } = await params;

    try {
        const { data } = await octokit.rest.repos.get({
            owner,
            repo,
        });

        console.log('GitHub API Response:', data);
        return Response.json(data);
    } catch (error) {
        console.error('Error fetching repo info:', error);
        return Response.json({ default_branch: 'main' }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic'; 