/*
 * The India state map on Reports (report #18, owner 27 Oct). Outline: public/maps/india-states.json — DataMeet India,
 * CC BY 4.0, India's official boundaries (README there). Zoho writes states as GST names ("Jammu and Kashmir"); the
 * outline has its own ("Jammu & Kashmir") — `geoName` matches them. Anything not a state of India ("Out of India", a
 * German state, blank) has no place on the map and is listed under it instead.
 */

type Echarts = typeof import("echarts/core");

/** The outline's names (ST_NM), as written there. */
const STATES = [
  "Andaman & Nicobar", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];
const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/\bislands?\b/g, "").replace(/[^a-z]/g, "");
// Older spellings Zoho may still hold.
const OLD: Record<string, string> = { orissa: "odisha", pondicherry: "puducherry", uttaranchal: "uttarakhand", nctofdelhi: "delhi", newdelhi: "delhi" };
const byNorm = new Map(STATES.map((s) => [norm(s), s]));

/** The outline's name for a state as Zoho writes it — undefined when it isn't on the map. */
export function geoName(state: string): string | undefined {
  const n = norm(state);
  return byNorm.get(OLD[n] ?? n);
}

let ready: Promise<void> | null = null;
/** Map chart + colour scale, and the outline registered as "india" — once, on the first map shown. */
export function loadIndia(ec: Echarts): Promise<void> {
  return (ready ??= (async () => {
    const [charts, components, geo] = await Promise.all([
      import("echarts/charts"), import("echarts/components"),
      fetch("/maps/india-states.json").then((r) => { if (!r.ok) throw new Error("map outline missing"); return r.json(); }),
    ]);
    ec.use([charts.MapChart, components.VisualMapComponent]);
    ec.registerMap("india", geo);
  })().catch((e) => { ready = null; throw e; }));
}
