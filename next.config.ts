import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-only indicator clear of the sidebar.
  devIndicators: { position: "bottom-right" },
  // Let teammates on the same Wi-Fi/LAN load data from this dev server (Next.js blocks
  // cross-origin dev requests by default). Covers any 192.168.x.x device on the network.
  allowedDevOrigins: ["192.168.1.55", "192.168.1.*"],
};

export default nextConfig;
