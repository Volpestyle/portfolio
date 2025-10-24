import Link from 'next/link';
import { ServerImageRenderer } from '@/components/ServerImageRenderer';

export const createMarkdownComponents = (
  pid: string,
  handleImageClick?: (src: string) => void
) => ({
  p: ({ node, children, ...props }: any) => {
    // Check if paragraph contains only image and text nodes
    const containsOnlyImageAndText = node?.children?.every(
      (child: any) => child.tagName === 'img' || (child.type === 'text' && /^[\s.]*$/.test(child.value))
    );

    // If it's an image-only paragraph, wrap in div
    if (containsOnlyImageAndText) {
      return <div className="my-4 flex flex-col items-start gap-2">{children}</div>;
    }

    // For mixed content (text + image), ensure proper wrapping
    const hasImage = node?.children?.some((child: any) => child.tagName === 'img');
    if (hasImage) {
      return <div className="my-4">{children}</div>;
    }

    // Regular paragraph
    return <p {...props}>{children}</p>;
  },
  img: ({ src, alt, ...props }: any) => {
    if (!src) return null;
    // Images are already processed server-side with absolute URLs
    return (
      <span className="inline-block">
        <ServerImageRenderer
          src={src}
          alt={alt || ''}
          onImageClick={handleImageClick}
          {...props}
        />
      </span>
    );
  },
  a: ({ href, children, node, ...props }: any) => {
    // Handle internal document links
    if (href && (href.startsWith('docs/') || href.startsWith('./docs/'))) {
      const cleanPath = href.replace(/^\.\//, '');
      return (
        <Link
          href={`/projects/${pid}/doc/${cleanPath}`}
          className="text-blue-400 hover:text-blue-300 underline"
        >
          {children}
        </Link>
      );
    }
    // External links
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 underline"
      >
        {children}
      </a>
    );
  },
});
