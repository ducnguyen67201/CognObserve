import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cognobserve/shared", "@cognobserve/db"],
};

export default nextConfig;
