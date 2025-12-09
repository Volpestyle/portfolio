/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: {
    '/api/chat': [
      './generated/**/*',
      './chat.config.*',
      './chat-preprocess.config.*',
      './node_modules/react/**/*',
      './node_modules/react-dom/**/*',
    ],
  },
  experimental: {
    externalDir: true,
  },
  transpilePackages: [
    '@portfolio/chat-contract',
    '@portfolio/chat-data',
    '@portfolio/chat-orchestrator',
    '@portfolio/chat-next-ui',
    '@portfolio/chat-next-api',
    '@portfolio/test-support',
  ],
  // Allow Playwright/dev assets to be fetched from loopback origins during local runs.
  allowedDevOrigins: [
    // Explicit origins used by Playwright/local dev (with and without protocol)
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'https://127.0.0.1:3000',
    'https://localhost:3000',
    '127.0.0.1',
    'localhost',
  ],
  images: {
    qualities: [75, 85],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'user-images.githubusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'repository-images.githubusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'objects.githubusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
