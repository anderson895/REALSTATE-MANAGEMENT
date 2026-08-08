import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowUpRight,
  Boxes,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleParking,
  FileBarChart,
  Megaphone,
  Plus,
  Upload,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Money } from '@sfsr/domain';
import type { AnnouncementRow } from '@sfsr/infrastructure/server';
import { ProjectPlaceholder, cloudinaryUrl, cn } from '@sfsr/ui';
import type { AnalyticsSnapshot, ProjectRow } from '@/lib/analytics';
import type { InventoryTrend } from '@/lib/inventory-trend';
import { AnnouncementsPanel } from './announcements-panel';
import { InventoryTrendChart, StatusDonut } from './dashboard-charts';
import { DashboardRefresh } from './dashboard-refresh';

/**
 * The inventory dashboard — the landing screen for every role whose department
 * does not have one of its own.
 *
 * Documentation and Billing branch away in `page.tsx` to their queues, because
 * INTERNAL.xls draws those separately and a verification clerk opens on work,
 * not on stock.
 *
 * ── Who reaches this, and who does not ───────────────────────────────────
 *
 * Only a role holding UNIT_INVENTORY: Marketing, Sales and Account Receivables.
 * Everyone else lands on `ModuleLauncher`.
 *
 * That was not true until it was pointed out. Every non-queue role landed here,
 * and five of the eight hold no grant over stock at all — Accounting, Cash,
 * Legal, Loans and IT. The last one is the one that mattered: note.txt strips
 * the administrator of the business on purpose, "restrict sales, restrict
 * finance", and this page was showing it the unit count, the highest unit price
 * and a per-project sales breakdown regardless. The matrix was right; the
 * landing page simply never asked it.
 *
 * ── Within it, each action is drawn from its own permission ──────────────
 *
 * Not from the role, so this component never has to know who Marketing is:
 * `canAddStock` is `create` on UNIT_INVENTORY, `canPostAnnouncement` is
 * `create` on ADVERTISEMENT. A Sales Agent gets the same figures with no
 * buttons under them, which is exactly what view-and-print means.
 *
 * ── What is deliberately not on here ─────────────────────────────────────
 *
 * Percentage-change badges beside each headline number. The mockup has them
 * ("+12%", "+8%"), they look excellent, and there is nothing in this system to
 * compute them from — no snapshot of last month's project count exists. The
 * slot holds a figure that is true instead.
 */
