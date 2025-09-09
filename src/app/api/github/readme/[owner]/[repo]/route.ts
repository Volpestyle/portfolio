import { NextRequest } from 'next/server';
import { Octokit } from '@octokit/rest';
import { GITHUB_CONFIG } from '@/lib/constants';
import { PortfolioConfig } from '@/types/portfolio';

/**
 * Transforms relative URLs to absolute GitHub URLs
 * @param content - The README content
 * @param owner - GitHub username/organization
 * @param repo - The repository name
 * @param branch - The branch name (default: main)
 * @returns README content with absolute URLs
 */
function convertRelativeToAbsoluteUrls(content: string, owner: string, repo: string, branch: string = 'main'): string {
  // Pattern to match relative image URLs in markdown: ![alt](./path/to/image) or ![alt](path/to/image)
  const relativeMarkdownImagePattern = /!\[([^\]]*?)\]\(((?:\.\/)?(?!https?:\/\/)[^)]+)\)/g;

  // Pattern to match relative URLs in HTML img tags
  const relativeHtmlImagePattern = /<img([^>]*?)src=["']((?:\.\/)?(?!https?:\/\/)[^"']+)["']([^>]*?)>/gi;

  return content
    .replace(relativeMarkdownImagePattern, (match, alt, path) => {
      // Remove leading ./ if present
      const cleanPath = path.startsWith('./') ? path.slice(2) : path;
      return `![${alt}](https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath})`;
    })
    .replace(relativeHtmlImagePattern, (match, before, path, after) => {
      // Remove leading ./ if present
      const cleanPath = path.startsWith('./') ? path.slice(2) : path;
      return `<img${before}src="https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath}"${after}>`;
    });
}

/**
 * Transforms GitHub image URLs in README content from private repo to public repo
 * @param content - The README content
 * @param owner - GitHub username/organization
 * @param originalRepo - The original repo name (private)
 * @param publicRepo - The public repo name
 * @returns Transformed README content with updated image URLs
 */
