import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { CarAddWizard } from "@/components/shop/car-add-wizard";
import { MAX_SOURCE_CHARS } from "@/lib/car-draft";

export const metadata: Metadata = { title: "차량 추가" };

export default function NewCarPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <AppHeader title="차량 추가" />
      <main className="flex-1 space-y-4 p-4 pb-10">
        <Link href="/shop/explore" className="inline-block text-sm text-muted">
          ‹ 탐색으로
        </Link>
        <CarAddWizard maxChars={MAX_SOURCE_CHARS} />
      </main>
    </div>
  );
}
