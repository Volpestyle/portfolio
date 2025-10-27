import { getDoc, getReadme, listProjects, searchProjects } from './github-tools';

type FunctionTool = {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: readonly string[];
    additionalProperties: boolean;
  };
  strict: boolean;
};

export const tools: FunctionTool[] = [
  {
    type: 'function',
    name: 'listProjects',
    description:
      "List James's projects/repositories. PRIMARY TOOL for showing projects. Use filters to group by language (e.g., 'TypeScript', 'Python') or topic/subject (e.g., 'ai', 'web', 'data', 'fullstack'). Combine filters to narrow results. CRITICAL: When user asks for ONE specific project by name, ALWAYS set limit=1. For general browsing, use 3-5. Sort by 'recent' for latest work, 'starred' for highlights, or 'alphabetical'. Returns project cards that display inline in the chat.",
    parameters: {
      type: 'object',
      properties: {
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', enum: ['language', 'topic'] },
              value: { type: 'string' },
            },
            required: ['field', 'value'],
            additionalProperties: false,
          },
          description:
            "Filter projects by 'language' (programming language) or 'topic' (domain/category). Can use multiple filters.",
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Maximum number of projects to return. Use 1 for single project, 3-5 for focused lists.',
        },
        sort: {
          type: 'string',
          enum: ['recent', 'alphabetical', 'starred'],
          description:
            "Sort order: 'recent' for latest updates, 'starred' for highlighted projects, 'alphabetical' for A-Z.",
        },
      },
      required: [],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: 'function',
    name: 'searchProjects',
    description:
      'Semantic project lookup. Use when a user asks for themes (e.g., "AWS work", "AED sheets", "data pipelines") or specific project names (e.g., "improview", "ilikeyacut"). CRITICAL: When user asks for ONE specific project, ALWAYS set limit=1. For thematic searches, use 3-5. Returns the most relevant project cards ranked by similarity.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Free-form text describing what to look for (technologies, domains, questions).',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'How many semantic matches to return (defaults to 5).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: 'function',
    name: 'getReadme',
    description:
      'Fetch and display full README content for a specific repository. ONLY use when user explicitly asks to see/open/read a README (e.g., "show me the README for X", "open X\'s README"). Returns inline project details with the full README rendered.',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name to fetch README for' },
      },
      required: ['repo'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'getDoc',
    description:
      'Load a specific markdown document from within a repository (e.g., docs/architecture.md, docs/api.md). ONLY use when user explicitly requests a specific document by name or path. Returns the document content rendered inline.',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'Path to the document within the repo (e.g., "docs/setup.md")' },
      },
      required: ['repo', 'path'],
      additionalProperties: false,
    },
    strict: true,
  },
];

type ToolCall = {
  name: string;
  arguments?: string;
};

export async function toolRouter(call: ToolCall) {
  const args = call.arguments ? JSON.parse(call.arguments) : {};

  switch (call.name) {
    case 'listProjects': {
      const limitArg =
        typeof args?.limit === 'number' && Number.isFinite(args.limit)
          ? Math.max(1, Math.min(20, Math.floor(args.limit)))
          : undefined;
      const primaryRepos = await listProjects(args);
      let combinedRepos = primaryRepos;

      if (limitArg) {
        combinedRepos = combinedRepos.slice(0, limitArg);
      }

      return { type: 'project-cards', repos: combinedRepos } as const;
    }
    case 'searchProjects': {
      const repos = await searchProjects(args);
      return { type: 'project-cards', repos } as const;
    }
    case 'getReadme': {
      const result = await getReadme(args);
      return { type: 'project-details', repo: result.repo, readme: result.readme } as const;
    }
    case 'getDoc': {
      const result = await getDoc(args);
      return {
        type: 'doc',
        repoName: result.repoName,
        title: result.title,
        path: result.path,
        content: result.content,
      } as const;
    }
    default:
      throw new Error(`Unknown tool: ${call.name}`);
  }
}
