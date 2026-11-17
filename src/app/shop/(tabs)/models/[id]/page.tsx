import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { ImageGallery } from "@/components/shop/image-gallery";
import { TrimSection } from "@/components/shop/trim-section";
import { getDb } from "@/db";
import { ICE_FUEL_LABEL } from "@/lib/car-draft";
import { formatPriceRange } from "@/lib/format";
import { getModelDetail, type ModelDetail } from "@/lib/model-detail";
import { myWishlistByTrim } from "@/lib/wishlist";
import type { Powertrain } from "@/lib/powertrain";

export const metadata: Metadata = { title: "모델 상세" };

const POWERTRAIN_BADGE: Record<Powertrain, { label: string; className: string }> = {
  ev: { label: "전기차", className: "bg-ok-soft text-ok" },
  hev: { label: "하이브리드(HEV)", className: "bg-warn-soft text-warn" },
  phev: { label: "플러그인 하이브리드", className: "bg-warn-soft text-warn" },
  ice: { label: "내연기관", className: "bg-soft text-muted" },
};

export default function ModelDetailPage(props: PageProps<"/shop/models/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailContent params={props.params} />
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="aspect-[16/10] animate-pulse rounded-xl bg-soft" />
      <div className="h-8 w-2/3 animate-pulse rounded bg-soft" />
      <div className="h-40 animate-pulse rounded-xl bg-soft" />
    </div>
  );
}

async function DetailContent({ params }: { params: PageProps<"/shop/models/[id]">["params"] }) {
  const [{ userId, orgId }, { id }] = await Promise.all([auth(), params]);
  if (!userId || !orgId) redirect("/");
  if (!z.uuid().safeParse(id).success) notFound();

  let detail: ModelDetail | null;
  try {
    detail = await getModelDetail(getDb(), orgId, id);
  } catch (error) {
    console.error("[model detail] 불러오기 실패:", error);
    return (
      <p role="alert" className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        모델 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }
  if (!detail) notFound();

  // 내가 이미 관심 목록에 담은 트림(하트 표시용). 못 불러와도 상세 화면은 보여 준다
  const wishlistEntries = await myWishlistByTrim(getDb(), orgId, userId, detail.trims.map((t) => t.id)).catch(() => ({}));

  const badge = POWERTRAIN_BADGE[detail.powertrain];
  const meta = [
    detail.segment,
    detail.releaseYear ? `${detail.releaseYear}년` : null,
    detail.powertrain === "ice" && detail.iceFuel ? ICE_FUEL_LABEL[detail.iceFuel] : null,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <Link href="/shop/explore" className="inline-block text-sm text-muted">
        ‹ 탐색으로
      </Link>

      <section className="space-y-2">
        <ImageGallery
          images={detail.images.map(({ id: imageId, url, kind, caption }) => ({ id: imageId, url, kind, caption }))}
          alt={`${detail.brandName} ${detail.name}`}
        />
        <Link
          href={`/shop/models/${detail.id}/images`}
          className="inline-block rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold"
        >
          🖼 이미지 추가·관리
        </Link>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
          <span className="text-sm text-muted">{detail.brandName}</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-2xl font-bold">{detail.name}</h1>
          <p className="shrink-0 font-bold">{formatPriceRange(detail.priceMin, detail.priceMax)}</p>
        </div>
        {meta.length > 0 && <p className="text-sm text-muted">{meta.join(" · ")}</p>}
        {detail.summary && <p className="text-sm leading-relaxed">{detail.summary}</p>}
      </section>

      <TrimSection powertrain={detail.powertrain} trims={detail.trims} wishlistEntries={wishlistEntries} />

      <section aria-label="다음 단계">
        <button
          type="button"
          disabled
          title="준비 중"
          className="min-h-11 w-full rounded-xl border border-line bg-surface text-sm opacity-50"
        >
          노션에 저장 (준비 중)
        </button>
      </section>
    </div>
  );
}
