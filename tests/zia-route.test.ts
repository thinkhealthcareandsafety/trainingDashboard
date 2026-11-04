// /api/zia (Zoho Flow posts Zia's email back) against the in-memory fake database — key check, asked-within-the-hour,
// subject split, then the email step's GET ?zia= reading it.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/zia/route";
import { GET } from "@/app/api/quotations/route";
import { db } from "@/lib/db";
import { resetFakeDb } from "./fakes/db";

process.env.ZIA_FLOW_URL = "http://flow.invalid/webhook";
process.env.ZIA_FLOW_SECRET = "s3cret-for-tests";
const back = (body: unknown, key = "s3cret-for-tests") =>
  POST(new Request(`http://x/api/zia?key=${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const ask = async (quote: string, askedAt = Date.now()) => (await db()).collection<{ _id: string; askedAt: number }>("kv").replaceOne({ _id: `zia:${quote}` }, { askedAt });

beforeEach(() => resetFakeDb());

test("a wrong key is refused; an answer nobody asked for (or asked > 1 h ago) is refused", async () => {
  await ask("QT-1");
  assert.equal((await back({ quote: "QT-1", text: "Hi" }, "nope")).status, 401);
  assert.equal((await back({ quote: "QT-2", text: "Hi" })).status, 404);
  await ask("QT-3", Date.now() - 2 * 3600_000);
  assert.equal((await back({ quote: "QT-3", text: "Hi" })).status, 404);
});

test("Zia's answer is kept and the email step gets it, subject split off", async () => {
  await ask("QT-9");
  const admin = { id: "admin", name: "Admin" };
  const get = async () => (await GET(new Request("http://x/api/quotations?zia=QT-9", { headers: { "x-test-member": JSON.stringify(admin) } }))).json();
  assert.deepEqual(await get(), { waiting: true });
  assert.equal((await back({ quote: "QT-9", text: "Subject: Your AED quote\n\nHi Rajesh,\n\nThanks." })).status, 200);
  const j = await get();
  assert.equal(j.subject, "Your AED quote");
  assert.equal(j.text, "Hi Rajesh,\n\nThanks."); // no signature: the email step adds the sender's
});
