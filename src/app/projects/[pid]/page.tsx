"use client";
import "highlight.js/styles/github-dark.css";
import "@/styles/markdown.css";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import ImageRenderer from "@/components/ImageRenderer";
import ImageCarousel from "@/components/ImageCarousel";

async function getReadme(pid: string) {
  const response = await fetch(
    `https://api.github.com/repos/volpestyle/${pid}/readme`,
    {
      next: { revalidate: 3600 }, // Revalidate every hour
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch README");
  }

  const data = await response.json();
  return atob(data.content);
}

async function getRepoUrl(pid: string) {
  const response = await fetch(
    `https://api.github.com/repos/volpestyle/${pid}`,
    {
      next: { revalidate: 3600 }, // Revalidate every hour
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch repository info");
  }

  const data = await response.json();
  return data.html_url;
}

const ExternalLinkIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-4 h-4 ml-1"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
    />
  </svg>
);

export default function ProjectDetail({ params }: { params: { pid: string } }) {
  const [readme, setReadme] = useState<string>("");
  const [repoUrl, setRepoUrl] = useState<string>("#");
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [carouselInitialIndex, setCarouselInitialIndex] = useState(0);
  const [isCarouselOpen, setIsCarouselOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [readmeContent, repoUrlContent] = await Promise.all([
          getReadme(params.pid),
          getRepoUrl(params.pid),
        ]);
        setReadme(readmeContent);
        setRepoUrl(repoUrlContent);
      } catch (error) {
        console.error("Error fetching data:", error);
        setReadme("Failed to load README. Please try again later.");
        setRepoUrl("#");
      }
    };

    fetchData();
  }, [params.pid]);

  const handleImageLoad = (src: string) => {
    setCarouselImages((prevImages) => {
      if (!prevImages.includes(src)) {
        return [...prevImages, src];
      }
      return prevImages;
    });
  };

  const handleImageClick = (src: string) => {
    const index = carouselImages.indexOf(src);
    if (index !== -1) {
      setCarouselInitialIndex(index);
      setIsCarouselOpen(true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{params.pid}</h1>
        <div className="space-x-2">
          <Button asChild className="bg-white text-black hover:bg-gray-200">
            <Link href="/projects">Back to Projects</Link>
          </Button>
          <Button asChild className="bg-white text-black hover:bg-gray-200">
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center"
            >
              View on GitHub
              <ExternalLinkIcon />
            </a>
          </Button>
        </div>
      </div>
      <div className="markdown-body text-white">
        <ReactMarkdown
          rehypePlugins={[rehypeHighlight]}
          components={{
            img: (props) => (
              <ImageRenderer
                {...props}
                pid={params.pid}
                onImageLoad={handleImageLoad}
                onImageClick={handleImageClick}
              />
            ),
          }}
        >
          {readme}
        </ReactMarkdown>
      </div>
      <ImageCarousel
        images={carouselImages}
        initialIndex={carouselInitialIndex}
        isOpen={isCarouselOpen}
        onClose={() => setIsCarouselOpen(false)}
      />
    </div>
  );
}
