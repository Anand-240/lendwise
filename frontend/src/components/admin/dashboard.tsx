"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  ChevronRight,
  Download,
  FileText,
  Gauge as GaugeIcon,
  Inbox,
  Loader2,
  LogOut,
  MessageSquareText,
  Trash2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/site/logo";
import { DecisionDonut, ProbabilityHistogram, TierBars, VolumeChart } from "./charts";
import { formatDate, formatPct, formatPercent, formatUSD } from "@/lib/format";
import type { AdminApplication, AdminPage, AdminStats, ContactPage, FinalDecision } from "@/lib/types";
import { ThreadList } from "@/components/decision/thread";
import { DECISION_COPY, RecommendationBadge, TierBadge } from "@/components/screen/screen-result";
import { cn } from "@/lib/utils";

type SortKey = "created_at" | "default_probability" | "eligibility_score" | "loan_amount" | "fico" | "full_name";
type Filters = {
  q: string;
  decision: string;
  recommendation: string;
  eligibility_tier: string;
  risk_tier: string;
  status: string;
  flagged: string;
  date_from: string;
  date_to: string;
};
const EMPTY: Filters = { q: "", decision: "", recommendation: "", eligibility_tier: "", risk_tier: "", status: "", flagged: "", date_from: "", date_to: "" };
const PAGE_SIZE = 15;

const selectCls =
  "h-10 rounded-lg border border-input bg-white px-3 text-sm text-stone-800 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

export function DecisionBadge({ decision, overridden }: { decision: FinalDecision; overridden?: boolean }) {
  if (decision === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
        <Clock3 className="size-3.5" aria-hidden /> Awaiting review
      </span>
    );
  }
  const ok = decision === "APPROVED";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
        ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-rose-200",
      )}
    >
      {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
      {ok ? "Approved" : "Rejected"}
      {overridden && <span className="font-normal">· override</span>}
    </span>
  );
}

