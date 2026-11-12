// The portal's dashboard (step 4): programme / social content, photos, the coordinator's trainings — on the fake database.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONTENT, cleanContent, youtube } from "@/lib/portalContent";
import { readContent, readPhoto, saveContent, savePhoto, trainingsFor } from "@/lib/portalServer";
import { issueLogin, signIn } from "@/lib/portalAuth";
import { GET as home } from "@/app/api/portal/home/route";
import { GET as getContent, POST as postPhoto, PUT as putContent } from "@/app/api/portal-content/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());
const ashish = { id: "ashish", name: "Ashish" };
const outsider = { id: "z", name: "Zed" };
const as = (m: object, init: RequestInit = {}) => ({ ...init, headers: { "content-type": "application/json", "x-test-member": JSON.stringify(m) } });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("YouTube links: a video (watch, youtu.be, shorts) or a playlist; anything else isn't one", () => {
  assert.deepEqual(youtube("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")?.id, "dQw4w9WgXcQ");
  assert.equal(youtube("https://youtu.be/dQw4w9WgXcQ")?.kind, "video");
  assert.equal(youtube("https://youtube.com/shorts/dQw4w9WgXcQ")?.id, "dQw4w9WgXcQ");
  const pl = youtube("https://www.youtube.com/playlist?list=PLabcdef123456");
  assert.equal(pl?.kind, "playlist");
  assert.match(pl!.embed, /videoseries\?list=PLabcdef123456/);
  assert.equal(youtube("https://vimeo.com/123456"), null);
  assert.equal(youtube("not a link"), null);
});

test("the content check: names needed, YouTube only, https links, at least one programme; social always all six", () => {
  assert.deepEqual(cleanContent(DEFAULT_CONTENT), DEFAULT_CONTENT);
  const p = DEFAULT_CONTENT.programmes[0];
  assert.match((cleanContent({ ...DEFAULT_CONTENT, programmes: [] }) as { error: string }).error, /at least one/);
  assert.match((cleanContent({ ...DEFAULT_CONTENT, programmes: [{ ...p, name: " " }] }) as { error: string }).error, /needs a name/);
  assert.match((cleanContent({ ...DEFAULT_CONTENT, programmes: [{ ...p, video: "https://vimeo.com/1" }] }) as { error: string }).error, /YouTube/);
  assert.match((cleanContent({ ...DEFAULT_CONTENT, programmes: [{ ...p, photo: "../x" }] }) as { error: string }).error, /Upload it again/);
  assert.match((cleanContent({ ...DEFAULT_CONTENT, social: [{ key: "facebook", url: "javascript:alert(1)" }] }) as { error: string }).error, /https/);
  const c = cleanContent({ programmes: [{ name: "BLS  for staff", sign: "cpr" }, { name: "BLS for staff", sign: "cpr" }], social: [] });
  assert.ok(!("error" in c));
  if (!("error" in c)) {
    assert.deepEqual(c.programmes.map((x) => x.key), ["bls-for-staff", "bls-for-staff-2"]);
    assert.deepEqual(c.social.map((s) => s.key), ["website", "whatsapp", "linkedin", "instagram", "facebook", "youtube"]);
  }
});

