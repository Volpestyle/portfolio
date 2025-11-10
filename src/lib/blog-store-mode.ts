const normalizeMode = (value?: string | null) => value?.toLowerCase() ?? undefined;

function detectMode(): 'mock' | 'aws' {
  const explicit = normalizeMode(process.env.BLOG_STORE_MODE);
  if (explicit === 'mock' || explicit === 'aws') {
    return explicit;
  }

  const hasAwsConfig = Boolean(
    process.env.POSTS_TABLE || process.env.CONTENT_BUCKET || process.env.MEDIA_BUCKET
  );

  return hasAwsConfig ? 'aws' : 'mock';
}

const resolvedMode = detectMode();
process.env.BLOG_STORE_MODE = resolvedMode;

export const blogStoreMode = resolvedMode;
export const isMockBlogStore = resolvedMode === 'mock';
