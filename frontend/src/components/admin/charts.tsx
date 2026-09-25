"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminStats, GroupStat } from "@/lib/types";
import { cn } from "@/lib/utils";

// Validated with the dataviz palette checker: approved/rejected pass CVD separation (ΔE 10.6).
// The lighter rejected hue is below 3:1 on white, so every chart pairs it with a legend,
// direct labels or tooltips, and the applications table is the full table view.
export const SERIES = { approved: "#047857", rejected: "#FB7185", single: "#8A6417" };
const AXIS = { stroke: "#A8A29E", fontSize: 12, tickLine: false, axisLine: false } as const;
const GRID = "#F0EEEC";

function ChartCard({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
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

function Legend({ items }: { items: { label: string; color: string }[] }) {
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

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
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

const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function VolumeChart({ data }: { data: AdminStats["per_day"] }) {
  return (
    <ChartCard
      title="Applications over time"
      subtitle="Last 30 days, by final decision"
      action={<Legend items={[{ label: "Approved", color: SERIES.approved }, { label: "Rejected", color: SERIES.rejected }]} />}
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
                    ]}
                  />
                ) : null
              }
            />
            <Bar isAnimationActive={false} dataKey="approved" stackId="d" fill={SERIES.approved} stroke="#fff" strokeWidth={1} />
            <Bar isAnimationActive={false} dataKey="rejected" stackId="d" fill={SERIES.rejected} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
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
    <ChartCard title="Approved vs rejected" subtitle="All applications, final decision">
      <div className="relative h-52">
        {total === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-stone-500">No applications yet</p>
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
              <span className="text-xs text-stone-500">applications</span>
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
    <ChartCard title="Default-probability distribution" subtitle="Applications per 10% band">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 4, left: -20, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="bucket" tickFormatter={(b: string) => b.split("–")[0] + "%"} {...AXIS} />
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
      <p className="mt-2 text-xs text-stone-500">Bands ≥ 50% are classed High risk; 30–50% Moderate.</p>
    </ChartCard>
  );
}

export function ApprovalRateBars({ profession, state }: { profession: GroupStat[]; state: GroupStat[] }) {
  const [tab, setTab] = useState<"profession" | "state">("profession");
  const rows = (tab === "profession" ? profession : state).map((g) => ({ ...g, pct: Math.round(g.approval_rate * 100) }));
  return (
    <ChartCard
      title="Approval rate by segment"
      subtitle="Top 10 by application volume"
      action={
        <div role="tablist" aria-label="Segment" className="flex rounded-lg bg-stone-100 p-0.5 text-xs">
          {(["profession", "state"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("rounded-md px-3 py-1 font-medium capitalize", tab === t ? "bg-white text-navy shadow-sm" : "text-stone-600")}
            >
              {t}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500">No data yet</p>
      ) : (
        <div style={{ height: Math.max(160, rows.length * 30 + 20) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barCategoryGap={4}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                type="category"
                dataKey="label"
                width={150}
                interval={0}
                {...AXIS}
                tick={{ fill: "#57534E", fontSize: 12 }}
                tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
              />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.12)" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipBox
                      title={payload[0].payload.label}
                      rows={[
                        { label: "Approval rate", value: `${payload[0].payload.pct}%` },
                        { label: "Applications", value: String(payload[0].payload.total) },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar isAnimationActive={false} dataKey="pct" fill={SERIES.single} radius={[0, 4, 4, 0]} background={{ fill: "#F5F5F4", radius: 4 }}>
                <LabelList dataKey="pct" position="right" formatter={(v) => `${v}%`} style={{ fill: "#44403C", fontSize: 12 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
