import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.0.134",
    "127.0.0.1",
    "localhost",
    "myheroes.vnmaison.site",
  ],
};

export default nextConfig;
