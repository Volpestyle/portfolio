import type { LucideIcon } from 'lucide-react';

/**
 * Configuration for a single navigation item
 */
export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  /** Hover message shown in the global hover context (base nav only) */
  hoverMessage?: string;
  /** Width when expanded on hover */
  expandedWidth: string;
}

/**
 * Configuration for a navigation variant (e.g., base, admin)
 */
export interface NavConfig {
  /** Unique identifier for this nav variant */
  id: string;
  /** Navigation items to display */
  items: NavItem[];
  /** Text displayed in the header typewriter */
  headerText: string;
  /** Where the brand/logo links to */
  brandHref: string;
  /** Text shown when hovering the brand link (typewriter target) */
  brandHoverText?: string;
  /** Whether to use hover context for messages */
  useHoverContext?: boolean;
  /** Whether to show mobile-specific animations */
  supportsMobileAnimations?: boolean;
  /** Optional trailing element (e.g., settings dropdown) */
  trailingElement?: React.ComponentType;
}

/**
 * Route pattern matcher for determining which nav config to use
 */
export interface NavRouteMatch {
  /** Function to test if pathname matches this route */
  match: (pathname: string) => boolean;
  /** Nav config ID to use when matched */
  navId: string;
}
