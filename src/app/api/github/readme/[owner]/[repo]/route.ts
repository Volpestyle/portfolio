import { NextRequest } from 'next/server';
import { Octokit } from '@octokit/rest';
import { GITHUB_CONFIG } from '@/lib/constants';
import { PortfolioConfig } from '@/types/portfolio';

export async function GET(request: NextRequest, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
  const { owner, repo } = await params;
  
  try {
    // First, try to get the README from GitHub API
    const readme = await octokit.rest.repos
      .getReadme({
        owner,
        repo,
      })
      .then((response) => Buffer.from(response.data.content, 'base64').toString());

    return Response.json({ readme });
  } catch (error) {
    // If README not found (likely private repo), check portfolio config
    if (!process.env.PORTFOLIO_GIST_ID) {
      console.error('Portfolio gist ID not configured');
      return Response.json({ error: 'README not found' }, { status: 404 });
    }

    try {
      // Fetch the portfolio config from gist
      const gistResponse = await octokit.rest.gists.get({
        gist_id: process.env.PORTFOLIO_GIST_ID,
      });

      const portfolioFile = gistResponse.data.files?.[GITHUB_CONFIG.PORTFOLIO_CONFIG_FILENAME];
      
      if (!portfolioFile || !portfolioFile.content) {
        return Response.json({ error: 'README not found' }, { status: 404 });
      }

      const portfolioConfig: PortfolioConfig = JSON.parse(portfolioFile.content);
      
      // Find the repo in the config
      const repoConfig = portfolioConfig.repositories.find(
        (r) => r.name === repo && (r.owner || GITHUB_CONFIG.USERNAME) === owner
      );

      if (!repoConfig || !repoConfig.isPrivate) {
        return Response.json({ error: 'README not found' }, { status: 404 });
      }

      // Check if README is stored in a separate gist
      if (repoConfig.readmeGistId) {
        try {
          const readmeGistResponse = await octokit.rest.gists.get({
            gist_id: repoConfig.readmeGistId,
          });

          const files = readmeGistResponse.data.files;
          
          if (!files || Object.keys(files).length === 0) {
            return Response.json({ error: 'No files found in gist' }, { status: 404 });
          }

          // Just get the first (and likely only) file in the gist
          const firstFile = files[Object.keys(files)[0]];
          
          if (!firstFile || !firstFile.content) {
            return Response.json({ error: 'README content not found in gist' }, { status: 404 });
          }

          return Response.json({ readme: firstFile.content });
        } catch (gistError) {
          console.error('Error fetching README from gist:', gistError);
          return Response.json({ error: 'README gist not found' }, { status: 404 });
        }
      }

      // Fall back to inline README in config
      if (!repoConfig.readme) {
        return Response.json({ error: 'README not found' }, { status: 404 });
      }

      // Return the README from config
      return Response.json({ readme: repoConfig.readme });
    } catch (configError) {
      console.error('Error fetching README from config:', configError);
      return Response.json({ error: 'README not found' }, { status: 404 });
    }
  }
}

export const dynamic = 'force-dynamic';
