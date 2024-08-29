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
}

const allowedRepos = new Set([
  "AED-Sheets",
  "AWS-IAM-Projects",
  "EldenRing-Build-Planner",
  "HTMLCanvas-Snake",
  "Parse-Tree-Calculator",
  "personal-web-app",
  "personal-website-v1",
  "portfolio",
  "rubiks-cube",
]);

const starredRepos = new Set([
  "AWS-IAM-Projects",
  "AED-Sheets",
  "portfolio",
  "rubiks-cube",
]);

async function getRepositories() {
  const response = await fetch(
    "https://api.github.com/users/volpestyle/repos?per_page=100",
    { next: { revalidate: 3600 } } // Revalidate every hour
  );

  if (!response.ok) {
    throw new Error("Failed to fetch repositories");
  }

  const data: Repository[] = await response.json();

  return data.reduce(
    (acc, repo) => {
      if (allowedRepos.has(repo.name)) {
        const isStarred = starredRepos.has(repo.name);
        acc[isStarred ? "starred" : "normal"].push({
          ...repo,
          isStarred,
        });
      }
      return acc;
    },
    { starred: [], normal: [] } as {
      starred: Repository[];
      normal: Repository[];
    }
  );
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
            <Button asChild className="bg-white text-black hover:bg-gray-200">
              <Link href={`/projects/${repo.name}`}>View Details</Link>
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
