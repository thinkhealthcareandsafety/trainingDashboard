// An application's own icon on the apps home page (owner, 24 Nov).
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { iconLinks, pictureType, publicSite } from "@/lib/siteIcon";
import { GET } from "@/app/api/apps/icon/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());

test("the best icon first: home-screen icon, then the drawing, then small ones, then favicon.ico", () => {
  const html = `<link rel="stylesheet" href="/a.css"><link rel="mask-icon" href="/m.svg"><link rel="shortcut icon" href="/s.png" sizes="32x32">
    <link rel=icon href=/icon.svg type="image/svg+xml" /><link rel='apple-touch-icon' href='/t.png?a=1&amp;b=2'><link rel="icon" href="data:image/png;base64,AA">`;
  assert.deepEqual(iconLinks(html, "https://x.com/in/"), ["https://x.com/t.png?a=1&b=2", "https://x.com/icon.svg", "https://x.com/s.png", "https://x.com/favicon.ico"]);
  assert.deepEqual(iconLinks("", "https://x.com/in/"), ["https://x.com/favicon.ico"]);
});

test("only real pictures count, whatever the site calls them; only public addresses are read", () => {
  assert.equal(pictureType(Buffer.from("89504e470d0a1a0a00", "hex")), "image/png");
  assert.equal(pictureType(Buffer.from(`<?xml version="1.0"?>\n<svg xmlns="x"/>`)), "image/svg+xml");
  assert.equal(pictureType(Buffer.from("<!doctype html><html><svg></svg>")), "");
  for (const bad of ["http://localhost/", "http://127.0.0.1/", "http://169.254.169.254/x", "http://[::1]/", "http://db.internal/", "file:///etc/x"]) assert.equal(publicSite(new URL(bad)), false, bad);
  assert.equal(publicSite(new URL("https://inspector.aedsmartx.com/")), true);
});

test("the route: signed in only, only applications on the page, read once and kept, kept while the site is down", async () => {
  const req = (id: string, who = true) => new Request(`http://x/api/apps/icon?id=${id}`, { headers: who ? { "x-test-member": JSON.stringify({ id: "arti", name: "Arti" }) } : {} });
  const d = await db();
  await d.collection<any>("launcherApps").insertOne({ _id: "a1", url: "https://ship.example.com/" });
  assert.equal((await GET(req("a1", false))).status, 401);
  assert.equal((await GET(req("zzz"))).status, 404);
  const png = Buffer.from("89504e470d0a1a0a0011", "hex");
  const asked: string[] = [];
  let up = true;
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: RequestInfo | URL) => {
    const s = String(u);
    asked.push(s);
    if (!up) throw new Error("down");
    if (s === "https://ship.example.com/") return new Response(null, { status: 302, headers: { location: "/home" } });
    if (s.endsWith("/home")) return new Response(`<link rel="apple-touch-icon" href="/gone.png"><link rel="icon" href="/i.png" sizes="192x192">`);
    if (s.endsWith("/gone.png")) return new Response("<!doctype html>");
    return new Response(new Uint8Array(png));
  }) as typeof fetch;
  try {
    const r = await GET(req("a1"));
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
    assert.deepEqual(asked, ["https://ship.example.com/", "https://ship.example.com/home", "https://ship.example.com/gone.png", "https://ship.example.com/i.png"]);
    assert.equal((await GET(req("a1"))).status, 200);
    assert.equal(asked.length, 4);
    up = false;
    await d.collection<any>("launcherIcons").updateOne({ _id: "a1" }, { $set: { at: 0 } });
    assert.equal((await GET(req("a1"))).status, 200);
  } finally { globalThis.fetch = real; }
});

test("the route: a small .ico only when asked for anything", async () => {
  const d = await db();
  await d.collection<any>("launcherApps").insertOne({ _id: "a2", url: "https://old.example.com/" });
  await d.collection<any>("launcherIcons").insertOne({ _id: "a2", url: "https://old.example.com/", type: "image/x-icon", data: "AAABAA==", at: Date.now() });
  const req = (q: string) => new Request(`http://x/api/apps/icon?id=a2${q}`, { headers: { "x-test-member": JSON.stringify({ id: "arti", name: "Arti" }) } });
  assert.equal((await GET(req(""))).status, 404);
  assert.equal((await GET(req("&any=1"))).status, 200);
});
