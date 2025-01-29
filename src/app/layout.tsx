import './globals.css';
import { ReactNode } from 'react';
import AnimatedBackground from '@/components/AnimatedBackground';
import Layout from '@/components/Layout';
import { jetbrainsMono, sourceCodePro, firaCode, spaceMono, ibmPlexMono, robotoMono } from './fonts';
import { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: "JCV's Portfolio",
  description: "James Volpe's Portfolio",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={` ${jetbrainsMono.variable} ${sourceCodePro.variable} ${firaCode.variable} ${spaceMono.variable} ${ibmPlexMono.variable} ${robotoMono.variable} `}
    >
      <body className="font-roboto-mono">
        <AnimatedBackground />

        <Providers>
          <Layout>{children}</Layout>
        </Providers>
      </body>
    </html>
  );
}
