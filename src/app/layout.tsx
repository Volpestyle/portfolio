import './globals.css';
import { ReactNode } from 'react';
import AnimatedBackground from '@/components/AnimatedBackground';
import Layout from '@/components/Layout';
import { hankenGrotesk } from './fonts';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "JCV's Portfolio",
  description: "James Volpe's Portfolio",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`dark ${hankenGrotesk.variable} font-sans`}>
        <AnimatedBackground />
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}
