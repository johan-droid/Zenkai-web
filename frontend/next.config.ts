import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent browser source maps from emitting file:/// source references in production
  productionBrowserSourceMaps: false,
  // Pin the workspace root so Turbopack does not walk up to a parent lockfile.
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    // In standalone or two-project fallback deployment mode, forward /api/* to the backend.
    // In Vercel Services mode, the top-level vercel.json edge rewrite takes precedence.
    const backendUrl = process.env.BACKEND_URL;
    if (backendUrl) {
      return [
        {
          source: "/api/:path*",
          destination: `${backendUrl.replace(/\/+$/, "")}/api/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
