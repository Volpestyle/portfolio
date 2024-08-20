import "./globals.css";
import type { Metadata } from "next";
import { hankenGrotesk } from "./fonts";

export const metadata: Metadata = {
  title: "JCV's Portfolio",
  description: "James Volpe's Portfolio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${hankenGrotesk.variable} font-sans`}>{children}</body>
    </html>
  );
}
