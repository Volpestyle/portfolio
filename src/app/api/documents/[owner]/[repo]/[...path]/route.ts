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
    
    if (!process.env.PORTFOLIO_GIST_ID) {
      throw new Error('Portfolio gist ID not configured');
    }

    // Fetch the portfolio config from gist
    const portfolioConfig = await getPortfolioConfig();
    
    // Find the repo in the config
    const repoConfig = portfolioConfig.repositories.find(
      (r) => r.name === repo && (r.owner || GITHUB_CONFIG.USERNAME) === owner
    );

    if (!repoConfig || !repoConfig.documents) {
      return NextResponse.json({ error: 'Document configuration not found' }, { status: 404 });
    }

    // Find the document config for this path
    const docConfig = repoConfig.documents.find((d) => d.path === docPath);
    
    if (!docConfig) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Fetch the document from its gist
    const docGistResponse = await octokit.rest.gists.get({
      gist_id: docConfig.gistId,
    });

    const files = docGistResponse.data.files;
    
    if (!files || Object.keys(files).length === 0) {
      return NextResponse.json({ error: 'No files found in document gist' }, { status: 404 });
    }

    // Get the document content
    let docFile;
    if (docConfig.filename) {
      docFile = files[docConfig.filename];
    } else {
      // Just get the first file in the gist
      docFile = files[Object.keys(files)[0]];
    }
    
    if (!docFile || !docFile.content) {
      return NextResponse.json({ error: 'Document content not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      content: docFile.content,
      projectName: repoConfig.displayName || repoConfig.name
    });
  } catch (error) {
    console.error('Error loading document:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load document' },
      { status: 500 }
    );
  }
}