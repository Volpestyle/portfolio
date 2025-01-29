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
    // Server-side only variables
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    PORTFOLIO_GIST_ID: process.env.PORTFOLIO_GIST_ID,
    ACCESS_KEY_ID: process.env.ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.SECRET_ACCESS_KEY,
    REGION: process.env.REGION,
  },
};

export default nextConfig;
