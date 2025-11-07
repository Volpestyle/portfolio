import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { BlogPost, BlogPostWithContent } from '@/types/blog';

const BLOG_DIRECTORY = path.join(process.cwd(), 'content', 'blog');

// Ensure blog directory exists
if (!fs.existsSync(BLOG_DIRECTORY)) {
  fs.mkdirSync(BLOG_DIRECTORY, { recursive: true });
}

export function getAllBlogPosts(): BlogPost[] {
  try {
    const files = fs.readdirSync(BLOG_DIRECTORY);
    const mdFiles = files.filter((file) => file.endsWith('.md') && file !== 'README.md');

    const posts = mdFiles.map((filename) => {
      const id = filename.replace(/\.md$/, '');
      const fullPath = path.join(BLOG_DIRECTORY, filename);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const { data } = matter(fileContents);

      return {
        id,
        title: data.title || id,
        date: data.date || new Date().toISOString(),
        description: data.description || '',
        tags: data.tags || [],
        readTime: data.readTime || '',
      };
    });

    // Sort posts by date (newest first)
    return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error('Error reading blog posts:', error);
    return [];
  }
}

export function getBlogPost(id: string): BlogPostWithContent | null {
  try {
    const fullPath = path.join(BLOG_DIRECTORY, `${id}.md`);
    
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data, content } = matter(fileContents);

    return {
      id,
      title: data.title || id,
      date: data.date || new Date().toISOString(),
      description: data.description || '',
      tags: data.tags || [],
      readTime: data.readTime || '',
      content,
    };
  } catch (error) {
    console.error(`Error reading blog post ${id}:`, error);
    return null;
  }
}

