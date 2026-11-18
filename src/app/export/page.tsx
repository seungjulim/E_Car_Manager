import type { Metadata } from "next";
import Link from "next/link";
import { EXPORT_KINDS } from "@/lib/export";

export const metadata: Metadata = { title: "자료 내려받기" };

export default function ExportPage() {
  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6">
      <Link href="/cars/more" className="inline-block text-sm text-muted">
        ‹ 더보기
      </Link>
      <div>
        <h1 className="text-xl font-bold">자료 내려받기</h1>
        <p className="mt-1 text-sm text-muted">
          우리 가족의 차량 기록을 파일로 저장해요. CSV는 엑셀·구글 시트에서 바로 열 수 있고, 전체 백업은 한 파일에 모두 담겨요.
        </p>
      </div>

      <ul className="space-y-2">
        {EXPORT_KINDS.map((k) => (
          <li key={k.kind}>
            {/* 파일 내려받기는 페이지 이동이 아니라 일반 링크로 처리한다 */}
            <a href={`/api/export/${k.kind}`} download className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
              <div className="min-w-0 flex-1">
                <b className="block">{k.label}</b>
                <span className="block text-sm text-muted">{k.desc}</span>
              </div>
              <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-xs text-muted">{k.format === "csv" ? "CSV" : "JSON"}</span>
            </a>
          </li>
        ))}
      </ul>

      <p className="rounded-xl border border-line bg-surface p-3 text-xs text-muted">
        서류·견적서 사진 파일은 이 파일들에 들어가지 않아요. 사진은 각 차량의 서류 화면에서 열어 저장할 수 있어요. 내려받은 파일에는 차량번호 같은 개인 정보가 있으니 보관에 주의해 주세요.
      </p>
    </main>
  );
}
