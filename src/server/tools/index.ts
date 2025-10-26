import { getDoc, getReadme, listProjects } from './github-tools';

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
    description: "List James's repositories with optional language/topic filters.",
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
        },
      },
      required: [],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: 'function',
    name: 'getReadme',
    description: 'Fetch README content and metadata for a repository.',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string' },
      },
      required: ['repo'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'getDoc',
    description: 'Load a markdown doc from within a repo (e.g., docs/ARCH.md).',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string' },
        path: { type: 'string' },
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
      const repos = await listProjects(args);
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
