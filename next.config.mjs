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
