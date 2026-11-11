/*
 * training.thinkhealth.in (owner, 10 Nov): the coordinators' portal on its own address, served by this same app. On
 * that host, "/" is the portal's sign-in and "/<Training Number>" a training's (the link in the login email) — both
 * shown from /training/…; everything else on the host (the staff pages) is the portal too, never the dashboard.
 * Any other host (work.thinkhealth.in, the Vercel address) is left alone: there the portal stays at /training/….
 */
export const PORTAL_HOSTS = ["training.thinkhealth.in"];

/** The path to show instead, or null to leave the request as it is. */
export function portalRewrite(host: string, pathname: string): string | null {
  const h = host.toLowerCase().split(":")[0];
  if (!PORTAL_HOSTS.includes(h)) return null;
  if (pathname === "/training" || pathname.startsWith("/training/")) return null;
  if (pathname === "/" || pathname === "") return "/training";
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return `/training/${first}`;
}
