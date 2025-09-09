'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { StarIcon } from '@/lib/svgs';
import { formatDate } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

interface ProjectCardProps {
  repo: {
    id: number;
    name: string;
    description: string | null;
    created_at: string;
    pushed_at: string;
    isStarred: boolean;
  };
}

export function ProjectCard({ repo }: ProjectCardProps) {
  return (
    <Card className="relative border-white bg-black bg-opacity-10 p-4 text-white">
      <h2 className="mb-2 flex items-center justify-between text-xl font-bold">
        {repo.name}
        {repo.isStarred && <StarIcon />}
      </h2>
      <p className="mb-4 text-sm">{repo.description}</p>
      <p className="mt-4 text-xs text-gray-400">
        <span className="font-bold">Created:</span> {formatDate(repo.created_at)}
      </p>
      <p className="mb-2 mt-1 text-xs text-gray-400">
        <span className="font-bold">Last commit:</span> {formatDate(repo.pushed_at)}
      </p>
      <div className="group relative mt-2 inline-block">
        <Button
          asChild
          className="relative h-10 w-10 overflow-hidden rounded-full bg-white text-black transition-all duration-300 hover:w-32 hover:bg-gray-200"
        >
          <Link href={`/projects/${repo.name}`}>
            <div className="relative flex h-full w-full items-center justify-center">
              <span className="absolute whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                View Details
              </span>
              <ArrowRight className="absolute h-5 w-5 transition-all duration-300 group-hover:translate-x-10 group-hover:opacity-0" />
            </div>
          </Link>
        </Button>
      </div>
    </Card>
  );
}