test("content: built-in until saved; a saved photo must exist; unused old photos go", async () => {
  assert.deepEqual((await readContent()).programmes, DEFAULT_CONTENT.programmes);
  const ph = await savePhoto(PNG);
  assert.ok("id" in ph);
  const id = "id" in ph ? ph.id : "";
  assert.equal((await readPhoto(id))?.type, "image/png");
  const withPhoto = { ...DEFAULT_CONTENT, programmes: [{ ...DEFAULT_CONTENT.programmes[0], photo: id }] };
  assert.deepEqual(await saveContent(withPhoto, "Ashish"), { ok: true });
  const r = await readContent();
  assert.equal(r.programmes.length, 1);
  assert.equal(r.by, "Ashish");
  assert.match(((await saveContent({ ...withPhoto, programmes: [{ ...withPhoto.programmes[0], photo: "a".repeat(24) }] }, "Ashish")) as { error: string }).error, /didn't finish/);
  // An old photo nobody uses is removed on the next save.
  await (await db()).collection<{ _id: string; at: string }>("portalPhotos").updateOne({ _id: id }, { $set: { at: "2020-01-01T00:00:00.000Z" } });
  await saveContent(DEFAULT_CONTENT, "Ashish");
  assert.equal(await readPhoto(id), null);
  assert.ok("error" in (await savePhoto("data:text/html;base64,PGI+")));
});

const seed = async () => {
  const d = await db();
  await d.collection<{ _id: string; items: object[] }>("kv").replaceOne({ _id: "zoho_items" }, { items: [{ id: "cpr", name: "CPR & AED Training (I)", identifier: "Training Services" }] }, { upsert: true });
  const est = (id: string, number: string, status: string, date: string) => ({
    _id: `estimates:${id}`, kind: "estimates", training: true,
    doc: { estimate_id: id, estimate_number: number, status, date, customer_name: "The Grand", total: 99999, line_items: [{ item_id: "cpr", name: "CPR & AED Training (I)", description: "Hands-on CPR\nAED practice", quantity: 30, rate: 1500, item_total: 45000 }] },
  });
  for (const e of [est("1", "QT-1", "sent", "2026-11-01"), est("2", "QT-2", "accepted", "2026-11-05"), est("3", "QT-3", "declined", "2026-11-06"), est("4", "QT-4", "sent", "2026-11-07")]) await d.collection<{ _id: string }>("zohoDocs").insertOne(e);
  const co = (email: string) => ({ coordinator: { name: "Riya", email, phone: "9800000000" } });
  for (const [id, email] of [["1", "riya@grand.com"], ["2", "riya@grand.com"], ["3", "riya@grand.com"], ["4", "someone@else.com"]]) await d.collection<{ _id: string }>("portalTrainings").insertOne({ _id: id, ...co(email) });
};

test("a coordinator sees only their own trainings, newest first, declined ones left out, and never a price", async () => {
  await seed();
  const t = await trainingsFor("riya@grand.com");
  assert.deepEqual(t.map((x) => x.number), ["QT-2", "QT-1"]);
  assert.equal(t[0].lines[0].name, "CPR & AED Training");
  assert.equal(t[0].expected, 30);
  assert.equal(t[0].stamp, "Awaiting date");
  assert.ok(!/99999|45000|1500/.test(JSON.stringify(t)));
  assert.deepEqual(await trainingsFor("nobody@grand.com"), []);
});

test("/api/portal/home: 401 without a session; with one, their trainings and the content", async () => {
  await seed();
  assert.equal((await home(new Request("http://x/api/portal/home"))).status, 401);
  const pw = await issueLogin("riya@grand.com", "Riya Mehta");
  const s = await signIn("riya@grand.com", pw);
  const r = await home(new Request("http://x/api/portal/home", { headers: { cookie: `th_portal=${s.ok ? s.token : ""}` } }));
  const j = (await r.json()) as { me: { name: string }; trainings: { number: string }[]; content: { programmes: unknown[]; social: unknown[] } };
  assert.equal(j.me.name, "Riya Mehta");
  assert.deepEqual(j.trainings.map((x) => x.number), ["QT-2", "QT-1"]);
  assert.equal(j.content.programmes.length, 4);
});

test("/api/portal-content: those who quote read, save and upload; others can't", async () => {
  assert.equal((await getContent(new Request("http://x/api/portal-content", as(outsider)))).status, 403);
  assert.equal((await putContent(new Request("http://x/api/portal-content", as(outsider, { method: "PUT", body: JSON.stringify(DEFAULT_CONTENT) })))).status, 403);
  assert.equal((await getContent(new Request("http://x/api/portal-content", as(ashish)))).status, 200);
  const up = (await (await postPhoto(new Request("http://x/api/portal-content", as(ashish, { method: "POST", body: JSON.stringify({ photo: PNG }) })))).json()) as { id?: string };
  assert.match(up.id ?? "", /^[a-f0-9]{24}$/);
  const bad = await putContent(new Request("http://x/api/portal-content", as(ashish, { method: "PUT", body: JSON.stringify({ ...DEFAULT_CONTENT, programmes: [] }) })));
  assert.equal(bad.status, 400);
  const ok = await putContent(new Request("http://x/api/portal-content", as(ashish, { method: "PUT", body: JSON.stringify(DEFAULT_CONTENT) })));
  assert.equal(ok.status, 200);
});
