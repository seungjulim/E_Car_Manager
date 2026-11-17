"use client";

import { useActionState } from "react";
import { saveComparisonAction, type SaveComparisonState } from "@/app/shop/(tabs)/compare/actions";

export function SaveComparisonForm({ trimIds, defaultTitle }: { trimIds: string[]; defaultTitle: string }) {
  const [state, action, pending] = useActionState<SaveComparisonState, FormData>(saveComparisonAction, {});
  return (
    <form action={action} className="space-y-2 rounded-xl border border-line bg-surface p-4">
      <h2 className="font-bold">이 비교 저장하기</h2>
      <p className="text-xs text-muted">저장하면 가족 모두 &lsquo;저장한 비교&rsquo;에서 다시 볼 수 있어요.</p>
      {trimIds.map((id) => (
        <input key={id} type="hidden" name="trimId" value={id} />
      ))}
      <div className="flex gap-2">
        <input
          name="title"
          defaultValue={defaultTitle}
          maxLength={60}
          required
          aria-label="비교 이름"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-base"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-white disabled:opacity-40"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
    </form>
  );
}
