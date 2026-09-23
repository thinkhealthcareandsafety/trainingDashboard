"use client";

import { useMemo, useState } from "react";
import type { PipelineDoc, Training } from "@/lib/types";
import { addDays, daysBetween, fmtDate, fmtINR, parseYmd, startOfDay } from "@/lib/dates";
import { zohoUrl } from "@/lib/zohoLinks";
import { CardHeader, Segmented } from "./ui";

type Tab = "quotes" | "booked" | "dated";

const QUOTE_ACTIVE_DAYS = 30;
const LIMIT = 6;

function ageLabel(days: number) {
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`;
}

function Row({ href, title, sub, amount, meta, tone = "muted" }: { href: string; title: string; sub: string; amount: number; meta: string; tone?: "muted" | "warn" | "faint" }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-surface-2/70" title="Open in Zoho Books">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-ink">{title}</div>
          <div className="truncate text-xs text-muted">{sub}</div>
        </div>
        <div className="shrink-0 text-right num">
          <div className="text-[13px] font-medium text-ink">{fmtINR(amount, true)}</div>
          <div className={`text-xs ${tone === "warn" ? "text-medium" : tone === "faint" ? "text-faint" : "text-muted"}`}>{meta}</div>
        </div>
      </a>
    </li>
  );
}

export function PipelineCard({ pipeline, trainings, now, orgId }: { pipeline: PipelineDoc[]; trainings: Training[]; now: Date; orgId?: string }) {
  const [tab, setTab] = useState<Tab>("quotes");
  const [all, setAll] = useState(false);
  const t0 = startOfDay(now);

  const quotes = useMemo(() => pipeline.filter((p) => p.kind === "estimate").sort((a, b) => b.date.localeCompare(a.date)), [pipeline]);
  const booked = useMemo(
    () =>
      pipeline
        .filter((p) => p.kind === "salesorder")
        .sort((a, b) => (a.trainingDate ?? "9999").localeCompare(b.trainingDate ?? "9999") || b.date.localeCompare(a.date)),
    [pipeline],
  );
  const dated = useMemo(
    () =>
      trainings
        .filter((t) => t.status !== "void" && parseYmd(t.trainingDate) >= t0 && parseYmd(t.trainingDate) <= addDays(t0, 30))
        .sort((a, b) => a.trainingDate.localeCompare(b.trainingDate)),
    [trainings, t0],
  );

  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  const sent = quotes.filter((q) => q.status === "sent");
  const recent = sent.filter((q) => daysBetween(parseYmd(q.date), t0) <= QUOTE_ACTIVE_DAYS);

  const summary =
    tab === "quotes"
      ? `${fmtINR(sum(sent), true)} awaiting reply across ${sent.length} quote${sent.length === 1 ? "" : "s"} · ${recent.length} sent in the last ${QUOTE_ACTIVE_DAYS} days`
      : tab === "booked"
        ? `${fmtINR(sum(booked), true)} confirmed, not yet invoiced`
        : "Trainings with a date in the next 30 days";

  const count = tab === "quotes" ? quotes.length : tab === "booked" ? booked.length : dated.length;
  const empty =
    tab === "quotes"
      ? "No open quotes with training items."
      : tab === "booked"
        ? "No confirmed bookings waiting to be invoiced."
        : "No trainings dated in the next 30 days. Set “Training Date” on sales orders or invoices in Zoho.";

  const pipelineRow = (p: PipelineDoc) => {
    const age = daysBetween(parseYmd(p.date), t0);
    const expired = Boolean(p.expiryDate && parseYmd(p.expiryDate) < t0);
    let meta: string;
    if (p.kind === "salesorder") meta = p.trainingDate ? `Training ${fmtDate(p.trainingDate)}` : "Date not set";
    else if (p.status === "draft") meta = "Draft · not sent";
    else if (p.status === "accepted") meta = "Accepted";
    else meta = expired ? `Expired · sent ${ageLabel(age)}` : `Sent ${ageLabel(age)}`;
    const tone = p.kind === "salesorder" && !p.trainingDate ? "warn" : expired || age > QUOTE_ACTIVE_DAYS ? "faint" : "muted";
    return (
      <Row
        key={p.id}
        href={zohoUrl(p.kind, p.docId, orgId)}
        title={p.customerName}
        sub={`${p.trainingType}${p.participants ? ` · ${p.participants} pax` : ""} · ${p.docNumber}`}
        amount={p.amount}
        meta={meta}
        tone={tone}
      />
    );
  };

  return (
    <section className="card p-5">
      <CardHeader
        title="Pipeline"
        sub="Training quotes sent and bookings confirmed in Zoho Books"
        right={
          <Segmented
            value={tab}
            onChange={(v) => {
              setTab(v);
              setAll(false);
            }}
            options={[
              { value: "quotes", label: `Quotes ${quotes.length}` },
              { value: "booked", label: `Booked ${booked.length}` },
              { value: "dated", label: `Dated ${dated.length}` },
            ]}
          />
        }
      />
      <p className="mt-3 text-[13px] text-ink-2">{summary}</p>

      {count === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {tab === "quotes" && (all ? quotes : quotes.slice(0, LIMIT)).map(pipelineRow)}
          {tab === "booked" && (all ? booked : booked.slice(0, LIMIT)).map(pipelineRow)}
          {tab === "dated" &&
            (all ? dated : dated.slice(0, LIMIT)).map((t) => (
              <Row
                key={t.id}
                href={zohoUrl("invoice", t.zohoDocId, orgId)}
                title={t.customerName}
                sub={`${t.trainingType} · ${t.participants} pax · ${t.docNumber}`}
                amount={t.amount}
                meta={fmtDate(t.trainingDate, { weekday: "short", day: "numeric", month: "short" })}
              />
            ))}
        </ul>
      )}
      {count > LIMIT && (
        <button className="mt-2 text-[13px] font-medium text-muted hover:text-ink" onClick={() => setAll((a) => !a)}>
          {all ? "Show less" : `Show all ${count}`}
        </button>
      )}
    </section>
  );
}
