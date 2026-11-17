import type { Metadata } from "next";
import Link from "next/link";
import { PopularityWizard } from "@/components/shop/popularity-wizard";
import { MAX_SOURCE_CHARS } from "@/lib/car-draft";

export const metadata: Metadata = { title: "판매 순위 자료 추가" };

export default function PopularityPage() {
  return (
    <div className="space-y-4">
      <Link href="/shop/budget" className="inline-block text-sm text-muted">
        ‹ 예산으로 추천받기
      </Link>
      <PopularityWizard maxChars={MAX_SOURCE_CHARS} />
    </div>
  );
}
