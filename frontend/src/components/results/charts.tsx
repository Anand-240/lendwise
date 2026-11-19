"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID, Legend, TooltipBox } from "@/components/admin/charts";
import type { Decile } from "@/lib/types";

// Validated with the dataviz palette checker (light surface): lightness band, chroma floor,
// CVD separation, normal-vision separation and 3:1 contrast all pass.
const PREDICTED = "#2F6FB0";
const OBSERVED = "#B8661A";
const SINGLE = "#2F6FB0";

/** Figure 5.3: predicted and actual default rate in each risk decile (2015 test loans). */
export function CalibrationChart({ deciles }: { deciles: Decile[] }) {
  return (
    <figure className="rounded-lg border border-stone-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <figcaption>
          <p className="text-sm font-semibold text-navy">Predicted and actual default rate in each risk group</p>
          <p className="text-xs text-stone-500">2015 test loans sorted into ten equal groups by predicted risk (1 = lowest)</p>
        </figcaption>
        <Legend items={[{ label: "Predicted", color: PREDICTED }, { label: "Observed", color: OBSERVED }]} />
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={deciles} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap="22%" barGap={2}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="decile" {...AXIS} />
            <YAxis tickFormatter={(v: number) => `${v}%`} {...AXIS} />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.12)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={`Risk group ${payload[0].payload.decile}`}
                    rows={[
                      { label: "Predicted", value: `${payload[0].payload.predicted.toFixed(1)}%`, color: PREDICTED },
                      { label: "Observed", value: `${payload[0].payload.observed.toFixed(1)}%`, color: OBSERVED },
                      { label: "Loans", value: payload[0].payload.count.toLocaleString("en-US") },
                    ]}
                  />
                ) : null
              }
            />
            <Bar isAnimationActive={false} dataKey="predicted" name="Predicted" fill={PREDICTED} radius={[4, 4, 0, 0]} />
            <Bar isAnimationActive={false} dataKey="observed" name="Observed" fill={OBSERVED} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Figure 5.4: eligibility AUC of the first (unconstrained) model with different sets of inputs. */
export function AuditChart({ rows }: { rows: { label: string; auc: number }[] }) {
  const data = rows.map((r) => ({ ...r, highlight: r.label === "Employment length alone" }));
  return (
    <figure className="rounded-lg border border-stone-200 bg-white p-5">
      <figcaption className="mb-4">
        <p className="text-sm font-semibold text-navy">Eligibility AUC with different sets of inputs</p>
        <p className="text-xs text-stone-500">First, unconstrained model on the 2016 cohort. Employment length is highlighted.</p>
      </figcaption>
      <div style={{ height: data.length * 44 + 24 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap={10}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" domain={[0.5, 1]} ticks={[0.5, 0.6, 0.7, 0.8, 0.9, 1]} {...AXIS} />
            <YAxis
              type="category"
              dataKey="label"
              width={190}
              interval={0}
              {...AXIS}
              tick={{ fill: "#57534E", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.12)" }}
              content={({ active, payload }) =>
                active && payload?.length ? <TooltipBox title={payload[0].payload.label} rows={[{ label: "AUC", value: payload[0].payload.auc.toFixed(4) }]} /> : null
              }
            />
            <Bar
              isAnimationActive={false}
              dataKey="auc"
              radius={[0, 4, 4, 0]}
              label={{ position: "right", fill: "#44403C", fontSize: 12, formatter: (v: unknown) => Number(v).toFixed(4) }}
            >
              {data.map((d) => (
                <Cell key={d.label} fill={d.highlight ? OBSERVED : SINGLE} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
