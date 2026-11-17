import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { formatManwon } from "@/lib/format";
import { listCandidateProgress, type CandidateProgress } from "@/lib/purchase";

export const metadata: Metadata = { title: "구입 준비" };

export default function PreparePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">구입 준비</h1>
        <p className="mt-1 text-sm text-muted">후보를 정했다면 비용을 계산하고, 사기 전에 꼭 확인할 10가지를 체크해요.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ToolLink href="/shop/prepare/cost" icon="🧮" title="구입 비용 계산기" desc="현금·할부·리스 5년 총비용 비교" />
        <ToolLink href="/shop/prepare/weights" icon="⚖️" title="체크 항목 중요도" desc="우리 가족에게 중요한 정도 설정" />
      </div>

      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <Candidates />
      </Suspense>
    </div>
  );
}

function ToolLink({ href, icon, title, desc }: { href: string; icon: string; title: string; desc: string }) {
  return (
    <Link href={href} className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent">
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      <b className="mt-1 block">{title}</b>
      <span className="block text-xs text-muted">{desc}</span>
    </Link>
  );
}

async function Candidates() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) redirect("/");

  let list: CandidateProgress[];
  try {
    list = await listCandidateProgress(getDb(), orgId, userId);
  } catch (error) {
    console.error("[prepare] 후보를 불러오지 못했어요:", error);
    return (
      <p role="alert" className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        후보 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  return (
    <section className="space-y-3" aria-label="내 후보">
      <h2 className="font-bold">구입 전 체크 TOP 10 · 내 후보</h2>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-center">
          <h3 className="font-bold">아직 체크할 후보가 없어요</h3>
          <p className="mt-1 text-sm text-muted">모델 상세에서 트림을 고르고 &lsquo;관심 추가&rsquo;를 누르면 여기에 나타나요.</p>
          <Link href="/shop/explore" className="mt-3 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">
            차량 둘러보기
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((c) => (
            <CandidateCard key={c.wishlistId} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CandidateCard({ c }: { c: CandidateProgress }) {
  const s = c.summary;
  const done = s.confirmed === s.total;
  return (
    <li className="space-y-3 rounded-xl border border-line bg-surface p-3">
      <div className="flex gap-3">
        <div className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-lg bg-soft">
          {c.coverUrl ? (
            <Image src={c.coverUrl} alt="" fill sizes="96px" className="object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-[11px] text-muted">이미지 없음</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{c.brandName}</p>
          <h3 className="truncate font-bold">{c.modelName}</h3>
          <p className="truncate text-sm">{c.trimName}</p>
          <p className="text-sm font-semibold">{c.price != null ? formatManwon(c.price) : "가격 미등록"}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold leading-none">{s.score == null ? "–" : s.score.toFixed(1)}</p>
          <p className="text-[11px] text-muted">/ 5 총점</p>
        </div>
      </div>

      <div>
        <div className="h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuemin={0} aria-valuemax={s.total} aria-valuenow={s.confirmed} aria-label="확인한 항목">
          <div className="h-full bg-accent" style={{ width: `${(s.confirmed / s.total) * 100}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">
          확인 {s.confirmed}/{s.total}
          {s.issues > 0 && <b className="text-bad"> · 문제 {s.issues}건</b>}
          {done && s.issues === 0 && <b className="text-ok"> · 모두 확인했어요</b>}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/shop/prepare/checklist/${c.wishlistId}`}
          className="grid min-h-11 place-items-center rounded-xl bg-accent text-sm font-semibold text-white"
        >
          {s.confirmed === 0 && s.scored === 0 ? "체크 시작" : "이어서 체크"}
        </Link>
        <Link
          href={`/shop/prepare/cost?trim=${c.trimId}`}
          className="grid min-h-11 place-items-center rounded-xl border border-line text-sm font-semibold"
        >
          비용 계산
        </Link>
      </div>
    </li>
  );
}