function transformImageUrls(content: string, owner: string, originalRepo: string, publicRepo: string): string {
  if (originalRepo === publicRepo) {
    return content;
  }

  // Escape special regex characters in owner and repo names
  const escapedOwner = owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedOriginalRepo = originalRepo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedPublicRepo = publicRepo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Pattern to match GitHub URLs in markdown images: ![alt](https://github.com/...)
  // Captures the URL up to the closing parenthesis
  const markdownImagePattern = new RegExp(
    `!\\[([^\\]]*?)\\]\\(https://github\\.com/${escapedOwner}/${escapedOriginalRepo}/(raw|blob)/([^\\s)]+)`,
    'g'
  );

  // Pattern to match raw.githubusercontent.com URLs in markdown images: ![alt](https://raw.githubusercontent.com/...)
  const markdownRawImagePattern = new RegExp(
    `!\\[([^\\]]*?)\\]\\(https://raw\\.githubusercontent\\.com/${escapedOwner}/${escapedOriginalRepo}/([^\\s)]+)`,
    'g'
  );

  // Pattern to match GitHub URLs in HTML img tags: <img src="https://github.com/...">
  // Handles both single and double quotes
  const htmlImagePattern = new RegExp(
    `<img[^>]*?src=["\'](https://github\\.com/${escapedOwner}/${escapedOriginalRepo}/(raw|blob)/[^"\']*)["\'][^>]*>`,
    'gi'
  );

  // Pattern to match raw.githubusercontent.com URLs in HTML img tags
  const htmlRawImagePattern = new RegExp(
    `<img[^>]*?src=["\'](https://raw\\.githubusercontent\\.com/${escapedOwner}/${escapedOriginalRepo}/[^"\']*)["\'][^>]*>`,
    'gi'
  );

  // Pattern to match standalone GitHub URLs in text (not in markdown/HTML)
  const standaloneGithubPattern = new RegExp(
    `https://github\\.com/${escapedOwner}/${escapedOriginalRepo}/(raw|blob)/([^\\s<>"\'()\\[\\]]+)`,
    'g'
  );

  // Pattern to match standalone raw.githubusercontent.com URLs
  const standaloneRawPattern = new RegExp(
    `https://raw\\.githubusercontent\\.com/${escapedOwner}/${escapedOriginalRepo}/([^\\s<>"\'()\\[\\]]+)`,
    'g'
  );

  return content
    .replace(markdownImagePattern, `![$1](https://github.com/${owner}/${escapedPublicRepo}/$2/$3`)
    .replace(markdownRawImagePattern, `![$1](https://raw.githubusercontent.com/${owner}/${escapedPublicRepo}/$2`)
    .replace(htmlImagePattern, (match, url, type) =>
      match.replace(
        `https://github.com/${owner}/${escapedOriginalRepo}`,
        `https://github.com/${owner}/${escapedPublicRepo}`
      )
    )
    .replace(htmlRawImagePattern, (match, url) =>
      match.replace(
        `https://raw.githubusercontent.com/${owner}/${escapedOriginalRepo}`,
        `https://raw.githubusercontent.com/${owner}/${escapedPublicRepo}`
      )
    )
    .replace(standaloneGithubPattern, `https://github.com/${owner}/${escapedPublicRepo}/$1/$2`)
    .replace(standaloneRawPattern, `https://raw.githubusercontent.com/${owner}/${escapedPublicRepo}/$1`);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
  const { owner, repo } = await params;

  // First check if this repo has a publicName mapping in the portfolio config
  let actualRepoName = repo;

  if (process.env.PORTFOLIO_GIST_ID) {
    try {
      const gistResponse = await octokit.rest.gists.get({
        gist_id: process.env.PORTFOLIO_GIST_ID,
      });

      const portfolioFile = gistResponse.data.files?.[GITHUB_CONFIG.PORTFOLIO_CONFIG_FILENAME];

      if (portfolioFile && portfolioFile.content) {
        const portfolioConfig: PortfolioConfig = JSON.parse(portfolioFile.content);

        // Find the repo in the config
        const repoConfig = portfolioConfig.repositories.find(
          (r) => r.name === repo && (r.owner || GITHUB_CONFIG.USERNAME) === owner
        );

        if (repoConfig?.isPrivate) {
          // If this repo has a publicRepo override, use that
          if (repoConfig.publicRepo) {
            actualRepoName = repoConfig.publicRepo;
          } else {
            // Default: append 'public' to the repo name
            actualRepoName = `${repo}public`;
          }
        }
      }
    } catch (configError) {
      // Continue with original repo name if config fetch fails
      console.error('Error checking portfolio config:', configError);
    }
  }

  try {
    // Try to get the README from GitHub API using the actual repo name
    const readme = await octokit.rest.repos
      .getReadme({
        owner,
        repo: actualRepoName,
      })
      .then((response) => Buffer.from(response.data.content, 'base64').toString());

    // Transform image URLs if this is a private repo being served from public repo
    let transformedReadme = readme;
    if (actualRepoName !== repo) {
      // First convert any relative URLs to absolute URLs pointing to the public repo
      transformedReadme = convertRelativeToAbsoluteUrls(readme, owner, actualRepoName);
      // Then transform any existing absolute URLs from private to public repo
      transformedReadme = transformImageUrls(transformedReadme, owner, repo, actualRepoName);
    }

    return Response.json({ readme: transformedReadme });
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

          // Transform image URLs if this is a private repo being served from public repo
          let transformedReadme = firstFile.content;
          if (actualRepoName !== repo) {
            // First convert any relative URLs to absolute URLs pointing to the public repo
            transformedReadme = convertRelativeToAbsoluteUrls(firstFile.content, owner, actualRepoName);
            // Then transform any existing absolute URLs from private to public repo
            transformedReadme = transformImageUrls(transformedReadme, owner, repo, actualRepoName);
          }

          return Response.json({ readme: transformedReadme });
        } catch (gistError) {
          console.error('Error fetching README from gist:', gistError);
          return Response.json({ error: 'README gist not found' }, { status: 404 });
        }
      }

      // Fall back to inline README in config
      if (!repoConfig.readme) {
        return Response.json({ error: 'README not found' }, { status: 404 });
      }

      // Transform image URLs if this is a private repo with a public counterpart
      let transformedReadme = repoConfig.readme;
      if (actualRepoName !== repo) {
        // First convert any relative URLs to absolute URLs pointing to the public repo
        transformedReadme = convertRelativeToAbsoluteUrls(repoConfig.readme, owner, actualRepoName);
        // Then transform any existing absolute URLs from private to public repo
        transformedReadme = transformImageUrls(transformedReadme, owner, repo, actualRepoName);
      }

      // Return the README from config
      return Response.json({ readme: transformedReadme });
    } catch (configError) {
      console.error('Error fetching README from config:', configError);
      return Response.json({ error: 'README not found' }, { status: 404 });
    }
  }
}

export const dynamic = 'force-dynamic';
