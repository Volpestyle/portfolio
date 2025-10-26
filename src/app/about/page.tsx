import Image from 'next/image';
import { siLinkedin, siGithub, siYoutube, siSpotify, siX } from 'simple-icons/icons';
import { AboutClient } from './AboutClient';
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

interface SocialLink {
  name: string;
  icon: {
    path: string;
    hex: string;
  };
  url: string;
}

const SocialIcon: React.FC<{ icon: { path: string; hex: string } }> = ({ icon }) => (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor">
    <path d={icon.path} />
  </svg>
);

export default function About() {
  const socialLinks: SocialLink[] = [
    {
      name: 'Twitter (x)',
      icon: siX,
      url: 'https://x.com/c0wboyboopbop',
    },
    { name: 'GitHub', icon: siGithub, url: 'https://github.com/Volpestyle' },
    {
      name: 'YouTube',
      icon: siYoutube,
      url: 'https://www.youtube.com/@vuhlp/videos',
    },
    {
      name: 'LinkedIn',
      icon: siLinkedin,
      url: 'https://www.linkedin.com/in/james-volpe/',
    },
    {
      name: 'Spotify',
      icon: siSpotify,
      url: 'https://open.spotify.com/artist/1s7neYGdYg0kCnUizWy3bk?si=GMzqI3G0RfialSx1-1NjDg',
    },
  ];

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
        <div className="flex flex-col gap-4">
          {socialLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 text-white transition-colors hover:text-gray-300"
            >
              <SocialIcon icon={link.icon} />
              <span className="relative">
                {link.name}
                <span className="absolute bottom-0 left-0 h-0.5 w-full scale-x-0 transform bg-gray-300 transition-transform duration-300 ease-in-out group-hover:scale-x-100"></span>
              </span>
            </a>
          ))}
        </div>
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
