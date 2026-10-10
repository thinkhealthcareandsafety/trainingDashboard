"use client";

import { useEffect, useMemo, useState } from "react";
import type { CardEvent, CertRow, Member } from "@/lib/types";
import { type CardView, certDate, fmtStamp, normEmail } from "@/lib/pipeline";
import { useStore } from "@/lib/store";
import { isAdmin } from "@/lib/roles";
import { fireworks } from "@/lib/confetti";
import { DESIGNS, type DesignId, designFor, parseNames, pdfName, printedDate } from "@/lib/certificates";
import { btn, inputCls } from "../ui";
import { EmailPicker, certEvents } from "./CardModal";
import { ConnectMailbox } from "./AedContacted";

/*
 * Fulfillment (Shreya) · under the Training box:
 *   Training Completed → Send Gratitude Email (Zoho Mail, from learn@ — Shikha's alias; Zoho forwards replies to digital@)
 *   Gratitude Email Sent → replies star the card (opened in Zoho Mail = star gone) · Generate Certificate: names → the
 *     rows as they'll sit in the master sheet → design → Generate (rows appended, PDF made here) → Download → moves on
 *   Certificates Generated → In process / On hold · Sent to Logistics (only while In process)
 */

const GRATITUDE_FROM = "learn@thinkhealth.in";
const GRATITUDE_MAILBOX = "shikhadixit@thinkhealth.in"; // learn@ is an alias of this mailbox
const REPLIES_TO = "digital@thinkhealth.in"; // Zoho Mail's filter forwards the replies here
const ZOHO_MAIL = "https://mail.zoho.in/zm/#mail/folder/inbox";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Design = (typeof DESIGNS)[number] & { uploaded: { at: string; by: string } | null };

/** A popup over the card (Escape / outside click closes it unless it's busy). */
function Popup({ label, wide, busy, onClose, children }: { label: string; wide?: boolean; busy?: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) (e.stopPropagation(), onClose()); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={busy ? undefined : onClose}>
      <div role="dialog" aria-label={label} className={`modal-in flex max-h-[90vh] w-full flex-col rounded-2xl bg-surface shadow-pop ${wide ? "max-w-3xl" : "max-w-xl"}`} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const serials = (rows: CertRow[]) => (rows.length ? `${rows[0].serial}${rows.length > 1 ? `–${rows.at(-1)!.serial}` : ""}` : "");

/** A flower turning very slowly clockwise while the certificates are made. */
export function FlowerLoader({ text }: { text: string }) {
  const petals = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <div className="grid place-items-center gap-3 py-8" role="status" aria-live="polite">
      <svg viewBox="-50 -50 100 100" className="size-24" aria-hidden>
        <g className="flower-turn">
          {petals.map((a, i) => (
            <ellipse key={a} cx="0" cy="-24" rx="11" ry="21" transform={`rotate(${a})`} fill={i % 2 ? "var(--brand-2)" : "var(--purple)"} opacity={i % 2 ? 0.85 : 0.6} />
          ))}
          <circle r="12" fill="var(--medium)" className="flower-breathe" />
          <circle r="5" cx="-3" cy="-3" fill="white" opacity="0.45" />
        </g>
      </svg>
      <p className="text-[13.5px] font-medium text-ink-2">{text}</p>
    </div>
  );
}

/* ---------------- Certificates PDF (made in the browser) ---------------- */

async function makePdf(design: string | undefined, rows: CertRow[]): Promise<Blob> {
  const r = await fetch(`/api/certificates/designs?id=${encodeURIComponent(design ?? "")}`);
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't load the certificate design");
  const { generateCertificates } = await import("@/lib/certPdf");
  const bytes = await generateCertificates(await r.arrayBuffer(), rows);
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Download: Gratitude Email Sent cards then move to Certificates Generated (In process), with fireworks. */
function useDownload(card: CardView, member: Member) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const moveOn = () => {
    if (card.fulfillment?.stage !== "gratitude") return;
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "set_fulfillment", value: "generated", before: "gratitude", by: member.name }]);
    fireworks();
    toast({ text: `${card.name} moved to Certificates Generated`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
  };
  /** The card's recorded batch — or one just made (the card may not have caught up with it yet). */
  const download = async (made?: { blob: Blob; rows: CertRow[] }) => {
    const certs = card.fulfillment?.certs;
    const rows = made?.rows ?? certs?.rows;
    if (!rows?.length) return;
    setBusy(true);
    setError("");
    try {
      saveFile(made?.blob ?? (await makePdf(certs?.design, rows)), pdfName(rows[0].location || card.name));
      moveOn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the PDF");
    }
    setBusy(false);
  };
  return { download, busy, error };
}

