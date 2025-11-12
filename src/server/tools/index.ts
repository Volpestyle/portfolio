import { findProjects, getDoc, getReadme } from './github-tools';

export type FunctionTool = {
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

export async function buildTools(): Promise<FunctionTool[]> {
  return [
    {
      type: 'function',
      name: 'findProjects',
      description:
        "Intelligent project search using AI-powered filtering. Describe what you're looking for in natural language (e.g., 'TypeScript AWS apps', 'AI research tools', 'Rust projects'). The tool uses semantic search + LLM re-ranking to filter false positives and return only genuinely matching projects. Use limit=1 for a single highlight and 3–5 for overviews. If nothing matches, expect an empty list and explain that to the user.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Natural language search query. The tool intelligently matches projects and filters out false positives (e.g., "Rust" will not match "Rubiks").',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: 'Maximum number of projects to return.',
            default: 5,
          },
        },
        required: ['query', 'limit'],
        additionalProperties: false,
      },
      strict: true,
    },
    {
      type: 'function',
      name: 'getReadme',
      description:
        'Fetch and display the README for a specific repository. Only call when the user explicitly asks to read/open a README.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name to fetch the README for.' },
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
        'Load a specific markdown document from a repository (e.g., docs/architecture.md). Only call when the user names the document.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name.' },
          path: { type: 'string', description: 'Document path inside the repository.' },
        },
        required: ['repo', 'path'],
        additionalProperties: false,
      },
      strict: true,
    },
  ];
}

type ToolCall = {
  name: string;
  arguments?: string;
};

export async function toolRouter(call: ToolCall) {
  const args = call.arguments ? JSON.parse(call.arguments) : {};

  switch (call.name) {
    case 'findProjects': {
      const limitArg =
        typeof args?.limit === 'number' && Number.isFinite(args.limit)
          ? Math.max(1, Math.min(10, Math.floor(args.limit)))
          : undefined;
      const repos = await findProjects({
        query: typeof args?.query === 'string' ? args.query : '',
        limit: limitArg,
      });
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
