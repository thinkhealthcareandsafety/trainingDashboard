// What a GSTIN tells (src/lib/gstin.ts): the state and PAN, and Zoho's GST treatment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GSTIN_RE, fromGstin, gstTreatment } from "@/lib/gstin";

test("a GSTIN gives its state and PAN", () => {
  assert.ok(GSTIN_RE.test("27ABCDE1234F1Z5"));
  assert.ok(!GSTIN_RE.test("27ABCDE1234F1X5"));
  assert.deepEqual(fromGstin("27ABCDE1234F1Z5"), { state: "MH", pan: "ABCDE1234F" });
  assert.equal(fromGstin("29AAACB1234C1Z1").state, "KA");
  assert.equal(fromGstin("99AAACB1234C1Z1").state, undefined);
});

test("GST treatment: registered with a GSTIN, else unregistered business or consumer", () => {
  assert.equal(gstTreatment({ kind: "business", gstin: "27ABCDE1234F1Z5" }), "business_gst");
  assert.equal(gstTreatment({ kind: "business" }), "business_none");
  assert.equal(gstTreatment({ kind: "individual" }), "consumer");
});
