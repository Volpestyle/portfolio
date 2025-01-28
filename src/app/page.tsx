'use client';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex h-full min-h-[calc(80vh-5rem)] flex-col items-center justify-center text-center">
      {/* Adjust the height to account for the navbar */}
      <h1 className="mb-2 text-4xl font-bold">I'm James,</h1>
      <h1 className="mb-6 text-4xl font-bold md:text-6xl">welcome to my portfolio.</h1>
      <div className="flex gap-4">
        <Button size="lg" className="bg-white text-black hover:bg-gray-200" asChild>
          <Link href="/about">About</Link>
        </Button>
        <Button size="lg" className="bg-white text-black hover:bg-gray-200" asChild>
          <Link href="/projects">Projects</Link>
        </Button>
      </div>
    </div>
  );
}
