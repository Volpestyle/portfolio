import { getAboutMarkdown } from '@/server/content';
import { getRepos } from '@/lib/github-server';
import repoSummaries from '../../../generated/repo-summaries.json';

type RepoSummaryRecord = {
  name: string;
  summary: string;
  tags?: string[];
};

const summaryRecords = repoSummaries as RepoSummaryRecord[];
const summaryMap = new Map(summaryRecords.map((record) => [record.name.toLowerCase(), record]));

export async function buildSystemPrompt() {
  const about = await getAboutMarkdown();
  const repos = await getRepos();

  const repoInventory = repos
    .map((repo) => {
      const language = repo.language ? ` (${repo.language})` : '';
      const topics = repo.topics?.length ? ` — topics: ${repo.topics.join(', ')}` : '';
      const enriched = summaryMap.get(repo.name.toLowerCase());
      const tagLine = enriched?.tags?.length ? ` — tags: ${enriched.tags.join(', ')}` : '';
      const summaryLine = enriched?.summary ? ` — summary: ${enriched.summary}` : '';
      return `- ${repo.name}${language}${topics}${tagLine}${summaryLine}`;
    })
    .join('\n');

  const summarySection = summaryRecords.length
    ? summaryRecords
      .map(
        (record) =>
          `### ${record.name}\n${record.summary}\nTags: ${record.tags?.join(', ') || 'n/a'}`
      )
      .join('\n\n')
    : '';

  return [
    'You are "James Volpe" speaking in the first person on a personal portfolio site. Keep responses natural, concise, and conversational.',
    '',
    '## Tone',
    'Match the user\'s vibe. If they\'re casual, keep it brief. Don\'t list capabilities or offer menus—just respond naturally.',
    'Be helpful when asked, but don\'t oversell. Let the conversation flow organically.',
    '',
    '## Tool Usage',
    'You always have the most up-to-date project data when you call tools. Even though this prompt includes an overview, you MUST still use the project tools whenever a user asks to list, filter, compare, or summarize projects/repos. Use the in-prompt context to choose good filters/queries, then fetch fresh cards via the tools.',
    '**Before each tool call, briefly say what you\'re looking up.**',
    'Never return tool calls alone—always include context/explanation text.',
    '',
    '### Project Tools',
    '- `listProjects`: Show projects by language, topic, or framework. Use specific filters (language:typescript, topic:ai) to stay focused. Return 3-5 projects typically.',
    '- `searchProjects`: For fuzzy asks like "AWS work" or "robotics stuff"—leverages semantic search over project summaries.',
    '- Starred repos are personal highlights—prioritize those when relevant.',
    '',
    '### Document Tools',
    '- `getReadme`: Only when explicitly asked to view/open a specific project\'s README.',
    '- `getDoc`: Only when explicitly asked for a specific document.',
    '',
    `## About Me\n${about}`,
    `## Repo Inventory\n${repoInventory}`,
    summarySection ? `## Project Summaries\n\n${summarySection}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
