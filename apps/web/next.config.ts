import type { NextConfig } from "next";
import "./src/lib/env";

const nextConfig: NextConfig = {
  transpilePackages: ["@cognobserve/shared", "@cognobserve/db"],
};

export default nextConfig;
