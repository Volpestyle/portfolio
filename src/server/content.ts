import { PROFILE_BIO_PARAGRAPHS } from '@/constants/profile';

export async function getAboutMarkdown() {
  return PROFILE_BIO_PARAGRAPHS.join('\n\n');
}
