import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Lets teammates open the dev server through a Cloudflare tunnel link.
  allowedDevOrigins: ['*.trycloudflare.com'],
  // ESLint is not installed in this project; skip it during builds.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
