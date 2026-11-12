/*
 * training.thinkhealth.in (owner, 10 Nov): the coordinators' portal on its own address, served by this same app. On
 * that host, "/" is the portal's sign-in, "/<Training Number>" a training's (the link in the login email),
 * "/<Training Number>/join" the QR join page and "/<Training Number>/<TH id>" a participant's page — all shown from
 * /training/…; everything else on the host (the staff pages) is the portal too, never the dashboard.
 * Any other host (work.thinkhealth.in, the Vercel address) is left alone: there the portal stays at /training/….
 */
export const PORTAL_HOSTS = ["training.thinkhealth.in"];

/**
 * Where the portal's links point (the login email, the QR code). Until training.thinkhealth.in resolves it's
 * work.thinkhealth.in/training; then set PORTAL_BASE_URL=https://training.thinkhealth.in on Vercel — no code change.
 */
export const portalBase = () => (process.env.PORTAL_BASE_URL || "https://work.thinkhealth.in/training").replace(/\/+$/, "");

/** The path to show instead, or null to leave the request as it is. */
export function portalRewrite(host: string, pathname: string): string | null {
  const h = host.toLowerCase().split(":")[0];
  if (!PORTAL_HOSTS.includes(h)) return null;
  if (pathname === "/training" || pathname.startsWith("/training/")) return null;
  if (pathname === "/" || pathname === "") return "/training";
  const parts = pathname.split("/").filter(Boolean).slice(0, 2);
  return `/training/${parts.join("/")}`;
}

/** The portal's address prefix in the browser: "" on training.thinkhealth.in, "/training" anywhere else. */
export const portalPrefix = (host: string) => (PORTAL_HOSTS.includes(host.toLowerCase().split(":")[0]) ? "" : "/training");
