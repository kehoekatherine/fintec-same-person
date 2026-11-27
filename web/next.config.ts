import type { NextConfig } from "next";

function pagesBasePath(): string {
  const raw = (process.env.PAGES_BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "/fintec-same-person").trim();
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "") || "/fintec-same-person";
}

const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = staticExport ? pagesBasePath() : "";

const nextConfig: NextConfig = {
  agentRules: false,
  devIndicators: false,
  ...(staticExport
    ? {
        output: "export",
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        cacheComponents: true,
        partialPrefetching: true,
      }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
