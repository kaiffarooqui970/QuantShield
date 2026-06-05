import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // <--- THIS LINE IS CRITICAL
  // ... any other config you might have
};

export default nextConfig;