"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FlaskConical,
  Gauge as GaugeIcon,
  Inbox,
  Loader2,
  LogOut,
  Mail,
  Reply,
  Send,
  Trash2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/site/logo";
import { ApprovalRateBars, DecisionDonut, ProbabilityHistogram, VolumeChart } from "./charts";
import { formatDate, formatINR, formatLakhCrore, formatPercent } from "@/lib/format";
import type { AdminApplication, AdminEmail, AdminEmailPage, AdminPage, AdminStats, ContactPage, Decision, RiskBand } from "@/lib/types";
import { EmailPreview, EmailStatusBadge, type PreviewEmail } from "@/components/site/email-preview";
import { cn } from "@/lib/utils";

type SortKey = "created_at" | "default_probability" | "loan_amount" | "income" | "full_name";
type Filters = { q: string; decision: string; risk_band: string; status: string; date_from: string; date_to: string };
const EMPTY: Filters = { q: "", decision: "", risk_band: "", status: "", date_from: "", date_to: "" };
const PAGE_SIZE = 15;

const selectCls =
  "h-10 rounded-lg border border-input bg-white px-3 text-sm text-stone-800 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

export function DecisionBadge({ decision, overridden }: { decision: Decision; overridden?: boolean }) {
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

function BandBadge({ band }: { band: RiskBand }) {
  const cls =
    band === "Low" ? "bg-emerald-50 text-emerald-800" : band === "Moderate" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-800";
  return <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", cls)}>{band}</span>;
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
      if ((e as Error).message !== "unauthorized") toast.error("Couldn’t open that application.");
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
            <a href="#outbox" className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 sm:inline-flex">
              <Mail className="size-4" aria-hidden /> Outbox
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
          <p className="text-sm text-stone-600">Monitor model decisions, review applications and record overrides.</p>
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
              { label: "Total applications", value: stats.total.toLocaleString("en-IN"), sub: `${stats.under_review} under review · ${stats.overridden} overridden`, icon: FileText, tone: "text-brand bg-brand-soft" },
              { label: "Approval rate", value: formatPercent(stats.approval_rate), sub: `${stats.approved} approved`, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
              { label: "Rejection rate", value: formatPercent(stats.rejection_rate), sub: `${stats.rejected} rejected`, icon: XCircle, tone: "text-rose-700 bg-rose-50" },
              { label: "Avg. default probability", value: formatPercent(stats.avg_default_probability), sub: `Low ${stats.by_risk_band.Low} · Mod ${stats.by_risk_band.Moderate} · High ${stats.by_risk_band.High}`, icon: GaugeIcon, tone: "text-amber-700 bg-amber-50" },
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
        {stats && stats.demo_count > 0 && (
          <p className="flex items-center gap-2 text-xs text-amber-800">
            <FlaskConical className="size-4" aria-hidden /> {stats.demo_count} application(s) were processed in demo mode (simulated decisions).
          </p>
        )}

        {/* Charts */}
        {stats ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><VolumeChart data={stats.per_day} /></div>
            <DecisionDonut approved={stats.approved} rejected={stats.rejected} />
            <ProbabilityHistogram data={stats.probability_histogram} />
            <div className="lg:col-span-2"><ApprovalRateBars profession={stats.by_profession} state={stats.by_state} /></div>
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
                Applications {page && <span className="font-normal text-stone-500">({page.total.toLocaleString("en-IN")})</span>}
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
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
              <select aria-label="Filter by risk band" className={selectCls} value={filters.risk_band} onChange={(e) => setFilter("risk_band", e.target.value)}>
                <option value="">All risk bands</option>
                <option>Low</option>
                <option>Moderate</option>
                <option>High</option>
              </select>
              <select aria-label="Filter by status" className={selectCls} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
                <option value="">All statuses</option>
                <option>Decided</option>
                <option>Under Review</option>
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
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="bg-stone-50 text-xs text-stone-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Application</th>
                  <SortHeader sort={sort} order={order} onSort={toggleSort} k="full_name">Applicant</SortHeader>
                  <SortHeader sort={sort} order={order} onSort={toggleSort} k="created_at">Date</SortHeader>
                  <SortHeader sort={sort} order={order} onSort={toggleSort} k="loan_amount">Loan</SortHeader>
                  <SortHeader sort={sort} order={order} onSort={toggleSort} k="default_probability">Default prob.</SortHeader>
                  <th scope="col" className="px-4 py-3 font-medium">Risk band</th>
                  <th scope="col" className="px-4 py-3 font-medium">Decision</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody aria-busy={loading}>
                {loading && !page
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-t border-stone-100">
                        <td colSpan={8} className="px-4 py-3"><Skeleton className="h-6 w-full" /></td>
                      </tr>
                    ))
                  : page?.items.map((a) => (
                      <tr key={a.id} className="border-t border-stone-100 hover:bg-stone-50/70">
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setSelected(a)} className="font-mono text-xs font-semibold text-brand hover:underline">
                            {a.application_id}
                          </button>
                          {a.is_demo && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">DEMO</span>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-stone-900">{a.full_name}</p>
                          <p className="text-xs text-stone-500">{a.profession.replace(/_/g, " ")}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-stone-600">{formatDate(a.created_at, true)}</td>
                        <td className="px-4 py-3 tabular-nums">{formatLakhCrore(a.loan_amount)}</td>
                        <td className="px-4 py-3 tabular-nums">{formatPercent(a.default_probability)}</td>
                        <td className="px-4 py-3"><BandBadge band={a.risk_band} /></td>
                        <td className="px-4 py-3"><DecisionBadge decision={a.final_decision} overridden={a.final_decision !== a.decision} /></td>
                        <td className="px-4 py-3 text-stone-600">{a.status}</td>
                      </tr>
                    ))}
                {page && page.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-stone-500">No applications match these filters.</td>
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

        <MessagesInbox reloadKey={reloadKey} onOpenApplication={openApplication} onChanged={reload} />
        <EmailOutbox reloadKey={reloadKey} />
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
  onChanged,
}: {
  reloadKey: number;
  onOpenApplication: (id: string) => void;
  onChanged: () => void;
}) {
  const authed = useAuthedFetch();
  const [data, setData] = useState<ContactPage | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [localKey, setLocalKey] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [resolveOnReply, setResolveOnReply] = useState(true);

  async function sendReply(id: number) {
    setBusy(id);
    try {
      const res = await authed(`/api/admin/messages/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText.trim(), resolve: resolveOnReply }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Couldn’t send the reply.");
      toast.success(body.status === "demo" ? "Reply captured in the outbox (demo mode — not delivered)" : "Reply sent");
      setReplyText("");
      setReplyTo(null);
      setLocalKey((k) => k + 1);
      onChanged();
    } catch (e) {
      if ((e as Error).message !== "unauthorized") toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

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
      if ((e as Error).message !== "unauthorized") toast.error("Couldn’t update the message.");
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
        <p className="px-5 py-10 text-center text-sm text-stone-500">{showResolved ? "No messages yet." : "No open messages — inbox zero."}</p>
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
                  <Button variant="outline" size="sm" onClick={() => setReplyTo(replyTo === m.id ? null : m.id)} aria-expanded={replyTo === m.id}>
                    <Reply aria-hidden /> Reply
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggle(m.id, !m.resolved)} disabled={busy === m.id}>
                    {busy === m.id ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
                    {m.resolved ? "Reopen" : "Mark resolved"}
                  </Button>
                </div>
              </div>
              {m.replies.length > 0 && (
                <ul className="mt-3 space-y-2 border-l-2 border-brand-line pl-4">
                  {m.replies.map((r, i) => (
                    <li key={i} className="text-sm">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        Reply sent {formatDate(r.created_at, true)} <EmailStatusBadge status={r.status} />
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-stone-700">{r.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              {replyTo === m.id && (
                <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-4">
                  <label htmlFor={`reply-${m.id}`} className="text-xs font-medium text-stone-700">
                    Reply to {m.email}
                  </label>
                  <Textarea
                    id={`reply-${m.id}`}
                    rows={4}
                    maxLength={5000}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your reply…"
                    className="mt-1 bg-white"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button onClick={() => sendReply(m.id)} disabled={replyText.trim().length < 5 || busy === m.id}>
                      {busy === m.id ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send reply
                    </Button>
                    <label className="flex items-center gap-2 text-sm text-stone-600">
                      <input type="checkbox" checked={resolveOnReply} onChange={(e) => setResolveOnReply(e.target.checked)} className="size-4 accent-[#8A6417]" />
                      Mark resolved after sending
                    </label>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const EMAIL_KIND: Record<string, string> = {
  application_received: "Application received",
  decision: "Decision",
  decision_update: "Decision update",
  contact_ack: "Contact acknowledgement",
  contact_reply: "Contact reply",
};

const toPreview = (e: AdminEmail): PreviewEmail => ({
  subject: e.subject,
  to: e.to_email,
  created_at: e.created_at,
  status: e.status,
  html: e.html,
  error: e.error,
});

function useEmails(query: string, reloadKey: number, enabled = true) {
  const authed = useAuthedFetch();
  const [data, setData] = useState<AdminEmailPage | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authed(`/api/admin/emails${query ? `?${query}` : ""}`);
        const body = await res.json().catch(() => null);
        if (!cancelled && res.ok) setData(body);
      } catch {
        /* shown as empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, query, reloadKey, enabled]);
  return data;
}

function EmailOutbox({ reloadKey }: { reloadKey: number }) {
  const data = useEmails("limit=25", reloadKey);
  const [preview, setPreview] = useState<PreviewEmail | null>(null);
  return (
    <section id="outbox" aria-labelledby="outbox-heading" className="scroll-mt-20 rounded-lg border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-5">
        <h2 id="outbox-heading" className="flex items-center gap-2 text-base font-semibold text-navy">
          <Mail className="size-4.5 text-brand" aria-hidden /> Email outbox
          {data && <span className="font-normal text-stone-500">({data.total})</span>}
        </h2>
        {data && (
          <p className={cn("text-xs", data.mode === "demo" ? "text-amber-900" : "text-emerald-800")}>
            {data.mode === "demo"
              ? "Demo mode: emails are captured here, not delivered. Add RESEND_API_KEY to send them."
              : "Live: emails are delivered through Resend."}
          </p>
        )}
      </div>
      {!data ? (
        <div className="p-5">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : data.items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-stone-500">No emails yet.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="bg-stone-50 text-xs text-stone-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Sent</th>
                <th scope="col" className="px-4 py-3 font-medium">To</th>
                <th scope="col" className="px-4 py-3 font-medium">Subject</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Preview</span></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} className="border-t border-stone-100">
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatDate(e.created_at, true)}</td>
                  <td className="px-4 py-3 text-stone-800">{e.to_email}</td>
                  <td className="max-w-[18rem] truncate px-4 py-3 text-stone-900">{e.subject}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{EMAIL_KIND[e.kind] ?? e.kind}</td>
                  <td className="px-4 py-3"><EmailStatusBadge status={e.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => setPreview(toPreview(e))} aria-label={`Preview email: ${e.subject}`}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <EmailPreview email={preview} onClose={() => setPreview(null)} />
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
  const emails = useEmails(a ? `application_id=${a.application_id}` : "", a?.updated_at ? Date.parse(a.updated_at) : 0, !!a);
  const [preview, setPreview] = useState<PreviewEmail | null>(null);
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
  const [decision, setDecision] = useState<Decision | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(body: Record<string, unknown>) {
    if (!a) return;
    if (note.trim().length < 5) {
      toast.error("A note of at least 5 characters is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await authed(`/api/admin/applications/${a.application_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, note: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Update failed");
      toast.success("Application updated");
      setNote("");
      setDecision("");
      onUpdated(data);
    } catch (e) {
      if ((e as Error).message !== "unauthorized") toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const rows: [string, React.ReactNode][] = a
    ? [
        ["Email", a.email],
        ["Phone", `${a.phone}${a.phone_verified ? " · verified" : " · not verified"}`],
        ["Age", a.age],
        ["Marital status", a.marital_status],
        ["Profession", a.profession.replace(/_/g, " ")],
        ["Experience", `${a.experience} yrs (${a.current_job_years} current job)`],
        ["Income", formatINR(a.income)],
        ["Location", `${a.city.replace(/\[\d+\]/, "").replace(/_/g, " ")}, ${a.state.replace(/\[\d+\]/, "").replace(/_/g, " ")}`],
        ["House", `${a.house_ownership} · ${a.current_house_years} yrs`],
        ["Car", a.car_ownership],
        ["Loan", `${formatINR(a.loan_amount)} · ${a.tenure_months} mo · ${a.purpose}`],
      ]
    : [];

  return (
    <Sheet open={!!a} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl data-[side=right]:sm:max-w-xl">
        {a && (
          <>
            <SheetHeader className="border-b border-stone-100">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">
                {a.full_name} <DecisionBadge decision={a.final_decision} overridden={a.final_decision !== a.decision} />
              </SheetTitle>
              <SheetDescription className="font-mono">
                {a.application_id} · {formatDate(a.created_at, true)}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-8">
              {a.is_demo && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Processed in demo mode — simulated decision, not a model output.</p>
              )}
              <section>
                <h3 className="text-sm font-semibold text-navy">Model output</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Model decision", a.decision],
                    ["Final decision", a.final_decision],
                    ["Risk class", a.risk_class],
                    ["Risk band", a.risk_band],
                    ["Default probability", formatPercent(a.default_probability, 2)],
                    ["Confidence", formatPercent(a.confidence, 1)],
                    ["Status", a.status],
                    ["Model version", a.model_version],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="rounded-lg bg-stone-50 p-3">
                      <dt className="text-xs text-stone-500">{k}</dt>
                      <dd className="mt-0.5 break-words font-medium text-stone-900">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
                {a.indicative_factors.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {a.indicative_factors.map((f) => (
                      <li key={f.key} className={cn("rounded-full px-2.5 py-1 text-xs", f.direction === "risk" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800")}>
                        {f.label}
                      </li>
                    ))}
                  </ul>
                )}
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
              <details className="rounded-lg bg-stone-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-navy">Engineered features</summary>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(a.engineered_features).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-stone-500">{k}</dt>
                      <dd className="font-mono">{typeof v === "number" ? Number(v.toFixed(4)).toLocaleString("en-IN") : v}</dd>
                    </div>
                  ))}
                </dl>
              </details>
              {a.warnings.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  {a.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              )}
              {a.officer_note && (
                <section>
                  <h3 className="text-sm font-semibold text-navy">Officer notes</h3>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-sans text-xs text-stone-700">{a.officer_note}</pre>
                </section>
              )}

              <section className="rounded-md border border-stone-200 p-4">
                <h3 className="text-sm font-semibold text-navy">Review & override</h3>
                <p className="mt-1 text-xs text-stone-500">The original model decision is always kept. A note is required for every change.</p>
                <fieldset className="mt-4">
                  <legend className="text-xs font-medium text-stone-700">Set final decision</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["APPROVED", "REJECTED"] as const).map((d) => (
                      <label
                        key={d}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40",
                          decision === d ? "border-brand bg-brand-soft font-medium" : "border-input",
                        )}
                      >
                        <input type="radio" name="override" value={d} checked={decision === d} onChange={() => setDecision(d)} className="accent-[#8A6417]" />
                        {d === "APPROVED" ? "Approve" : "Reject"}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label htmlFor="officer-note" className="mt-4 block text-xs font-medium text-stone-700">
                  Note (required)
                </label>
                <Textarea id="officer-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="Reason for this change…" className="mt-1" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => save({ decision })} disabled={!decision || saving}>
                    {saving && <Loader2 className="animate-spin" aria-hidden />} Save decision
                  </Button>
                  <Button variant="outline" onClick={() => save({ status: "Under Review" })} disabled={saving || a.status === "Under Review"}>
                    Mark under review
                  </Button>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-navy">Emails to applicant</h3>
                {!emails ? (
                  <Skeleton className="mt-2 h-12 w-full" />
                ) : emails.items.length === 0 ? (
                  <p className="mt-2 text-sm text-stone-500">No emails.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-stone-100 text-sm">
                    {emails.items.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-stone-900">{e.subject}</span>
                          <span className="text-xs text-stone-500">{formatDate(e.created_at, true)}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <EmailStatusBadge status={e.status} />
                          <Button variant="ghost" size="sm" onClick={() => setPreview(toPreview(e))}>View</Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-md border border-rose-200 p-4">
                <h3 className="text-sm font-semibold text-rose-800">Delete application</h3>
                <p className="mt-1 text-xs text-stone-600">
                  Permanently removes this application and its personal data (e.g. for a data-deletion request). This can’t be undone.
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
      <EmailPreview email={preview} onClose={() => setPreview(null)} />
    </Sheet>
  );
}
