import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { QuoteForm } from "@/components/cars/quote-forms";
import { getDb } from "@/db";
import { firstParam, requireVehicle } from "@/lib/cars-server";
import { getDocument } from "@/lib/documents";
import { parseStoredQuoteDraft } from "@/lib/quote-extract";
import { distanceKm } from "@/lib/quotes";
import { getRequest, listShops, quoteForDocument } from "@/lib/repairs";

export const metadata: Metadata = { title: "견적 입력" };

export default function AddQuotePage(props: PageProps<"/cars/vehicles/[id]/quotes/[requestId]/add">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <Content params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/cars/vehicles/[id]/quotes/[requestId]/add">["params"];
  searchParams: PageProps<"/cars/vehicles/[id]/quotes/[requestId]/add">["searchParams"];
}) {
  const [{ id, requestId }, query] = await Promise.all([params, searchParams]);
  const { orgId, vehicle: v } = await requireVehicle(id);
  if (!z.uuid().safeParse(requestId).success) notFound();
  const db = getDb();
  const [req, shops] = await Promise.all([getRequest(db, orgId, requestId), listShops(db, orgId)]);
  if (!req || req.vehicleId !== v.id) notFound();

  // 사진으로 입력하는 경우: 이 차량의 견적서이고 아직 어떤 견적에도 붙지 않은 서류만 쓴다
  const rawDoc = firstParam(query.doc);
  const doc = rawDoc && z.uuid().safeParse(rawDoc).success ? await getDocument(db, orgId, rawDoc) : null;
  const usable = doc && doc.kind === "quote" && doc.vehicleId === v.id && !(await quoteForDocument(db, orgId, doc.id)) ? doc : null;

  const origin = req.originLat != null && req.originLng != null ? { lat: req.originLat, lng: req.originLng } : null;
  const options = shops
    .map((s) => ({ id: s.id, name: s.name, type: s.type, distanceKm: origin && s.lat != null && s.lng != null ? distanceKm(origin, { lat: s.lat, lng: s.lng }) : null }))
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || a.name.localeCompare(b.name, "ko"));

  return (
    <div className="space-y-4">
      <Link href={`/cars/vehicles/${v.id}/quotes/${req.id}`} className="inline-block text-sm text-muted">
        ‹ 견적 비교
      </Link>
      <h1 className="text-xl font-bold">받은 견적 입력</h1>
      {!usable && (
        <Link href={`/cars/vehicles/${v.id}/statements/new?request=${req.id}`} className="flex min-h-12 items-center justify-center rounded-xl border border-accent font-semibold text-accent">
          📷 견적서 사진으로 입력 (AI가 읽어 줘요)
        </Link>
      )}
      <QuoteForm
        requestId={req.id}
        shops={options}
        document={usable ? { id: usable.id, imageIds: usable.images.map((i) => i.id), draft: parseStoredQuoteDraft(usable.ocrJson) } : undefined}
      />
    </div>
  );
}
