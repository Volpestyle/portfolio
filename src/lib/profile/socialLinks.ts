import { SOCIAL_PLATFORM_VALUES, type ProfileSocialLink, type SocialPlatform } from '@portfolio/chat-contract';
import { siGithub, siLinkedin, siSpotify, siX, siYoutube } from 'simple-icons/icons';
import profile from '../../../generated/profile.json';

export type SocialIcon = { path: string; hex: string };

const ICONS: Record<SocialPlatform, SocialIcon> = {
  x: siX,
  github: siGithub,
  youtube: siYoutube,
  linkedin: siLinkedin,
  spotify: siSpotify,
};

const ALLOWED_PLATFORMS = new Set<string>(SOCIAL_PLATFORM_VALUES);

export function normalizeLinkId(value?: string) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function normalizeSocialLinks(links: unknown): ProfileSocialLink[] {
  if (!Array.isArray(links)) return [];
  const normalized: ProfileSocialLink[] = [];
  for (const link of links) {
    const candidate = link as { platform?: unknown; label?: unknown; url?: unknown; blurb?: unknown };
    const platform = normalizeLinkId(candidate.platform as string | undefined);
    if (!platform || !ALLOWED_PLATFORMS.has(platform)) {
      continue;
    }
    const label = typeof candidate.label === 'string' ? candidate.label : '';
    const url = typeof candidate.url === 'string' ? candidate.url : '';
    const blurb = typeof candidate.blurb === 'string' ? candidate.blurb : undefined;
    if (!label || !url) {
      continue;
    }
    normalized.push({ platform: platform as SocialPlatform, label, url, blurb });
  }
  return normalized;
}

const SOCIAL_LINKS: ProfileSocialLink[] = normalizeSocialLinks((profile as { socialLinks?: unknown }).socialLinks).map(
  (link) => ({
    ...link,
  })
);
const SOCIAL_LINK_MAP = new Map<string, ProfileSocialLink>(
  SOCIAL_LINKS.map((link) => [normalizeLinkId(link.platform), link])
);

export function getProfileSocialLinks(): ProfileSocialLink[] {
  return SOCIAL_LINKS;
}

export function resolveSocialLink(id?: string): ProfileSocialLink | undefined {
  const normalized = normalizeLinkId(id);
  if (!normalized) return undefined;
  return SOCIAL_LINK_MAP.get(normalized);
}

export function getSocialIcon(platform: SocialPlatform): SocialIcon {
  return ICONS[platform] ?? ICONS.github;
}
