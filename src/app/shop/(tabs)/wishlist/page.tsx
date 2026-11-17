import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { CompareToggle } from "@/components/shop/compare-basket";
import { WishlistButton } from "@/components/shop/wishlist-button";
import { WishlistEntryEditor } from "@/components/shop/wishlist-entry-editor";
import { getDb } from "@/db";
import { formatManwon } from "@/lib/format";
import { displayName, getMemberNames } from "@/lib/members";
import { priceAfterSubsidy } from "@/lib/compare";
import { listWishlistGroups, type WishlistGroup } from "@/lib/wishlist";
import { WISHLIST_STATUS_LABEL } from "@/lib/wishlist-constants";

export const metadata: Metadata = { title: "관심 목록" };

type Filter = "all" | "reviewing" | "finalist" | "dropped" | "unrated";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "reviewing", label: "검토중" },
  { key: "finalist", label: "최종후보" },
  { key: "dropped", label: "탈락" },
  { key: "unrated", label: "내 평가 전" },
];

export default function WishlistPage(props: PageProps<"/shop/wishlist">) {
  return (
    <Suspense fallback={<WishlistSkeleton />}>
      <WishlistContent searchParams={props.searchParams} />
    </Suspense>
  );
}

function WishlistSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-9 w-3/4 animate-pulse rounded-full bg-soft" />
      {[0, 1].map((i) => (
        <div key={i} className="h-56 animate-pulse rounded-xl bg-soft" />
      ))}
    </div>
  );
}

const POWERTRAIN_LABEL = { ev: "전기차", hev: "HEV", phev: "PHEV", ice: "내연" } as const;

async function WishlistContent({ searchParams }: { searchParams: PageProps<"/shop/wishlist">["searchParams"] }) {
  const [{ userId, orgId }, query] = await Promise.all([auth(), searchParams]);
  if (!userId || !orgId) redirect("/");

  const raw = Array.isArray(query.status) ? query.status[0] : query.status;
  const filter: Filter = FILTERS.some((f) => f.key === raw) ? (raw as Filter) : "all";

  let groups: WishlistGroup[];
  try {
    groups = await listWishlistGroups(getDb(), orgId);
  } catch (error) {
    console.error("[wishlist] 불러오기 실패:", error);
    return (
      <p role="alert" className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        관심 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }
  const names = await getMemberNames(orgId);

  const mine = (g: WishlistGroup) => g.entries.find((e) => e.userId === userId);
  const matches = (g: WishlistGroup) => {
    if (filter === "all") return true;
    const m = mine(g);
    return filter === "unrated" ? !m : m?.status === filter;
  };
  const visible = groups.filter(matches);
  const count = (f: Filter) => groups.filter((g) => (f === "all" ? true : f === "unrated" ? !mine(g) : mine(g)?.status === f)).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">관심 목록</h1>
        <p className="mt-1 text-sm text-muted">가족이 담은 후보예요. 내 별점과 상태를 남기면 가족도 함께 볼 수 있어요.</p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="내 상태로 거르기">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/shop/wishlist" : `/shop/wishlist?status=${f.key}`}
            aria-current={filter === f.key ? "true" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
              filter === f.key ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"
            }`}
          >
            {f.label} {count(f.key)}
          </Link>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-center">
          <h2 className="font-bold">아직 담은 후보가 없어요</h2>
          <p className="mt-1 text-sm text-muted">모델 상세에서 트림을 고르고 &lsquo;관심 추가&rsquo;를 눌러 보세요.</p>
          <Link href="/shop/explore" className="mt-3 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">
            차량 둘러보기
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">이 조건에 맞는 후보가 없어요.</p>
      ) : (
        <ul className="space-y-4">
          {visible.map((g) => (
            <GroupCard key={g.trimId} group={g} userId={userId} names={names} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">별점 없음</span>;
  return (
    <span aria-label={`${value}점`}>
      <span className="text-warn">{"★".repeat(Math.round(value))}</span>
      <span className="text-line">{"★".repeat(5 - Math.round(value))}</span>
    </span>
  );
}

function GroupCard({ group: g, userId, names }: { group: WishlistGroup; userId: string; names: Record<string, string> }) {
  const my = g.entries.find((e) => e.userId === userId);
  const others = g.entries.filter((e) => e.userId !== userId);
  const after = priceAfterSubsidy({ price: g.price, subsidyEstimate: g.subsidyEstimate, powertrain: g.powertrain });

  return (
    <li className="space-y-3 rounded-xl border border-line bg-surface p-3">
      <Link href={`/shop/models/${g.modelId}`} className="flex gap-3">
        <div className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-lg bg-soft">
          {g.coverUrl ? (
            <Image src={g.coverUrl} alt="" fill sizes="112px" className="object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-[11px] text-muted">이미지 없음</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs text-muted">
            {g.brandName} · {POWERTRAIN_LABEL[g.powertrain]}
          </p>
          <h2 className="truncate font-bold">{g.modelName}</h2>
          <p className="truncate text-sm">{g.trimName}</p>
          <p className="text-sm">
            <b>{g.price != null ? formatManwon(g.price) : "가격 미등록"}</b>
            {after != null && <span className="text-muted"> · 보조금 반영 {formatManwon(after)}</span>}
          </p>
          <p className="text-sm">
            <Stars value={g.avgRating} />
            {g.ratingCount > 0 && g.avgRating != null && (
              <span className="text-muted">
                {" "}
                {g.avgRating.toFixed(1)} ({g.ratingCount}명)
              </span>
            )}
          </p>
        </div>
      </Link>

      <div className="rounded-lg bg-soft p-3">
        <h3 className="mb-2 text-sm font-bold">내 평가</h3>
        {my ? (
          <WishlistEntryEditor id={my.id} initial={{ rating: my.rating, status: my.status, memo: my.memo }} />
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted">아직 내 평가가 없어요. 관심 목록에 담으면 별점과 메모를 남길 수 있어요.</p>
            <WishlistButton trimId={g.trimId} />
          </div>
        )}
      </div>

      {others.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold">가족 의견</h3>
          <ul className="space-y-1.5">
            {others.map((e) => (
              <li key={e.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-2">
                  <b>{displayName(names, e.userId, userId)}</b>
                  <Stars value={e.rating} />
                  <span className="text-muted">· {WISHLIST_STATUS_LABEL[e.status]}</span>
                </div>
                {e.memo && <p className="mt-0.5 whitespace-pre-line text-muted">{e.memo}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <CompareToggle trimId={g.trimId} />
        <Link
          href={`/shop/models/${g.modelId}`}
          className="grid min-h-11 place-items-center rounded-xl border border-line text-sm font-semibold"
        >
          상세 보기
        </Link>
      </div>
    </li>
  );
}
