import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Turbopack to use Webpack (better Tailwind support)
  // turbopack: false, // Not needed, just don't use --turbo flag
};

export default nextConfig;
