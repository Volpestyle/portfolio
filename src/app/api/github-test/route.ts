import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';

export async function GET() {
    try {
        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN,
        });

        const { data } = await octokit.rest.users.getAuthenticated();

        return NextResponse.json({
            success: true,
            username: data.login,
            scopes: data.plan,
        });
    } catch (error: unknown) {
        const err = error as { message?: string; status?: number; response?: { data?: unknown } };
        return NextResponse.json({
            success: false,
            error: err.message || 'Unknown error',
            status: err.status || 500,
        }, { status: 500 });
    }
} 