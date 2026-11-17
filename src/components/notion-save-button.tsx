"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveToNotionAction } from "@/app/notion/actions";
import type { NotionEntity } from "@/lib/notion-sync";

/** 노션에 저장 버튼. 이미 저장했다면 "노션에서 열기"와 "다시 저장"을 보여 준다 */
export function NotionSaveButton({ entityType, entityId, savedUrl }: { entityType: NotionEntity; entityId: string; savedUrl?: string }) {
  const [url, setUrl] = useState<string | undefined>(savedUrl);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  function save() {
    setError("");
    setMessage("");
    start(async () => {
      const r = await saveToNotionAction(entityType, entityId);
      if (r.ok) {
        setUrl(r.url);
        setMessage(r.replaced ? "노션에 다시 저장했어요." : "노션에 저장했어요.");
      } else {
        setError(r.error);
        setSetup(!!r.needsSetup);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={save} disabled={pending} className="min-h-9 rounded-lg border border-line px-3 text-xs font-semibold disabled:opacity-40">
        {pending ? "저장 중…" : url ? "노션에 다시 저장" : "📝 노션에 저장"}
      </button>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline">
          노션에서 열기
        </a>
      )}
      {message && (
        <span role="status" className="text-xs text-ok">
          {message}
        </span>
      )}
      {error && (
        <span role="alert" className="text-xs text-bad">
          {error}{" "}
          {setup && (
            <Link href="/notion" className="underline">
              설정 방법
            </Link>
          )}
        </span>
      )}
    </div>
  );
}
