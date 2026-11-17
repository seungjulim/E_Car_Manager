import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DeleteDocumentButton as DeleteButton } from "@/components/cars/delete-document-button";
import { StatementReview } from "@/components/cars/statement-review";
import { QuoteDocReview } from "@/components/cars/quote-forms";
import { won } from "@/components/cars/ui";
import { getDb } from "@/db";
import { presetsFor, todayKst } from "@/lib/car-care";
import { vehicleLabel } from "@/lib/cars";
import { requireVehicle } from "@/lib/cars-server";
import { DOCUMENT_KIND_LABEL, documentImageUrl, isDocumentKind } from "@/lib/document-constants";
import { getDocument } from "@/lib/documents";
import { chosenQuotesFor, quoteForDocument } from "@/lib/repairs";
import { parseStoredQuoteDraft } from "@/lib/quote-extract";
import { parseStoredDraft } from "@/lib/statement-extract";
import { deleteDocumentAction } from "@/app/cars/(tabs)/statement-actions";

export const metadata: Metadata = { title: "서류" };

export default function StatementDetailPage(props: PageProps<"/cars/vehicles/[id]/statements/[docId]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/cars/vehicles/[id]/statements/[docId]">["params"] }) {
  const { id, docId } = await params;
  const { orgId, vehicle: v } = await requireVehicle(id);
  if (!z.uuid().safeParse(docId).success) notFound();
  const doc = await getDocument(getDb(), orgId, docId);
  if (!doc || doc.vehicleId !== v.id) notFound();

  const isQuote = doc.kind === "quote";
  const quote = isQuote ? await quoteForDocument(getDb(), orgId, doc.id) : null;
  const chosenQuotes = isQuote || doc.serviceRecordId ? [] : await chosenQuotesFor(getDb(), orgId, v.id);
  const kind = isDocumentKind(doc.kind) ? DOCUMENT_KIND_LABEL[doc.kind] : "서류";
  const presets = presetsFor(v.powertrain).map((p) => ({ itemCode: p.itemCode, name: p.name }));

  return (
    <div className="space-y-4">
      <Link href={`/cars/vehicles/${v.id}?tab=service`} className="inline-block text-sm text-muted">
        ‹ {vehicleLabel(v)} 정비
      </Link>
      <h1 className="text-xl font-bold">{kind}</h1>

      <section className="grid grid-cols-2 gap-2" aria-label="첨부한 사진">
        {doc.images.map((img, i) => (
          <a key={img.id} href={documentImageUrl(img.id)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-line bg-soft">
            {/* 비공개 저장소의 사진이라 로그인 확인을 거치는 경로를 쓴다(최적화 대상 아님) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={documentImageUrl(img.id)} alt={`${kind} ${i + 1}번째 사진`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
          </a>
        ))}
      </section>
      <p className="text-xs text-muted">사진을 누르면 크게 볼 수 있어요. 우리 가족 구성원만 볼 수 있어요.</p>

      {isQuote ? (
        <section className="rounded-xl border border-line bg-surface p-3 text-sm">
          {quote ? (
            <>
              <p>
                <b>{quote.shopName}</b> 견적({won(quote.totalAmount)})에 연결된 견적서예요.
              </p>
              <Link href={`/cars/vehicles/${v.id}/quotes/${quote.requestId}`} className="mt-1 inline-block text-xs text-accent underline">
                견적 비교 보기
              </Link>
              <div className="mt-3 border-t border-line pt-3">
                <QuoteDocReview quoteId={quote.quoteId} documentId={doc.id} current={quote} initialDraft={parseStoredQuoteDraft(doc.ocrJson)} />
              </div>
            </>
          ) : (
            <p className="text-muted">아직 어떤 견적에도 연결되지 않은 견적서예요. 견적 비교 화면에서 견적을 골라 사진을 첨부해 주세요.</p>
          )}
        </section>
      ) : doc.serviceRecordId ? (
        <section className="rounded-xl border border-ok bg-ok-soft p-3 text-sm">
          <p className="font-semibold text-ok">✓ 정비 기록에 연결돼 있어요</p>
          <Link href={`/cars/vehicles/${v.id}?tab=service`} className="mt-1 inline-block text-xs text-accent underline">
            정비 기록 보기
          </Link>
        </section>
      ) : (
        <StatementReview documentId={doc.id} presets={presets} initialDraft={parseStoredDraft(doc.ocrJson)} today={todayKst()} currentKm={v.currentMileageKm} quotes={chosenQuotes} />
      )}

      <form action={deleteDocumentAction} className="flex justify-end">
        <input type="hidden" name="id" value={doc.id} />
        <input type="hidden" name="vehicleId" value={v.id} />
        <DeleteButton />
      </form>
    </div>
  );
}
