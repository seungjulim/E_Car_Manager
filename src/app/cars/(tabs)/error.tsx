"use client";

import { useEffect } from "react";

/** 차량 관리 화면에서 데이터를 불러오다 오류가 나면 보여 주는 화면 */
export default function CarsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[cars] 화면 오류:", error);
  }, [error]);

  return (
    <div role="alert" className="rounded-xl border border-dashed border-line p-6 text-center">
      <h2 className="font-bold">불러오지 못했어요</h2>
      <p className="mt-1 text-sm text-muted">잠시 후 다시 시도해 주세요. 계속되면 데이터베이스 연결 설정을 확인해 주세요.</p>
      <button type="button" onClick={reset} className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">
        다시 시도
      </button>
    </div>
  );
}
