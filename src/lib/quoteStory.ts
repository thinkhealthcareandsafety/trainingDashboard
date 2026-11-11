/*
 * The story of a quotation (owner, 11 Nov: boxes in a snake, "something like that would be peak"): Zoho's history of
 * the quote turned into its steps, oldest first — created, updated (one after another counted as one), emailed, turned
 * into a sales order or invoice, accepted, declined, expired. Zoho's own automation lines ("The custom function … has
 * been executed by the workflow …") aren't steps; they stay behind "Show all of Zoho's lines".
 */

export type HistoryLine = { text: string; by: string | null; when: string };
export type StepKind = "created" | "updated" | "emailed" | "salesorder" | "invoiced" | "accepted" | "declined" | "expired" | "other";
export type StoryStep = { kind: StepKind; title: string; detail: string | null; when: string; by: string | null; count: number };

/** Zoho's automation, not something a person did to the quote. */
export const isAutomation = (h: HistoryLine) => /custom function|workflow/i.test(h.text);

/** "Rs.121,170.00" → "₹121,170". */
const rupees = (s: string) => s.replace(/Rs\.?\s*/gi, "₹").replace(/\.00\b/g, "");

function stepOf(h: HistoryLine): StoryStep {
  const t = h.text.trim();
  const base = { when: h.when, by: h.by, count: 1 };
  let m: RegExpMatchArray | null;
  if ((m = t.match(/created for\s+(.+?)\.?$/i))) return { ...base, kind: "created", title: "Created", detail: rupees(m[1]) };
  if (/^quote updated/i.test(t)) {
    m = t.match(/amount changed from\s+(\S+)\s+to\s+(\S+?)\.?$/i);
    return { ...base, kind: "updated", title: "Updated", detail: m ? `${rupees(m[1])} → ${rupees(m[2])}` : null };
  }
  if ((m = t.match(/emailed to\s+(.+?)\.?$/i))) return { ...base, kind: "emailed", title: "Emailed", detail: m[1] };
  if ((m = t.match(/converted to sales order\s+(.+?)\.?$/i))) return { ...base, kind: "salesorder", title: "Sales order", detail: m[1] };
  if ((m = t.match(/converted to invoice\s+(.+?)\.?$/i)) || /invoiced/i.test(t)) return { ...base, kind: "invoiced", title: "Invoiced", detail: m?.[1] ?? null };
  if (/accepted/i.test(t)) return { ...base, kind: "accepted", title: "Accepted", detail: null };
  if (/declined/i.test(t)) return { ...base, kind: "declined", title: "Declined", detail: null };
  if (/expired/i.test(t)) return { ...base, kind: "expired", title: "Expired", detail: null };
  if (/marked as sent/i.test(t)) return { ...base, kind: "emailed", title: "Marked sent", detail: null };
  return { ...base, kind: "other", title: t.replace(/\.$/, ""), detail: null };
}

/** `history`: Zoho's lines, newest first (as Zoho gives them). */
export function quoteStory(history: HistoryLine[]): StoryStep[] {
  const steps: StoryStep[] = [];
  for (const h of [...history].reverse()) {
    if (!h.text.trim() || isAutomation(h)) continue;
    const s = stepOf(h);
    const prev = steps.at(-1);
    // Updates one after another are one step: "Updated ×3", the latest time, the latest amount change.
    if (s.kind === "updated" && prev?.kind === "updated") {
      prev.count++;
      prev.when = s.when;
      prev.by = s.by ?? prev.by;
      prev.detail = s.detail ?? prev.detail;
      continue;
    }
    steps.push(s);
  }
  return steps;
}
