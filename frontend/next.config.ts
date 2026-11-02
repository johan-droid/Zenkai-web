import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent browser source maps from emitting file:/// source references in production
  productionBrowserSourceMaps: false,
  webpack: (config, { dev }) => {
    if (!dev) {
      config.devtool = false;
    }
    return config;
  },
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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
