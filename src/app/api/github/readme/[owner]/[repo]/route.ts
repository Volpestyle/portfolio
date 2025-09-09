import { NextRequest } from 'next/server';
import {
  createOctokit,
  getPortfolioConfig,
  findRepoConfig,
  getActualRepoName,
  notFoundResponse,
  getReadmeFromGist,
} from '@/lib/github-api';
import { GITHUB_CONFIG } from '@/lib/constants';

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
  const octokit = createOctokit();
  const { owner, repo } = await params;

  // Get the actual repo name (handling private repos with public counterparts)
  const actualRepoName = await getActualRepoName(owner, repo);

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
    const portfolioConfig = await getPortfolioConfig();

    if (!portfolioConfig) {
      return notFoundResponse('README');
    }

    const repoConfig = findRepoConfig(portfolioConfig, owner, repo);

    if (!repoConfig || !repoConfig.isPrivate) {
      return notFoundResponse('README');
    }

    // Check if README is stored in a separate gist
    if (repoConfig.readmeGistId) {
      const readmeContent = await getReadmeFromGist(repoConfig.readmeGistId);

      if (!readmeContent) {
        return notFoundResponse('README');
      }

      // Transform image URLs if this is a private repo being served from public repo
      let transformedReadme = readmeContent;
      if (actualRepoName !== repo) {
        // First convert any relative URLs to absolute URLs pointing to the public repo
        transformedReadme = convertRelativeToAbsoluteUrls(readmeContent, owner, actualRepoName);
        // Then transform any existing absolute URLs from private to public repo
        transformedReadme = transformImageUrls(transformedReadme, owner, repo, actualRepoName);
      }

      return Response.json({ readme: transformedReadme });
    }

    // Fall back to inline README in config
    if (!repoConfig.readme) {
      return notFoundResponse('README');
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
  }
}

export const dynamic = 'force-dynamic';
