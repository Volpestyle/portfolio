export interface DocumentConfig {
  path: string;
  gistId: string;
  filename?: string;
}

export interface PortfolioRepoConfig {
  name: string;
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
  createdAt?: string;
  updatedAt?: string;
  homepage?: string;
}

export interface PortfolioConfig {
  repositories: PortfolioRepoConfig[];
}

export interface PrivateRepoData {
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    avatar_url?: string;
  };
  description: string | null;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  created_at: string;
  updated_at: string;
  isStarred?: boolean;
  readme?: string;
  techStack?: string[];
  demoUrl?: string;
  screenshots?: string[];
}