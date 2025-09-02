import { NextRequest } from 'next/server';
import { Octokit } from '@octokit/rest';
import { GITHUB_CONFIG } from '@/lib/constants';
import { PortfolioConfig } from '@/types/portfolio';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; path: string[] }> }
) {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
  
  const { owner, repo, path } = await params;
  const docPath = path.join('/');
  
  if (!process.env.PORTFOLIO_GIST_ID) {
    return Response.json({ error: 'Portfolio gist ID not configured' }, { status: 500 });
  }

  try {
    // Fetch the portfolio config from gist
    const gistResponse = await octokit.rest.gists.get({
      gist_id: process.env.PORTFOLIO_GIST_ID,
    });

    const portfolioFile = gistResponse.data.files?.[GITHUB_CONFIG.PORTFOLIO_CONFIG_FILENAME];
    
    if (!portfolioFile || !portfolioFile.content) {
      return Response.json({ error: 'Portfolio configuration not found' }, { status: 404 });
    }

    const portfolioConfig: PortfolioConfig = JSON.parse(portfolioFile.content);
    
    // Find the repo in the config
    const repoConfig = portfolioConfig.repositories.find(
      (r) => r.name === repo && (r.owner || GITHUB_CONFIG.USERNAME) === owner
    );

    if (!repoConfig || !repoConfig.documents) {
      return Response.json({ error: 'Document configuration not found' }, { status: 404 });
    }

    // Find the document config for this path
    const docConfig = repoConfig.documents.find((d) => d.path === docPath);
    
    if (!docConfig) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    // Fetch the document from its gist
    const docGistResponse = await octokit.rest.gists.get({
      gist_id: docConfig.gistId,
    });

    const files = docGistResponse.data.files;
    
    if (!files || Object.keys(files).length === 0) {
      return Response.json({ error: 'No files found in document gist' }, { status: 404 });
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
      return Response.json({ error: 'Document content not found' }, { status: 404 });
    }

    // Return the document content
    return Response.json({ 
      content: docFile.content,
      filename: docFile.filename,
      language: docFile.language
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    return Response.json({ error: 'Failed to fetch document' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';