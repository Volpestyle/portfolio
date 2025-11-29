import Image from 'next/image';
import { AboutClient } from './AboutClient';
import { SocialLinks } from './SocialLinks';
import type { Metadata } from 'next';
import profile from '../../../generated/profile.json';
import { PROFILE_BIO_PARAGRAPHS, PROFILE_SOCIAL_LINKS } from '@/constants/profile';
import type { ProfileSocialLink, SocialPlatform } from '@portfolio/chat-contract';
import { resolveResumeFilename } from '@/server/chat/config';

const SOCIAL_PLATFORMS: SocialPlatform[] = ['x', 'github', 'youtube', 'linkedin', 'spotify'];

function normalizeSocialLinks(links: unknown): ProfileSocialLink[] {
  if (!Array.isArray(links)) return [];
  const normalized: ProfileSocialLink[] = [];
  for (const link of links) {
    const candidate = link as {
      platform?: unknown;
      label?: unknown;
      url?: unknown;
      blurb?: unknown;
    };
    const { platform, label, url, blurb } = candidate;
    if (
      typeof platform === 'string' &&
      SOCIAL_PLATFORMS.includes(platform as SocialPlatform) &&
      typeof label === 'string' &&
      typeof url === 'string' &&
      (typeof blurb === 'string' || typeof blurb === 'undefined')
    ) {
      normalized.push({ platform: platform as SocialPlatform, label, url, blurb });
    }
  }
  return normalized;
}

export const metadata: Metadata = {
  title: "About - JCV's Portfolio",
  description: 'Learn more about James Volpe, a software engineer from Chicago, IL USA',
  openGraph: {
    title: 'About James Volpe',
    description:
      'Software engineer from Chicago, IL USA with passions in animation, graphic design, music, and full stack web development',
    type: 'profile',
  },
};

export default function About() {
  const resumeFilename = resolveResumeFilename();
  const aboutParagraphs = profile.about?.length ? profile.about : PROFILE_BIO_PARAGRAPHS;
  const fromProfile = normalizeSocialLinks(profile.socialLinks);
  const socialLinks: readonly ProfileSocialLink[] =
    fromProfile.length > 0 ? fromProfile : PROFILE_SOCIAL_LINKS;
  const normalizedAbout = Array.isArray(aboutParagraphs) ? aboutParagraphs : [aboutParagraphs].filter(Boolean);

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="md:w-1/2">
        <Image
          src="/images/skateboard.jpg"
          alt="James"
          width={400}
          height={400}
          priority
          className="mb-4 h-auto w-full rounded-lg object-cover"
        />
        <SocialLinks links={socialLinks} />
      </div>
      <div className="md:w-1/2">
        <div className="preserve-case mb-4 space-y-4">
          {normalizedAbout.map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}
        </div>
        <h2 className="mb-2 mt-4 text-2xl font-bold">my resume</h2>
        <AboutClient resumeFilename={resumeFilename} />
      </div>
    </div>
  );
}
