# Language Enrichment Implementation

## Overview

This document describes the implementation of language data enrichment for project cards in the portfolio application. Language data is now fetched deterministically from GitHub's language detection API and displayed prominently on project cards.

## Changes Made

### 1. GitHub API Layer (`src/lib/github-api.ts`)

**Added Functions:**

- `fetchRepoLanguages(owner, repo)`: Fetches language breakdown from GitHub's API, returning a map of language names to byte counts
- `calculateLanguagePercentages(languagesBreakdown)`: Converts byte counts to percentages, sorted by usage (descending)

**Key Features:**

- Handles rate limiting through Octokit's built-in throttling
- Returns null gracefully on errors
- Percentages are rounded to 2 decimal places for precision

### 2. RepoData Type Extension (`src/lib/github-server.ts`)

**New Fields:**

- `languagesBreakdown?: Record<string, number>` - Raw byte counts from GitHub
- `languagePercentages?: Array<{ name: string; percent: number }>` - Calculated percentages

**Updated Functions:**

- `fetchPortfolioRepos()`: Now fetches language data for all public repos automatically
- `fetchRepoDetails()`: Includes language data when fetching individual repo details
- Private repos can specify language data in the portfolio config using the `languages` field

### 3. Knowledge Generation Script (`scripts/generate-project-knowledge.ts`)

**Changes:**

- `SummaryRecord` type now includes `languages?: Array<{ name: string; percent: number }>`
- Language data from GitHub is stored in `repo-summaries.json`
- **Languages removed from LLM-derived tags** - they now come from GitHub deterministically
- Updated prompts to instruct AI not to extract programming languages
- Language names included in embedding payload for better semantic search
- `derivedTags` now excludes `facts.languages` since those are provided by GitHub

**Benefits:**

- Deterministic language detection (no AI hallucination)
- Reduced LLM token usage
- More accurate language information
- Languages searchable in embeddings

### 4. Project Knowledge System (`src/server/project-knowledge.ts`)

**Updates:**

- `RepoSummaryRecord` and `KnowledgeRecord` types include language data
- `augmentRepoWithKnowledge()` merges language data from summaries into `RepoData`
- `searchRepoKnowledge()` returns language data in search results
- Language names included in searchable text for better filtering

### 5. UI Components

#### New Component: `LanguageBar` (`src/components/LanguageBar.tsx`)

**Features:**

- **Visual bar chart** showing language distribution with color-coded segments
- **Hover tooltips** displaying exact percentages
- **Language labels** with color dots and percentages (configurable max labels)
- **Smooth animations** using Framer Motion
- **GitHub-inspired color palette** for popular languages
- **Fallback color generation** for unknown languages using consistent hashing
- **Responsive design** that fits the portfolio's dark theme
- Filters out languages with < 0.1% for visual clarity

**Props:**

- `languages`: Array of language objects with name and percent
- `className`: Optional CSS classes
- `showLabels`: Toggle labels display (default: true)
- `maxLabels`: Maximum number of labels to show (default: 4)

#### Updated Component: `ProjectCard` (`src/components/ProjectCard.tsx`)

**Changes:**

- Imports `LanguageBar` component
- Displays language bar between date info and tags
- Shows up to 3 language labels on cards (configurable)
- Applied to both default and chat variants

### 6. Type System (`src/types/portfolio.ts`)

**Updated:**

- `PortfolioRepoConfig` now includes optional `languages` field for private repos

## Data Flow

```
GitHub API (listLanguages)
    ↓
fetchRepoLanguages() → byte counts
    ↓
calculateLanguagePercentages() → percentages
    ↓
RepoData (languagesBreakdown + languagePercentages)
    ↓
├─→ generate-project-knowledge.ts → repo-summaries.json
│       ↓
│   project-knowledge.ts (augmentRepoWithKnowledge)
│
└─→ ProjectCard → LanguageBar (UI display)
```

## Usage Examples

### For Public Repos

Language data is automatically fetched and populated when calling:

- `fetchPortfolioRepos()`
- `fetchRepoDetails(repo, owner)`

### For Private Repos

Add language data to your portfolio config:

```json
{
  "name": "my-private-repo",
  "isPrivate": true,
  "languages": [
    { "name": "TypeScript", "percent": 65.5 },
    { "name": "JavaScript", "percent": 25.3 },
    { "name": "CSS", "percent": 9.2 }
  ]
}
```

### Customizing Language Bar Display

```tsx
<LanguageBar
  languages={repo.languagePercentages}
  maxLabels={5} // Show up to 5 languages
  showLabels={true} // Show/hide labels
  className="my-4" // Custom spacing
/>
```

## Benefits

1. **Deterministic Data**: Language percentages come directly from GitHub's analysis, not AI inference
2. **Better UX**: Visual language bars provide instant insight into project tech stack
3. **Cleaner Tags**: LLM-derived tags now focus on frameworks, platforms, and tooling
4. **Searchable**: Languages are included in embeddings for semantic search
5. **Consistent**: Uses GitHub's official language colors and detection
6. **Performance**: No extra API calls needed - cached with repo data
7. **Accessibility**: Hover tooltips and clear visual indicators

## Next Steps

To generate updated knowledge with language data:

```bash
# From project root
pnpm tsx scripts/generate-project-knowledge.ts
```

This will:

1. Fetch all repos from portfolio config
2. Get language data from GitHub for each public repo
3. Generate summaries WITHOUT language tags (since they come from GitHub)
4. Store language percentages in `generated/repo-summaries.json`
5. Update embeddings with language data for search

## Testing

Language data will automatically appear on:

- Project cards on `/projects` page
- Project cards in chat responses
- Project detail pages
- Chat search results

No additional configuration needed - it works out of the box for public repos!
