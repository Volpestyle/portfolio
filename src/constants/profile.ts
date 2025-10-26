export type SocialPlatform = 'x' | 'github' | 'youtube' | 'linkedin' | 'spotify';

export type ProfileSocialLink = {
  platform: SocialPlatform;
  label: string;
  url: string;
  blurb?: string;
};

export const PROFILE_BIO_PARAGRAPHS: readonly string[] = [
  "I'm a software engineer from Chicago, IL USA. I graduated from Iowa State University in May 2021, with a B.S. in Software Engineering 📚. Over the years I've found many passions, from animation, graphic design, and writing music, to full stack web development. I think the common theme here is that I love to make things 🧑‍🎨.",
] as const;

export const PROFILE_SOCIAL_LINKS: readonly ProfileSocialLink[] = [
  {
    platform: 'x',
    label: 'Twitter (X)',
    url: 'https://x.com/c0wboyboopbop',
    blurb: 'Day-to-day thoughts, product ideas, and tech musings.',
  },
  {
    platform: 'github',
    label: 'GitHub',
    url: 'https://github.com/Volpestyle',
    blurb: 'Open-source experiments, OSS contributions, and portfolio code.',
  },
  {
    platform: 'youtube',
    label: 'YouTube',
    url: 'https://www.youtube.com/@vuhlp/videos',
    blurb: 'Music, design explorations, and creative projects in motion.',
  },
  {
    platform: 'linkedin',
    label: 'LinkedIn',
    url: 'https://www.linkedin.com/in/james-volpe/',
    blurb: 'Professional resume, experience, and networking.',
  },
  {
    platform: 'spotify',
    label: 'Spotify',
    url: 'https://open.spotify.com/artist/1s7neYGdYg0kCnUizWy3bk?si=GMzqI3G0RfialSx1-1NjDg',
    blurb: 'Original music and sound design experiments.',
  },
] as const;

