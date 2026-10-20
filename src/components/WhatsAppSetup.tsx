"use client";

import { useEffect, useState } from "react";
import { IconButton, Segmented, btn, inputCls } from "./ui";

/*
 * Admin: WhatsApp reminders through Anantya (owner, 20 Oct) — the API key (kept on the server, never shown again),
 * each trainer's number, which Anantya template is the reminder and which the postponement, and a test message.
 * Opened from the Calendar's "WhatsApp" button. Server: /api/whatsapp, src/lib/whatsapp.ts.
 */

type Kind = "reminder" | "postponed";
type Template = { id: number; name: string; status: string; active: boolean; text: string; vars: number };
type Config = { hasKey: boolean; keyEnd?: string; numbers: Record<string, string>; templates: Partial<Record<Kind, { id: number; name: string; vars?: number }>>; updatedAt?: string; updatedBy?: string; ready: boolean };
type Data = { config: Config; people: { key: string; name: string }[]; vars: Record<Kind, number>; templates?: Template[]; templatesError?: string };

/**
 * What to create in Anantya → Templates (Utility, English) — the dashboard fills {{1}}… in this order
 * (trainingReminders.ts whatsappValues). 20 Oct: "_v2" read on a phone (the first ones read like a form); "_v3" added the
 * concerned person's contact number; "_v4" the type of training.
 */
const DETAILS = `🩺 *Training:* {{5}}
📍 *Location:* {{6}}
👥 *People expected:* {{7}}
🧑‍🏫 *Trainers:* {{8}}

*Contact on site*
👤 {{9}}
📞 {{10}}
✉️ {{11}}

— ThinkHealth Training Dashboard`;
const SAMPLE = ["THCAS First Aid Training (I)", "Andheri East", "25", "Ashish Dalal, Sumit A Shah", "Rahul Mehta", "98200 12345", "rahul@example.com"];
const TEXT: Record<Kind, { name: string; body: string; sample: string[] }> = {
  reminder: {
    name: "training_reminder_v4",
    body: `Hi {{1}} 👋

Reminder: your training at *{{2}}* is *{{3}}*.

📅 *Date:* {{4}}
${DETAILS}`,
    sample: ["Ashish", "Sierragold Heights", "in 3 days", "Wed, 21 Oct 2026", ...SAMPLE],
  },
  postponed: {
    name: "training_postponed_v4",
    body: `Hi {{1}},

The training at *{{2}}* has been *postponed*. We are sorry for the inconvenience.

❌ *Was:* {{3}}
✅ *Now:* {{4}}

${DETAILS}`,
    sample: ["Ashish", "Sierragold Heights", "Wed, 21 Oct 2026", "Mon, 26 Oct 2026", ...SAMPLE],
  },
};

/** The message as WhatsApp shows it: sample values in, *bold* bold. */
function Preview({ k }: { k: Kind }) {
  const text = TEXT[k].body.replace(/\{\{(\d+)\}\}/g, (_, n) => TEXT[k].sample[Number(n) - 1] ?? "");
  return (
    <div className="rounded-lg rounded-tl-none bg-[#dcf8c6] px-3 py-2 text-[12.5px] leading-snug text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
      <p className="whitespace-pre-wrap">{text.split(/(\*[^*\n]+\*)/).map((s, i) => (/^\*.+\*$/.test(s) ? <b key={i} className="font-semibold">{s.slice(1, -1)}</b> : s))}</p>
    </div>
  );
}
const LABEL: Record<Kind, string> = { reminder: "Reminder", postponed: "Postponed" };

