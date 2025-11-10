import Image from 'next/image';
import { AboutClient } from './AboutClient';
import { SocialLinks } from './SocialLinks';
import type { Metadata } from 'next';

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
        <SocialLinks />
      </div>
      <div className="md:w-1/2">
        <p className="preserve-case mb-4">
          I&apos;m a software engineer from Chicago, IL USA. I graduated from Iowa State University in May 2021, with a
          B.S. in Software Engineering 📚. Over the years I&apos;ve found many passions, from animation, graphic design,
          and writing music, to full stack web development. I think the common theme here is that I love to make things
          🧑‍🎨.
        </p>
        <h2 className="mb-2 mt-4 text-2xl font-bold">my resume</h2>
        <AboutClient />
      </div>
    </div>
  );
}