function useAuthedFetch() {
  const router = useRouter();
  return useCallback(
    async (url: string, init?: RequestInit) => {
      const res = await fetch(url, { cache: "no-store", ...init });
      if (res.status === 401) {
        toast.error("Your session has expired. Please sign in again.");
        router.replace("/admin/login?next=/admin");
        throw new Error("unauthorized");
      }
      return res;
    },
    [router],
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const authed = useAuthedFetch();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [page, setPage] = useState<AdminPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [pageNo, setPageNo] = useState(1);
  const [selected, setSelected] = useState<AdminApplication | null>(null);

  // Debounce free-text search. Only reset to page 1 when the text actually changed, otherwise
  // the initial run would bounce an officer who pages forward within the debounce window.
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, q }));
      setPageNo(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q, filters.q]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    return p;
  }, [filters]);

  const [reloadKey, setReloadKey] = useState(0);
  const listKey = useMemo(() => {
    const p = new URLSearchParams(query);
    p.set("sort", sort);
    p.set("order", order);
    p.set("page", String(pageNo));
    p.set("page_size", String(PAGE_SIZE));
    return p.toString();
  }, [query, sort, order, pageNo]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== `${listKey}#${reloadKey}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authed("/api/admin/stats");
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load stats");
        setStats(body);
      } catch (e) {
        if (!cancelled && (e as Error).message !== "unauthorized") setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    const key = `${listKey}#${reloadKey}`;
    (async () => {
      try {
        const res = await authed(`/api/admin/applications?${listKey}`);
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load applications");
        setPage(body);
        setError(null);
      } catch (e) {
        if (!cancelled && (e as Error).message !== "unauthorized") setError((e as Error).message);
      } finally {
        if (!cancelled) setLoadedKey(key);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, listKey, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  async function openApplication(applicationId: string) {
    try {
      const res = await authed(`/api/admin/applications/${encodeURIComponent(applicationId)}`);
      if (res.status === 404) return toast.error(`Application ${applicationId} was not found (it may have been deleted).`);
      if (!res.ok) throw new Error();
      setSelected(await res.json());
    } catch (e) {
      if ((e as Error).message !== "unauthorized") toast.error("Could not open that application.");
    }
  }

  function toggleSort(key: SortKey) {
    if (sort === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("desc");
    }
    setPageNo(1);
  }

  function setFilter<K extends keyof Filters>(k: K, v: Filters[K]) {
    setFilters((f) => ({ ...f, [k]: v }));
    setPageNo(1);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  const exportHref = `/api/admin/export${query.toString() ? `?${query}` : ""}`;
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 sm:inline">Officer console</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={reload} aria-label="Refresh data">
              <RefreshCw aria-hidden /> <span className="hidden sm:inline">Refresh</span>
            </Button>
            <a href="#messages" className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 sm:inline-flex">
              <Inbox className="size-4" aria-hidden /> Messages
            </a>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut aria-hidden /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <div id="dashboard" className="container-page space-y-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Applications dashboard</h1>
          <p className="text-sm text-stone-600">
            Every application arrives with its screening result. Click <strong>Decide</strong> on a row to approve, approve the counter-offer, reject or ask for more information.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}. <button className="font-semibold underline" onClick={() => { setError(null); reload(); }}>Retry</button>
          </div>
        )}

        {/* KPIs */}
        <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats ? (
            [
              { label: "Total applications", value: stats.total.toLocaleString("en-US"), sub: `${stats.overridden} decided against the recommendation`, icon: FileText, tone: "text-brand bg-brand-soft" },
              { label: "Awaiting review", value: stats.awaiting_review.toLocaleString("en-US"), sub: `${stats.info_requested} waiting on the applicant · ${stats.flagged} flagged`, icon: Clock3, tone: "text-amber-800 bg-amber-50" },
              { label: "Approval rate", value: formatPercent(stats.approval_rate), sub: `${stats.approved} approved · ${stats.rejected} rejected`, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
              { label: "Avg. charge-off risk", value: formatPct(stats.avg_default_probability), sub: `Low ${stats.by_risk_tier.Low} · Moderate ${stats.by_risk_tier.Moderate} · High ${stats.by_risk_tier.High}`, icon: GaugeIcon, tone: "text-amber-700 bg-amber-50" },
            ].map((k) => (
              <div key={k.label} className="rounded-lg bg-white p-5 border border-stone-200">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-stone-600">{k.label}</p>
                  <span className={cn("flex size-9 items-center justify-center rounded-lg", k.tone)}>
                    <k.icon className="size-4.5" aria-hidden />
                  </span>
                </div>
                <p className="mt-2 text-3xl font-semibold text-navy tabular-nums">{k.value}</p>
                <p className="mt-1 text-xs text-stone-500">{k.sub}</p>
              </div>
            ))
          ) : (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)
          )}
        </section>
        {/* Charts */}
        {stats ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><VolumeChart data={stats.per_day} /></div>
            <DecisionDonut approved={stats.approved} rejected={stats.rejected} />
            <ProbabilityHistogram data={stats.probability_histogram} />
            <div className="lg:col-span-2"><TierBars stats={stats} /></div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-80 rounded-lg lg:col-span-2" />
            <Skeleton className="h-80 rounded-lg" />
          </div>
        )}

        {/* Table */}
        <section aria-labelledby="apps-heading" className="rounded-lg bg-white border border-stone-200">
          <div className="flex flex-col gap-4 border-b border-stone-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="apps-heading" className="text-base font-semibold text-navy">
                Applications {page && <span className="font-normal text-stone-500">({page.total.toLocaleString("en-US")})</span>}
              </h2>
              <a href={exportHref} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-stone-50" download>
                <Download className="size-4" aria-hidden /> Export CSV
              </a>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or application ID" aria-label="Search applications" className="h-10 pl-9" />
              </div>
              <select aria-label="Filter by decision" className={selectCls} value={filters.decision} onChange={(e) => setFilter("decision", e.target.value)}>
                <option value="">All decisions</option>
                <option value="PENDING">Awaiting review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
              <select aria-label="Filter by recommendation" className={selectCls} value={filters.recommendation} onChange={(e) => setFilter("recommendation", e.target.value)}>
                <option value="">All recommendations</option>
                <option value="APPROVE">Approve</option>
                <option value="REVIEW">Review</option>
                <option value="REJECT">Reject</option>
              </select>
              <select aria-label="Filter by eligibility tier" className={selectCls} value={filters.eligibility_tier} onChange={(e) => setFilter("eligibility_tier", e.target.value)}>
                <option value="">All eligibility tiers</option>
                <option>Likely</option>
                <option>Borderline</option>
                <option>Unlikely</option>
              </select>
              <select aria-label="Filter by risk tier" className={selectCls} value={filters.risk_tier} onChange={(e) => setFilter("risk_tier", e.target.value)}>
                <option value="">All risk tiers</option>
                <option>Low</option>
                <option>Moderate</option>
                <option>High</option>
              </select>
              <select aria-label="Filter by range guard" className={selectCls} value={filters.flagged} onChange={(e) => setFilter("flagged", e.target.value)}>
                <option value="">Flagged or not</option>
                <option value="true">Flagged by range guard</option>
                <option value="false">Not flagged</option>
              </select>
              <select aria-label="Filter by status" className={selectCls} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
                <option value="">All statuses</option>
                <option>Pending Review</option>
                <option>Info Requested</option>
                <option>Decided</option>
                <option>Overridden</option>
              </select>
              <label className="flex flex-col gap-1 text-xs text-stone-500">
                From
                <input type="date" className={selectCls} value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-stone-500">
                To
                <input type="date" className={selectCls} value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} />
              </label>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={() => { setFilters(EMPTY); setQ(""); setPageNo(1); }}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[72rem] text-left text-sm">
              <thead className="bg-stone-50 text-xs text-stone-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Application</th>
                  <SortHeader sort={sort} order={order} onSort={toggleSort} k="full_name">Applicant</SortHeader>
                  <SortHeader sort={sort} order={order} onSort={toggleSort} k="created_at">Date</SortHeader>
                  <SortHeader sort={sort} order={order} onSort={toggleSort} k="loan_amount">Loan</SortHeader>
                  <SortHeader sort={sort} order={order} onSort={toggleSort} k="fico">FICO / DTI</SortHeader>
                  <SortHeader sort={sort} order={order} onSort={toggleSort} k="eligibility_score">Eligibility</SortHeader>
                  <SortHeader sort={sort} order={order} onSort={toggleSort} k="default_probability">Charge-off risk</SortHeader>
                  <th scope="col" className="px-4 py-3 font-medium">Recommendation</th>
                  <th scope="col" className="px-4 py-3 font-medium">Decision</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody aria-busy={loading}>
                {loading && !page
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-t border-stone-100">
                        <td colSpan={11} className="px-4 py-3"><Skeleton className="h-6 w-full" /></td>
                      </tr>
                    ))
                  : page?.items.map((a) => (
                      <tr
                        key={a.id}
                        onClick={() => openApplication(a.application_id)}
                        className="cursor-pointer border-t border-stone-100 hover:bg-stone-50/70"
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openApplication(a.application_id);
                            }}
                            className="font-mono text-xs font-semibold text-brand hover:underline"
                          >
                            {a.application_id}
                          </button>
                          {a.guard_flagged && (
                            <span title="Flagged by the range guard" className="ml-2 inline-flex align-middle text-amber-700">
                              <ShieldAlert className="size-3.5" aria-label="Flagged by the range guard" />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-stone-900">{a.full_name}</p>
                          <p className="text-xs text-stone-500">{a.purpose}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-stone-600">{formatDate(a.created_at, true)}</td>
                        <td className="px-4 py-3 tabular-nums">{formatUSD(a.loan_amount)}</td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">{a.fico} / {a.dti}%</td>
                        <td className="px-4 py-3">
                          <span className="mr-2 tabular-nums">{a.eligibility_score.toFixed(1)}</span>
                          <TierBadge tier={a.eligibility_tier} kind="eligibility" />
                        </td>
                        <td className="px-4 py-3">
                          <span className="mr-2 tabular-nums">{formatPct(a.default_probability)}</span>
                          <TierBadge tier={a.risk_tier} kind="risk" />
                        </td>
                        <td className="px-4 py-3"><RecommendationBadge decision={a.recommendation} /></td>
                        <td className="px-4 py-3"><DecisionBadge decision={a.final_decision} overridden={a.status === "Overridden"} /></td>
                        <td className="px-4 py-3 text-stone-600">{a.status}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant={a.final_decision === "PENDING" ? "brand" : "outline"}
                            onClick={(e) => {
                              e.stopPropagation();
                              openApplication(a.application_id);
                            }}
                            aria-label={`${a.final_decision === "PENDING" ? "Decide on" : "View"} application ${a.application_id}`}
                          >
                            {a.final_decision === "PENDING" ? "Decide" : "View"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                {page && page.items.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-stone-500">No applications match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {page && page.total > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-5 py-3 text-sm text-stone-600">
              <p>
                Page {page.page} of {page.pages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPageNo((p) => p - 1)} disabled={page.page <= 1 || loading} aria-label="Previous page">
                  <ChevronLeft aria-hidden /> Prev
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPageNo((p) => p + 1)} disabled={page.page >= page.pages || loading} aria-label="Next page">
                  Next <ChevronRight aria-hidden />
                </Button>
              </div>
            </div>
          )}
        </section>

        <MessagesInbox reloadKey={reloadKey} onOpenApplication={openApplication} />
      </div>

      <ApplicationDrawer
        key={selected?.application_id ?? "none"}
        application={selected}
        onClose={() => setSelected(null)}
        onUpdated={(a) => {
          setSelected(a);
          reload();
        }}
        onDeleted={() => {
          setSelected(null);
          reload();
        }}
      />
    </div>
  );
}

