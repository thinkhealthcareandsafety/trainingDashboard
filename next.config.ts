import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-only indicator clear of the sidebar.
  devIndicators: { position: "bottom-right" },
  // Let teammates on the same Wi-Fi/LAN load data from this dev server (Next.js blocks
  // cross-origin dev requests by default). Covers any 192.168.x.x device on the network.
  allowedDevOrigins: ["192.168.1.55", "192.168.1.*"],
  // Certificates from the quiz are made on the server (src/lib/portalCertSend.ts reads the fonts from disk).
  // Reading scanned POs (src/lib/pageRead.ts): a native drawing library and the reader, kept out of the bundle.
  serverExternalPackages: ["@napi-rs/canvas", "tesseract.js"],
  outputFileTracingIncludes: {
    "/api/invoice-converter": ["./assets/ocr/*", "./node_modules/tesseract.js/**/*", "./node_modules/tesseract.js-core/*lstm*", "./node_modules/tesseract.js-core/index.js", "./node_modules/tesseract.js-core/package.json", "./node_modules/{bmp-js,idb-keyval,is-url,node-fetch,regenerator-runtime,wasm-feature-detect,zlibjs,whatwg-url,tr46,webidl-conversions}/**/*", "./node_modules/@napi-rs/canvas*/**/*"],
    "/api/portal/training": ["./public/certificate-fonts/*.ttf", "./assets/certificates/*.pdf"],
    "/api/portal/quiz": ["./public/certificate-fonts/*.ttf", "./assets/certificates/*.pdf"],
    "/api/portal/certificate": ["./public/certificate-fonts/*.ttf", "./assets/certificates/*.pdf"],
    "/api/training-management": ["./public/certificate-fonts/*.ttf", "./assets/certificates/*.pdf"],
  },
};

export default nextConfig;
