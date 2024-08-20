import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StaticBackground from "./StaticBackground";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const pathname = usePathname();

  const NavButton: React.FC<{ href: string; children: React.ReactNode }> = ({
    href,
    children,
  }) => {
    const isActive = pathname === href;
    return (
      <Button
        variant="onBlack"
        asChild
        className={isActive ? "bg-white bg-opacity-20" : ""}
      >
        <Link href={href}>{children}</Link>
      </Button>
    );
  };

  return (
    <>
      {pathname !== "/" && <StaticBackground />}
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-4xl overflow-hidden relative z-10 bg-black bg-opacity-50 text-white">
          <div className="flex flex-col min-h-[80vh]">
            {/* Navbar */}
            <nav className="p-4 flex justify-between items-center border-b border-white">
              <Link href="/" className="text-xl font-bold">
                JCV
              </Link>
              <div className="space-x-4">
                <NavButton href="/">Home</NavButton>
                <NavButton href="/about">About</NavButton>
                <NavButton href="/projects">Projects</NavButton>
                <NavButton href="/contact">Contact</NavButton>
              </div>
            </nav>

            {/* Main content */}
            <main className="flex-grow p-4">{children}</main>
          </div>
        </Card>
      </div>
    </>
  );
};

export default Layout;
