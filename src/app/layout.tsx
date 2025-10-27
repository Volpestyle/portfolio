import './globals.css';
import 'highlight.js/styles/github-dark.css';
import '@/styles/markdown.css';
import { ReactNode } from 'react';
import AnimatedBackground from '@/components/AnimatedBackground';
import { Header } from '@/components/Header';
import { jetbrainsMono, sourceCodePro, firaCode, spaceMono, ibmPlexMono, geistMono } from './fonts';
import { Metadata } from 'next';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnimatedLayout } from '@/components/AnimatedLayout';
import { LoadingOverlay } from '@/components/LoadingOverlay';

export const metadata: Metadata = {
  title: {
    default: "JCV's Portfolio",
    template: '%s | JCV Portfolio',
  },
  description: "James Volpe's Portfolio - Software Engineer from Chicago, IL",
  keywords: ['portfolio', 'software engineer', 'web development', 'James Volpe', 'Chicago', 'full stack'],
  authors: [{ name: 'James Volpe' }],
  creator: 'James Volpe',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://jamesvolpe.com',
    siteName: "JCV's Portfolio",
    title: "JCV's Portfolio",
    description: "James Volpe's Portfolio - Software Engineer from Chicago, IL",
  },
  twitter: {
    card: 'summary_large_image',
    title: "JCV's Portfolio",
    description: "James Volpe's Portfolio - Software Engineer from Chicago, IL",
    creator: '@c0wboyboopbop',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={` ${jetbrainsMono.variable} ${sourceCodePro.variable} ${firaCode.variable} ${spaceMono.variable} ${ibmPlexMono.variable} ${geistMono.variable} `}
    >
      <body className="bg-black font-geist-mono text-white">
        <ErrorBoundary>
          <AnimatedBackground />
          <Providers>
            <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
              <AnimatedLayout>
                <Header />
                <LoadingOverlay spinnerVariant="ring">
                  <main className="px-4 py-8 sm:px-8">{children}</main>
                </LoadingOverlay>
              </AnimatedLayout>
            </div>
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
