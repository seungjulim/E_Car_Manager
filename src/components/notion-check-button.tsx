"use client";

import { useState, useTransition } from "react";
import { checkNotionAction, type NotionCheckResult } from "@/app/notion/actions";

export function NotionCheckButton() {
  const [result, setResult] = useState<NotionCheckResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await checkNotionAction()))}
        className="min-h-11 rounded-xl border border-accent px-4 font-semibold text-accent disabled:opacity-40"
      >
        {pending ? "확인하는 중…" : "연결 확인"}
      </button>
      {result?.ok && (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
          ✓ 연결됐어요{result.botName ? ` (통합: ${result.botName})` : ""}. 이제 저장 버튼을 쓸 수 있어요.
        </p>
      )}
      {result && !result.ok && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {result.error}
        </p>
      )}
    </div>
  );
}
