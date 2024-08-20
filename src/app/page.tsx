"use client";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center text-center h-full min-h-[calc(80vh-5rem)]">
      {/* Adjust the height to account for the navbar */}
      <h1 className="text-4xl font-bold mb-2">I'm James,</h1>
      <h1 className="text-4xl md:text-6xl font-bold mb-6">
        welcome to my portfolio.
      </h1>
      <Button
        size="lg"
        className="bg-white text-black hover:bg-gray-200"
        asChild
      >
        <Link href="/projects">Projects</Link>
      </Button>
    </div>
  );
}
