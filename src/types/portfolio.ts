export interface DocumentConfig {
  path: string;
  gistId: string;
  filename?: string;
}

export interface PortfolioRepoConfig {
  name: string;
  publicRepo?: string;
  isStarred?: boolean;
  isPrivate?: boolean;
  owner?: string;
  description?: string;
  readme?: string;
  readmeGistId?: string;
  documents?: DocumentConfig[];
  techStack?: string[];
  demoUrl?: string;
  screenshots?: string[];
  topics?: string[];
  language?: string;
  languages?: Array<{ name: string; percent: number }>;
  createdAt?: string;
  updatedAt?: string;
  homepage?: string;
  icon?: string;
}

export interface PortfolioConfig {
  repositories: PortfolioRepoConfig[];
}
