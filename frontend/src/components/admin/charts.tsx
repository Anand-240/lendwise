"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminStats } from "@/lib/types";
import { cn } from "@/lib/utils";

// Validated with the dataviz palette checker: approved/rejected pass CVD separation (ΔE 10.6).
// The lighter rejected hue is below 3:1 on white, so every chart pairs it with a legend,
// direct labels or tooltips, and the applications table is the full table view.
export const SERIES = { approved: "#047857", rejected: "#FB7185", pending: "#D6D3D1", single: "#8A6417" };
export const AXIS = { stroke: "#A8A29E", fontSize: 12, tickLine: false, axisLine: false } as const;
export const GRID = "#F0EEEC";

export function ChartCard({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-white p-5 border border-stone-200" aria-label={title}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-stone-600">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-stone-200">
      <p className="mb-1 font-semibold text-stone-900">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-stone-600">
          {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} aria-hidden />}
          {r.label}: <span className="font-semibold text-stone-900 tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" });

export function VolumeChart({ data }: { data: AdminStats["per_day"] }) {
  return (
    <ChartCard
      title="Applications over time"
      subtitle="Last 30 days, by final decision"
      action={
        <Legend
          items={[
            { label: "Approved", color: SERIES.approved },
            { label: "Rejected", color: SERIES.rejected },
            { label: "Awaiting review", color: SERIES.pending },
          ]}
        />
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="date" tickFormatter={shortDate} interval="preserveStartEnd" minTickGap={24} {...AXIS} />
            <YAxis allowDecimals={false} {...AXIS} />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.12)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={shortDate(String(label))}
                    rows={[
                      { label: "Approved", value: String(payload[0]?.payload.approved ?? 0), color: SERIES.approved },
                      { label: "Rejected", value: String(payload[0]?.payload.rejected ?? 0), color: SERIES.rejected },
                      { label: "Awaiting review", value: String(payload[0]?.payload.pending ?? 0), color: SERIES.pending },
                    ]}
                  />
                ) : null
              }
            />
            <Bar isAnimationActive={false} dataKey="approved" stackId="d" fill={SERIES.approved} stroke="#fff" strokeWidth={1} />
            <Bar isAnimationActive={false} dataKey="rejected" stackId="d" fill={SERIES.rejected} stroke="#fff" strokeWidth={1} />
            <Bar isAnimationActive={false} dataKey="pending" stackId="d" fill={SERIES.pending} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function DecisionDonut({ approved, rejected }: { approved: number; rejected: number }) {
  const total = approved + rejected;
  const data = [
    { name: "Approved", value: approved, color: SERIES.approved },
    { name: "Rejected", value: rejected, color: SERIES.rejected },
  ];
  return (
    <ChartCard title="Approved vs rejected" subtitle="Applications an officer has decided">
      <div className="relative h-52">
        {total === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-stone-500">No decisions yet</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie isAnimationActive={false} data={data} dataKey="value" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270}>
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <TooltipBox
                        title={String(payload[0].name)}
                        rows={[{ label: "Applications", value: `${payload[0].value} (${Math.round((Number(payload[0].value) / total) * 100)}%)` }]}
                      />
                    ) : null
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold text-navy tabular-nums">{total}</span>
              <span className="text-xs text-stone-500">decided</span>
            </div>
          </>
        )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-stone-600">
            <span className="size-2.5 rounded-sm" style={{ background: d.color }} aria-hidden />
            {d.name}
            <span className="ml-auto font-semibold text-stone-900 tabular-nums">
              {d.value} · {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

export function ProbabilityHistogram({ data }: { data: AdminStats["probability_histogram"] }) {
  return (
    <ChartCard title="Charge-off risk distribution" subtitle="Applications per default-probability band">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 4, left: -20, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="bucket" tickFormatter={(b: string) => (b.includes(" to ") ? `${b.split(" to ")[0]}%` : b)} {...AXIS} />
            <YAxis allowDecimals={false} {...AXIS} />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.12)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox title={`${payload[0].payload.bucket} default probability`} rows={[{ label: "Applications", value: String(payload[0].value) }]} />
                ) : null
              }
            />
            <Bar isAnimationActive={false} dataKey="count" fill={SERIES.single} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-stone-500">Up to 12% is Low risk, 12% to 22% Moderate and above 22% High.</p>
    </ChartCard>
  );
}

const TIER_COLORS: Record<string, string> = {
  APPROVE: "#047857", REVIEW: "#D97706", REJECT: "#FB7185",
  Likely: "#047857", Borderline: "#D97706", Unlikely: "#FB7185",
  Low: "#047857", Moderate: "#D97706", High: "#FB7185",
};
const TIER_LABEL: Record<string, string> = { APPROVE: "Approve", REVIEW: "Review", REJECT: "Reject" };

export function TierBars({ stats }: { stats: AdminStats }) {
  const tabs = {
    recommendation: { label: "Recommendation", data: stats.by_recommendation },
    eligibility: { label: "Eligibility tier", data: stats.by_eligibility_tier },
    risk: { label: "Risk tier", data: stats.by_risk_tier },
  } as const;
  const [tab, setTab] = useState<keyof typeof tabs>("recommendation");
  const total = Object.values(tabs[tab].data).reduce((a, b) => a + b, 0);
  const rows = Object.entries(tabs[tab].data).map(([k, v]) => ({ key: k, label: TIER_LABEL[k] ?? k, count: v, pct: total ? Math.round((v / total) * 100) : 0 }));
  return (
    <ChartCard
      title="Screening results"
      subtitle="What LendWise recommended for every application"
      action={
        <div role="tablist" aria-label="Breakdown" className="flex rounded-lg bg-stone-100 p-0.5 text-xs">
          {(Object.keys(tabs) as (keyof typeof tabs)[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("rounded-md px-3 py-1 font-medium", tab === t ? "bg-white text-navy shadow-sm" : "text-stone-600")}
            >
              {tabs[t].label}
            </button>
          ))}
        </div>
      }
    >
      {total === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">No applications yet</p>
      ) : (
        <ul className="space-y-4 py-2">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-stone-800">{r.label}</span>
                <span className="text-stone-600 tabular-nums">
                  {r.count} · {r.pct}%
                </span>
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-stone-100">
                <div className="h-2.5 rounded-full" style={{ width: `${r.pct}%`, background: TIER_COLORS[r.key] }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
