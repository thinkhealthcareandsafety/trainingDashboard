/*
 * What the Training Manager portal shows besides the trainings (docs/TRAINING_MANAGER_PLAN.md step 4): the programme
 * tiles ("Our Programmes") and the "Stay connected" cards. Staff change it on Templates → Portal content (owner, 10 Nov:
 * "no code change needed"); it's kept in kv "portal_content", photos in "portalPhotos". Nothing here is invented:
 * a programme without a video or photo shows its sign, and a social card without a link isn't shown.
 * Pure — used by the portal, the staff screen and the server's checks.
 */

export const SIGN_KEYS = ["first-aid", "aed", "cpr", "fire"] as const;
export type SignKey = (typeof SIGN_KEYS)[number];

export type Programme = {
  key: string;
  name: string;
  line: string; // the one-line description
  sign: SignKey;
  video: string; // a YouTube link (video or playlist), or ""
  photo: string; // a portalPhotos id, or ""
};

export const SOCIAL_KEYS = ["website", "linkedin", "instagram", "youtube", "facebook"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type Social = { key: SocialKey; label: string; line: string; url: string };

export type PortalContent = { programmes: Programme[]; social: Social[] };

export const SOCIAL_LABELS: Record<SocialKey, string> = { website: "Website", linkedin: "LinkedIn", instagram: "Instagram", youtube: "YouTube", facebook: "Facebook" };

// The built-in content. The links are the ones PRODUCT.md records from thinkhealth.in. YouTube and Facebook stay empty
// (so hidden) until someone pastes the exact links on Portal content.
export const DEFAULT_CONTENT: PortalContent = {
  programmes: [
    { key: "cpr", name: "CPR", line: "Chest compressions and rescue breaths for adults, children and infants.", sign: "cpr", video: "", photo: "" },
    { key: "first-aid", name: "First Aid", line: "Care for injuries and sudden illness until help arrives.", sign: "first-aid", video: "", photo: "" },
    { key: "aed", name: "AED", line: "Using an automated external defibrillator, step by step.", sign: "aed", video: "", photo: "" },
    { key: "fire", name: "Fire Safety", line: "Preventing fires, using extinguishers and leading an evacuation.", sign: "fire", video: "", photo: "" },
  ],
  social: [
    { key: "website", label: "Website", line: "Our programmes and equipment", url: "https://www.thinkhealth.in" },
    { key: "linkedin", label: "LinkedIn", line: "News from Think Health", url: "https://www.linkedin.com/in/thinkhealth" },
    { key: "instagram", label: "Instagram", line: "Moments from our trainings", url: "https://www.instagram.com/think_health_india" },
    { key: "youtube", label: "YouTube", line: "Training videos", url: "" },
    { key: "facebook", label: "Facebook", line: "Think Health Care Pune", url: "" },
  ],
};

export const MAX_PROGRAMMES = 12;
export const PHOTO_ID = /^[a-f0-9]{24}$/;

/** A YouTube link → what to show: a single video (with its id, for the thumbnail) or a playlist. null when it isn't one. */
export function youtube(url: string): { kind: "video"; id: string; embed: string } | { kind: "playlist"; id: string; embed: string } | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  const okId = (s: string | null | undefined) => (s && /^[\w-]{6,64}$/.test(s) ? s : null);
  let video: string | null = null;
  if (host === "youtu.be") video = okId(u.pathname.split("/")[1]);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [first, second] = u.pathname.split("/").filter(Boolean);
    video = first === "watch" ? okId(u.searchParams.get("v")) : ["embed", "shorts", "live", "v"].includes(first ?? "") && second !== "videoseries" ? okId(second) : null;
  } else return null;
  const list = okId(u.searchParams.get("list"));
  if (video) return { kind: "video", id: video, embed: `https://www.youtube-nocookie.com/embed/${video}?autoplay=1&rel=0` };
  if (list) return { kind: "playlist", id: list, embed: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=1&rel=0` };
  return null;
}

const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "programme";

/** Staff's edit, checked: the content to keep, or what's wrong (said plainly, for the Portal content screen). */
export function cleanContent(raw: unknown): PortalContent | { error: string } {
  const r = (raw ?? {}) as { programmes?: unknown; social?: unknown };
  if (!Array.isArray(r.programmes) || !Array.isArray(r.social)) return { error: "Nothing to save" };
  if (!r.programmes.length) return { error: "Keep at least one programme" };
  if (r.programmes.length > MAX_PROGRAMMES) return { error: `At most ${MAX_PROGRAMMES} programmes` };
  const programmes: Programme[] = [];
  const keys = new Set<string>();
  for (const p of r.programmes as Record<string, unknown>[]) {
    const name = text(p?.name, 60);
    if (!name) return { error: "Every programme needs a name" };
    const sign = SIGN_KEYS.includes(p.sign as SignKey) ? (p.sign as SignKey) : null;
    if (!sign) return { error: `Pick a sign for ${name}` };
    const video = text(p.video, 300);
    if (video && !youtube(video)) return { error: `${name}: the video should be a YouTube link (a video or a playlist)` };
    const photo = text(p.photo, 24);
    if (photo && !PHOTO_ID.test(photo)) return { error: `${name}: that photo isn't one of ours. Upload it again.` };
    let key = text(p.key, 40) || slug(name);
    while (keys.has(key)) key = `${key}-2`;
    keys.add(key);
    programmes.push({ key, name, line: text(p.line, 140), sign, video, photo });
  }
  const given = new Map((r.social as Record<string, unknown>[]).map((s) => [s?.key, s]));
  const social: Social[] = [];
  for (const key of SOCIAL_KEYS) {
    const s = given.get(key) ?? {};
    const url = text(s.url, 300);
    if (url) {
      let ok = false;
      try { ok = new URL(url).protocol === "https:"; } catch { /* not a link */ }
      if (!ok) return { error: `${SOCIAL_LABELS[key]}: paste the full link, starting with https://` };
    }
    social.push({ key, label: SOCIAL_LABELS[key], line: text(s.line, 80), url });
  }
  return { programmes, social };
}

/** The photo ids the content uses (the server deletes the others). */
export const photosIn = (c: PortalContent) => c.programmes.map((p) => p.photo).filter(Boolean);
