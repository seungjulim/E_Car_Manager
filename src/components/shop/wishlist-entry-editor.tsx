"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  removeWishlistAction,
  updateWishlistAction,
  type WishlistActionResult,
} from "@/app/shop/(tabs)/wishlist/actions";
import { WISHLIST_STATUSES, WISHLIST_STATUS_LABEL, type WishlistStatus } from "@/lib/wishlist-constants";

/** 내 별점·상태·메모를 바로 고치는 편집기(별점·상태는 누르는 즉시 저장, 메모는 저장 버튼) */
export function WishlistEntryEditor({
  id,
  initial,
}: {
  id: string;
  initial: { rating: number | null; status: WishlistStatus; memo: string | null };
}) {
  const router = useRouter();
  const [rating, setRating] = useState(initial.rating);
  const [status, setStatus] = useState(initial.status);
  const [memo, setMemo] = useState(initial.memo ?? "");
  const [savedMemo, setSavedMemo] = useState(initial.memo ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<WishlistActionResult>, rollback: () => void, after?: () => void) {
    setError("");
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        rollback();
        setError(result.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function pickRating(value: number) {
    const prev = rating;
    const next = rating === value ? null : value; // 같은 별을 다시 누르면 평가 취소
    setRating(next);
    run(() => updateWishlistAction({ id, rating: next }), () => setRating(prev));
  }

  function pickStatus(value: WishlistStatus) {
    if (value === status) return;
    const prev = status;
    setStatus(value);
    run(() => updateWishlistAction({ id, status: value }), () => setStatus(prev));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1" role="group" aria-label="내 별점">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n}점`}
            aria-pressed={rating != null && n <= rating}
            onClick={() => pickRating(n)}
            className={`grid size-10 place-items-center text-2xl ${rating != null && n <= rating ? "text-warn" : "text-line"}`}
          >
            ★
          </button>
        ))}
        <span className="ml-1 text-sm text-muted">{rating ? `${rating}점` : "별점 없음"}</span>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="내 상태">
        {WISHLIST_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => pickStatus(s)}
            className={`min-h-9 rounded-full border px-3 text-sm ${
              status === s ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"
            }`}
          >
            {WISHLIST_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          maxLength={500}
          aria-label="내 메모"
          placeholder="시승 느낌, 마음에 드는 점, 걸리는 점"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-base"
        />
        <button
          type="button"
          disabled={pending || memo === savedMemo}
          onClick={() => run(() => updateWishlistAction({ id, memo }), () => undefined, () => setSavedMemo(memo))}
          className="min-h-10 self-end rounded-lg border border-line px-3 text-sm font-semibold disabled:opacity-40"
        >
          메모 저장
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("내 관심 목록에서 뺄까요?")) run(() => removeWishlistAction(id), () => undefined);
        }}
        className="text-sm text-muted underline disabled:opacity-40"
      >
        관심 목록에서 빼기
      </button>
    </div>
  );
}
