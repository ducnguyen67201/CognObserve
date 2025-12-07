import type { NextConfig } from "next";

// Validate environment variables
import "./src/lib/env";

const nextConfig: NextConfig = {
  transpilePackages: ["@cognobserve/shared", "@cognobserve/db"],
};

export default nextConfig;
