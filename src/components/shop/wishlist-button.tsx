"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addWishlist, removeWishlistByTrimAction } from "@/app/shop/(tabs)/wishlist/actions";

/** 트림 하나를 내 관심 목록에 담고 빼는 하트 버튼 */
export function WishlistButton({ trimId, entryId, className = "" }: { trimId: string; entryId?: string | null; className?: string }) {
  const router = useRouter();
  const [on, setOn] = useState(Boolean(entryId));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // 먼저 바꿔 보여 주고, 실패하면 되돌린다
    setError("");
    startTransition(async () => {
      const result = next ? await addWishlist(trimId) : await removeWishlistByTrimAction(trimId);
      if (!result.ok) {
        setOn(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-pressed={on}
        disabled={pending}
        onClick={toggle}
        className={`min-h-11 w-full rounded-xl border text-sm font-semibold disabled:opacity-60 ${
          on ? "border-bad bg-bad-soft text-bad" : "border-line bg-surface"
        }`}
      >
        {on ? "♥ 관심 목록에 있어요" : "♡ 관심 추가"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-bad">
          {error}
        </p>
      )}
      {on && !pending && (
        <Link href="/shop/wishlist" className="mt-1 block text-center text-xs text-muted underline">
          관심 목록 보기
        </Link>
      )}
    </div>
  );
}
