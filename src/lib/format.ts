// Display helpers shared by the server (Zoho sync) and the browser (CSV import, UI).

const COMMON = new Set(["THE", "AND", "OF", "FOR", "TO", "IN", "AT", "BY", "ON", "A"]);

/** Zoho names are often ALL CAPS ("CHALET HOTELS LIMITED( Pune)"); show them in title case. */
export function tidyName(name: string): string {
  const clean = name.replace(/\s*\(\s*/g, " (").replace(/\s+\)/g, ")").replace(/\s+/g, " ").trim();
  const letters = clean.replace(/[^A-Za-z]/g, "");
  const upper = clean.replace(/[^A-Z]/g, "");
  if (!letters || upper.length / letters.length < 0.7) return clean;
  const keep = new Set(["LLP", "IT", "AED", "BLS", "CPR", "HR", "UK", "USA", "ITC", "JW", "MU", "PN"]);
  return clean
    .split(" ")
    .map((w) => {
      const bare = w.replace(/[^A-Za-z]/g, "");
      // Short all-caps words are usually acronyms (JLL, HS1, AED) — keep them, except common words.
      if (keep.has(bare) || (bare.length > 0 && bare.length <= 3 && !COMMON.has(bare))) return w;
      return w.replace(/[A-Za-z]+/g, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
    })
    .join(" ");
}

/** Loose key for matching the same company across CRM and Books ("Chalet Hotels Ltd." ~ "CHALET HOTELS LIMITED"). */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(private|pvt|limited|ltd|llp|inc|india|the|co|company)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
