import { test } from "node:test";
import assert from "node:assert/strict";
import { portalRewrite } from "../src/lib/portalHost";

test("training.thinkhealth.in: / is the sign-in, /<number> a training's; the staff pages are never shown there", () => {
  assert.equal(portalRewrite("training.thinkhealth.in", "/"), "/training");
  assert.equal(portalRewrite("Training.ThinkHealth.in:443", "/Quotation-24-002787"), "/training/Quotation-24-002787");
  assert.equal(portalRewrite("training.thinkhealth.in", "/quotations"), "/training/quotations");
  assert.equal(portalRewrite("training.thinkhealth.in", "/training/Quotation-24-002787"), null);
});

test("every other host is left alone", () => {
  assert.equal(portalRewrite("work.thinkhealth.in", "/"), null);
  assert.equal(portalRewrite("training-dashboard-xfwl.vercel.app", "/quotations"), null);
  assert.equal(portalRewrite("localhost:3000", "/training"), null);
});

test("the join page and a participant's page keep their second part; anything deeper is cut", () => {
  assert.equal(portalRewrite("training.thinkhealth.in", "/Quotation-24-002787/join"), "/training/Quotation-24-002787/join");
  assert.equal(portalRewrite("training.thinkhealth.in", "/Quotation-24-002787/TH001"), "/training/Quotation-24-002787/TH001");
  assert.equal(portalRewrite("training.thinkhealth.in", "/a/b/c"), "/training/a/b");
});
