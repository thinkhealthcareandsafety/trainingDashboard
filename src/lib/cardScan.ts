import { GSTIN_RE, fromGstin } from "./gstin";

/*
 * A visiting card's words → the External Leads form (owner, 27 Nov: "adding a photograph of the card and our system scans
 * it and uploads it directly into the labels"). The words are read in the browser (pageRead.readPicture); one card may be
 * several photos (front and back), all read and put together here. Only a first guess: the form shows it to be checked.
 * Pure.
 */

export type CardGuess = {
  company?: string; salutation?: string; firstName?: string; lastName?: string; designation?: string; phone?: string; phones: string[];
  email?: string; website?: string; gstin?: string; street?: string; street2?: string; city?: string; state?: string; zip?: string;
};

const COMPANY = /\b(pvt|private|ltd|limited|llp|inc|corp|corporation|company|co\.|industries|enterprises?|solutions?|technologies|tech|services|systems|traders|trading|agencies|associates|group|hotels?|resorts?|hospitals?|healthcare|pharma|foundation|consultants?|international|exports?|imports?|engineering|infra|logistics|labs?|motors|retail|marketing)\b/i;
const ROLE = /\b(manager|director|engineer|executive|officer|head|ceo|cfo|coo|cto|founder|co-founder|proprietor|partner|owner|president|vice|consultant|sales|purchase|procurement|admin|administrator|hr|lead|specialist|coordinator|supervisor|incharge|in-charge|chairman|md|gm|agm|dgm|vp|accounts?|marketing|operations?|business development|associate)\b/i;
const ADDRESS = /\b(road|rd\.?|street|st\.|floor|flr|plot|near|opp\.?|opposite|sector|nagar|building|bldg|tower|complex|plaza|chowk|lane|marg|park|estate|midc|phase|block|wing|shop|office no|unit|society|colony|layout|cross|main|highway|area|village|taluka|dist\.?|district)\b|\d+[/,-]\d+/i;
const CITIES = ["Mumbai", "Navi Mumbai", "Thane", "Pune", "Pimpri", "Chinchwad", "Nagpur", "Nashik", "Aurangabad", "Delhi", "New Delhi", "Noida", "Gurgaon", "Gurugram", "Faridabad", "Ghaziabad", "Bengaluru", "Bangalore", "Chennai", "Hyderabad", "Secunderabad", "Kolkata", "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Jaipur", "Lucknow", "Kanpur", "Indore", "Bhopal", "Goa", "Panaji", "Margao", "Kochi", "Cochin", "Thiruvananthapuram", "Coimbatore", "Madurai", "Visakhapatnam", "Vijayawada", "Bhubaneswar", "Patna", "Ranchi", "Chandigarh", "Mohali", "Ludhiana", "Amritsar", "Dehradun", "Guwahati", "Raipur", "Mysuru", "Mysore", "Mangaluru", "Mangalore", "Hubli", "Belgaum", "Kolhapur", "Solapur", "Udaipur", "Jodhpur", "Agra", "Varanasi"];
const FREE_MAIL = /@(gmail|yahoo|hotmail|outlook|rediffmail|live|icloud|aol|protonmail|ymail)\./i;