/* ---------------- Gratitude email ---------------- */

type MailPreview = { connected: boolean; from: string; to: string; subject: string; text: string; error?: string };

function GratitudePopup({ card, member, onClose }: { card: CardView; member: Member; onClose: () => void }) {
  const { addCardEvents, recordCardEvents, toast } = useStore();
  const [p, setP] = useState<MailPreview | null>(null);
  const [to, setTo] = useState(card.concernedEmail ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [tested, setTested] = useState("");
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    fetch(`/api/mail/fulfil?card=${encodeURIComponent(card.id)}`)
      .then(async (r) => { const j = (await r.json()) as MailPreview; if (!r.ok) setError(j.error ?? "Couldn't prepare the email"); else setP(j); })
      .catch(() => setError("Couldn't reach the server"));
  }, [card.id, connecting]);
  const post = async (extra: Record<string, string>) => {
    const r = await fetch("/api/mail/fulfil", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: card.id, to, ...extra }) });
    const j = (await r.json()) as { ok?: boolean; event?: CardEvent; error?: string };
    if (!r.ok || !j.ok) throw new Error(j.error ?? "Couldn't send the email");
    return j;
  };
  const sendTest = async () => {
    setBusy(true); setError(""); setTested("");
    try {
      await post({ testTo });
      setTested(`Test sent to ${testTo.trim()} — the card doesn't move.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't send the test"); }
    setBusy(false);
  };
  const send = async () => {
    setBusy(true); setError("");
    try {
      // A new concerned email chosen here is kept on the customer, like one set when scheduling.
      if (normEmail(to) !== normEmail(card.concernedEmail ?? "")) addCardEvents(certEvents(card, { alias: card.certAlias ?? "", email: to }, member.name));
      const j = await post({});
      recordCardEvents([j.event!]);
      toast({ text: `Gratitude email sent to ${to} — ${card.name} moved to Gratitude Email Sent` });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the email");
      setBusy(false);
    }
  };
  return (
    <Popup label="Send gratitude email" busy={busy} onClose={onClose}>
      <div className="px-5 pt-5">
        <h3 className="text-[17px] font-bold tracking-tight text-ink">Gratitude email · {card.certAlias || card.name}</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">Sent once. Replies go to {GRATITUDE_FROM} and Zoho forwards them to {REPLIES_TO}; the card gets a ★ when one comes in.</p>
      </div>
      {p ? (
        <>
          <dl className="mx-5 mt-3 grid grid-cols-[64px_1fr] items-center gap-x-3 gap-y-1.5 border-b border-line pb-2 text-[13px]">
            <dt className="text-muted">From</dt><dd className="font-medium text-ink">{p.from}</dd>
            <dt className="text-muted">To</dt>
            <dd><EmailPicker card={card} value={to} onChange={setTo} /></dd>
            <dt className="text-muted">Subject</dt><dd className="font-medium text-ink">{p.subject}</dd>
          </dl>
          <div className="no-scrollbar mx-5 mt-2 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-2/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">{p.text}</div>
          {p.connected && (
            <div className="mx-5 mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <span className="text-muted">Send a test to</span>
              <input className={`${inputCls} !h-8 min-w-0 flex-1 text-[13px]`} type="email" placeholder="your email" value={testTo} onChange={(e) => setTestTo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && EMAIL_RE.test(testTo.trim()) && sendTest()} />
              <button className={`${btn.ghost} !h-8`} onClick={sendTest} disabled={busy || !EMAIL_RE.test(testTo.trim())}>Send test</button>
              {tested && <span className="w-full font-medium text-low">{tested}</span>}
            </div>
          )}
        </>
      ) : !error && <div className="px-5 py-6 text-[13px] text-muted">Preparing the email…</div>}
      <div className="flex flex-wrap items-center justify-end gap-2 p-5">
        {error && <span className="mr-auto text-[13px] font-medium text-high">{error}</span>}
        {p && !p.connected && (
          <span className="mr-auto text-[13px] font-medium text-medium">
            Zoho Mail ({p.from}) isn&apos;t connected yet.{" "}
            <button className="font-semibold text-brand underline" onClick={() => setConnecting(true)}>Connect it</button>
          </span>
        )}
        <button className={btn.ghost} onClick={onClose} disabled={busy}>Cancel</button>
        <button className={btn.primary} onClick={send} disabled={!p || !p.connected || busy || !EMAIL_RE.test(to.trim())} title={!EMAIL_RE.test(to.trim()) ? "Choose the concerned person's email" : undefined}>
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
      {connecting && <ConnectMailbox member={member} address={GRATITUDE_FROM} signInAs={GRATITUDE_MAILBOX} where="a Training Completed card on Fulfillment → Send Gratitude Email" onClose={() => setConnecting(false)} />}
    </Popup>
  );
}

/* ---------------- Replies ---------------- */

type Reply = NonNullable<CardView["fulfillment"]>["replies"][number];

/** The reply, read from Zoho Mail (shown sandboxed — it's the customer's HTML). Open in Zoho Mail clears the star. */
export function ReplyPopup({ card, member, onClose }: { card: CardView; member: Member; onClose: () => void }) {
  const { addCardEvents } = useStore();
  const replies = card.fulfillment?.replies ?? [];
  const [index, setIndex] = useState(replies.length - 1);
  const reply: Reply | undefined = replies[index];
  const [body, setBody] = useState<{ html?: string; error?: string } | null>(null);
  useEffect(() => {
    if (!reply) return;
    setBody(null);
    fetch(`/api/mail/fulfil?card=${encodeURIComponent(card.id)}&reply=${encodeURIComponent(reply.id)}`)
      .then(async (r) => { const j = (await r.json()) as { html?: string; error?: string }; setBody(r.ok ? j : { error: j.error ?? "Couldn't read the reply" }); })
      .catch(() => setBody({ error: "Couldn't reach the server" }));
  }, [card.id, reply?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const openInZoho = () => {
    window.open(ZOHO_MAIL, "_blank", "noopener");
    addCardEvents([{ cardIds: [card.id], kind: "fulfil_mail_opened", value: reply?.from, by: member.name }]);
  };
  return (
    <Popup label="Reply" wide onClose={onClose}>
      <div className="flex flex-wrap items-start gap-x-3 px-5 pt-5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold tracking-tight text-ink">{card.fulfillment?.star && <span className="text-medium">★ </span>}Reply · {card.certAlias || card.name}</h3>
          {reply && <p className="mt-0.5 truncate text-[12.5px] text-muted">{reply.from} · {fmtStamp(reply.at)}{reply.subject ? ` · ${reply.subject}` : ""}</p>}
        </div>
        {replies.length > 1 && (
          <span className="inline-flex items-center gap-1 text-[12.5px] text-muted">
            <button className={`${btn.quiet} !h-7 !px-2`} disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Earlier reply">◀</button>
            {index + 1} of {replies.length}
            <button className={`${btn.quiet} !h-7 !px-2`} disabled={index === replies.length - 1} onClick={() => setIndex(index + 1)} aria-label="Later reply">▶</button>
          </span>
        )}
      </div>
      <div className="mx-5 mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-white">
        {!body ? <p className="p-4 text-[13px] text-muted">Reading the reply…</p>
          : body.error ? <p className="p-4 text-[13px] font-medium text-high">{body.error}</p>
          : <iframe title="Reply" sandbox="" srcDoc={body.html ?? ""} className="h-[52vh] w-full" />}
      </div>
      <p className="mx-5 mt-2 text-[12.5px] text-muted">Copy the names from here, or open it in Zoho Mail ({REPLIES_TO} — forwarded there).</p>
      <div className="flex justify-end gap-2 p-5">
        <button className={btn.ghost} onClick={onClose} autoFocus>Close</button>
        <button className={btn.primary} onClick={openInZoho}>Open in Zoho Mail</button>
      </div>
    </Popup>
  );
}

/* ---------------- Setup (Admin): the master sheet and the two designs ---------------- */

type Register = { headers: string[]; columns: Record<string, string | undefined>; missing: string[]; count: number; lastSerial: number; last: Record<string, string>[] };

/** The sheet's rows as they sit there: every column visible (long names, places and courses wrap). */
function RegisterTable({ headers, rows, fresh }: { headers: string[]; rows: Record<string, string>[]; fresh?: Record<string, string>[] }) {
  const cell = (h: string) => `px-2 py-1 align-top ${/cert|s.?s*no|serial|date/i.test(h) ? "whitespace-nowrap" : ""}`;
  return (
    <div className="no-scrollbar max-h-[38vh] overflow-auto rounded-xl border border-line">
      <table className="w-full text-left text-[12px] leading-snug">
        <thead className="sticky top-0 bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted">
          <tr>{headers.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 font-bold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => <tr key={`old${i}`} className="text-faint">{headers.map((h) => <td key={h} className={cell(h)}>{r[h]}</td>)}</tr>)}
          {fresh?.map((r, i) => <tr key={`new${i}`} className="bg-low-bg/60 text-ink">{headers.map((h) => <td key={h} className={`${cell(h)} font-medium`}>{r[h]}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function ConnectSheet({ member, onClose }: { member: Member; onClose: () => void }) {
  const [link, setLink] = useState("");
  const [code, setCode] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState("ZohoSheet.dataAPI.READ,ZohoSheet.dataAPI.UPDATE");
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string; register?: Register; worksheet?: string }>({});
  useEffect(() => {
    fetch("/api/sheet?check=1").then((r) => r.json()).then((j: { scopes?: string; sheet?: { connectedBy: string; connectedAt: string; worksheet: string } | null; register?: Register }) => {
      if (j.scopes) setScopes(j.scopes);
      if (j.sheet) setState({ done: `Connected by ${j.sheet.connectedBy} on ${fmtStamp(j.sheet.connectedAt)}.`, register: j.register, worksheet: j.sheet.worksheet });
    }).catch(() => {});
  }, []);
  const connect = async () => {
    setState({ busy: true });
    const r = await fetch("/api/sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link, code, clientId, clientSecret }) }).catch(() => null);
    const j = r ? ((await r.json()) as { ok?: boolean; error?: string; register?: Register; info?: { worksheet: string } }) : { error: "Couldn't reach the server" };
    setState(j.ok ? { done: "Connected — check the columns below.", register: j.register, worksheet: j.info?.worksheet } : { error: j.error ?? "Couldn't connect" });
    if (j.ok) setCode("");
  };
  const reg = state.register;
  return (
    <Popup label="Connect the master sheet" wide onClose={onClose}>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
        <h3 className="text-[17px] font-bold tracking-tight text-ink">Master certificate sheet (Zoho Sheet)</h3>
        {!isAdmin(member) ? (
          <p className="mt-2 text-[13.5px] text-muted">Admin connects the sheet once.</p>
        ) : (
          <>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
              <li>Sign in to <a className="font-semibold text-brand underline" href="https://api-console.zoho.in" target="_blank" rel="noreferrer">api-console.zoho.in</a> as <b>{REPLIES_TO}</b> (it must be able to edit the sheet).</li>
              <li>Open <b>Self Client</b> (create one if asked) → <b>Generate Code</b>.</li>
              <li>Scope: <code className="select-all rounded bg-surface-2 px-1 text-[12px]">{scopes}</code> · Time: 10 minutes · Create.</li>
              <li>Paste the sheet&apos;s link and the code here. If that Self Client isn&apos;t the one used for Zoho Books, also paste its Client ID and Secret.</li>
            </ol>
            <div className="mt-3 space-y-2">
              <input className={inputCls} placeholder="Sheet link (https://sheet.zoho.in/sheet/open/…)" value={link} onChange={(e) => setLink(e.target.value)} />
              <input className={inputCls} placeholder="Code (1000.…)" value={code} onChange={(e) => setCode(e.target.value)} />
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={inputCls} placeholder="Client ID (optional)" value={clientId} onChange={(e) => setClientId(e.target.value)} />
                <input className={inputCls} placeholder="Client Secret (optional)" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
              </div>
            </div>
          </>
        )}
        {state.error && <p className="mt-2 text-[13px] font-medium text-high">{state.error}</p>}
        {state.done && <p className="mt-2 text-[13px] font-medium text-low">{state.done}</p>}
        {reg && (
          <div className="mt-3 space-y-2">
            <p className="text-[13px] text-ink-2">
              Worksheet <b>{state.worksheet}</b> · {reg.count} rows · last serial <b className="num">{reg.lastSerial}</b>.{" "}
              Columns: {(["serial", "certNo", "name", "location", "course", "date"] as const).map((k) => `${k} → ${reg.columns[k] ?? "—"}`).join(" · ")}
            </p>
            {reg.missing.length > 0 && <p className="text-[13px] font-medium text-high">No {reg.missing.join(", ")} column found — check the sheet&apos;s first row.</p>}
            <RegisterTable headers={reg.headers} rows={reg.last} />
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5">
        <button className={btn.ghost} onClick={onClose}>Close</button>
        {isAdmin(member) && <button className={btn.primary} onClick={connect} disabled={!code.trim() || !link.trim() || state.busy}>{state.busy ? "Connecting…" : "Connect"}</button>}
      </div>
    </Popup>
  );
}

function UploadDesigns({ designs, onDone, onClose }: { designs: Design[]; onDone: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState<DesignId | null>(null);
  const [error, setError] = useState("");
  const upload = async (id: DesignId, file?: File) => {
    if (!file) return;
    setBusy(id); setError("");
    const form = new FormData();
    form.set("id", id);
    form.set("file", file);
    const r = await fetch("/api/certificates/designs", { method: "POST", body: form }).catch(() => null);
    const j = r ? ((await r.json()) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
    if (!j.ok) setError(j.error ?? "Couldn't upload it");
    setBusy(null);
    onDone();
  };
  return (
    <Popup label="Certificate designs" onClose={onClose}>
      <div className="p-5">
        <h3 className="text-[17px] font-bold tracking-tight text-ink">Certificate designs</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">The blank designs (with signature and seal) from the certificate generator&apos;s <code>private/backgrounds</code> folder. Kept in the database only — never in GitHub.</p>
        <ul className="mt-3 space-y-2">
          {designs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink">{d.label}</div>
                <div className="text-[12px] text-muted">{d.file} · {d.uploaded ? `uploaded by ${d.uploaded.by}, ${fmtStamp(d.uploaded.at)}` : "not uploaded yet"}</div>
              </div>
              <label className={`${d.uploaded ? btn.ghost : btn.primary} cursor-pointer`}>
                {busy === d.id ? "Uploading…" : d.uploaded ? "Replace" : "Upload PDF"}
                <input type="file" accept="application/pdf" className="sr-only" disabled={busy !== null} onChange={(e) => upload(d.id, e.target.files?.[0])} />
              </label>
            </li>
          ))}
        </ul>
        {error && <p className="mt-2 text-[13px] font-medium text-high">{error}</p>}
        <div className="mt-4 flex justify-end"><button className={btn.ghost} onClick={onClose}>Close</button></div>
      </div>
    </Popup>
  );
}

/* ---------------- Generate Certificate ---------------- */

type Preview = { rows: CertRow[]; sheet: Record<string, string>[]; headers: string[]; missing: string[]; last: Record<string, string>[]; count: number; problems: string[] };

function GeneratePopup({ card, member, onClose }: { card: CardView; member: Member; onClose: () => void }) {
  const { recordCardEvents } = useStore();
  const [text, setText] = useState("");
  const names = useMemo(() => parseNames(text), [text]);
  const [design, setDesign] = useState<DesignId>(designFor(card.training.map((t) => t.name)));
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [sheet, setSheet] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<"sheet" | "designs" | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [phase, setPhase] = useState<"names" | "preview" | "working" | "ready">("names");
  const [ready, setReady] = useState<{ blob: Blob; rows: CertRow[] } | null>(null);
  const [error, setError] = useState("");
  const { download } = useDownload(card, member);
  const date = certDate(card);
  const location = card.certAlias || card.name;
  const chosen = designs?.find((d) => d.id === design);

  const loadSetup = () => {
    fetch("/api/certificates/designs").then((r) => r.json()).then((j: { designs?: Design[] }) => setDesigns(j.designs ?? [])).catch(() => setDesigns([]));
    fetch("/api/sheet").then((r) => r.json()).then((j: { sheet?: unknown }) => setSheet(Boolean(j.sheet))).catch(() => setSheet(false));
  };
  useEffect(loadSetup, []);
  const blocked = sheet === false ? "The master sheet isn't connected yet." : chosen && !chosen.uploaded ? `The “${chosen.label}” design isn't uploaded yet.` : "";

  const showPreview = async () => {
    setError("");
    try {
      const r = await fetch("/api/certificates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: card.id, design, names, preview: true }) });
      const j = (await r.json()) as Omit<Preview, "problems"> & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Couldn't read the sheet");
      const { checkCertificates } = await import("@/lib/certPdf");
      setPreview({ ...j, problems: await checkCertificates(j.rows) });
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the sheet");
    }
  };

  const generate = async () => {
    setError("");
    setPhase("working");
    const started = Date.now();
    let added: CertRow[] | null = null;
    try {
      const r = await fetch("/api/certificates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: card.id, design, names }) });
      const j = (await r.json()) as { ok?: boolean; event?: CardEvent; rows?: CertRow[]; error?: string };
      if (!r.ok || !j.event || !j.rows) throw new Error(j.error ?? "Couldn't add them to the sheet");
      recordCardEvents([j.event]);
      added = j.rows;
      const blob = await makePdf(design, j.rows);
      await new Promise((res) => setTimeout(res, Math.max(0, 1600 - (Date.now() - started)))); // let the flower turn a little
      setReady({ blob, rows: j.rows });
      setPhase("ready");
    } catch (e) {
      const why = e instanceof Error ? e.message : "Something went wrong";
      // Once the rows are in the sheet they stay; the card offers Download, so nothing is added twice.
      setError(added ? `${why}. The names are in the sheet (serial ${serials(added)}) — use Download certificates on the card.` : why);
      setPhase(added ? "ready" : "preview");
    }
  };

  const busy = phase === "working";
  return (
    <Popup label="Generate certificates" wide busy={busy} onClose={onClose}>
      <div className="px-5 pt-5">
        <h3 className="text-[17px] font-bold tracking-tight text-ink">Generate certificates · {location}</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Training date <b className="num text-ink-2">{date ? printedDate(date) : "—"}</b> · location on the certificate <b className="text-ink-2">{location}</b>
        </p>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pt-3">
        {phase === "names" && (
          <div className="space-y-3">
            {card.fulfillment?.certsReverted && <RevertedNote card={card} />}
            <label className="block">
              <span className="mb-1 flex items-baseline justify-between text-[13px] font-semibold text-ink-2">
                Participants&apos; names <span className="text-[12px] font-normal text-muted">one per line · {names.length} {names.length === 1 ? "name" : "names"}</span>
              </span>
              <textarea className={`${inputCls} !h-44 resize-none py-2 leading-relaxed`} placeholder={"Paste the list from the reply — one name per line"} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            </label>
            <fieldset>
              <legend className="mb-1 text-[13px] font-semibold text-ink-2">Certificate design</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(designs ?? DESIGNS.map((d) => ({ ...d, uploaded: null }))).map((d) => (
                  <label key={d.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border-2 px-3 py-2 text-[13px] ${design === d.id ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong"}`}>
                    <input type="radio" name="design" className="mt-0.5 size-4 accent-[var(--brand)]" checked={design === d.id} onChange={() => setDesign(d.id)} />
                    <span>
                      <span className="block font-semibold text-ink">{d.label}</span>
                      <span className="block text-[12px] text-muted">Course: {d.course}{designs && !d.uploaded ? " · not uploaded yet" : ""}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {blocked && (
              <p className="rounded-lg border border-medium/50 bg-medium-bg px-3 py-2 text-[13px] font-medium text-medium">
                {blocked}{" "}
                {isAdmin(member)
                  ? <button className="font-semibold text-brand underline" onClick={() => setSetup(sheet === false ? "sheet" : "designs")}>{sheet === false ? "Connect the sheet" : "Upload the designs"}</button>
                  : "Ask Admin to set it up."}
              </p>
            )}
          </div>
        )}
        {phase === "preview" && preview && (
          <div className="space-y-2">
            <p className="text-[13px] text-ink-2">
              How they&apos;ll sit in the master sheet: the last {preview.last.length} rows already there (grey), then these <b>{preview.rows.length}</b> (green), serial <b className="num">{serials(preview.rows)}</b>.
              Nothing is written until you press Generate; the serial is checked again then.
            </p>
            <RegisterTable headers={preview.headers} rows={preview.last} fresh={preview.sheet} />
            {preview.missing.length > 0 && <p className="text-[13px] font-medium text-high">The sheet has no {preview.missing.join(", ")} column — Admin needs to check it.</p>}
            {preview.problems.length > 0 && (
              <div className="rounded-lg border border-high/40 bg-high-bg px-3 py-2 text-[13px] text-high">
                <b>Can&apos;t be printed — fix these names first:</b>
                <ul className="mt-1 list-disc pl-5">{preview.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        {phase === "working" && <FlowerLoader text="Adding the names to the sheet and making the certificates…" />}
        {phase === "ready" && (
          <div className="grid place-items-center gap-2 py-8 text-center">
            {ready ? (
              <>
                <div className="text-[34px]" aria-hidden>🌸</div>
                <p className="text-[15px] font-semibold text-ink">{ready.rows.length} certificates are ready</p>
                <p className="text-[13px] text-muted">Added to the master sheet as serial {serials(ready.rows)}. Downloading moves the card to Certificates Generated.</p>
              </>
            ) : <p className="text-[13px] text-muted">The PDF couldn&apos;t be made here.</p>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 p-5">
        {error && <span className="mr-auto max-w-[60%] text-[13px] font-medium text-high">{error}</span>}
        {phase === "names" && (
          <>
            <button className={btn.ghost} onClick={onClose}>Cancel</button>
            <button className={btn.primary} onClick={showPreview} disabled={!names.length || !date || Boolean(blocked) || designs === null || sheet === null}>Preview</button>
          </>
        )}
        {phase === "preview" && (
          <>
            <button className={btn.ghost} onClick={() => setPhase("names")}>Back</button>
            <button className={btn.primary} onClick={generate} disabled={!preview || preview.problems.length > 0 || preview.missing.length > 0}>Generate</button>
          </>
        )}
        {phase === "ready" && (
          <>
            <button className={btn.ghost} onClick={onClose}>{ready ? "Later" : "Close"}</button>
            {ready && <button className={btn.primary} autoFocus onClick={() => { download(ready); onClose(); }}>Download {pdfName(location)}</button>}
          </>
        )}
      </div>
      {setup === "sheet" && <ConnectSheet member={member} onClose={() => { setSetup(null); loadSetup(); }} />}
      {setup === "designs" && designs && <UploadDesigns designs={designs} onDone={loadSetup} onClose={() => setSetup(null)} />}
    </Popup>
  );
}

function RevertedNote({ card }: { card: CardView }) {
  const c = card.fulfillment!.certs!;
  return (
    <p className="rounded-lg border border-medium/50 bg-medium-bg px-3 py-2 text-[12.5px] font-medium text-medium">
      This card was moved back after {c.rows.length} names went to the master sheet (serial {serials(c.rows)}, {fmtStamp(c.at)}). Check the sheet — remove those rows if they were wrong — before adding the list again.
    </p>
  );
}

/* ---------------- Under the Training box ---------------- */

export function FulfilActions({ card, member, onShowReply }: { card: CardView; member: Member; onShowReply: () => void }) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const f = card.fulfillment!;
  const [popup, setPopup] = useState<"email" | "generate" | null>(null);
  useEffect(() => setPopup(null), [card.id]);
  const { download, busy, error } = useDownload(card, member);
  const certs = f.certs && !f.certsReverted ? f.certs : undefined;
  const lastReply = f.replies.at(-1);

  const setStatus = (value: "process" | "hold") => {
    if (value === f.certStatus) return;
    addCardEvents([{ cardIds: [card.id], kind: "set_cert_status", value, by: member.name }]);
  };
  const toLogistics = () => {
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "set_fulfillment", value: "logistics", before: f.stage, by: member.name }]);
    toast({ text: `${card.name} sent to Logistics`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
  };
  const line = "flex flex-wrap items-center gap-x-1.5 text-[12.5px] leading-snug text-muted";
  const link = "font-semibold text-brand hover:underline disabled:opacity-40";
  // The step's main action sits on the title row and the details are one line each, so the card still fits without scrolling.
  const action =
    f.stage === "completed" ? <button className={btn.primary} onClick={() => setPopup("email")}>Send Gratitude Email</button>
    : f.stage === "gratitude" ? (certs
      ? <button className={btn.primary} onClick={() => download()} disabled={busy}>{busy ? "Making the PDF…" : "Download certificates"}</button>
      : <button className={btn.primary} onClick={() => setPopup("generate")}>Generate Certificate</button>)
    : f.stage === "generated" ? <button className={btn.primary} onClick={toLogistics} disabled={f.certStatus === "hold"} title={f.certStatus === "hold" ? "Set it to In process first" : undefined}>Sent to Logistics</button>
    : null;

  return (
    <div className="mt-3 space-y-1.5 rounded-xl border border-line px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-[12px] font-bold uppercase tracking-wide text-brand">
          Certificates{f.at && f.stage !== "completed" && <span className="ml-1.5 font-normal normal-case tracking-normal text-muted">· {f.by}, {fmtStamp(f.at)}</span>}
        </span>
        {action}
      </div>

      {f.stage === "completed" && (
        <div className={line}>from {GRATITUDE_FROM} to {card.concernedEmail ?? <span className="font-medium text-medium">the concerned email (choose it in the popup)</span>}</div>
      )}

      {f.stage === "gratitude" && (
        <>
          <div className={line}>
            {f.email
              ? <>Email sent to <b className="text-ink-2">{f.email.to}</b> · {fmtStamp(f.email.at)}</>
              : <>Moved to {f.legacy === "hold" ? "Process on hold" : "List Received"} before gratitude emails — no email from the dashboard.</>}
          </div>
          {lastReply ? (
            <div className={line}>
              {f.star && <span className="text-[14px] leading-none text-medium" aria-label="New reply">★</span>}
              <span>{f.replies.length} {f.replies.length === 1 ? "reply" : "replies"} · last from <b className="text-ink-2">{lastReply.from}</b>, {fmtStamp(lastReply.at)} ·</span>
              <button className={link} onClick={onShowReply}>Show reply</button>
            </div>
          ) : f.email && <div className={`${line} font-medium !text-info`}>Awaiting reply · checked hourly</div>}
          {certs && <div className={line}>{certs.rows.length} names in the master sheet · serial {serials(certs.rows)}</div>}
          {f.certsReverted && <RevertedNote card={card} />}
        </>
      )}

      {f.stage === "generated" && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <div role="radiogroup" aria-label="Certificates status" className="inline-flex gap-1.5">
            {(["process", "hold"] as const).map((v) => (
              <label key={v} className={`inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border-2 px-3 text-[13px] font-semibold ${f.certStatus === v ? (v === "hold" ? "border-medium bg-medium-bg text-medium" : "border-low bg-low-bg text-low") : "border-line text-ink-2 hover:border-line-strong"}`}>
                <input type="radio" name={`cert-status-${card.id}`} className="size-3.5" checked={f.certStatus === v} onChange={() => setStatus(v)} />
                {v === "hold" ? "On hold" : "In process"}
              </label>
            ))}
          </div>
          {f.certs && <span className={line}>{f.certs.rows.length} names · serial {serials(f.certs.rows)} · <button className={link} onClick={() => download()} disabled={busy}>{busy ? "Making the PDF…" : "Download again"}</button></span>}
        </div>
      )}

      {f.stage === "logistics" && (
        <div className={line}>
          <span className="font-semibold text-low">Sent to Logistics — Arti takes it from here.</span>
          {f.certs && <>{f.certs.rows.length} names · serial {serials(f.certs.rows)} · <button className={link} onClick={() => download()} disabled={busy}>{busy ? "Making the PDF…" : "Download again"}</button></>}
        </div>
      )}
      {error && <p className="text-[12.5px] font-medium text-high">{error}</p>}

      {popup === "email" && <GratitudePopup card={card} member={member} onClose={() => setPopup(null)} />}
      {popup === "generate" && <GeneratePopup card={card} member={member} onClose={() => setPopup(null)} />}
    </div>
  );
}
