/**
 * Transforms relative URLs to absolute GitHub URLs
 * @param content - The README content
 * @param owner - GitHub username/organization
 * @param repo - The repository name
 * @param branch - The branch name (default: main)
 * @returns README content with absolute URLs
 */
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