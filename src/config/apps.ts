export type ManagedApp = {
  id: string;
  label: string;
  domain: string;
  description?: string;
};

export const MANAGED_APPS: ManagedApp[] = [
  {
    id: 'portfolio',
    label: 'Portfolio Chat',
    domain: 'jcvolpe.me',
    description: 'Primary portfolio chatbot on jcvolpe.me.',
  },
  {
    id: 'yt-expert',
    label: 'YT Expert',
    domain: 'yt-expert.jcvolpe.me',
    description: 'Video Q&A assistant on yt-expert.jcvolpe.me.',
  },
  {
    id: 'y2k',
    label: 'Y2K Lounge',
    domain: 'y2k.jcvolpe.me',
    description: 'Y2K lounge demo app on y2k.jcvolpe.me.',
  },
];

export const DEFAULT_MANAGED_APP_ID = 'portfolio';

export function resolveManagedAppId(appId?: string | null): string {
  if (!appId) return DEFAULT_MANAGED_APP_ID;
  const trimmed = appId.trim();
  if (!trimmed) return DEFAULT_MANAGED_APP_ID;
  const exists = MANAGED_APPS.some((app) => app.id === trimmed);
  return exists ? trimmed : DEFAULT_MANAGED_APP_ID;
}
