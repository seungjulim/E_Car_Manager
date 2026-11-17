import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { CompareTable, type CompareHeader } from "@/components/shop/compare-table";
import { NotionSaveButton } from "@/components/notion-save-button";
import { notionSavedUrls } from "@/lib/notion-sync";
import { SaveComparisonForm } from "@/components/shop/save-comparison-form";
import { getDb } from "@/db";
import { buildCompareRows, MAX_COMPARE, parseCompareIds, type CompareTrim } from "@/lib/compare";
import { deleteComparisonAction } from "./actions";
import {
  listComparisons,
  listWishlistGroups,
  loadCompareTrims,
  type SavedComparison,
  type WishlistGroup,
} from "@/lib/wishlist";

export const metadata: Metadata = { title: "비교" };

export default function ComparePage(props: PageProps<"/shop/compare">) {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-soft" aria-hidden />}>
      <CompareContent searchParams={props.searchParams} />
    </Suspense>
  );
}

const href = (ids: string[]) => (ids.length === 0 ? "/shop/compare" : `/shop/compare?t=${ids.join(",")}`);

async function CompareContent({ searchParams }: { searchParams: PageProps<"/shop/compare">["searchParams"] }) {
  const [{ userId, orgId }, query] = await Promise.all([auth(), searchParams]);
  if (!userId || !orgId) redirect("/");

  const requested = parseCompareIds(query.t);

  let trims: CompareTrim[] = [];
  let saved: SavedComparison[] = [];
  let wished: WishlistGroup[] = [];
  let notionUrls: Record<string, string> = {};
  try {
    const db = getDb();
    [trims, saved, wished] = await Promise.all([
      loadCompareTrims(db, orgId, requested, userId),
      listComparisons(db, orgId),
      listWishlistGroups(db, orgId),
    ]);
    notionUrls = await notionSavedUrls(db, orgId, "comparison", saved.map((x) => x.id)).catch(() => ({}));
  } catch (error) {
    console.error("[compare] 불러오기 실패:", error);
    return (
      <p role="alert" className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        비교 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  // 지워졌거나 다른 가족의 트림은 조용히 제외한다
  const ids = trims.map((t) => t.id);
  const headers: CompareHeader[] = trims.map((t) => ({
    id: t.id,
    modelId: t.modelId,
    title: `${t.brandName} ${t.modelName}`,
    trimName: t.trimName,
    coverUrl: t.coverUrl,
    removeHref: href(ids.filter((id) => id !== t.id)),
  }));
  const addable = wished.filter((g) => !ids.includes(g.trimId)).slice(0, 8);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">비교</h1>
        <p className="mt-1 text-sm text-muted">후보 2~{MAX_COMPARE}대를 나란히 놓고 차이를 확인해요.</p>
      </div>

      {trims.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-center">
          <h2 className="font-bold">비교할 차량을 담아 보세요</h2>
          <p className="mt-1 text-sm text-muted">
            모델 상세나 관심 목록에서 &lsquo;비교 담기&rsquo;를 누르면 화면 아래에 비교 바가 나타나요.
          </p>
          <Link href="/shop/explore" className="mt-3 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">
            차량 둘러보기
          </Link>
        </div>
      ) : (
        <>
          {trims.length === 1 && (
            <p role="note" className="rounded-xl border border-warn bg-warn-soft px-3 py-2 text-sm text-warn">
              1대만 있어요. 비교하려면 한 대 이상 더 담아 주세요.
            </p>
          )}
          <CompareTable headers={headers} rows={buildCompareRows(trims)} />
          {trims.length >= 2 && (
            <SaveComparisonForm
              trimIds={ids}
              defaultTitle={trims.map((t) => t.modelName).join(" vs ").slice(0, 60)}
            />
          )}
        </>
      )}

      {trims.length < MAX_COMPARE && addable.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">관심 목록에서 추가</h2>
          <div className="flex flex-wrap gap-2">
            {addable.map((g) => (
              <Link
                key={g.trimId}
                href={href([...ids, g.trimId])}
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm"
              >
                + {g.modelName} {g.trimName}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-bold">저장한 비교</h2>
        {saved.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">아직 저장한 비교가 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {saved.map((s) => (
              <li key={s.id} className="space-y-2 rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <Link href={href(s.trimIds.slice(0, MAX_COMPARE))} className="min-w-0 flex-1">
                    <b className="block truncate">{s.title}</b>
                    <span className="text-xs text-muted">
                      {s.trimIds.length}대 · {s.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </Link>
                  <form action={deleteComparisonAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="min-h-9 rounded-lg border border-line px-3 text-sm text-bad">
                      삭제
                    </button>
                  </form>
                </div>
                <NotionSaveButton entityType="comparison" entityId={s.id} savedUrl={notionUrls[s.id]} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
