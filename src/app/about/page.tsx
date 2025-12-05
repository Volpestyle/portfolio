import Image from 'next/image';
import { AboutClient } from './AboutClient';
import { SocialLinks } from './SocialLinks';
import type { Metadata } from 'next';
import profile from '../../../generated/profile.json';
import { PROFILE_BIO_PARAGRAPHS } from '@/constants/profile';
import { resolveResumeFilename } from '@/server/chat/config';
import { getProfileSocialLinks } from '@/lib/profile/socialLinks';

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
  const socialLinks = getProfileSocialLinks();
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
