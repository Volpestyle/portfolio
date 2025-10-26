import Link from 'next/link';
import { ServerImageRenderer } from '@/components/ServerImageRenderer';

type MarkdownComponentOptions = {
  handleImageClick?: (src: string) => void;
  variant?: 'page' | 'chat';
  onDocLinkClick?: (path: string, label?: string) => void;
};

export const createMarkdownComponents = (
  pid: string,
  { handleImageClick, onDocLinkClick }: MarkdownComponentOptions = {}
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
  a: ({ href, children }: any) => {
    if (href && isDocsLink(href)) {
      const cleanPath = normalizeDocPath(href);

      if (onDocLinkClick) {
        return (
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault();
              onDocLinkClick(cleanPath, extractText(children));
            }}
            className="text-blue-400 underline hover:text-blue-300"
          >
            {children}
          </a>
        );
      }

      return (
        <Link
          href={`/projects/${pid}/doc/${cleanPath}`}
          className="text-blue-400 underline hover:text-blue-300"
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

function isDocsLink(href: string) {
  return href.startsWith('docs/') || href.startsWith('./docs/') || href.startsWith('/docs/');
}

function normalizeDocPath(href: string) {
  const cleaned = href.replace(/^\.\//, '').replace(/^\/+/, '');
  return cleaned;
}

function extractText(children: any): string | undefined {
  if (typeof children === 'string') {
    return children;
  }

  if (Array.isArray(children)) {
    const text = children.map((child) => extractText(child)).filter(Boolean).join(' ').trim();
    return text || undefined;
  }

  if (typeof children === 'object' && children?.props?.children) {
    return extractText(children.props.children);
  }

  return undefined;
}
