import type { ProfileSocialLink } from '@/constants/profile';

type Props = {
  links: ProfileSocialLink[];
};

export function SocialLinkList({ links }: Props) {
  return (
    <div className="grid gap-3">
      {links.map((link) => (
        <a
          key={link.platform}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/40 hover:bg-white/10"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-white">{link.label}</div>
            <span className="text-xs uppercase tracking-wide text-white/60">Follow</span>
          </div>
          {link.blurb ? <p className="mt-2 text-sm text-white/70">{link.blurb}</p> : null}
          <div className="mt-3 text-xs text-blue-300 underline underline-offset-4 group-hover:text-blue-200">
            {link.url}
          </div>
        </a>
      ))}
    </div>
  );
}

