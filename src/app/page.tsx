"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/images/handstand.jpg')" }}
    >
      <div className="absolute inset-0 bg-black bg-opacity-50 z-0"></div>
      <Card className="w-full max-w-4xl overflow-hidden relative z-10 bg-black bg-opacity-50">
        {/* Content */}
        <div className="relative z-10 flex flex-col min-h-[80vh] text-white">
          {/* Navbar */}
          <nav className="p-4 flex justify-between items-center border-b border-white">
            <a href="/" className="text-xl font-bold">
              JCV
            </a>
            <div className="space-x-4">
              <Button variant="onBlack">About</Button>
              <Button variant="onBlack">Projects</Button>
              <Button variant="onBlack">Contact</Button>
            </div>
          </nav>

          {/* Main content */}
          <main className="flex-grow flex flex-col items-center justify-center text-center p-4">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              I'm James, <br /> Welcome to my portfolio
            </h1>
            <Button size="lg" className="bg-white text-black hover:bg-gray-200">
              Projects
            </Button>
          </main>
        </div>
      </Card>
    </div>
  );
}
