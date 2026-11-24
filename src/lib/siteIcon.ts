/*
 * An application's own icon for the apps home page (owner, 24 Nov: "add favicons for these"). Google's favicon service
 * doesn't know small or new sites, so the server reads the site's page, picks its best icon and fetches it.
 * Used by /api/apps/icon, which keeps a copy.
 */

export type SiteIcon = { type: string; data: Buffer };
const MAX_PAGE = 600_000;
const MAX_ICON = 400_000;

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").replace(/&amp;/g, "&").trim();
};

/** The page's icons, best first: the phone home-screen icon (square, big), then the largest picture, then the drawing (SVG), then the rest. */
export function iconLinks(html: string, pageUrl: string): string[] {
  const found: { url: string; score: number }[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attr(tag, "rel").toLowerCase().split(/\s+/), href = attr(tag, "href");
    const apple = rel.some((r) => r.startsWith("apple-touch-icon"));
    if (!href || (!apple && !rel.includes("icon"))) continue;
    let url: URL;
    try { url = new URL(href, pageUrl); } catch { continue; }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    const size = Number(/^(\d+)x/i.exec(attr(tag, "sizes"))?.[1] ?? 0);
    const svg = /svg/i.test(attr(tag, "type")) || /\.svg$/i.test(url.pathname);
    found.push({ url: url.href, score: apple ? 1000 + size : svg ? 150 : size });
  }
  const out = found.sort((a, b) => b.score - a.score).map((f) => f.url);
  return [...new Set([...out, new URL("/favicon.ico", pageUrl).href])].slice(0, 6);
}

/** What kind of picture the bytes really are ("" = not one): some sites answer an icon address with a web page. */
export function pictureType(b: Buffer): string {
  if (b.length > 8 && b.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (b.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (b.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.subarray(0, 4).toString("hex") === "00000100") return "image/x-icon";
  const head = b.subarray(0, 600).toString("utf8").replace(/^﻿/, "").trimStart();
  if (/^(<\?xml|<!--|<!doctype svg|<svg)/i.test(head) && /<svg[\s>]/i.test(head)) return "image/svg+xml";
  return "";
}

/** A public web address: no bare names, numbers or inside-only names. */
export function publicSite(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return (u.protocol === "https:" || u.protocol === "http:") && h.includes(".") && !/^[\d.]+$/.test(h) && !h.startsWith("[") && !/\.(local|localhost|internal|lan|home)$/.test(h);
}

/** GET with the redirects checked one by one. Null when it isn't there, isn't public or is too big. */
async function get(address: string, max: number, ms: number): Promise<{ url: string; body: Buffer } | null> {
  let url = new URL(address);
  for (let hop = 0; hop < 5; hop++) {
    if (!publicSite(url)) return null;
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(ms), headers: { "User-Agent": "Mozilla/5.0 (icon reader)" }, cache: "no-store" });
    const to = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && to) { url = new URL(to, url); continue; }
    if (!res.ok || !res.body) return null;
    const parts: Uint8Array[] = [];
    let size = 0;
    for (const reader = res.body.getReader(); ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { void reader.cancel(); return null; }
      parts.push(value);
    }
    return { url: url.href, body: Buffer.concat(parts) };
  }
  return null;
}

/** The site's own icon, or null when it has none we can use. */
export async function siteIcon(address: string): Promise<SiteIcon | null> {
  // Some free hosts sleep and take a while to answer the first time.
  const page = await get(address, MAX_PAGE, 30_000).catch(() => null);
  const links = page ? iconLinks(page.body.toString("utf8"), page.url) : [new URL("/favicon.ico", address).href];
  for (const link of links) {
    const got = await get(link, MAX_ICON, 10_000).catch(() => null);
    const type = got ? pictureType(got.body) : "";
    if (type) return { type, data: got!.body };
  }
  return null;
}
