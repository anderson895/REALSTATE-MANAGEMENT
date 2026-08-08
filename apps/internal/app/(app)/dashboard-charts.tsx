'use client';

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PipelineBar, PriceBar, ProjectBar, StatusSlice } from '@/lib/analytics';
import type { TrendPoint } from '@/lib/inventory-trend';

/**
 * The charts, and the only client components in the Internal system.
 *
 * Recharts measures the DOM to lay out axes, so these cannot render on the
 * server. The pages stay server components and hand down plain arrays — no
 * Firestore handle, no session, and nothing here that a browser should not
 * already be allowed to see.
 *
 * Colours are the mid-tones of each ramp rather than the 50/700 pair used by
 * the badges: a chart fill sits on both the light and the dark background
 * unchanged, so it has to be legible against either. They still map to the
 * same meanings — green available, amber held, rose sold.
 */
const TONE = {
  available: '#10b981',
  onHold: '#f59e0b',
  sold: '#f43f5e',
  brand: '#558a68',
  accent: '#0ea5e9',
} as const;

const AXIS = '#a1a1aa';

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #d4d4d8',
  fontSize: 12,
  color: '#18181b',
} as const;

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
});

/** ₱6.0M — a full peso figure is too wide to repeat down an axis. */
function compactPeso(value: number): string {
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₱${Math.round(value / 1_000)}k`;
  return `₱${value}`;
}

const axisProps = {
  stroke: AXIS,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export function InventoryDonut({ data }: { data: readonly StatusSlice[] }) {
  const fills = [TONE.available, TONE.onHold, TONE.sold];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={[...data]}
          dataKey="value"
          nameKey="name"
          innerRadius={62}
          outerRadius={92}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((slice, index) => (
            <Cell key={slice.name} fill={fills[index % fills.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${value} units`, '']} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/**
 * The donut, with the total in the middle of it.
 *
 * ── Why the legend is NOT Recharts' ──────────────────────────────────────
 *
 * `InventoryDonut` above draws its own, and it can only show a colour and a
 * name. The panel this one sits in wants a count and a percentage beside each
 * status, aligned into a column — which is a table, and a table renders better,
 * reads better to a screen reader, and needs no JavaScript. So this component
 * is the RING only; the page owns the legend beside it.
 *
 * The centre label is absolutely positioned rather than drawn as an SVG
 * `<text>`, so it inherits the page's font and can hold two lines at different
 * sizes without hand-computing baselines.
 */
export function StatusDonut({
  data,
  total,
}: {
  data: readonly StatusSlice[];
  total: number;
}) {
  const fills = [TONE.available, TONE.onHold, TONE.sold];
  // A donut of nothing renders as an invisible ring. One grey slice says
  // "no units" in the shape the reader is already looking at.
  const slices = total === 0 ? [{ name: 'No units', value: 1 }] : [...data];

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={64}
            outerRadius={88}
            paddingAngle={total === 0 ? 0 : 2}
            stroke="none"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.name} fill={total === 0 ? '#e4e4e7' : fills[index % fills.length]} />
            ))}
          </Pie>
          {total > 0 ? (
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${value} units`, '']} />
          ) : null}
        </PieChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-2xl font-bold text-navy-800">{total}</span>
        <span className="text-[11px] text-neutral-500">Total Units</span>
      </div>
    </div>
  );
}

/**
 * Six months of inventory levels.
 *
 * Available gets an area fill and the other two are plain lines, because in a
 * healthy month Available is ~150 and the others are near zero — three lines of
 * equal weight would make two of them look like the axis. The fill is what
 * separates "the stock" from "what moved".
 *
 * `connectNulls` is off and every point is a real number, so a flat line here
 * means nothing happened rather than that data is missing. The panel says which
 * of those it is; see `eventsReplayed` on the trend.
 */
export function InventoryTrendChart({ data }: { data: readonly TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <ComposedChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="availableFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TONE.available} stopOpacity={0.28} />
            <stop offset="100%" stopColor={TONE.available} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={AXIS} strokeOpacity={0.22} vertical={false} />
        <XAxis dataKey="month" {...axisProps} />
        <YAxis {...axisProps} allowDecimals={false} width={40} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${value} units`, '']} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} verticalAlign="top" height={28} />
        <Area
          type="monotone"
          dataKey="Available"
          stroke={TONE.available}
          strokeWidth={2}
          fill="url(#availableFill)"
          dot={{ r: 2.5, strokeWidth: 0, fill: TONE.available }}
        />
        <Line
          type="monotone"
          dataKey="On Hold"
          stroke={TONE.onHold}
          strokeWidth={2}
          dot={{ r: 2.5, strokeWidth: 0, fill: TONE.onHold }}
        />
        <Line
          type="monotone"
          dataKey="Sold"
          stroke={TONE.sold}
          strokeWidth={2}
          dot={{ r: 2.5, strokeWidth: 0, fill: TONE.sold }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ProjectStackedBar({ data }: { data: readonly ProjectBar[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={[...data]} margin={{ top: 8, right: 8, bottom: 8, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={AXIS} strokeOpacity={0.25} vertical={false} />
        <XAxis dataKey="project" {...axisProps} interval={0} angle={-12} textAnchor="end" height={54} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: AXIS, fillOpacity: 0.08 }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Available" stackId="units" fill={TONE.available} radius={[0, 0, 0, 0]} />
        <Bar dataKey="On Hold" stackId="units" fill={TONE.onHold} />
        <Bar dataKey="Sold" stackId="units" fill={TONE.sold} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PriceRangeBar({ data }: { data: readonly PriceBar[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={[...data]} margin={{ top: 8, right: 8, bottom: 8, left: 6 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={AXIS} strokeOpacity={0.25} vertical={false} />
        <XAxis dataKey="project" {...axisProps} interval={0} angle={-12} textAnchor="end" height={54} />
        <YAxis {...axisProps} tickFormatter={compactPeso} width={58} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: AXIS, fillOpacity: 0.08 }}
          formatter={(value) => peso.format(Number(value))}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="lowest" name="Lowest unit" fill={TONE.accent} radius={[4, 4, 0, 0]} />
        <Bar dataKey="highest" name="Highest unit" fill={TONE.brand} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PipelineChart({ data }: { data: readonly PipelineBar[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 42)}>
      <BarChart
        data={[...data]}
        layout="vertical"
        margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={AXIS} strokeOpacity={0.25} horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis type="category" dataKey="status" {...axisProps} width={140} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: AXIS, fillOpacity: 0.08 }}
          formatter={(value) => [`${value} reservation${Number(value) === 1 ? '' : 's'}`, '']}
        />
        <Bar dataKey="count" fill={TONE.brand} radius={[0, 4, 4, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