/** A line as read: odd marks out, and the one or two letters a phone / mail / pin icon is read as ("BN +91 …", "El www…"). */
const tidy = (s: string) => s.replace(/([A-Za-z0-9])[®©](?=[A-Za-z0-9])/g, "$1@").replace(/[|_~`•●▪◆■®©]+/g, " ").replace(/\s+/g, " ").trim()
  .replace(/^(?!(?:mr|ms|dr)\b)[A-Za-z]{1,2}\s+(?=[+\d(]|www\.|[\w.%+-]+@|plot\b|shop\b|flat\b|office\b|unit\b|door\b|no\.)/i, "");
/** States by name (an address says "Gujarat - 360022"), as Zoho's codes. */
const STATES: [RegExp, string][] = [
  [/\bmaharashtra\b/i, "MH"], [/\bgujarat\b/i, "GJ"], [/\bkarnataka\b/i, "KA"], [/\btamil ?nadu\b/i, "TN"], [/\btelangana\b/i, "TS"],
  [/\b(new )?delhi\b/i, "DL"], [/\bgoa\b/i, "GA"], [/\bkerala\b/i, "KL"], [/\bandhra pradesh\b/i, "AP"], [/\buttar pradesh\b/i, "UP"],
  [/\bwest bengal\b/i, "WB"], [/\bharyana\b/i, "HR"], [/\brajasthan\b/i, "RJ"], [/\bpunjab\b/i, "PB"], [/\bmadhya pradesh\b/i, "MP"],
  [/\bchhattisgarh\b/i, "CG"], [/\bodisha|orissa\b/i, "OR"], [/\bbihar\b/i, "BR"], [/\bjharkhand\b/i, "JH"], [/\buttarakhand\b/i, "UK"],
  [/\bhimachal\b/i, "HP"], [/\bjammu\b|\bkashmir\b/i, "JK"], [/\bchandigarh\b/i, "CH"], [/\bassam\b/i, "AS"], [/\bpuducherry|pondicherry\b/i, "PY"],
];
const STATE_WORDS = /\b(maharashtra|gujarat|karnataka|tamil ?nadu|telangana|kerala|andhra pradesh|uttar pradesh|west bengal|haryana|rajasthan|punjab|madhya pradesh|chhattisgarh|odisha|orissa|bihar|jharkhand|uttarakhand|himachal pradesh|assam|india)\b/gi;
const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Indian phone numbers on the card, as +91 and ten digits (mobiles) or with their area code (landlines). */
export function phonesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:\+?\s?91[\s-]*|0)?(?:\(?\d{2,5}\)?[\s-]*)?\d[\d\s-]{6,12}\d/g)) {
    const d = m[0].replace(/\D/g, "");
    const core = d.replace(/^(91|0)(?=\d{10}$)/, "");
    if (/^[6-9]\d{9}$/.test(core)) out.push(`+91 ${core}`);
    else if (/^\d{10,11}$/.test(core) && !/^(19|20)\d{6}$/.test(core) && !/^\d{6}$/.test(core)) out.push(core.length === 11 ? core : `0${core}`.replace(/^00/, "0"));
  }
  return [...new Set(out)];
}

export function parseCard(text: string): CardGuess {
  const lines = text.split(/\r?\n/).map(tidy).filter((l) => l.length > 1);
  const all = lines.join("\n");
  const g: CardGuess = { phones: phonesIn(all) };
  g.phone = g.phones.find((p) => p.startsWith("+91")) ?? g.phones[0];
  // A "1" after a mailbox word is often read as "i" or "l" ("pnsalesi@" on the Armor Fire card was "pnsales1@").
  g.email = all.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0].toLowerCase()
    .replace(/(sales|info|admin|support|accounts|purchase|office|contact|service|enquiry|marketing)[il](?=@)/, "$11");
  g.website = all.match(/\b(?:https?:\/\/)?(?:www\.)[A-Za-z0-9-]+(?:\.[A-Za-z]{2,})+\b/i)?.[0].toLowerCase();
  const gst = all.toUpperCase().replace(/\s+/g, "").match(/\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]/)?.[0];
  if (gst && GSTIN_RE.test(gst)) { g.gstin = gst; g.state = fromGstin(gst).state; }
  const pin = all.match(/\b(\d{3})\s?(\d{3})\b(?![\d-])/);
  if (pin && /^[1-8]/.test(pin[1])) g.zip = pin[1] + pin[2];

  const used = new Set<string>();
  const plain = (l: string) => !/@|www\.|https?:|\d{5,}/i.test(l) && !/^(ph|tel|mob|mobile|cell|fax|email|e-mail|web|gst|gstin)\b/i.test(l);
  // Company: a line that says so (Pvt Ltd, Industries …), else the email's own domain.
  const co = lines.find((l) => COMPANY.test(l) && plain(l) && !ROLE.test(l.replace(COMPANY, "")) && l.length <= 70)
    ?? lines.find((l) => COMPANY.test(l) && plain(l) && l.length <= 70);
  // An all-capitals line is written the usual way ("INFINITY INDUSTRIES PVT LTD" → "Infinity Industries Pvt Ltd").
  if (co) { g.company = /[a-z]/.test(co) ? co : title(co).replace(/\bLlp\b/g, "LLP"); used.add(co); }
  else {
    // No such line: the name the email or website is made of, as the card's own words spell it ("ARMOR" "FIRE" → Armor Fire).
    const stem = (g.email && !FREE_MAIL.test(g.email) ? g.email.split("@")[1] : g.website?.replace(/^(https?:\/\/)?www\./, ""))?.split(".")[0].replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (stem) {
      const words = all.split(/[^A-Za-z0-9&]+/).filter(Boolean);
      let found: string | undefined;
      for (let i = 0; i < words.length && !found; i++) {
        let joined = "";
        for (let k = i; k < Math.min(words.length, i + 4); k++) {
          joined += words[k].toLowerCase();
          if (joined === stem && k > i) found = words.slice(i, k + 1).map((w) => (/[a-z]/.test(w) ? w : title(w))).join(" ");
          if (!stem.startsWith(joined)) break;
        }
      }
      // The logo often puts the words apart ("ARMOR" above "FIRE"): any two of the card's words that make the name.
      if (!found) {
        const uniq = [...new Set(words.filter((x) => x.length >= 2 && stem.includes(x.toLowerCase())))];
        for (const a of uniq) for (const b of uniq) if (!found && a !== b && (a + b).toLowerCase() === stem) found = [a, b].map((w) => (/[a-z]/.test(w) ? w : title(w))).join(" ");
      }
      g.company = found ?? title(stem);
    }
  }

  // The person: two to four words of letters, not the company, not a job title; Mr / Ms / Dr becomes the salutation.
  const role = lines.find((l) => ROLE.test(l) && plain(l) && !used.has(l) && l.replace(/[()]/g, " ").trim().split(/\s+/).length <= 9);
  const nameLine = lines.find((l) => {
    if (used.has(l) || l === role || !plain(l) || COMPANY.test(l) || ADDRESS.test(l)) return false;
    const w = l.replace(/^(mr|mrs|ms|miss|dr|er|capt)\.?\s+/i, "").split(" ");
    return w.length >= 2 && w.length <= 4 && w.every((x) => /^[A-Za-z][A-Za-z.'-]*$/.test(x)) && !ROLE.test(l);
  });
  if (nameLine) {
    used.add(nameLine);
    const sal = nameLine.match(/^(mr|mrs|ms|miss|dr)\.?\s+/i);
    if (sal) g.salutation = { mr: "Mr.", mrs: "Mrs.", ms: "Ms.", miss: "Miss", dr: "Dr." }[sal[1].toLowerCase()];
    const words = nameLine.slice(sal?.[0].length ?? 0).split(" ").map((w) => (/[a-z]/.test(w) ? w : title(w)));
    g.firstName = words.slice(0, -1).join(" ");
    g.lastName = words.at(-1);
  }
  if (role) { g.designation = /[a-z]/.test(role) ? role : title(role).replace(/\(\s*/g, "(").replace(/\s*\)/g, ")").replace(/\bPan India\b/, "PAN India"); used.add(role); }

  // The address: the lines that look like one (road, floor, plot …, or the line with the PIN code).
  const addr = lines.filter((l) => !used.has(l) && !/@|www\.|https?:/i.test(l) && (ADDRESS.test(l) || (g.zip && l.replace(/\s/g, "").includes(g.zip))) && !/^(ph|tel|mob|mobile|fax|gst)/i.test(l))
    .map((l) => l.replace(/\b(?:ph|tel|mob|mobile|cell)\b.*$/i, "").replace(/[,\s-]+$/, "").trim()).filter(Boolean);
  if (!g.state) g.state = STATES.find(([re]) => re.test(addr.join(" ") || all))?.[1];
  const city = CITIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(addr.join(" ") || all));
  if (city) g.city = city;
  const street = addr.map((l) => l.replace(new RegExp(`\\b${city ?? "$^"}\\b.*$`, "i"), "").replace(/\b\d{3}\s?\d{3}\b/, "").replace(STATE_WORDS, "").replace(/[,\s-]+$/, "").replace(/^[,\s-]+/, "").trim()).filter((l) => l.length > 2);
  if (street.length) {
    const joined = street.join(", ");
    const cut = joined.length > 100 ? joined.lastIndexOf(", ", 100) : -1;
    g.street = cut > 0 ? joined.slice(0, cut) : joined.slice(0, 200);
    if (cut > 0) g.street2 = joined.slice(cut + 2, cut + 202);
  }
  return g;
}
