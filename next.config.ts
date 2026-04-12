import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable Web Workers
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output.globalObject = 'self';
    }
    return config;
  },
};

export default nextConfig;
