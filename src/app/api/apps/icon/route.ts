import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { type SiteIcon, siteIcon } from "@/lib/siteIcon";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * GET ?id= — an application's own icon (lib/siteIcon.ts); small old-style ones (.ico) only with &any=1. Only for applications on the page, so nobody can make the server
 * read other addresses. Kept in `launcherIcons` (per application and link) and read again after 30 days, or a day after
 * finding none; an older copy stays when the site can't be reached.
 */
type Doc = { _id: string; url: string; type: string; data: string; at: number };
const DAY = 24 * 60 * 60_000;

const picture = (type: string, data: Buffer) =>
  new Response(new Uint8Array(data), {
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      // Someone else's SVG on our address: shown as a picture, never run.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
const none = () => new Response(null, { status: 404, headers: { "cache-control": "private, max-age=3600" } });

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  const q = new URL(request.url).searchParams, id = q.get("id") ?? "", any = q.get("any") === "1";
  const show = (type: string, data: Buffer) => (type && (any || type !== "image/x-icon") ? picture(type, data) : none());
  const d = await db();
  const app = await d.collection<{ _id: string; url: string }>("launcherApps").findOne({ _id: id });
  if (!app) return none();
  const icons = d.collection<Doc>("launcherIcons");
  const kept = await icons.findOne({ _id: id });
  const mine = kept?.url === app.url ? kept : null;
  if (mine && Date.now() - mine.at < (mine.type ? 30 * DAY : DAY)) return show(mine.type, Buffer.from(mine.data, "base64"));
  const got: SiteIcon | null = await siteIcon(app.url).catch(() => null);
  if (!got && mine?.type) return show(mine.type, Buffer.from(mine.data, "base64"));
  await icons.replaceOne({ _id: id }, { url: app.url, type: got?.type ?? "", data: got?.data.toString("base64") ?? "", at: Date.now() }, { upsert: true });
  return got ? show(got.type, got.data) : none();
}
