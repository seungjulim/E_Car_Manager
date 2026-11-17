import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { NotionCheckButton } from "@/components/notion-check-button";
import { getDb } from "@/db";
import { notionConfig } from "@/lib/notion";
import { recentNotionSaves } from "@/lib/notion-sync";
import { formatKstShort } from "@/lib/format";

export const metadata: Metadata = { title: "노션 연동" };

const TYPE_LABEL: Record<string, string> = { service_record: "정비 기록", inspection_record: "점검 기록", comparison: "신차 비교" };

export default function NotionPage() {
  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6">
      <Link href="/" className="inline-block text-sm text-muted">
        ‹ 모드 선택
      </Link>
      <div>
        <h1 className="text-xl font-bold">노션 연동</h1>
        <p className="mt-1 text-sm text-muted">정비 기록, 점검 기록, 신차 비교를 노션 페이지로 저장해 두세요. 저장할 때마다 지정한 상위 페이지 아래에 새 페이지가 만들어져요.</p>
      </div>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-soft" aria-hidden />}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) redirect("/");
  const configured = notionConfig() != null;
  const recent = configured ? await recentNotionSaves(getDb(), orgId).catch(() => []) : [];

  return (
    <>
      <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-bold">연결 상태</h2>
        {configured ? (
          <>
            <p className="text-sm text-ok">✓ 설정이 되어 있어요. 아래 버튼으로 실제로 연결되는지 확인해 보세요.</p>
            <NotionCheckButton />
          </>
        ) : (
          <p className="text-sm text-warn">아직 설정되지 않았어요. 아래 순서대로 한 번만 설정해 주세요.</p>
        )}
      </section>

      {!configured && (
        <section className="space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="font-bold">설정 방법</h2>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              노션 <b>내 통합(Integrations)</b> 페이지에서 새 <b>내부 통합</b>을 만들고 토큰(<code>ntn_…</code> 또는 <code>secret_…</code>)을 복사해요.
            </li>
            <li>저장 결과를 모아 둘 노션 페이지를 하나 만들어요(예: &lsquo;차량 기록&rsquo;).</li>
            <li>
              그 페이지 오른쪽 위 <b>⋯ → 연결(Connections)</b>에서 방금 만든 통합을 추가해요. 이걸 빼먹으면 저장이 거부돼요.
            </li>
            <li>
              페이지 주소를 복사해요(<b>링크 복사</b>). 주소 끝의 32자리 글자가 페이지 id예요.
            </li>
            <li>
              <code>.env.local</code> 에 아래 두 줄을 넣고 앱을 다시 시작해요.
              <pre className="mt-1 overflow-x-auto rounded-lg bg-soft p-2 text-xs">{`NOTION_TOKEN=토큰
NOTION_PARENT_PAGE_ID=페이지 주소 또는 id`}</pre>
            </li>
          </ol>
        </section>
      )}

      {recent.length > 0 && (
        <section className="space-y-2" aria-label="최근 저장">
          <h2 className="font-bold">최근 저장한 항목</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {recent.map((r) => (
              <li key={r.url} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{TYPE_LABEL[r.type] ?? r.type}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted">{formatKstShort(r.syncedAt)}</span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                    열기
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
