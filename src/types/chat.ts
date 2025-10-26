import type { RepoData } from '@/lib/github-server';
import type { ProfileSocialLink } from '@/constants/profile';

export type ChatRole = 'user' | 'assistant';

export type BannerMode = 'idle' | 'thinking' | 'hover' | 'chat';

export type BannerState =
  | { mode: 'idle' }
  | { mode: 'thinking' }
  | { mode: 'hover'; text?: string }
  | { mode: 'chat'; text?: string };

export type ChatTextPart = {
  kind: 'text';
  text: string;
  itemId?: string;
};

export type ProjectCardsAttachment = {
  type: 'project-cards';
  repos: RepoData[];
};

export type ProjectDetailsAttachment = {
  type: 'project-details';
  repo: RepoData;
  readme: string;
  breadcrumbsOverride?: { label: string; href?: string }[];
};

export type DocumentAttachment = {
  type: 'doc';
  repoName: string;
  title: string;
  path: string;
  content: string;
  breadcrumbsOverride?: { label: string; href?: string }[];
};

export type LinkAttachment = {
  type: 'link';
  url: string;
  label?: string;
};

export type SocialLinksAttachment = {
  type: 'social-links';
  links: ProfileSocialLink[];
};

export type ChatAttachment =
  | ProjectCardsAttachment
  | ProjectDetailsAttachment
  | DocumentAttachment
  | SocialLinksAttachment
  | LinkAttachment;

export type ChatAttachmentPart = {
  kind: 'attachment';
  attachment: ChatAttachment;
  itemId?: string;
};

export type ChatMessagePart = ChatTextPart | ChatAttachmentPart;

export type ChatMessage = {
  id: string;
  role: ChatRole;
  parts: ChatMessagePart[];
  createdAt?: string;
  animated?: boolean;
};

export type ChatRequestMessage = {
  role: ChatRole;
  content: string;
};

export type ChatApiRequest = {
  messages: ChatRequestMessage[];
};

export type ChatApiResponse = {
  message: ChatMessage;
  bannerText?: string;
};