export function InventoryDashboard({
  data,
  trend,
  announcements,
  canAddStock,
  canPostAnnouncement,
  canSeeReports,
}: {
  data: AnalyticsSnapshot;
  trend: InventoryTrend;
  announcements: readonly AnnouncementRow[];
  canAddStock: boolean;
  canPostAnnouncement: boolean;
  canSeeReports: boolean;
}) {
  const parkingFree = data.projects.reduce((n, p) => n + p.availableParking, 0);

  return (
    <div className="space-y-5">
      {/* ─────────────────────────────────────────── headline figures ── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Building2}
          tone="sky"
          label="Projects"
          value={String(data.projectCount)}
          caption="Total active projects"
        />
        <Kpi
          icon={Boxes}
          tone="emerald"
          label="Units"
          value={String(data.totalUnits)}
          caption="Total units in inventory"
          chip={data.totalUnits > 0 ? `${pct(data.available, data.totalUnits)}% free` : undefined}
        />
        <Kpi
          icon={CircleParking}
          tone="violet"
          label="Parking Slots"
          value={String(data.totalParking)}
          caption="Total parking slots"
          chip={data.totalParking > 0 ? `${parkingFree} free` : undefined}
        />
        <Kpi
          icon={Wallet}
          tone="amber"
          label="Highest Unit Price"
          value={Money.fromCentavos(data.highestPriceCentavos).format()}
          caption="Premium offering"
        />
      </section>

      {/* ──────────────────────────── status, trend and quick actions ── */}
      <section className="grid gap-5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-4"
          title="Unit Inventory by Status"
          action={<DashboardRefresh generatedAt={data.generatedAt} />}
        >
          <div className="grid grid-cols-[minmax(0,150px)_1fr] items-center gap-4">
            <StatusDonut data={data.inventoryMix} total={data.totalUnits} />

            {/*
             * A table, not the chart's own legend. Recharts can draw a colour
             * and a name; this column needs a count and a share as well, lined
             * up — which is what a table is for, and it reads correctly to a
             * screen reader with no JavaScript involved.
             */}
            <dl className="space-y-3">
              {(
                [
                  ['Available', data.available, 'bg-emerald-500'],
                  ['On Hold', data.onHold, 'bg-amber-500'],
                  ['Sold', data.sold, 'bg-rose-500'],
                ] as const
              ).map(([label, count, dot]) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                  <dt className="flex-1 text-xs text-neutral-600">{label}</dt>
                  <dd className="tabular text-sm font-semibold text-navy-800">{count}</dd>
                  <dd className="tabular w-11 text-right text-[11px] text-neutral-400">
                    {data.totalUnits === 0 ? '—' : `${pct(count, data.totalUnits)}%`}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>

        <Panel className="lg:col-span-5" title="Inventory Trend (Last 6 Months)">
          {trend.eventsReplayed === 0 ? (
            /*
             * Not a chart of nothing.
             *
             * With no unit movements recorded, every month is today's position
             * repeated — which is TRUE, and drawn as six confident points it
             * would read as six months of measured history. Saying so is the
             * only honest thing this panel can do until the audit trail has
             * something in it.
             */
            <div className="flex h-[210px] flex-col items-center justify-center px-6 text-center">
              <CalendarClock
                className="mb-2 h-6 w-6 text-neutral-300"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-navy-800">Not enough history yet</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">
                This is rebuilt from the audit trail — every hold, sale and release. Nothing has
                moved in the last six months, so there is no line to draw.
              </p>
            </div>
          ) : (
            <>
              <InventoryTrendChart data={trend.points} />
              <p className="mt-1 text-[11px] text-neutral-400">
                Reconstructed from {trend.eventsReplayed} audit{' '}
                {trend.eventsReplayed === 1 ? 'entry' : 'entries'}
                {trend.truncated ? ' — capped, so the oldest months are approximate' : ''}.
              </p>
            </>
          )}
        </Panel>

        {/* The one dark panel on the page, so the actions read as actions
            rather than as a fourth card of figures. */}
        <section className="overflow-hidden rounded-xl bg-navy-900 shadow-sm lg:col-span-3">
          <header className="border-b border-white/10 px-5 py-3.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-white">
              Quick Actions
            </h2>
          </header>
          <div className="space-y-2 p-3">
            {canAddStock ? (
              <>
                <Action href="/inventory" icon={Building2} label="Add New Project" />
                <Action href="/inventory" icon={Plus} label="Add New Unit" />
              </>
            ) : (
              <Action href="/inventory" icon={Boxes} label="Browse Unit Inventory" />
            )}

            {/* Its own grant, not bundled with stock. Marketing holds both, so
                they look the same today — and the day somebody is given one
                without the other, this stays correct without being revisited. */}
            {canPostAnnouncement ? (
              <Action href="/announcements" icon={Megaphone} label="Post an Announcement" />
            ) : null}

            {/*
             * Bulk import is on the mockup and does not exist. Drawn, disabled
             * and labelled — a link that 404s is worse than a button that says
             * it is not ready, and silently dropping it from the design leaves
             * nobody knowing it was ever asked for.
             */}
            <span className="flex cursor-not-allowed items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2.5 text-sm text-white/40">
              <Upload className="h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              <span className="flex-1">Bulk Unit Import</span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                Soon
              </span>
            </span>

            {canSeeReports ? (
              <Action href="/reports" icon={FileBarChart} label="View Reports" />
            ) : null}
          </div>
        </section>
      </section>

      {/* ─────────────────────────────── by project, and what is new ── */}
      <section className="grid gap-5 lg:grid-cols-12">
        <Panel className="lg:col-span-8" title="Unit Inventory by Project" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                  <th scope="col" className="px-5 py-2.5 font-semibold">Project</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold text-emerald-600">Available</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold text-amber-600">On Hold</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold text-rose-500">Sold</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Parking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.projects.map((project) => (
                  <ProjectRowCells key={project.id} project={project} />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Shared with the ModuleLauncher landing, so a Cash Clerk and a
            Marketing Staff read the same notice in the same shape. */}
        <AnnouncementsPanel announcements={announcements} className="lg:col-span-4" />
      </section>
    </div>
  );
}

/** Whole percent. `Math.round` so Available 149/150 reads 99, not 99.333. */
function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

const KPI_TONES = {
  sky: 'bg-sky-50 text-sky-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  violet: 'bg-violet-50 text-violet-700',
  amber: 'bg-amber-50 text-amber-700',
} as const;

function Kpi({
  icon: Icon,
  tone,
  label,
  value,
  caption,
  chip,
}: {
  icon: LucideIcon;
  tone: keyof typeof KPI_TONES;
  label: string;
  value: string;
  caption: string;
  /**
   * The corner slot the mockup fills with a growth percentage.
   *
   * Given a figure that is TRUE instead — how much of the stock is free, how
   * many bays are open. There is no stored history of last month's totals, so a
   * "+12%" here would be decoration pretending to be measurement.
   */
  chip?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            KPI_TONES[tone],
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={1.9} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-neutral-500">{label}</p>
            {chip ? (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden="true" />
                {chip}
              </span>
            ) : null}
          </div>
          <p className="tabular mt-0.5 truncate text-xl font-bold text-navy-800">{value}</p>
          <p className="mt-0.5 truncate text-[11px] text-neutral-400">{caption}</p>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200/80 px-5 py-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">{title}</h2>
        {action}
      </header>
      <div className={bodyClassName ?? 'px-5 py-4'}>{children}</div>
    </section>
  );
}

function Action({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={{ pathname: href }}
      className="flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2.5 text-sm text-white transition-colors hover:bg-white/12"
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}

/**
 * One project's row, with a bar under each count.
 *
 * The bar is scaled to the PROJECT's own total rather than to the largest
 * project on the page, so a full green bar means "all of this project's units
 * are free" and not "more than anybody else's". The five projects hold thirty
 * units each today, which makes the two scalings identical and would have
 * hidden the difference until the sixth project was added at a different size.
 */
function ProjectRowCells({ project }: { project: ProjectRow }) {
  const total = project.available + project.onHold + project.sold;

  return (
    <tr className="transition-colors hover:bg-navy-50/40">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-neutral-100">
            {project.heroImageUrl ? (
              <Image
                src={cloudinaryUrl(project.heroImageUrl, { width: 64, height: 64, crop: 'fill' })}
                alt=""
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : (
              <ProjectPlaceholder name={project.name} />
            )}
          </span>
          <span className="min-w-0">
            <Link
              href={{ pathname: '/inventory', search: `project=${encodeURIComponent(project.id)}` }}
              className="block truncate text-sm font-medium text-neutral-800 hover:text-navy-700 hover:underline"
            >
              {project.name}
            </Link>
            <span className="text-[10px] text-neutral-400">{project.id}</span>
          </span>
        </div>
      </td>

      <CountCell value={project.available} total={total} bar="bg-emerald-500" />
      <CountCell value={project.onHold} total={total} bar="bg-amber-500" />
      <CountCell value={project.sold} total={total} bar="bg-rose-500" />

      <td className="px-4 py-3">
        <span className="tabular text-sm text-neutral-700">
          {project.availableParking}/{project.totalParking}
        </span>
        <Bar
          value={project.availableParking}
          total={project.totalParking}
          className="bg-navy-700"
        />
      </td>
    </tr>
  );
}

function CountCell({ value, total, bar }: { value: number; total: number; bar: string }) {
  return (
    <td className="px-4 py-3">
      <span className={cn('tabular text-sm', value > 0 ? 'text-neutral-800' : 'text-neutral-300')}>
        {value}
      </span>
      <Bar value={value} total={total} className={bar} />
    </td>
  );
}

function Bar({ value, total, className }: { value: number; total: number; className: string }) {
  const width = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <span aria-hidden="true" className="mt-1.5 block h-1 w-full rounded-full bg-neutral-100">
      <span className={cn('block h-1 rounded-full', className)} style={{ width: `${width}%` }} />
    </span>
  );
}
