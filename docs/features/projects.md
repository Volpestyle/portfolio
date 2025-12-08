# Projects Feature

The portfolio showcases GitHub projects with dynamic documentation rendering.

## Features

- **Project Gallery** - Grid display of portfolio projects
- **Dynamic Docs** - Render docs from GitHub repositories
- **GitHub Integration** - Pull project metadata via API
- **Search** - Filter projects by technology or name

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        /projects                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Project Gallery                            ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        ││
│  │  │Project 1│  │Project 2│  │Project 3│  │Project 4│        ││
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        ││
│  └───────┼────────────┼────────────┼────────────┼──────────────┘│
└──────────┼────────────┼────────────┼────────────┼───────────────┘
           │            │            │            │
           └────────────┴────────────┴────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              /projects/[pid]/doc/[...path]                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                Dynamic Documentation                         ││
│  │  Rendered from GitHub repository docs                        ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub API                                │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ Portfolio Gist  │  │ Repository Docs │                       │
│  │ (projects.json) │  │ (/docs, README) │                       │
│  └─────────────────┘  └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

## Data Sources

### Portfolio Gist

Projects defined in GitHub gist (`PORTFOLIO_GIST_ID`):

```json
// projects.json
{
  "projects": [
    {
      "id": "my-project",
      "name": "My Project",
      "description": "A cool project",
      "repo": "owner/my-project",
      "technologies": ["React", "TypeScript"],
      "featured": true,
      "docsPath": "docs"
    }
  ]
}
```

### GitHub Repository

Additional metadata fetched from GitHub:

- Stars, forks, watchers
- Last updated timestamp
- Topics/tags
- Languages

## Routes

### Project List

**Route:** `/projects`

Displays grid of all portfolio projects:

```typescript
// src/app/projects/page.tsx
export default async function ProjectsPage() {
  const projects = await getProjects();
  return <ProjectGrid projects={projects} />;
}
```

### Project Detail

**Route:** `/projects/[pid]`

Shows single project with README:

```typescript
// src/app/projects/[pid]/page.tsx
export default async function ProjectPage({ params }) {
  const project = await getProject(params.pid);
  const readme = await getRepoReadme(project.repo);
  return <ProjectDetail project={project} readme={readme} />;
}
```

### Project Documentation

**Route:** `/projects/[pid]/doc/[...path]`

Renders documentation from repository:

```typescript
// src/app/projects/[pid]/doc/[...path]/page.tsx
export default async function DocPage({ params }) {
  const { pid, path } = params;
  const project = await getProject(pid);
  const content = await getRepoFile(project.repo, path.join('/'));
  return <MarkdownRenderer content={content} />;
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/github/portfolio-repos` | GET | List all portfolio repos |
| `/api/github/repos/[owner]/[repo]` | GET | Get repo metadata |
| `/api/github/repos/[owner]/[repo]/readme` | GET | Get repo README |
| `/api/github/repos/[owner]/[repo]/contents/[...path]` | GET | Get file contents |

## GitHub Integration

### Authentication

```bash
GH_TOKEN=ghp_your_personal_access_token
```

### @portfolio/github-data

Uses Octokit for API access:

```typescript
import { createGitHubClient, fetchRepoFile } from '@portfolio/github-data';

const client = createGitHubClient(process.env.GH_TOKEN);
const content = await fetchRepoFile(client, 'owner/repo', 'docs/guide.md');
```

## Caching

### ISR Configuration

Projects page uses ISR with revalidation:

```typescript
export const revalidate = 3600; // 1 hour
```

### Cache Tags

```typescript
// Revalidate all projects
await revalidateTag('github-repos');

// Revalidate specific project
await revalidateTag(`project:${projectId}`);
```

## Search and Filtering

### Client-Side Search

```typescript
const filteredProjects = projects.filter(p =>
  p.name.toLowerCase().includes(query) ||
  p.technologies.some(t => t.toLowerCase().includes(query))
);
```

### Technology Filters

Filter by technology stack:

```typescript
const reactProjects = projects.filter(p =>
  p.technologies.includes('React')
);
```

## Development

### Fixture Mode

Use mock projects during development:

```bash
PORTFOLIO_TEST_FIXTURES=true pnpm dev
```

### Real Data

Connect to GitHub API:

```bash
PORTFOLIO_TEST_FIXTURES= pnpm dev
```

## Preprocessing

Projects are preprocessed for chat search:

```bash
pnpm chat:preprocess
```

Generates:
- `generated/projects.json` - Project list
- `generated/projects-embeddings.json` - Vector embeddings

## Related Documentation

- [Chat Overview](./chat/overview.md) - How projects integrate with chat
- [GitHub Data Package](../../packages/github-data/) - API client
