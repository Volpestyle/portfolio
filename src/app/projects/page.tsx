"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Layout from "@/components/Layout";
import { Loader } from "lucide-react";

interface Repository {
  id: number;
  name: string;
  description: string;
  html_url: string;
}

export default function Projects() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const response = await fetch(
          "https://api.github.com/users/volpestyle/repos"
        );
        const data = await response.json();
        setRepos(data);
      } catch (error) {
        console.error("Error fetching repositories:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRepos();
  }, []);

  return (
    <Layout>
      <h1 className="text-3xl font-bold mb-6">My Code</h1>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader className="animate-spin h-8 w-8 text-white" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {repos.map((repo) => (
            <Card
              key={repo.id}
              className="p-4 bg-black bg-opacity-10 text-white"
            >
              <h2 className="text-xl font-bold mb-2">{repo.name}</h2>
              <p className="mb-4 text-sm">{repo.description}</p>
              <Button asChild className="bg-white text-black hover:bg-gray-200">
                <a
                  href={repo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on GitHub
                </a>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
