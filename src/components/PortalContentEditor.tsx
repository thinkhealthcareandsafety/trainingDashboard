"use client";

import { useEffect, useMemo, useState } from "react";
import { type PortalContent, type Programme, MAX_PROGRAMMES, SIGN_KEYS, type SignKey, cleanContent, youtube } from "@/lib/portalContent";
import { SIGNS, SignTile } from "./portal/SignTiles";
import { fmtDate } from "@/lib/dates";
import { btn, inputCls } from "./ui";

/*
 * Templates → Portal content (docs/TRAINING_MANAGER_PLAN.md step 4, owner 10 Nov): what the Training Manager portal
 * shows besides the trainings — the programme tiles (name, one line, sign, YouTube video, photo) and the Stay connected
 * links. Save, and the portal shows it straight away. Photos are made small here before they go up.
 */

type Saved = PortalContent & { by?: string; at?: string };

// The portal's sign colours, for the tiles shown here (the staff pages don't carry the portal's colours).
const SIGN_VARS = { "--sign-green": "#00843d", "--sign-red": "#c8102e", "--action": "#0077b6" } as React.CSSProperties;
const SIGN_NAMES: Record<SignKey, string> = { "first-aid": "First Aid (green cross)", aed: "AED (green heart)", cpr: "CPR (blue)", fire: "Fire (red)" };
const signOf = (k: string) => SIGNS.find((s) => s.key === k) ?? SIGNS[0];

/** A photo, made at most 1200 px wide as a JPEG, so the portal stays light on phones. */
async function smallPhoto(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  let q = 0.82, url = canvas.toDataURL("image/jpeg", q);
  while (url.length > 900_000 && q > 0.4) { q -= 0.12; url = canvas.toDataURL("image/jpeg", q); }
  return url;
}

const same = (a: PortalContent, b: PortalContent) => JSON.stringify({ p: a.programmes, s: a.social }) === JSON.stringify({ p: b.programmes, s: b.social });