function SortHeader({
  k,
  sort,
  order,
  onSort,
  children,
}: {
  k: SortKey;
  sort: SortKey;
  order: "asc" | "desc";
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  return (
    <th scope="col" aria-sort={sort === k ? (order === "asc" ? "ascending" : "descending") : "none"} className="px-4 py-3 font-medium">
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 rounded hover:text-navy">
        {children}
        {sort === k ? (
          order === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />
        ) : (
          <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}

function MessagesInbox({
  reloadKey,
  onOpenApplication,
}: {
  reloadKey: number;
  onOpenApplication: (id: string) => void;
}) {
  const authed = useAuthedFetch();
  const [data, setData] = useState<ContactPage | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [localKey, setLocalKey] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authed(`/api/admin/messages${showResolved ? "" : "?resolved=false"}`);
        const body = await res.json().catch(() => null);
        if (!cancelled && res.ok) setData(body);
      } catch {
        /* handled by authed / shown as empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, showResolved, reloadKey, localKey]);

  async function toggle(id: number, resolved: boolean) {
    setBusy(id);
    try {
      const res = await authed(`/api/admin/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved }),
      });
      if (!res.ok) throw new Error();
      toast.success(resolved ? "Marked as resolved" : "Reopened");
      setLocalKey((k) => k + 1);
    } catch (e) {
      if ((e as Error).message !== "unauthorized") toast.error("Could not update the message.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="messages" aria-labelledby="messages-heading" className="scroll-mt-20 rounded-lg bg-white border border-stone-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-5">
        <h2 id="messages-heading" className="flex items-center gap-2 text-base font-semibold text-navy">
          <Inbox className="size-4.5 text-brand" aria-hidden /> Messages
          {data && data.unresolved > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">{data.unresolved} open</span>
          )}
        </h2>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="size-4 accent-[#8A6417]" />
          Show resolved
        </label>
      </div>
      {!data ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : data.items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-stone-500">{showResolved ? "No messages yet." : "No open messages. Inbox zero."}</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {data.items.map((m) => (
            <li key={m.id} className="p-5">
              <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", m.resolved && "opacity-70")}>
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-stone-900">{m.name}</span>
                    <span className="text-stone-600">{m.email}</span>
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">{m.topic}</span>
                    {m.application_id && (
                      <button type="button" onClick={() => onOpenApplication(m.application_id!)} className="font-mono text-xs font-semibold text-brand hover:underline">
                        {m.application_id}
                      </button>
                    )}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-stone-700">{m.message}</p>
                  <p className="text-xs text-stone-500">
                    {m.reference} · {formatDate(m.created_at, true)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggle(m.id, !m.resolved)} disabled={busy === m.id}>
                    {busy === m.id ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
                    {m.resolved ? "Reopen" : "Mark resolved"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ApplicationDrawer({
  application: a,
  onClose,
  onUpdated,
  onDeleted,
}: {
  application: AdminApplication | null;
  onClose: () => void;
  onUpdated: (a: AdminApplication) => void;
  onDeleted: () => void;
}) {
  const authed = useAuthedFetch();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!a) return;
    setDeleting(true);
    try {
      const res = await authed(`/api/admin/applications/${a.application_id}`, { method: "DELETE" });
      if (res.status !== 204) throw new Error((await res.json().catch(() => null))?.error?.message ?? "Delete failed");
      toast.success(`${a.application_id} permanently deleted`);
      onDeleted();
    } catch (e) {
      if ((e as Error).message !== "unauthorized") toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  type Action = "approve" | "approve_counter_offer" | "reject" | "request_info";
  const [saving, setSaving] = useState<null | Action>(null);

  async function act(action: Action) {
    if (!a) return;
    setSaving(action);
    try {
      const res = await authed(`/api/admin/applications/${a.application_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() || null, message: message.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.details?.[0]?.message ?? data?.error?.message ?? "Update failed");
      toast.success(
        action === "approve" || action === "approve_counter_offer" ? "Application approved. The applicant can see it on their status page."
          : action === "reject" ? "Application rejected. The applicant can see it on their status page."
          : "Request sent. The applicant will see it on their status page.",
      );
      setNote("");
      setMessage("");
      onUpdated(data);
    } catch (e) {
      if ((e as Error).message !== "unauthorized") toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const rows: [string, React.ReactNode][] = a
    ? [
        ["Email", a.email],
        ["Purpose", a.purpose],
        ["Loan amount", formatUSD(a.loan_amount)],
        ["FICO score", a.fico],
        ["DTI", `${a.dti}%`],
        ...(a.approved_amount !== null ? ([["Approved amount", formatUSD(a.approved_amount)]] as [string, React.ReactNode][]) : []),
      ]
    : [];
  const rec = a ? DECISION_COPY[a.recommendation] : null;

  return (
    <Sheet open={!!a} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl data-[side=right]:sm:max-w-xl">
        {a && (
          <>
            <SheetHeader className="border-b border-stone-100">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">
                {a.full_name} <DecisionBadge decision={a.final_decision} overridden={a.status === "Overridden"} />
              </SheetTitle>
              <SheetDescription className="font-mono">
                {a.application_id} · {formatDate(a.created_at, true)}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-8">
              <section className="rounded-md border border-stone-200 p-4" aria-labelledby="officer-decision-heading">
                <h3 id="officer-decision-heading" className="text-sm font-semibold text-navy">Officer decision</h3>
                <div className={cn("mt-3 rounded-md border p-3 text-sm", rec!.tone)}>
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      LendWise recommends <strong>{rec!.label.toLowerCase()}</strong>
                    </span>
                    <span className="text-xs">
                      Eligibility {a.eligibility_score.toFixed(1)} · charge-off risk {formatPct(a.default_probability)}
                    </span>
                  </p>
                  {a.recommendation_reasons.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs">
                      {a.recommendation_reasons.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                </div>
                {a.guard_flagged && (
                  <div className="mt-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <ShieldAlert className="size-3.5" aria-hidden /> Range guard flag
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {a.guard_reasons.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-2 text-xs text-stone-600">
                  {a.final_decision === "PENDING"
                    ? a.status === "Info Requested"
                      ? "Waiting for the applicant to reply to your request."
                      : "Awaiting your decision."
                    : `Final decision: ${a.final_decision === "APPROVED" ? `Approved ${formatUSD(a.approved_amount ?? a.loan_amount)}` : "Rejected"}${a.status === "Overridden" ? " (against the recommendation)" : ""}. You can still change it.`}
                </p>

                {a.messages.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-stone-700">Conversation with applicant</p>
                    <ThreadList messages={a.messages} />
                  </div>
                )}

                <label htmlFor="officer-message" className="mt-4 block text-xs font-medium text-stone-700">
                  Message to the applicant (shown on their status page; required for Request more info)
                </label>
                <Textarea
                  id="officer-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="For example: Approved after checking your income. Or: please share your last two pay stubs."
                  className="mt-1"
                />

                <label htmlFor="officer-note" className="mt-3 block text-xs font-medium text-stone-700">
                  Internal note (officers only; required if you go against an approve or reject recommendation)
                </label>
                <Textarea
                  id="officer-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="Never shown to the applicant"
                  className="mt-1"
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                    onClick={() => act("approve")}
                    disabled={!!saving || (a.final_decision === "APPROVED" && a.approved_amount === a.loan_amount)}
                  >
                    {saving === "approve" ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} Approve {formatUSD(a.loan_amount)}
                  </Button>
                  {a.counter_offer !== null && (
                    <Button
                      variant="outline"
                      className="border-emerald-300 text-emerald-800"
                      onClick={() => act("approve_counter_offer")}
                      disabled={!!saving || (a.final_decision === "APPROVED" && a.approved_amount === a.counter_offer)}
                    >
                      {saving === "approve_counter_offer" ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} Approve counter-offer {formatUSD(a.counter_offer)}
                    </Button>
                  )}
                  <Button className="bg-rose-700 text-white hover:bg-rose-800" onClick={() => act("reject")} disabled={!!saving || a.final_decision === "REJECTED"}>
                    {saving === "reject" ? <Loader2 className="animate-spin" aria-hidden /> : <XCircle aria-hidden />} Reject
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => act("request_info")}
                    disabled={!!saving || a.final_decision !== "PENDING" || message.trim().length < 10}
                    title={message.trim().length < 10 ? "Write your question in the message box first (at least 10 characters)" : undefined}
                  >
                    {saving === "request_info" ? <Loader2 className="animate-spin" aria-hidden /> : <MessageSquareText aria-hidden />} Request more info
                  </Button>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-navy">Screening result</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Eligibility score", `${a.eligibility_score.toFixed(1)} (${a.eligibility_tier})`],
                    ["Default probability", `${formatPct(a.default_probability, 2)} (${a.risk_tier})`],
                    ["Expected loss", `${formatPct(a.expected_loss, 2)} of principal`],
                    ["Counter-offer", a.counter_offer !== null ? formatUSD(a.counter_offer) : "None"],
                    ["Recommendation", rec!.label],
                    ["Status", a.status],
                    ["Range guard", a.guard_flagged ? "Flagged" : "Not flagged"],
                    ["Model version", a.model_version],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="rounded-lg bg-stone-50 p-3">
                      <dt className="text-xs text-stone-500">{k}</dt>
                      <dd className="mt-0.5 break-words font-medium text-stone-900">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-navy">Applicant</h3>
                <dl className="mt-3 divide-y divide-stone-100 text-sm">
                  {rows.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 py-2">
                      <dt className="text-stone-500">{k}</dt>
                      <dd className="text-right font-medium text-stone-900">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              {a.officer_note && (
                <section>
                  <h3 className="text-sm font-semibold text-navy">Officer notes</h3>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-sans text-xs text-stone-700">{a.officer_note}</pre>
                </section>
              )}


              <section className="rounded-md border border-rose-200 p-4">
                <h3 className="text-sm font-semibold text-rose-800">Delete application</h3>
                <p className="mt-1 text-xs text-stone-600">
                  Permanently removes this application and its personal data (for example after a data-deletion request). This cannot be undone.
                </p>
                {!confirmDelete ? (
                  <Button variant="destructive" className="mt-3" onClick={() => setConfirmDelete(true)}>
                    <Trash2 aria-hidden /> Delete application
                  </Button>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2" role="alert">
                    <span className="text-sm font-medium text-rose-800">Delete {a.application_id} permanently?</span>
                    <Button className="bg-danger text-white hover:bg-rose-700" onClick={remove} disabled={deleting}>
                      {deleting && <Loader2 className="animate-spin" aria-hidden />} Yes, delete
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                      Cancel
                    </Button>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
