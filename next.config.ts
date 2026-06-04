import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle in .next/standalone for the Docker image.
  output: "standalone",
  allowedDevOrigins: [
    // Add your own dev machine LAN IP here if you access `next dev` from another host.
    "127.0.0.1",
    "localhost",
    "myheroes.vnmaison.site",
  ],
};

export default nextConfig;
