/**
 * Transforms relative URLs to absolute GitHub URLs
 * @param content - The README content
 * @param owner - GitHub username/organization
 * @param repo - The repository name
 * @param branch - The branch name (default: main)
 * @returns README content with absolute URLs
 */
function sanitizeRelativePath(path: string): string {
  let cleanPath = path.trim();

  // Strip leading ./ segments
  cleanPath = cleanPath.replace(/^(\.\/)+/, '');

  // Remove single leading slash (repo root), but keep protocol-relative URLs (//example.com)
  if (cleanPath.startsWith('/') && !cleanPath.startsWith('//')) {
    cleanPath = cleanPath.replace(/^\/+/, '');
  }

  // Drop ?raw=true or similar query hints
  cleanPath = cleanPath.replace(/\?raw=true$/, '');

  return cleanPath;
}

export function convertRelativeToAbsoluteUrls(
  content: string,
  owner: string,
  repo: string,
  branch: string = 'main'
): string {
  // Pattern to match relative image URLs in markdown: ![alt](./path/to/image) or ![alt](path/to/image)
  const relativeMarkdownImagePattern = /!\[([^\]]*?)\]\(((?:\.\/)?(?!https?:\/\/)[^)]+)\)/g;

  // Pattern to match relative URLs in HTML img tags
  const relativeHtmlImagePattern = /<img([^>]*?)src=["']((?:\.\/)?(?!https?:\/\/)[^"']+)["']([^>]*?)>/gi;

  return content
    .replace(relativeMarkdownImagePattern, (match, alt, path) => {
      if (path.startsWith('//')) {
        return match;
      }
      const cleanPath = sanitizeRelativePath(path);
      return `![${alt}](https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath})`;
    })
    .replace(relativeHtmlImagePattern, (match, before, path, after) => {
      if (path.startsWith('//')) {
        return match;
      }
      const cleanPath = sanitizeRelativePath(path);
      return `<img${before}src="https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanPath}"${after}>`;
    });
}
