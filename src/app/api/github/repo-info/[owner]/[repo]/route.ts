import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';

type RouteParams = {
    params: {
        owner: string;
        repo: string;
    };
};

export async function GET(
    request: NextRequest,
    { params }: RouteParams
): Promise<NextResponse> {
    const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
    });

    const { owner, repo } = params;

    try {
        const { data } = await octokit.rest.repos.get({
            owner,
            repo,
        });

        console.log('GitHub API Response:', data);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching repo info:', error);
        return NextResponse.json({ default_branch: 'main' }, { status: 500 });
    }
} 