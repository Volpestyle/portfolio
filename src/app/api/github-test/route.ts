import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { headers } from 'next/headers';

export async function GET(request: Request) {
    console.log('[GitHub API] Request received');
    // Check request method
    if (request.method !== 'GET') {
        return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    try {
        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN,
        });

        const { data } = await octokit.rest.users.getAuthenticated();

        console.log('[GitHub API] Successfully authenticated as:', data.login);
        return NextResponse.json({
            success: true,
            username: data.login,
            scopes: data.plan,
        });
    } catch (error: unknown) {
        console.error('[GitHub API] Error:', {
            message: (error as Error).message,
            stack: (error as Error).stack
        });
        const err = error as { message?: string; status?: number; response?: { data?: unknown } };
        return NextResponse.json({
            success: false,
            error: err.message || 'Unknown error',
            status: err.status || 500,
        }, { status: 500 });
    } finally {
        // Add CORS headers
        const response = NextResponse.next();
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET');
    }
}

export const dynamic = 'force-dynamic'; 