function Step({ n, title, hint, children }: { n: number; title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="flex items-baseline gap-2 text-[14px] font-semibold text-ink">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted">{n}</span>
        {title}
      </h4>
      {hint && <p className="mt-1 text-[12.5px] leading-snug text-muted">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

export function WhatsAppSetup({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [replaceKey, setReplaceKey] = useState(false);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Partial<Record<Kind, number>>>({});
  const [showText, setShowText] = useState<Kind | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testKind, setTestKind] = useState<Kind>("reminder");
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const take = (d: Data) => {
    setData(d);
    setNumbers(Object.fromEntries(d.people.map((p) => [p.key, d.config.numbers[p.key] ?? ""])));
    setPicked({ reminder: d.config.templates.reminder?.id, postponed: d.config.templates.postponed?.id });
  };
  useEffect(() => {
    fetch("/api/whatsapp", { cache: "no-store" })
      .then(async (r) => (r.ok ? take(await r.json()) : setLoadError((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`)))
      .catch((e) => setLoadError(String(e)));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const templates = data?.templates ?? [];
  const byId = (id?: number) => templates.find((t) => t.id === id);
  const save = async () => {
    if (!data) return;
    setSaving(true);
    setSaveMsg(null);
    const chosen = Object.fromEntries((["reminder", "postponed"] as const).map((k) => {
      const t = byId(picked[k]);
      return [k, t ? { id: t.id, name: t.name } : data.config.templates[k] ?? null];
    }));
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), numbers, ...(data.config.hasKey || apiKey.trim() ? { templates: chosen } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      take({ ...data, ...j });
      setApiKey("");
      setReplaceKey(false);
      setSaveMsg({ ok: true, text: "Saved" });
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };
  const test = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch("/api/whatsapp", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: testKind, to: testTo }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setTestMsg({ ok: true, text: `Sent “${j.template}” (${j.about}). Check WhatsApp on that phone.` });
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };
  const copy = async (k: Kind) => {
    try {
      await navigator.clipboard.writeText(TEXT[k].body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const cfg = data?.config;
  const fits = (k: Kind) => cfg?.templates[k]?.vars === data?.vars[k];
  const missing = cfg ? [!cfg.hasKey && "the API key", !fits("reminder") && `a reminder template with ${data?.vars.reminder} values`, !fits("postponed") && `a postponed template with ${data?.vars.postponed} values`, !Object.values(cfg.numbers).some(Boolean) && "a number"].filter(Boolean) : [];

  return (
    <div className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/30 p-3 backdrop-blur-md sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal aria-label="WhatsApp reminders" className="modal-in flex max-h-[94vh] w-full max-w-[940px] flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <h3 className="text-[19px] font-bold tracking-tight text-ink">WhatsApp reminders</h3>
            <p className="mt-0.5 text-[13px] text-muted">Through Anantya — the same days and details as the reminder emails, one message to each trainer.</p>
          </div>
          <IconButton label="Close" onClick={onClose}><path d="M5 5l10 10M15 5L5 15" /></IconButton>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-5">
          {loadError && <p className="text-[13px] text-high">Couldn&rsquo;t load the settings: {loadError}</p>}
          {!data && !loadError && <p className="py-8 text-center text-[13px] text-muted">Loading…</p>}
          {data && cfg && (
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
              <div className="space-y-6">
                <Step n={1} title="Anantya API key" hint={<>In Anantya: <b className="font-medium text-ink-2">Integrations → API Key</b> → Create / Copy. It stays on the server — nobody sees it here again.</>}>
                  {cfg.hasKey && !replaceKey ? (
                    <div className="flex items-center gap-3 text-[13.5px]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-low"><span aria-hidden>●</span> Saved</span>
                      <span className="num text-muted">ends …{cfg.keyEnd}</span>
                      <button className={`${btn.quiet} ml-auto`} onClick={() => setReplaceKey(true)}>Replace</button>
                    </div>
                  ) : (
                    <input className={inputCls} type="password" autoComplete="off" placeholder="Paste the API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                  )}
                </Step>

                <Step n={2} title="WhatsApp numbers" hint="Who gets the reminders for the trainings they give (AED trainings: Priyanka). Leave one empty to skip that person.">
                  <div className="space-y-2">
                    {data.people.map((p) => (
                      <label key={p.key} className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
                        <span className="text-[13px] text-ink-2">{p.name}</span>
                        <input className={`${inputCls} h-9 num`} inputMode="tel" placeholder="98xxxxxxxx" value={numbers[p.key] ?? ""} onChange={(e) => setNumbers((n) => ({ ...n, [p.key]: e.target.value }))} />
                      </label>
                    ))}
                  </div>
                </Step>
              </div>

              <div className="space-y-6">
                <Step
                  n={3}
                  title="Templates"
                  hint={<>Create both in Anantya → <b className="font-medium text-ink-2">Templates</b> (category Utility, English), wait for Meta to approve them, then pick them here.</>}
                >
                  {!cfg.hasKey && <p className="text-[13px] text-muted">Save the API key first — then your Anantya templates show here.</p>}
                  {data.templatesError && <p className="text-[13px] text-high">{data.templatesError}</p>}
                  <div className="space-y-3">
                    {(["reminder", "postponed"] as const).map((k) => {
                      const t = byId(picked[k]);
                      const warn = t && (t.vars !== data.vars[k] ? `It has ${t.vars} values — this one needs ${data.vars[k]} ({{1}} to {{${data.vars[k]}}}).` : !/approv|accept/i.test(t.status) ? `Status “${t.status || "unknown"}” — it can't be sent until Meta approves it.` : "");
                      return (
                        <div key={k}>
                          <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
                            <span className="text-[13px] text-ink-2">{LABEL[k]} <span className="text-faint">· {data.vars[k]} values</span></span>
                            <select
                              className={`${inputCls} h-9`}
                              disabled={!cfg.hasKey || !templates.length}
                              value={picked[k] ?? ""}
                              onChange={(e) => setPicked((p) => ({ ...p, [k]: e.target.value ? Number(e.target.value) : undefined }))}
                            >
                              <option value="">{templates.length ? "Pick a template…" : cfg.hasKey ? "No templates yet" : "—"}</option>
                              {templates.map((x) => <option key={x.id} value={x.id}>{x.name}{x.status ? ` · ${x.status}` : ""}</option>)}
                            </select>
                          </div>
                          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 pl-[144px] text-[12px]">
                            {warn ? <span className="text-medium">{warn}</span> : t ? <span className="text-low">Ready</span> : null}
                            <button className="font-medium text-muted hover:text-ink" onClick={() => setShowText(showText === k ? null : k)}>{showText === k ? "Hide the text" : "Text to create"}</button>
                          </div>
                          {showText === k && (
                            <div className="mt-2 rounded-lg bg-surface-2 p-3 text-[12px]">
                              <div className="mb-1.5 flex items-center justify-between gap-2">
                                <span className="text-muted">Name <b className="num font-medium text-ink-2">{TEXT[k].name}</b> · Utility · English</span>
                                <button className="font-medium text-muted hover:text-ink" onClick={() => copy(k)}>{copied ? "Copied" : "Copy"}</button>
                              </div>
                              <pre className="whitespace-pre-wrap font-sans leading-snug text-ink-2">{TEXT[k].body}</pre>
                              <p className="mb-1.5 mt-3 text-muted">On the phone it looks like this</p>
                              <Preview k={k} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Step>

                <Step n={4} title="Send a test" hint="To one number, with the next training's details (or made-up ones). Recorded nowhere. Save first.">
                  <div className="flex flex-wrap items-center gap-2">
                    <Segmented value={testKind} onChange={setTestKind} options={[{ value: "reminder", label: "Reminder" }, { value: "postponed", label: "Postponed" }]} />
                    <input className={`${inputCls} h-9 w-40 num`} inputMode="tel" placeholder="Number" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                    <button className={btn.ghost} disabled={testing || !testTo.trim() || !cfg.templates[testKind]} onClick={test}>{testing ? "Sending…" : "Send test"}</button>
                  </div>
                  {testMsg && <p className={`mt-2 text-[12.5px] ${testMsg.ok ? "text-low" : "text-high"}`}>{testMsg.text}</p>}
                </Step>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-3.5">
          {cfg && (
            <span className={`mr-auto text-[12.5px] ${cfg.ready ? "text-low" : "text-muted"}`}>
              {cfg.ready ? "● On — reminders also go by WhatsApp" : `Off until it has ${missing.join(", ")}`}
              {cfg.updatedBy && <span className="text-faint"> · saved by {cfg.updatedBy}</span>}
            </span>
          )}
          {saveMsg && <span className={`text-[12.5px] ${saveMsg.ok ? "text-low" : "text-high"}`}>{saveMsg.text}</span>}
          <button className={btn.ghost} onClick={onClose}>Close</button>
          <button className={btn.primary} disabled={!data || saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
