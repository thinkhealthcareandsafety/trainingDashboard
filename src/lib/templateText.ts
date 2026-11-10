/*
 * The little language of editable email templates (owner, 10 Nov: "we should technically be able to edit templates on the
 * page"). Plain text, plus three marks:
 *  - {name}      a value the code fills in ({total}, {valid}, {items} …);
 *  - [ … ]       left out when a {name} inside it is empty ("[, valid until {valid}]" disappears when a quote has no expiry);
 *  - {one|many}  item paragraphs only: the first when the paragraph names one item, the second when it names several.
 * Square brackets with no {name} inside are ordinary text. Used in the browser (preview, email step) and on the server (save).
 */

const OPTIONAL = /\[([^[\]]*\{\w+\}[^[\]]*)\]/g;
const CHOICE = /\{([^{}|]*)\|([^{}]*)\}/g;
const NAME = /\{(\w+)\}/g;

/** The text with its marks resolved. A {name} with no value given stays as typed (saving refuses those). */
export function renderTemplate(text: string, vars: Record<string, string | undefined>, many = false): string {
  return text
    .replace(OPTIONAL, (_, inner: string) => ([...inner.matchAll(NAME)].some((m) => !vars[m[1]]) ? "" : inner))
    .replace(CHOICE, (_, one: string, several: string) => (many ? several : one))
    .replace(NAME, (m, k: string) => (k in vars ? (vars[k] ?? "") : m));
}

/** What's wrong with a template before it's saved; empty when it can be saved. */
export function templateProblems(text: string, allowed: readonly string[], opts: { choices?: boolean; required?: boolean } = {}): string[] {
  const out: string[] = [];
  if (opts.required !== false && !text.trim()) out.push("It can't be empty.");
  if (text.length > 20_000) out.push("It's too long (20,000 characters at most).");
  const unknown = [...new Set([...text.replace(CHOICE, "").matchAll(NAME)].map((m) => m[1]).filter((k) => !allowed.includes(k)))];
  if (unknown.length) out.push(`Unknown: ${unknown.map((k) => `{${k}}`).join(", ")}. Use only ${allowed.map((k) => `{${k}}`).join(" ")}.`);
  const choices = text.match(CHOICE);
  if (choices && !opts.choices) out.push(`{…|…} only works in item paragraphs: ${choices[0]}`);
  return out;
}
