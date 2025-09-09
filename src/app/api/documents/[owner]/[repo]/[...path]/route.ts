import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { GITHUB_CONFIG } from '@/lib/constants';
import { PortfolioConfig } from '@/types/portfolio';

async function getPortfolioConfig(): Promise<PortfolioConfig> {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  if (!process.env.PORTFOLIO_GIST_ID) {
    throw new Error('Portfolio gist ID not configured');
  }

  const gistResponse = await octokit.rest.gists.get({
    gist_id: process.env.PORTFOLIO_GIST_ID,
  });

  const portfolioFile = gistResponse.data.files?.[GITHUB_CONFIG.PORTFOLIO_CONFIG_FILENAME];

  if (!portfolioFile || !portfolioFile.content) {
    throw new Error('Portfolio configuration not found');
  }

  return JSON.parse(portfolioFile.content);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string; path: string[] }> }
) {
  try {
    const { owner, repo, path } = await params;
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    const docPath = path.join('/');

    // Check if this is a private repo with a public counterpart
    let publicRepoName: string | null = null;
    let isPrivateRepo = false;
    let repoConfig = null;

    // Check portfolio config if available
    if (process.env.PORTFOLIO_GIST_ID) {
      try {
        const portfolioConfig = await getPortfolioConfig();

        // Find the repo in the config
        repoConfig = portfolioConfig.repositories.find(
          (r) => r.name === repo && (r.owner || GITHUB_CONFIG.USERNAME) === owner
        );

        if (repoConfig?.isPrivate) {
          isPrivateRepo = true;
          // If this repo has a publicRepo override, use that
          if (repoConfig.publicRepo) {
            publicRepoName = repoConfig.publicRepo;
          } else {
            // Default: append 'public' to the repo name
            publicRepoName = `${repo}public`;
          }
        }

        // First check if the document is configured in gist
        if (repoConfig?.documents) {
          const docConfig = repoConfig.documents.find((d) => d.path === docPath);

          if (docConfig) {
            // Fetch the document from its gist
            const docGistResponse = await octokit.rest.gists.get({
              gist_id: docConfig.gistId,
            });

            const files = docGistResponse.data.files;

            if (files && Object.keys(files).length > 0) {
              // Get the document content
              let docFile;
              if (docConfig.filename) {
                docFile = files[docConfig.filename];
              } else {
                // Just get the first file in the gist
                docFile = files[Object.keys(files)[0]];
              }

              if (docFile && docFile.content) {
                return NextResponse.json({
                  content: docFile.content,
                  projectName: repoConfig.name,
                });
              }
            }
          }
        }
      } catch (configError) {
        console.error('Error checking portfolio config:', configError);
      }
    }

    // If not found in gist config, try to fetch directly from GitHub
    // For private repos, use the public repo name
    const repoToFetch = isPrivateRepo && publicRepoName ? publicRepoName : repo;

    try {
      // Try to fetch the document directly from GitHub
      const response = await octokit.rest.repos.getContent({
        owner,
        repo: repoToFetch,
        path: docPath,
      });

      // Check if the response is a file (not a directory)
      if ('content' in response.data && response.data.type === 'file') {
        const content = Buffer.from(response.data.content, 'base64').toString();

        return NextResponse.json({
          content,
          projectName: repo,
        });
      } else {
        return NextResponse.json({ error: 'Path is not a file' }, { status: 404 });
      }
    } catch (githubError) {
      console.error('Error fetching document from GitHub:', githubError);
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Error loading document:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load document' },
      { status: 500 }
    );
  }
}
