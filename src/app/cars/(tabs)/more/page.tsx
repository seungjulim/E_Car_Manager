import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "더보기" };

const SOON = [
  ["💸", "수리 견적 TOP 10", "내 위치 반경 40km 최저가 견적"],
  ["🧾", "수리내역서 첨부", "사진으로 올리면 자동 입력"],
  ["📄", "차량 이력 리포트", "PDF·공유 링크·CSV"],
] as const;

export default function CarsMorePage() {
  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        <li>
          <Link href="/notion" className="block rounded-xl border border-line bg-surface p-4">
            <b>📝 노션 연동</b>
            <span className="block text-sm text-muted">정비·점검 기록을 노션에 저장</span>
          </Link>
        </li>
        <li>
          <Link href="/export" className="block rounded-xl border border-line bg-surface p-4">
            <b>⬇ 자료 내려받기</b>
            <span className="block text-sm text-muted">정비·보험·주행 기록을 엑셀(CSV)이나 백업 파일로</span>
          </Link>
        </li>
        <li>
          <Link href="/cars/notifications" className="block rounded-xl border border-line bg-surface p-4">
            <b>🔔 알림 센터</b>
            <span className="block text-sm text-muted">정비 예정·보험 만기 알림 보기</span>
          </Link>
        </li>
        <li>
          <Link href="/cars/notifications/settings" className="block rounded-xl border border-line bg-surface p-4">
            <b>⚙ 알림 설정</b>
            <span className="block text-sm text-muted">언제·무엇을 받을지, 이 기기 푸시 켜기</span>
          </Link>
        </li>
        <li>
          <Link href="/" className="block rounded-xl border border-line bg-surface p-4">
            <b>모드 선택으로</b>
            <span className="block text-sm text-muted">신차 구입 / 차량 관리</span>
          </Link>
        </li>
        <li>
          <Link href="/shop" className="block rounded-xl border border-line bg-surface p-4">
            <b>신차 구입 모드로</b>
            <span className="block text-sm text-muted">후보 탐색·비교·구입 준비</span>
          </Link>
        </li>
      </ul>

      <section className="space-y-2" aria-label="준비 중인 기능">
        <h2 className="font-bold">곧 만들 기능</h2>
        <ul className="space-y-2">
          {SOON.map(([icon, title, desc]) => (
            <li key={title} className="flex items-center gap-3 rounded-xl border border-dashed border-line p-3 opacity-80">
              <span className="text-xl" aria-hidden>
                {icon}
              </span>
              <div className="min-w-0 flex-1">
                <b className="block">{title}</b>
                <span className="block text-xs text-muted">{desc}</span>
              </div>
              <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-xs text-muted">준비 중</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
