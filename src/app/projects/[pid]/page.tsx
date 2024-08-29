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
import { ExternalLinkIcon } from "@/lib/svgs";
import { CustomLink } from "@/components/CustomLink";
import { ArrowLeft } from "lucide-react";

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
        <Button asChild className="bg-white text-black hover:bg-gray-200">
          <Link href="/projects" className="flex items-center">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Projects
          </Link>
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
      <h1 className="text-3xl font-bold mb-4">{params.pid}</h1>
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
            a: ({ href, children }) => (
              <CustomLink href={href || "#"}>{children}</CustomLink>
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
