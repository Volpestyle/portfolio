/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  env: {
    // Server-side only (sensitive) variables
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    REGION: process.env.REGION,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    PORTFOLIO_GIST_ID: process.env.PORTFOLIO_GIST_ID,

    // Public variables (if needed)
    NEXT_PUBLIC_SITE_URL: process.env.SITE_URL,
    // Add other public variables here
  },
};

module.exports = nextConfig;
