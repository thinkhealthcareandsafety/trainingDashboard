import { NextResponse, type NextRequest } from "next/server";
import { portalRewrite } from "./lib/portalHost";

// training.thinkhealth.in shows the coordinators' portal (src/lib/portalHost.ts). Other hosts pass straight through.
export function proxy(request: NextRequest) {
  const to = portalRewrite(request.headers.get("host") ?? "", request.nextUrl.pathname);
  if (!to) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = to;
  return NextResponse.rewrite(url);
}

// Not for the app's own files, the APIs (the portal's sign-in calls /api/portal) or the logo in /portal.
export const config = {
  matcher: ["/((?!_next/|api/|portal/|favicon.ico).*)"],
};
