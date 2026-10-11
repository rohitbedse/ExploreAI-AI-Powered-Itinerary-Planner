import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` needs symlinks, which Windows blocks without Developer Mode; Docker builds on Linux.
  output: process.platform === "win32" ? undefined : "standalone",
  transpilePackages: ["@exploreai/shared"],
};

export default nextConfig;
