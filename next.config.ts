import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-only indicator clear of the sidebar.
  devIndicators: { position: "bottom-right" },
  // Let teammates on the same Wi-Fi/LAN load data from this dev server (Next.js blocks
  // cross-origin dev requests by default). Covers any 192.168.x.x device on the network.
  allowedDevOrigins: ["192.168.1.55", "192.168.1.*"],
  // Certificates from the quiz are made on the server (src/lib/portalCertSend.ts reads the fonts from disk).
  outputFileTracingIncludes: {
    "/api/portal/training": ["./public/certificate-fonts/*.ttf"],
    "/api/portal/quiz": ["./public/certificate-fonts/*.ttf"],
    "/api/portal/certificate": ["./public/certificate-fonts/*.ttf"],
    "/api/training-management": ["./public/certificate-fonts/*.ttf"],
  },
};

export default nextConfig;
