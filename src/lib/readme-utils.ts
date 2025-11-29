const CUSTOM_PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

function normalizeSlashes(input: string): string {
  return input.replace(/\\/g, '/');
}

function splitSegments(input: string): string[] {
  return input.split('/').filter(Boolean);
}

function getBaseDirSegments(filePath?: string): string[] {
  if (!filePath) {
    return [];
  }
  const normalized = normalizeSlashes(filePath);
  const segments = splitSegments(normalized);
  segments.pop(); // remove filename
  return segments;
}

function resolveRelativeSegments(baseSegments: string[], relativePath: string): string {
  const stack = [...baseSegments];
  const normalizedRelative = normalizeSlashes(relativePath);
  const relativeSegments = normalizedRelative.split('/');

  for (const segment of relativeSegments) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (stack.length) {
        stack.pop();
      }
      continue;
    }
    stack.push(segment);
  }

  return stack.join('/');
}

function sanitizeRelativePath(rawPath: string, basePath?: string): string | null {
  let cleanPath = rawPath.trim();
  if (!cleanPath) {
    return null;
  }

  if (CUSTOM_PROTOCOL_PATTERN.test(cleanPath)) {
    return null;
  }

  if (cleanPath.startsWith('//')) {
    return null;
  }

  cleanPath = cleanPath.replace(/\?raw=true$/, '');

  const baseSegments = getBaseDirSegments(basePath);

  // Drop repo-root absolute hints so join() can resolve correctly
  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.replace(/^\/+/, '');
  }

  cleanPath = cleanPath.replace(/^(\.\/)+/, '');
  cleanPath = cleanPath.replace(/^\/+/, '');

  const resolved = resolveRelativeSegments(baseSegments, cleanPath);

  if (!resolved) {
    return null;
  }

  return resolved;
}

function isAllowedRelativePath(candidate: string): boolean {
  if (!candidate) {
    return false;
  }
  if (CUSTOM_PROTOCOL_PATTERN.test(candidate)) {
    return false;
  }
  if (candidate.startsWith('//')) {
    return false;
  }
  return true;
}

/**
 * Transforms relative URLs to absolute GitHub URLs
 * @param content - Markdown content
 * @param owner - GitHub username/organization
 * @param repo - The repository name
 * @param branch - The branch name or commit (default: main)
 * @param basePath - Optional path to the current document for resolving relative links
 * @returns Markdown content with absolute URLs
 */
function buildAbsoluteUrl(owner: string, repo: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

export function convertRelativeToAbsoluteUrls(
  content: string,
  owner: string,
  repo: string,
  branch: string = 'main',
  basePath?: string
): string {
  // Pattern to match relative image URLs in markdown: ![alt](./path/to/image) or ![alt](path/to/image)
  const relativeMarkdownImagePattern = /!\[([^\]]*?)\]\(((?:\.\/)?[^)]+)\)/g;

  // Pattern to match relative URLs in HTML img tags
  const relativeHtmlImagePattern = /<img([^>]*?)src=["']((?:\.\/)?[^"']+)["']([^>]*?)>/gi;

  return content
    .replace(relativeMarkdownImagePattern, (match, alt, path) => {
      if (!isAllowedRelativePath(path)) {
        return match;
      }
      const cleanPath = sanitizeRelativePath(path, basePath);
      if (!cleanPath) {
        return match;
      }
      return `![${alt}](${buildAbsoluteUrl(owner, repo, branch, cleanPath)})`;
    })
    .replace(relativeHtmlImagePattern, (match, before, path, after) => {
      if (!isAllowedRelativePath(path)) {
        return match;
      }
      const cleanPath = sanitizeRelativePath(path, basePath);
      if (!cleanPath) {
        return match;
      }
      return `<img${before}src="${buildAbsoluteUrl(owner, repo, branch, cleanPath)}"${after}>`;
    });
}
