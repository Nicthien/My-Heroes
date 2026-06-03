import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle in .next/standalone for the Docker image.
  output: "standalone",
  allowedDevOrigins: [
    "192.168.0.174",
    "127.0.0.1",
    "localhost",
    "myheroes.vnmaison.site",
  ],
};

export default nextConfig;
