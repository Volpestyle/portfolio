/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["raw.githubusercontent.com"],
  },
  env: {
    ACCESS_KEY_ID: process.env.AMPLIFY_SECRETS?.ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.AMPLIFY_SECRETS?.SECRET_ACCESS_KEY,
  },
};

export default nextConfig;
