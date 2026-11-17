import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChooseQuoteButton, DeleteQuoteButton, DeleteRequestButton, SmsDraft } from "@/components/cars/quote-buttons";
import { EmptyBox, won } from "@/components/cars/ui";
import { getDb } from "@/db";
import { findPreset, todayKst } from "@/lib/car-care";
import { documentImageUrl } from "@/lib/document-constants";
import { vehicleLabel } from "@/lib/cars";
import { firstParam, requireVehicle } from "@/lib/cars-server";
import {
  breakdownMatches,
  compareToQuote,
  distanceKm,
  isSortMode,
  MAX_RADIUS_KM,
  PART_PREF_LABEL,
  quoteDiffText,
  rankQuotes,
  SHOP_TYPE_LABEL,
  smsDraft,
  SORT_LABEL,
  SOURCE_LABEL,
  type RankedQuote,
  type SortMode,
} from "@/lib/quotes";
import { getRequest, listQuotes, listShops, serviceForQuote } from "@/lib/repairs";

export const metadata: Metadata = { title: "수리 견적 TOP 10" };

export default function QuoteResultPage(props: PageProps<"/cars/vehicles/[id]/quotes/[requestId]">) {
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
  params: PageProps<"/cars/vehicles/[id]/quotes/[requestId]">["params"];
  searchParams: PageProps<"/cars/vehicles/[id]/quotes/[requestId]">["searchParams"];
}) {
  const [{ id, requestId }, query] = await Promise.all([params, searchParams]);
  const { orgId, vehicle: v } = await requireVehicle(id);
  if (!z.uuid().safeParse(requestId).success) notFound();

  const db = getDb();
  const req = await getRequest(db, orgId, requestId);
  if (!req || req.vehicleId !== v.id) notFound();
  const [quotes, shops] = await Promise.all([listQuotes(db, orgId, requestId), listShops(db, orgId)]);

  const rawSort = firstParam(query.sort);
  const sort: SortMode = isSortMode(rawSort) ? rawSort : "price";
  const officialOnly = firstParam(query.official) === "1";
  const origin = req.originLat != null && req.originLng != null ? { lat: req.originLat, lng: req.originLng } : null;
  const today = todayKst();
  const result = rankQuotes(quotes, { origin, radiusKm: req.radiusKm, sort, officialOnly, shopTypes: req.shopTypes, today });

  const itemName = findPreset(req.itemCode)?.name ?? req.description ?? "수리";
  const base = `/cars/vehicles/${v.id}/quotes/${req.id}`;
  const href = (s: SortMode, o: boolean) => `${base}?${new URLSearchParams({ ...(s !== "price" ? { sort: s } : {}), ...(o ? { official: "1" } : {}) }).toString()}`.replace(/\?$/, "");

  // 견적이 없는 정비소: 반경 안(또는 거리를 모르는) 가족 정비소
  const quotedShopIds = new Set(quotes.map((q) => q.shopId));
  const noQuote = shops
    .filter((s) => !quotedShopIds.has(s.id))
    .map((s) => ({ ...s, dist: origin && s.lat != null && s.lng != null ? distanceKm(origin, { lat: s.lat, lng: s.lng }) : null }))
    .filter((s) => s.dist == null || s.dist <= Math.min(req.radiusKm, MAX_RADIUS_KM))
    .filter((s) => (req.shopTypes ? req.shopTypes.includes(s.type) : true))
    .sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
  const draft = smsDraft({ vehicle: vehicleLabel(v), item: itemName, description: req.itemCode ? req.description : null, partPref: req.partPref });
  const chosen = quotes.find((q) => q.id === req.chosenQuoteId) ?? null;
  const done = chosen ? await serviceForQuote(db, orgId, chosen.id) : null;
  const costDiff = chosen && done ? compareToQuote(chosen.totalAmount, done.cost) : null;

  return (
    <div className="space-y-4">
      <Link href={`/cars/vehicles/${v.id}?tab=quotes`} className="inline-block text-sm text-muted">
        ‹ {vehicleLabel(v)} 견적
      </Link>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h1 className="text-xl font-bold">{itemName}</h1>
        {req.itemCode && req.description && <p className="mt-1 whitespace-pre-line text-sm">{req.description}</p>}
        <p className="mt-1 text-xs text-muted">
          {[`부품: ${PART_PREF_LABEL[req.partPref]}`, origin ? `반경 ${req.radiusKm}km` : "내 위치 없음(거리 계산 안 함)", req.shopTypes ? req.shopTypes.map((t) => SHOP_TYPE_LABEL[t]).join("·") : "모든 유형"].join(" · ")}
        </p>
      </section>

      {chosen && (
        <section className="rounded-xl border border-accent bg-accent-soft p-3 text-sm" aria-label="선택한 견적">
          <p>
            <b>{chosen.shopName}</b> 견적 {won(chosen.totalAmount)}으로 정했어요.
          </p>
          {done ? (
            <div className="mt-2 space-y-1">
              <p className="font-semibold">
                ✓ 수리 완료{done.cost != null ? ` · 실제 ${won(done.cost)}` : ""} <span className="text-xs font-normal text-muted">({done.servicedOn})</span>
              </p>
              {costDiff && (
                <p className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${costDiff.kind === "extra" ? "bg-warn-soft text-warn" : costDiff.kind === "saved" ? "bg-ok-soft text-ok" : "bg-soft text-muted"}`}>
                  견적 {won(chosen.totalAmount)} → 실제 {won(done.cost)} · {quoteDiffText(costDiff, won)}
                </p>
              )}
              {!costDiff && <p className="text-xs text-muted">정비 기록에 실제 금액을 입력하면 견적과 비교해 드려요.</p>}
              <Link href={`/cars/vehicles/${v.id}?tab=service`} className="inline-block text-xs text-accent underline">
                정비 기록 보기
              </Link>
            </div>
          ) : (
            <Link
              href={`/cars/vehicles/${v.id}/service/new?${new URLSearchParams({ ...(req.itemCode ? { item: req.itemCode } : {}), shop: chosen.shopName, cost: String(chosen.totalAmount), quote: chosen.id }).toString()}`}
              className="mt-2 inline-block rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white"
            >
              🔧 수리를 마쳤다면 정비 기록하기 (견적과 비교)
            </Link>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2" aria-label="정렬">
        {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => (
          <Link key={s} href={href(s, officialOnly)} aria-current={sort === s ? "true" : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${sort === s ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}>
            {SORT_LABEL[s]}
          </Link>
        ))}
        <Link href={href(sort, !officialOnly)} aria-pressed={officialOnly} className={`rounded-full border px-3 py-1.5 text-sm ${officialOnly ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}>
          공식만
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-bold">
          견적 TOP {Math.min(10, result.ranked.length)} <span className="text-sm font-normal text-muted">{quotes.length}건 입력</span>
        </h2>
        <Link href={`${base}/add`} className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
          + 견적 입력
        </Link>
      </div>

      {result.ranked.length === 0 ? (
        <EmptyBox title={quotes.length === 0 ? "아직 입력한 견적이 없어요" : "조건에 맞는 견적이 없어요"} action={{ href: `${base}/add`, label: "받은 견적 입력하기" }}>
          {quotes.length === 0 ? "여러 정비소에 전화하거나 방문해 받은 견적 금액을 입력하면 최저가 순으로 비교해 드려요." : "정렬·필터를 바꾸거나 아래 반경 밖·기간 지난 견적을 확인해 보세요."}
        </EmptyBox>
      ) : (
        <ol className="space-y-2">
          {result.ranked.map((q) => (
            <QuoteCard key={q.id} q={q} requestId={req.id} vehicleId={v.id} chosen={q.id === req.chosenQuoteId} lowest={result.ranked.reduce((m, x) => Math.min(m, x.totalAmount), Infinity)} />
          ))}
        </ol>
      )}
      {result.more > 0 && <p className="text-center text-xs text-muted">TOP 10 밖의 견적이 {result.more}곳 더 있어요.</p>}
      {result.ranked.length > 0 && <p className="text-xs text-muted">※ 최저가가 최선은 아니에요. 견적은 정비소가 제시한 값이라 방문 시 달라질 수 있고, 부품 종류와 보증을 함께 비교해 주세요.</p>}

      {(result.outside.length > 0 || result.expired.length > 0 || result.filtered > 0) && (
        <section className="space-y-2 rounded-xl border border-dashed border-line p-3 text-sm" aria-label="순위에서 빠진 견적">
          <h2 className="font-bold">순위에서 빠진 견적</h2>
          {result.outside.length > 0 && (
            <p className="text-muted">
              반경 {req.radiusKm}km 밖 {result.outside.length}건: {result.outside.map((q) => `${q.shopName} ${won(q.totalAmount)} (${q.distanceKm}km)`).join(", ")}
            </p>
          )}
          {result.expired.length > 0 && (
            <p className="text-muted">
              유효기간 지남 {result.expired.length}건: {result.expired.map((q) => `${q.shopName} ${won(q.totalAmount)} (~${q.validUntil})`).join(", ")}
            </p>
          )}
          {result.filtered > 0 && <p className="text-muted">정비소 유형 조건 때문에 {result.filtered}건이 빠졌어요.</p>}
        </section>
      )}

      <section className="space-y-2" aria-label="견적이 없는 정비소">
        <h2 className="font-bold">
          견적이 아직 없는 정비소 <span className="text-sm font-normal text-muted">{noQuote.length}곳</span>
        </h2>
        {noQuote.length === 0 ? (
          <p className="text-sm text-muted">견적을 받으려는 정비소를 견적 입력 화면에서 추가하면 여기에 연락 버튼이 나타나요.</p>
        ) : (
          <ul className="space-y-2">
            {noQuote.map((s) => (
              <li key={s.id} className="rounded-xl border border-line bg-surface p-3">
                <p className="font-semibold">
                  {s.name} <span className="text-xs font-normal text-muted">{SHOP_TYPE_LABEL[s.type]}{s.dist != null ? ` · ${s.dist}km` : ""}</span>
                </p>
                {s.address && <p className="text-xs text-muted">{s.address}</p>}
                <div className="mt-2">
                  <SmsDraft phone={s.phone} text={draft} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-end">
        <DeleteRequestButton id={req.id} vehicleId={v.id} />
      </div>
    </div>
  );
}

function QuoteCard({ q, requestId, vehicleId, chosen, lowest }: { q: RankedQuote; requestId: string; vehicleId: string; chosen: boolean; lowest: number }) {
  const match = breakdownMatches(q);
  const diff = q.totalAmount - lowest;
  return (
    <li className={`rounded-xl border bg-surface p-3 ${chosen ? "border-accent" : "border-line"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${q.rank === 1 ? "bg-accent text-white" : "bg-soft"}`}>{q.rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 font-bold">
              {q.shopName} <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-normal text-muted">{SHOP_TYPE_LABEL[q.shopType]}</span>
            </p>
            <p className="shrink-0 text-lg font-bold">{won(q.totalAmount)}</p>
          </div>
          <p className="text-xs text-muted">
            {[
              q.distanceKm != null ? `${q.distanceKm}km` : "거리 미확인",
              q.partType ? `부품 ${q.partType}` : null,
              q.warrantyMonths != null ? `보증 ${q.warrantyMonths}개월` : "보증 정보 없음",
              SOURCE_LABEL[q.source],
              q.validUntil ? `~${q.validUntil}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {diff > 0 && <p className="text-xs text-muted">최저가보다 {won(diff)} 비싸요</p>}
          {(q.partsAmount != null || q.laborAmount != null || q.taxAmount != null) && (
            <p className="text-xs text-muted">
              {[q.partsAmount != null ? `부품 ${won(q.partsAmount)}` : null, q.laborAmount != null ? `공임 ${won(q.laborAmount)}` : null, q.taxAmount != null ? `부가세 ${won(q.taxAmount)}` : null].filter(Boolean).join(" · ")}
              {match === false && <span className="text-bad"> (합계가 총액과 달라요)</span>}
            </p>
          )}
          {q.note && <p className="mt-1 whitespace-pre-line text-sm">{q.note}</p>}
          {q.documentId && q.documentImageId && (
            <Link href={`/cars/vehicles/${vehicleId}/statements/${q.documentId}`} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-line bg-soft p-1.5 pr-3 text-xs font-semibold">
              {/* 비공개 저장소의 사진이라 로그인 확인을 거치는 경로를 쓴다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={documentImageUrl(q.documentImageId)} alt={`${q.shopName} 견적서`} loading="lazy" className="size-12 rounded object-cover" />
              견적서 {q.documentImageCount}장 보기
            </Link>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ChooseQuoteButton requestId={requestId} quoteId={q.id} chosen={chosen} />
            <Link href={`/cars/vehicles/${vehicleId}/statements/new?kind=quote&quote=${q.id}`} className="min-h-9 rounded-lg border border-line px-3 py-2 text-xs font-semibold">
              📎 {q.documentId ? "견적서 바꾸기" : "견적서 첨부"}
            </Link>
            {q.phone && (
              <a href={`tel:${q.phone.replace(/[^0-9+]/g, "")}`} className="min-h-9 rounded-lg border border-line px-3 py-2 text-xs font-semibold">
                📞 전화
              </a>
            )}
            <DeleteQuoteButton id={q.id} label={q.shopName} />
          </div>
        </div>
      </div>
    </li>
  );
}