export function PortalContentEditor() {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [draft, setDraft] = useState<PortalContent | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState<string>("");

  const load = async () => {
    const r = await fetch("/api/portal-content").catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { content?: Saved; error?: string }) : { error: "Couldn't reach the server" };
    if (!j.content) return setError(j.error ?? "Couldn't read the portal content");
    setSaved(j.content);
    setDraft({ programmes: j.content.programmes, social: j.content.social });
  };
  useEffect(() => { load(); }, []);

  const problem = useMemo(() => { if (!draft) return ""; const c = cleanContent(draft); return "error" in c ? c.error : ""; }, [draft]);
  if (error) return <p className="text-[14px] text-high">{error}</p>;
  if (!saved || !draft) return <p className="text-[14px] text-muted">Loading the portal content…</p>;
  const dirty = !same(draft, saved);

  const setP = (i: number, patch: Partial<Programme>) => setDraft({ ...draft, programmes: draft.programmes.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const move = (i: number, d: -1 | 1) => { const l = [...draft.programmes]; [l[i], l[i + d]] = [l[i + d], l[i]]; setDraft({ ...draft, programmes: l }); };
  const remove = (i: number) => { if (window.confirm(`Take "${draft.programmes[i].name || "this programme"}" off the portal?`)) setDraft({ ...draft, programmes: draft.programmes.filter((_, j) => j !== i) }); };
  const add = () => setDraft({ ...draft, programmes: [...draft.programmes, { key: "", name: "", line: "", sign: "cpr", video: "", photo: "" }] });
  const setS = (key: string, patch: { line?: string; url?: string }) => setDraft({ ...draft, social: draft.social.map((s) => (s.key === key ? { ...s, ...patch } : s)) });

  const upload = async (i: number, file: File | undefined) => {
    if (!file) return;
    setUploading(String(i)); setMsg("");
    try {
      const r = await fetch("/api/portal-content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ photo: await smallPhoto(file) }) });
      const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (j.id) setP(i, { photo: j.id }); else setMsg(j.error ?? "Couldn't upload the photo");
    } catch { setMsg("Couldn't read that photo. Try a JPEG or PNG."); }
    setUploading("");
  };

  const save = async () => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/portal-content", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
    setBusy(false);
    if (!j.ok) return setMsg(j.error ?? "Couldn't save");
    await load();
    setMsg("Saved. The portal shows it now.");
  };

  return (
    <div className="space-y-4 pb-20">
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-semibold">Our Programmes</h2>
          <span className="text-[12px] text-muted">{saved.by && saved.at ? `Last saved by ${saved.by}, ${fmtDate(saved.at, { day: "numeric", month: "short" })}` : "Built-in content"}</span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">The tiles at the top of the portal. A tile with no photo or video shows its sign. The video plays on the tile; a YouTube playlist link works too.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {draft.programmes.map((p, i) => {
            const yt = p.video ? youtube(p.video) : null;
            return (
              <div key={i} className="rounded-xl border border-line p-3">
                <div className="flex items-center gap-2.5">
                  <span style={SIGN_VARS}><SignTile sign={signOf(p.sign)} size={34} /></span>
                  <input className={`${inputCls} flex-1 font-medium`} placeholder="Programme name" value={p.name} maxLength={60} onChange={(e) => setP(i, { name: e.target.value })} aria-label="Programme name" />
                  <button type="button" className={btn.quiet} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" title="Move up">↑</button>
                  <button type="button" className={btn.quiet} disabled={i === draft.programmes.length - 1} onClick={() => move(i, 1)} aria-label="Move down" title="Move down">↓</button>
                </div>
                <label className="mt-2.5 block">
                  <span className="flex justify-between text-[12px] font-medium text-muted">One line <span className="font-normal text-faint">{p.line.length}/140</span></span>
                  <input className={`${inputCls} mt-1`} value={p.line} maxLength={140} onChange={(e) => setP(i, { line: e.target.value })} />
                </label>
                <div className="mt-2.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sign">
                  {SIGN_KEYS.map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={p.sign === k} onClick={() => setP(i, { sign: k })}
                      className={`rounded-full px-2.5 py-1 text-[12px] ${p.sign === k ? "bg-brand-soft font-medium text-ink ring-1 ring-brand" : "bg-surface-2 text-ink-2 hover:bg-line"}`}>{SIGN_NAMES[k]}</button>
                  ))}
                </div>
                <label className="mt-2.5 block">
                  <span className="flex justify-between text-[12px] font-medium text-muted">YouTube video <span className={`font-normal ${p.video && !yt ? "text-high" : "text-faint"}`}>{!p.video ? "none" : !yt ? "not a YouTube link" : yt.kind === "playlist" ? "playlist" : "video"}</span></span>
                  <input className={`${inputCls} mt-1`} placeholder="https://www.youtube.com/watch?v=…" value={p.video} onChange={(e) => setP(i, { video: e.target.value.trim() })} />
                </label>
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="grid aspect-video w-28 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2 text-[11px] text-faint">
                    {p.photo
                      // eslint-disable-next-line @next/next/no-img-element -- a small uploaded photo
                      ? <img src={`/api/portal/photo?id=${p.photo}`} alt="" className="h-full w-full object-cover" />
                      : yt?.kind === "video"
                        // eslint-disable-next-line @next/next/no-img-element -- the video's YouTube thumbnail
                        ? <img src={`https://i.ytimg.com/vi/${yt.id}/mqdefault.jpg`} alt="" className="h-full w-full object-cover" />
                        : "No photo"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <label className={`${btn.ghost} cursor-pointer`}>
                      {uploading === String(i) ? "Uploading…" : p.photo ? "Change photo" : "Upload photo"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={Boolean(uploading)} onChange={(e) => { upload(i, e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                    {p.photo && <button type="button" className={btn.quiet} onClick={() => setP(i, { photo: "" })}>Remove photo</button>}
                  </div>
                </div>
                <div className="mt-2 text-right">
                  <button type="button" className={btn.danger} disabled={draft.programmes.length <= 1} onClick={() => remove(i)}>Remove programme</button>
                </div>
              </div>
            );
          })}
        </div>
        {draft.programmes.length < MAX_PROGRAMMES && <button type="button" className={`${btn.ghost} mt-3`} onClick={add}>+ Add a programme</button>}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[16px] font-semibold">Stay connected</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">The cards at the foot of the portal. A card with no link isn&apos;t shown.</p>
        <div className="mt-3 space-y-2.5">
          {draft.social.map((s) => (
            <div key={s.key} className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
              <span className="text-[13.5px] font-medium">{s.label}</span>
              <input className={inputCls} placeholder="A few words" value={s.line} maxLength={80} onChange={(e) => setS(s.key, { line: e.target.value })} aria-label={`${s.label}: description`} />
              <input className={inputCls} placeholder="https://…" value={s.url} onChange={(e) => setS(s.key, { url: e.target.value.trim() })} aria-label={`${s.label}: link`} />
            </div>
          ))}
        </div>
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-[0_6px_24px_rgb(0_0_0/0.08)] backdrop-blur">
        <button type="button" className={btn.primary} disabled={busy || !dirty || Boolean(problem) || Boolean(uploading)} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {dirty && <button type="button" className={btn.ghost} disabled={busy} onClick={() => { setDraft({ programmes: saved.programmes, social: saved.social }); setMsg(""); }}>Undo changes</button>}
        {dirty && problem && <span className="text-[13px] text-high">{problem}</span>}
        {msg && <span className={`text-[13px] ${/^Saved/.test(msg) ? "text-low" : "text-high"}`} role="status">{msg}</span>}
        {!dirty && !msg && <span className="text-[12.5px] text-faint">Change anything above, then Save.</span>}
      </div>
    </div>
  );
}
