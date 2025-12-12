import { BookOpen, FileText, FolderGit2, Mail, MessageSquare, Rocket, User } from 'lucide-react';
import type { NavConfig, NavItem, NavRouteMatch } from '@/types/navigation';
import { hoverMessages } from '@/constants/messages';

/**
 * Base/portfolio navigation items
 */
export const BASE_NAV_ITEMS: NavItem[] = [
  { href: '/', icon: MessageSquare, label: 'chat', hoverMessage: '', expandedWidth: '4.5rem' },
  { href: '/about', icon: User, label: 'about', hoverMessage: hoverMessages.about, expandedWidth: '5rem' },
  { href: '/projects', icon: Rocket, label: 'projects', hoverMessage: hoverMessages.projects, expandedWidth: '6.5rem' },
  { href: '/blog', icon: BookOpen, label: 'blog', hoverMessage: hoverMessages.blog, expandedWidth: '4.5rem' },
  { href: '/contact', icon: Mail, label: 'contact', hoverMessage: hoverMessages.contact, expandedWidth: '6rem' },
];

/**
 * Admin navigation items
 */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/admin', icon: FileText, label: 'posts', expandedWidth: '5rem' },
  { href: '/admin/portfolio', icon: FolderGit2, label: 'portfolio', expandedWidth: '6rem' },
  { href: '/admin/chat-exports', icon: MessageSquare, label: 'chats', expandedWidth: '5rem' },
];

/**
 * Navigation configurations by ID
 */
export const NAV_CONFIGS: Record<string, NavConfig> = {
  base: {
    id: 'base',
    items: BASE_NAV_ITEMS,
    headerText: 'JCV',
    brandHref: '/',
    useHoverContext: true,
    supportsMobileAnimations: true,
  },
  admin: {
    id: 'admin',
    items: ADMIN_NAV_ITEMS,
    headerText: 'Admin',
    brandHref: '/',
    brandHoverText: 'JCV',
    useHoverContext: false,
    supportsMobileAnimations: false,
  },
};

/**
 * Route matchers to determine which nav config to use
 * Order matters - first match wins
 */
export const NAV_ROUTE_MATCHERS: NavRouteMatch[] = [
  { match: (pathname) => pathname.startsWith('/admin'), navId: 'admin' },
  { match: () => true, navId: 'base' }, // Default fallback
];

/**
 * Resolve the nav config ID for a given pathname
 */
export function resolveNavConfigId(pathname: string | null): string {
  if (!pathname) return 'base';
  const match = NAV_ROUTE_MATCHERS.find((m) => m.match(pathname));
  return match?.navId ?? 'base';
}

/**
 * Get the nav config for a given pathname
 */
export function getNavConfig(pathname: string | null): NavConfig {
  const configId = resolveNavConfigId(pathname);
  return NAV_CONFIGS[configId] ?? NAV_CONFIGS.base;
}
