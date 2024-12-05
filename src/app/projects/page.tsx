import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { StarIcon } from "@/lib/svgs";

interface Repository {
  id: number;
  name: string;
  description: string;
  html_url: string;
  isStarred?: boolean;
  created_at: string;
  pushed_at: string;
}

function formatDate(dateString: string): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return new Date(dateString).toLocaleDateString(undefined, options);
}

const allowedRepos = new Set([
  "slash-siege",
  "rubiks-cube",
  "AWS-IAM-Projects",
  "AED-Sheets",
  "portfolio",
  "Parse-Tree-Calculator",
  "personal-web-app",
  "personal-website-v1",
]);

const starredRepos = new Set([
  "slash-siege",
  "rubiks-cube",
  "AWS-IAM-Projects",
  "AED-Sheets",
]);

async function getRepositories() {
  const response = await fetch(
    "https://api.github.com/users/volpestyle/repos?per_page=100",
    { next: { revalidate: 3600 } }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch repositories");
  }

  const data: Repository[] = await response.json();

  // Create a map for quick lookup
  const repoMap = new Map(data.map((repo) => [repo.name, repo]));

  // Filter in order of allowedRepos
  return {
    starred: Array.from(starredRepos)
      .filter((name) => repoMap.has(name))
      .map((name) => ({ ...repoMap.get(name)!, isStarred: true })),
    normal: Array.from(allowedRepos)
      .filter((name) => !starredRepos.has(name) && repoMap.has(name))
      .map((name) => ({ ...repoMap.get(name)!, isStarred: false })),
  };
}

export default async function Projects() {
  const { starred, normal } = await getRepositories();
  const repos = [...starred, ...normal];

  return (
    <>
      <h1 className="text-3xl font-bold mb-6">My Code</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {repos.map((repo) => (
          <Card
            key={repo.id}
            className="p-4 bg-black bg-opacity-10 text-white border-white relative"
          >
            {repo.isStarred && <StarIcon />}
            <h2 className="text-xl font-bold mb-2">{repo.name}</h2>
            <p className="mb-4 text-sm">{repo.description}</p>
            <p className="mt-4 text-xs text-gray-400">
              <span className="font-bold">Created:</span>{" "}
              {formatDate(repo.created_at)}
            </p>
            <p className="mt-1 mb-2 text-xs text-gray-400">
              <span className="font-bold">Last commit:</span>{" "}
              {formatDate(repo.pushed_at)}
            </p>
            <Button
              asChild
              className="bg-white text-black hover:bg-gray-200 mt-2"
            >
              <Link href={`/projects/${repo.name}`}>View Details</Link>
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
