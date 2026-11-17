import Link from "next/link";
import { formatDday, type DueLevel, type UpcomingItem } from "@/lib/car-care";
import type { Powertrain } from "@/lib/powertrain";

export const PT_BADGE: Record<Powertrain, { label: string; className: string }> = {
  ev: { label: "전기차", className: "bg-ok-soft text-ok" },
  hev: { label: "HEV", className: "bg-warn-soft text-warn" },
  phev: { label: "PHEV", className: "bg-warn-soft text-warn" },
  ice: { label: "내연", className: "bg-soft text-muted" },
};

const LEVEL_STYLE: Record<DueLevel, string> = {
  overdue: "bg-bad-soft text-bad",
  urgent: "bg-bad-soft text-bad",
  soon: "bg-warn-soft text-warn",
  later: "bg-soft text-muted",
};

export function won(n: number | null | undefined): string {
  return n == null ? "-" : `${n.toLocaleString("ko-KR")}원`;
}

export function km(n: number | null | undefined): string {
  return n == null ? "-" : `${n.toLocaleString("ko-KR")}km`;
}

export function EmptyBox({ title, children, action }: { title: string; children?: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center">
      <h3 className="font-bold">{title}</h3>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
      {action && (
        <Link href={action.href} className="mt-3 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}

/** 일정 한 줄: D-day 배지 + 제목 + 설명 */
export function UpcomingRow({ item, showVehicle = true }: { item: UpcomingItem; showVehicle?: boolean }) {
  const badge =
    item.days == null ? "주행거리 기준" : item.level === "overdue" ? `지남 ${formatDday(item.days)}` : formatDday(item.days);
  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3">
      <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${LEVEL_STYLE[item.level]}`}>{badge}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{item.title}</p>
        <p className="text-xs text-muted">
          {showVehicle && `${item.vehicleLabel} · `}
          {item.detail}
        </p>
      </div>
      <Link
        href={
          item.kind === "insurance"
            ? `/cars/vehicles/${item.vehicleId}/insurance/new`
            : `/cars/vehicles/${item.vehicleId}/service/new`
        }
        className="shrink-0 self-center rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold"
      >
        {item.kind === "insurance" ? "갱신 기록" : "정비 기록"}
      </Link>
    </li>
  );
}
