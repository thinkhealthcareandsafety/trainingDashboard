// The Training Manager portal's sign-in (src/lib/portalAuth.ts, /api/portal) — on the fake database, nothing sent.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { issueLogin, newPassword, portalUser, requestCode, resetPassword, signIn } from "@/lib/portalAuth";
import { GET, POST } from "@/app/api/portal/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

beforeEach(() => resetFakeDb());
const EMAIL = "riya@grandhotel.com";

test("a new password is 12 easy-to-read characters, and kept only scrambled", async () => {
  const p = newPassword();
  assert.match(p, /^[a-km-zA-HJ-NP-Z2-9]{12}$/);
  const pw = await issueLogin(EMAIL, "Riya Mehta");
  const saved = await (await db()).collection<{ _id: string }>("portalLogins").findOne({ _id: EMAIL });
  assert.ok(saved && !JSON.stringify(saved).includes(pw));
});

test("sign in: the right password works and gives a session; a wrong one doesn't say whether the email exists", async () => {
  const pw = await issueLogin(EMAIL, "Riya Mehta");
  const ok = await signIn(" Riya@GrandHotel.com ", pw);
  assert.equal(ok.ok, true);
  assert.deepEqual(await portalUser(ok.ok ? ok.token : ""), { email: EMAIL, name: "Riya Mehta" });
  const wrong = await signIn(EMAIL, "nope-nope");
  const nobody = await signIn("someone@else.com", "nope-nope");
  assert.equal(wrong.ok, false);
  assert.equal(!wrong.ok && !nobody.ok && wrong.error === nobody.error, true);
  assert.equal(await portalUser("not-a-token"), null);
});

test("5 wrong passwords: wait 15 minutes, even with the right one", async () => {
  const pw = await issueLogin(EMAIL, "Riya");
  for (let i = 0; i < 4; i++) assert.equal((await signIn(EMAIL, "wrong")).ok, false);
  const fifth = await signIn(EMAIL, "wrong");
  assert.equal(!fifth.ok && fifth.status, 429);
  const right = await signIn(EMAIL, pw);
  assert.equal(!right.ok && right.status, 429);
});

test("reset: a code by email, 3 an hour; the code + a new password sign them in; a wrong code fails", async () => {
  await issueLogin(EMAIL, "Riya");
  const sent: string[] = [];
  const send = async (_to: string, code: string) => { sent.push(code); };
  assert.deepEqual(await requestCode("nobody@x.com", send), { ok: true }); // same answer, nothing sent
  assert.equal(sent.length, 0);
  for (let i = 0; i < 3; i++) assert.equal((await requestCode(EMAIL, send)).ok, true);
  assert.equal((await requestCode(EMAIL, send)).ok, false); // 4th in an hour
  const code = sent.at(-1)!;
  assert.match(code, /^\d{6}$/);
  assert.equal((await resetPassword(EMAIL, code, "short")).ok, false);
  assert.equal((await resetPassword(EMAIL, code === "000000" ? "111111" : "000000", "a-good-password")).ok, false);
  const r = await resetPassword(EMAIL, code, "a-good-password");
  assert.equal(r.ok, true);
  assert.equal((await signIn(EMAIL, "a-good-password")).ok, true);
  assert.equal((await resetPassword(EMAIL, code, "another-password")).ok, false); // a code works once
});

test("the route: sign in sets the cookie, GET knows who it is; the reset code goes only from the live site", async () => {
  const pw = await issueLogin(EMAIL, "Riya Mehta");
  const call = (body: object) => POST(new Request("http://x/api/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const r = await call({ action: "signin", email: EMAIL, password: pw });
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^th_portal=[\w-]+; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax/);
  const me = await GET(new Request("http://x/api/portal", { headers: { cookie: cookie.split(";")[0] } }));
  assert.deepEqual(await me.json(), { email: EMAIL, name: "Riya Mehta" });
  assert.equal((await GET(new Request("http://x/api/portal"))).status, 401);
  delete process.env.VERCEL_ENV;
  assert.equal((await call({ action: "code", email: EMAIL })).status, 409);
});

test("every login email: a fresh password (the old one stops), unless they chose their own; undo puts it back", async () => {
  const { passwordForEmail } = await import("@/lib/portalAuth");
  const first = await passwordForEmail(EMAIL, "Riya Mehta");
  assert.ok(first.password);
  const second = await passwordForEmail(EMAIL, "Riya Mehta");
  assert.ok(second.password && second.password !== first.password);
  assert.equal((await signIn(EMAIL, first.password!)).ok, false);
  assert.equal((await signIn(EMAIL, second.password!)).ok, true);
  // The email failed: back to how it was, so the second password still works.
  const third = await passwordForEmail(EMAIL, "Riya Mehta");
  await third.undo();
  assert.equal((await signIn(EMAIL, second.password!)).ok, true);
  // They choose their own (reset by code): never replaced.
  await (await db()).collection<{ _id: string }>("portalLogins").updateOne({ _id: EMAIL }, { $set: { own: true } });
  const fourth = await passwordForEmail(EMAIL, "Riya Mehta");
  assert.equal(fourth.password, null);
  assert.equal((await signIn(EMAIL, second.password!)).ok, true);
});
