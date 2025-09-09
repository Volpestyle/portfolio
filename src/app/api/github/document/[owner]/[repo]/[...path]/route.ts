import { NextRequest } from 'next/server';
import { createOctokit, getPortfolioConfig, findRepoConfig, notFoundResponse, serverErrorResponse } from '@/lib/github-api';
import { GITHUB_CONFIG } from '@/lib/constants';
import { DocumentConfig } from '@/types/portfolio';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; path: string[] }> }
) {
  const octokit = createOctokit();
  
  const { owner, repo, path } = await params;
  const docPath = path.join('/');
  
  if (!process.env.PORTFOLIO_GIST_ID) {
    return serverErrorResponse('Portfolio gist ID not configured');
  }

  try {
    // Fetch portfolio configuration
    const portfolioConfig = await getPortfolioConfig();
    
    if (!portfolioConfig) {
      return notFoundResponse('Portfolio configuration');
    }
    
    // Find the repo in the config
    const repoConfig = findRepoConfig(portfolioConfig, owner, repo);

    if (!repoConfig || !repoConfig.documents) {
      return notFoundResponse('Document configuration');
    }

    // Find the document config for this path
    const docConfig = repoConfig.documents.find((d: DocumentConfig) => d.path === docPath);
    
    if (!docConfig) {
      return notFoundResponse('Document');
    }

    // Fetch the document from its gist
    const docGistResponse = await octokit.rest.gists.get({
      gist_id: docConfig.gistId,
    });

    const files = docGistResponse.data.files;
    
    if (!files || Object.keys(files).length === 0) {
      return notFoundResponse('Document files');
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
      return notFoundResponse('Document content');
    }

    // Return the document content
    return Response.json({ 
      content: docFile.content,
      filename: docFile.filename,
      language: docFile.language
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    return serverErrorResponse('Failed to fetch document');
  }
}

export const dynamic = 'force-dynamic';