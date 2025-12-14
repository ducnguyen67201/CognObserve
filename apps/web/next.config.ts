import type { NextConfig } from "next";

// Validate environment variables
import "./src/lib/env";

const nextConfig: NextConfig = {
  // Required for Docker deployments - creates a standalone build with all dependencies
  output: "standalone",
  transpilePackages: ["@cognobserve/shared", "@cognobserve/db"],
};

export default nextConfig;
