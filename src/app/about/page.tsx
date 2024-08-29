"use client";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { siLinkedin, siGithub, siYoutube, siSpotify } from "simple-icons/icons";
import { useState } from "react";
import ResumeModal from "@/components/ResumeModal";

interface SocialLink {
  name: string;
  icon: {
    path: string;
    hex: string;
  };
  url: string;
}

const SocialIcon: React.FC<{ icon: { path: string; hex: string } }> = ({
  icon,
}) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    fill="currentColor"
  >
    <path d={icon.path} />
  </svg>
);

export default function About() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const socialLinks: SocialLink[] = [
    {
      name: "LinkedIn",
      icon: siLinkedin,
      url: "https://www.linkedin.com/in/james-volpe/",
    },
    { name: "GitHub", icon: siGithub, url: "https://github.com/Volpestyle" },
    {
      name: "YouTube",
      icon: siYoutube,
      url: "https://www.youtube.com/@vuhlp/videos",
    },
    {
      name: "Spotify",
      icon: siSpotify,
      url: "https://open.spotify.com/artist/1s7neYGdYg0kCnUizWy3bk?si=GMzqI3G0RfialSx1-1NjDg",
    },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="md:w-1/2">
        <Image
          src="/images/skateboard.jpg"
          alt="James"
          width={400}
          height={400}
          className="rounded-lg mb-4"
        />
        <div className="flex flex-wrap gap-4">
          {socialLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors group"
            >
              <SocialIcon icon={link.icon} />
              <span className="relative">
                {link.name}
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-300 transform scale-x-0 transition-transform duration-300 ease-in-out group-hover:scale-x-100"></span>
              </span>
            </a>
          ))}
        </div>
      </div>
      <div className="md:w-1/2">
        <h1 className="text-3xl font-bold mb-4">About Me</h1>
        <p className="mb-4">
          I'm a software engineer from Chicago, IL USA. In May 2021, I graduated
          from Iowa State University with a B.S. in Software Engineering. 📚
          Over the years I've found many passions. From animation, graphic
          design, and writing music, to full stack web development. I think the
          common theme here is - I love to make things 🧑‍🎨.
        </p>
        <p>
          But ever since I started using computers as a kid, I found myself
          interested in writing code, inspired by the endless possibilities.
          Here you'll find some of the products of my creative efforts,
          including my work and projects I'm most proud of :)
        </p>
        <h2 className="text-2xl font-bold mb-2 mt-4">My Resume</h2>
        <iframe
          src="/resume/summer-2024.pdf"
          className="w-full h-96 mb-4"
        ></iframe>
        <Button className="bg-white text-black hover:bg-gray-200 mr-2">
          <a href="/resume/summer-2024.pdf" download>
            Download resume
          </a>
        </Button>
        <Button
          className="bg-white text-black hover:bg-gray-200"
          onClick={() => setIsModalOpen(true)}
        >
          View full screen
        </Button>
      </div>
      <ResumeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
