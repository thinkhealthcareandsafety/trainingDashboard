// Which Self Client a reconnect tries (src/lib/zohoOAuth.ts): a code only works with the one that made it.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { clientsToTry } from "@/lib/zohoOAuth";

const saved = { clientId: "own", clientSecret: "own-secret" };
const app = { clientId: "app", clientSecret: "app-secret" };
beforeEach(() => { delete process.env.ZOHO_MAIL_CLIENT_ID; delete process.env.ZOHO_MAIL_CLIENT_SECRET; process.env.ZOHO_CLIENT_ID = "app"; process.env.ZOHO_CLIENT_SECRET = "app-secret"; });

test("both boxes typed: only those", () => {
  assert.deepEqual(clientsToTry({ clientId: " typed ", clientSecret: " s " }, saved), [{ clientId: "typed", clientSecret: "s" }]);
});

test("nothing typed: the connection's own Self Client first, then the app's", () => {
  assert.deepEqual(clientsToTry({}, saved), [saved, app]);
  assert.deepEqual(clientsToTry({}, null), [app]);
  assert.deepEqual(clientsToTry({}, app), [app]); // not twice
});

test("one box alone is ignored: browsers auto-fill the secret", () => {
  assert.deepEqual(clientsToTry({ clientSecret: "1234" }, saved), [saved, app]);
  assert.deepEqual(clientsToTry({ clientId: "typed" }, saved), [saved, app]);
});

test("nothing anywhere says so", () => {
  delete process.env.ZOHO_CLIENT_ID; delete process.env.ZOHO_CLIENT_SECRET;
  assert.throws(() => clientsToTry({}, null), /Client ID and secret are needed/);
});
