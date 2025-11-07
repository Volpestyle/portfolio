export interface BlogPost {
  id: string;
  title: string;
  date: string;
  description: string;
  tags?: string[];
  readTime?: string;
}

export interface BlogPostWithContent extends BlogPost {
  content: string;
}

