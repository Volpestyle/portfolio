"use client";
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSpring, animated, config } from "@react-spring/web";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const pathname = usePathname();
  const [key, setKey] = useState(0);

  // Need to force re-render, fixes animations not starting on refresh
  useEffect(() => {
    setKey((prevKey) => prevKey + 1);
  }, [pathname]);

  const springProps = useSpring({
    from: { opacity: 0 },
    to: { opacity: 1 },
    reset: true,
    config: { duration: 1000, easing: (t) => t * (2 - t) }, // Ease-out quad
  });

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
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl overflow-hidden relative z-10 bg-black bg-opacity-50 text-white border-white">
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
          <animated.main
            key={key}
            className="flex-grow p-4"
            style={springProps}
          >
            {children}
          </animated.main>
        </div>
      </Card>
    </div>
  );
};

export default Layout;
