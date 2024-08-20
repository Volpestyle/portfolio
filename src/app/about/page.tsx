"use client";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Layout from "@/components/Layout";

export default function About() {
  return (
    <Layout>
      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-1/2">
          <Image
            src="/images/skateboard.jpg"
            alt="James"
            width={400}
            height={400}
            className="rounded-lg"
          />
        </div>
        <div className="md:w-1/2">
          <h1 className="text-3xl font-bold mb-4">About Me</h1>
          <p className="mb-4">
            Over the years I've tried my hand at many things, from graphic
            design to front-end engineering. But ever since I started using
            computers as a young kid, I found myself interested in writing code,
            inspired by the endless possibilities. Here you'll find some of the
            products of my creative efforts, including my work and projects I'm
            most proud of :)
          </p>
          <h2 className="text-2xl font-bold mb-2">My Resume</h2>
          <iframe
            src="/resume/summer-2024.pdf"
            className="w-full h-96 mb-4"
          ></iframe>
          <Button className="bg-white text-black hover:bg-gray-200">
            <a href="/resume/summer-2024.pdf" download>
              Download Resume
            </a>
          </Button>
        </div>
      </div>
    </Layout>
  );
}
