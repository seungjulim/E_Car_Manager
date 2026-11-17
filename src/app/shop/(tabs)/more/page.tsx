import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "더보기" };

export default function MorePage() {
  return (
    <ul className="space-y-3">
      <li>
        <Link href="/shop/taste" className="block rounded-xl border border-line bg-surface p-4">
          <b>내 취향 설정</b>
          <span className="block text-sm text-muted">선호 차급 · 중요한 사양 · 기본 예산</span>
        </Link>
      </li>
      <li>
        <Link href="/shop?edit=1" className="block rounded-xl border border-line bg-surface p-4">
          <b>차량 유형 다시 선택</b>
          <span className="block text-sm text-muted">전기차 · 하이브리드 · 내연기관</span>
        </Link>
      </li>
      <li>
        <Link href="/notion" className="block rounded-xl border border-line bg-surface p-4">
          <b>노션 연동</b>
          <span className="block text-sm text-muted">저장한 비교를 노션에 보내기</span>
        </Link>
      </li>
      <li>
        <Link href="/" className="block rounded-xl border border-line bg-surface p-4">
          <b>모드 선택으로</b>
          <span className="block text-sm text-muted">신차 구입 / 차량 관리</span>
        </Link>
      </li>
    </ul>
  );
}
