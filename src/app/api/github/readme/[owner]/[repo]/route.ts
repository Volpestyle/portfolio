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
        const readme = await octokit.rest.repos
            .getReadme({
                owner,
                repo
            })
            .then((response) => Buffer.from(response.data.content, 'base64').toString());

        return Response.json({ readme });
    } catch (error) {
        console.error('Error fetching project data:', error);
        return Response.json({ error: 'Project not found' }, { status: 404 });
    }
}

export const dynamic = 'force-dynamic'; 