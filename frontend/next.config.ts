import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Allow your phone/other devices on the Wi-Fi to load the page
  allowedDevOrigins: ['10.5.33.125'],
};

export default nextConfig;