"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AedResponse, PipelineResponse } from "@/lib/types";
import type { SalesResponse } from "@/lib/salesSync";
import { buildAedBoard, buildBoard, buildFulfillmentBoard, cardCustomers, customerAliases, customerContacts, customerNameKeys } from "@/lib/pipeline";
import { ZOHO_SYNCED, useStore } from "@/lib/store";
import type { BoardOptions } from "./CardModal";

/* The boards' Zoho data, shared by the Follow-ups board and the calendar (which opens the same cards). */

/** The Training board's Zoho data (leads, quotes, PIs, invoices, payments). `enabled`: fetch only when needed. */
export function usePipeline(enabled = true) {
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pipeline${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      const json = (await res.json()) as PipelineResponse;
      // If Zoho is unavailable, keep showing the last good data, flagged with the error.
      setData((d) => (json.leads?.length || !d ? json : { ...d, error: json.error ?? "Sync failed" }));
    } catch (e) {
      setData((d) => (d ? { ...d, error: String(e) } : null));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(() => load(), 3 * 60_000);
    const onSynced = () => load();
    // A tab coming back (e.g. after the laptop slept) gets fresh Zoho data right away, like the team data.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener(ZOHO_SYNCED, onSynced);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener(ZOHO_SYNCED, onSynced);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load]);
  return { data, loading, refresh: () => load(true) };
}

/** AED invoices (current fiscal year) — fetched only while something showing needs them. */
export function useAedInvoices(enabled: boolean) {
  const [data, setData] = useState<AedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/aed${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      const json = (await res.json()) as AedResponse;
      setData((d) => (json.invoices?.length || !d ? json : { ...d, error: json.error ?? "Sync failed" }));
    } catch (e) {
      setData((d) => (d ? { ...d, error: String(e) } : null));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(() => load(), 5 * 60_000);
    const onSynced = () => load();
    window.addEventListener(ZOHO_SYNCED, onSynced);
    return () => {
      clearInterval(t);
      window.removeEventListener(ZOHO_SYNCED, onSynced);
    };
  }, [enabled, load]);
  return { data, loading, refresh: () => load(true) };
}

/** The Sales board's Zoho data (salesSync.ts) — fetched only while the Sales board is showing. */
export function useSalesData(enabled: boolean) {
  const [data, setData] = useState<SalesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = (await (await fetch("/api/sales", { cache: "no-store" })).json()) as SalesResponse;
      setData((d) => (json.invoices?.length || !d ? json : { ...d, error: json.error ?? "Sync failed" }));
    } catch (e) {
      setData((d) => (d ? { ...d, error: String(e) } : null));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(load, 5 * 60_000);
    window.addEventListener(ZOHO_SYNCED, load);
    return () => { clearInterval(t); window.removeEventListener(ZOHO_SYNCED, load); };
  }, [enabled, load]);
  return { data, loading };
}

/**
 * The Training board (and the AedSmartx and Fulfillment boards) built in the browser exactly as the board page builds
 * them — the calendar opens and schedules these cards. `training` / `aed`: which boards to load (nothing is fetched for
 * a board that's off).
 */
export function useBoardCards({ training, aed }: { training: boolean; aed: boolean }) {
  const { cardEvents } = useStore();
  const pipeline = usePipeline(training || aed);
  const aedInv = useAedInvoices(aed);
  const data = pipeline.data;
  const built = useMemo(() => {
    if (!data) return null;
    const [leads, quotes, pis, invoices, payments, aedList] = [data.leads ?? [], data.quotes ?? [], data.pis ?? [], data.invoices ?? [], data.payments ?? [], aedInv.data?.invoices ?? []];
    const customerOf = cardCustomers(leads, quotes, pis, invoices, payments, aedList, cardEvents);
    const nameOf = customerNameKeys(leads, quotes, pis, invoices, payments, aedList);
    const aliases = customerAliases(cardEvents, customerOf, nameOf);
    const contacts = customerContacts(cardEvents, customerOf, nameOf);
    const board = buildBoard(leads, quotes, pis, invoices, payments, cardEvents, aliases, contacts);
    return {
      board,
      fulBoard: buildFulfillmentBoard(board, cardEvents),
      aedBoard: aed && aedInv.data ? buildAedBoard(leads, aedList, cardEvents, aliases, contacts) : null,
    };
  }, [data, aedInv.data, aed, cardEvents]);
  const options: BoardOptions = { typeOptions: data?.typeOptions ?? [], sectorOptions: data?.sectorOptions ?? [], orgId: data?.orgId };
  return { ...built, options, loading: pipeline.loading || (aed && aedInv.loading && !aedInv.data) };
}
