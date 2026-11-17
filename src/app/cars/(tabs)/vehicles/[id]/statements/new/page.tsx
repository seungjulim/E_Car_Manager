import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { StatementUploader } from "@/components/cars/statement-uploader";
import { won } from "@/components/cars/ui";
import { getDb } from "@/db";
import { vehicleLabel } from "@/lib/cars";
import { firstParam, requireVehicle } from "@/lib/cars-server";
import { isDocumentKind, type DocumentKind } from "@/lib/document-constants";
import { getQuoteBrief, getRequest } from "@/lib/repairs";

export const metadata: Metadata = { title: "수리내역서 첨부" };

export default function NewStatementPage(props: PageProps<"/cars/vehicles/[id]/statements/new">) {
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
  params: PageProps<"/cars/vehicles/[id]/statements/new">["params"];
  searchParams: PageProps<"/cars/vehicles/[id]/statements/new">["searchParams"];
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { orgId, vehicle: v } = await requireVehicle(id);
  // 견적에 연결하려는 경우: 이 가족·이 차량의 견적일 때만 인정한다
  const rawQuote = firstParam(query.quote);
  const quote = rawQuote && z.uuid().safeParse(rawQuote).success ? await getQuoteBrief(getDb(), orgId, rawQuote) : null;
  const forQuote = quote && quote.vehicleId === v.id ? quote : null;
  // 견적서 사진을 먼저 올린 뒤 AI 로 읽어 새 견적을 만드는 경우: 이 가족·이 차량의 견적 요청일 때만 인정한다
  const rawReq = firstParam(query.request);
  const reqFound = !forQuote && rawReq && z.uuid().safeParse(rawReq).success ? await getRequest(getDb(), orgId, rawReq) : null;
  const forRequest = reqFound && reqFound.vehicleId === v.id ? reqFound : null;
  const defaultKind = isDocumentKind(firstParam(query.kind)) ? (firstParam(query.kind) as DocumentKind) : "repair_statement";
  return (
    <div className="space-y-4">
      <Link href={forQuote ? `/cars/vehicles/${v.id}/quotes/${forQuote.requestId}` : forRequest ? `/cars/vehicles/${v.id}/quotes/${forRequest.id}` : `/cars/vehicles/${v.id}?tab=service`} className="inline-block text-sm text-muted">
        ‹ {forQuote || forRequest ? "견적 비교" : `${vehicleLabel(v)} 정비`}
      </Link>
      <div>
        <h1 className="text-xl font-bold">{forQuote ? "견적서 사진 첨부" : forRequest ? "견적서 사진으로 입력" : "수리내역서 첨부"}</h1>
        {forQuote ? (
          <p className="mt-1 text-sm text-muted">
            <b>{forQuote.shopName}</b> 견적({won(forQuote.totalAmount)})에 견적서 사진을 연결해요.{forQuote.documentId ? " 이미 첨부한 사진이 있어서, 새로 올리면 이전 사진은 지워져요." : ""}
          </p>
        ) : forRequest ? (
          <p className="mt-1 text-sm text-muted">받은 견적서를 사진으로 올리면 AI가 정비소·금액·보증을 읽어 견적 입력칸을 채워 줘요. 올린 뒤 내용을 확인하고 저장해 주세요.</p>
        ) : (
          <p className="mt-1 text-sm text-muted">수리 후 받은 내역서·견적서·영수증을 사진으로 남겨요. 올린 뒤 AI가 내용을 읽어 정비 기록으로 만들어 줘요.</p>
        )}
      </div>
      <StatementUploader
        vehicleId={v.id}
        orgId={orgId}
        defaultKind={forRequest ? "quote" : defaultKind}
        lockKind={!!forRequest}
        quoteId={forQuote?.id}
        redirectTo={forQuote ? `/cars/vehicles/${v.id}/quotes/${forQuote.requestId}` : forRequest ? `/cars/vehicles/${v.id}/quotes/${forRequest.id}/add?doc={id}` : undefined}
      />
    </div>
  );
}
