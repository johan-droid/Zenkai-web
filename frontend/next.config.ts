import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack does not walk up to a parent lockfile.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
