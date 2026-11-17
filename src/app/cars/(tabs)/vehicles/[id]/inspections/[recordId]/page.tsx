import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DeleteRecordButton } from "@/components/cars/forms";
import { NotionSaveButton } from "@/components/notion-save-button";
import { km } from "@/components/cars/ui";
import { getDb } from "@/db";
import { findPreset } from "@/lib/car-care";
import { vehicleLabel } from "@/lib/cars";
import { requireVehicle } from "@/lib/cars-server";
import { STATUS_ICON, STATUS_LABEL, serviceLink, type InspectionStatus } from "@/lib/inspection";
import { getInspection } from "@/lib/inspections";
import { notionSavedUrls } from "@/lib/notion-sync";

export const metadata: Metadata = { title: "점검 결과" };

export default function InspectionDetailPage(props: PageProps<"/cars/vehicles/[id]/inspections/[recordId]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <Content params={props.params} />
    </Suspense>
  );
}

const ORDER: InspectionStatus[] = ["replace", "warn", "ok", "na"];
const TONE: Record<InspectionStatus, string> = { ok: "text-ok", warn: "text-warn", replace: "text-bad", na: "text-muted" };

async function Content({ params }: { params: PageProps<"/cars/vehicles/[id]/inspections/[recordId]">["params"] }) {
  const { id, recordId } = await params;
  const { orgId, vehicle: v } = await requireVehicle(id);
  if (!z.uuid().safeParse(recordId).success) notFound();
  const rec = await getInspection(getDb(), orgId, recordId);
  if (!rec || rec.vehicleId !== v.id) notFound();

  const saved = await notionSavedUrls(getDb(), orgId, "inspection_record", [rec.id]).catch(() => ({}) as Record<string, string>);
  const groups = ORDER.map((st) => ({ st, items: rec.items.filter((i) => i.status === st) })).filter((g) => g.items.length > 0);
  const problems = rec.items.filter((i) => i.status === "warn" || i.status === "replace").length;

  return (
    <div className="space-y-4">
      <Link href={`/cars/vehicles/${v.id}?tab=inspection`} className="inline-block text-sm text-muted">
        ‹ {vehicleLabel(v)} 점검
      </Link>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h1 className="text-xl font-bold">
          {rec.overallStatus ? STATUS_ICON[rec.overallStatus] : "⚪"} {rec.isSelfCheck ? "셀프 점검" : "정비소 점검"}
        </h1>
        <p className="text-sm text-muted">
          {[rec.inspectedOn, rec.mileageKm != null ? km(rec.mileageKm) : null, rec.place].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-2 text-sm">
          {problems > 0 ? <b className="text-bad">확인이 필요한 항목 {problems}개</b> : <span className="text-ok">문제 없이 끝났어요</span>} · 점검 {rec.items.length}개
        </p>
        {rec.memo && <p className="mt-2 whitespace-pre-line rounded-lg bg-soft px-3 py-2 text-sm">{rec.memo}</p>}
      </section>

      {groups.map((g) => (
        <section key={g.st} className="space-y-2" aria-label={STATUS_LABEL[g.st]}>
          <h2 className={`font-bold ${TONE[g.st]}`}>
            {STATUS_ICON[g.st]} {STATUS_LABEL[g.st]} <span className="text-sm font-normal text-muted">{g.items.length}개</span>
          </h2>
          <ul className="space-y-2">
            {g.items.map((it) => (
              <li key={it.id} className="rounded-xl border border-line bg-surface p-3">
                <p className="font-semibold">{it.itemName}</p>
                {it.category && <p className="text-xs text-muted">{it.category}</p>}
                {it.note && <p className="mt-1 whitespace-pre-line text-sm">{it.note}</p>}
                {(g.st === "replace" || g.st === "warn") && it.itemCode && findPreset(it.itemCode) && (
                  <Link href={serviceLink(v.id, it.itemCode)} className="mt-2 inline-block rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-accent">
                    🔧 정비 기록하기
                  </Link>
                )}
                {(g.st === "replace" || g.st === "warn") && it.itemCode && findPreset(it.itemCode) && (
                  <Link href={`/cars/vehicles/${v.id}/quotes/new?item=${encodeURIComponent(it.itemCode)}`} className="ml-2 mt-2 inline-block rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
                    💸 견적 받기
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <NotionSaveButton entityType="inspection_record" entityId={rec.id} savedUrl={saved[rec.id]} />
        <DeleteRecordButton id={rec.id} vehicleId={v.id} type="inspection" label="점검 기록" />
      </div>
    </div>
  );
}
