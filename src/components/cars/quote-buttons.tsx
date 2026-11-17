"use client";

import { useState } from "react";
import { chooseQuoteAction, deleteQuoteAction, deleteRequestAction } from "@/app/cars/(tabs)/quote-actions";

export function ChooseQuoteButton({ requestId, quoteId, chosen }: { requestId: string; quoteId: string; chosen: boolean }) {
  return (
    <form action={chooseQuoteAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="quoteId" value={quoteId} />
      <button
        type="submit"
        aria-pressed={chosen}
        className={`min-h-9 rounded-lg border px-3 text-xs font-semibold ${chosen ? "border-accent bg-accent text-white" : "border-line text-accent"}`}
      >
        {chosen ? "✓ 선택함 (누르면 해제)" : "이 견적으로 정하기"}
      </button>
    </form>
  );
}

export function DeleteQuoteButton({ id, label }: { id: string; label: string }) {
  return (
    <form
      action={deleteQuoteAction}
      onSubmit={(e) => {
        if (!window.confirm(`${label} 견적을 삭제할까요?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="min-h-9 rounded-lg border border-line px-3 text-xs text-bad" aria-label={`${label} 견적 삭제`}>
        삭제
      </button>
    </form>
  );
}

export function DeleteRequestButton({ id, vehicleId }: { id: string; vehicleId: string }) {
  return (
    <form
      action={deleteRequestAction}
      onSubmit={(e) => {
        if (!window.confirm("이 견적 요청과 입력한 견적을 모두 삭제할까요?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <button type="submit" className="min-h-9 rounded-lg border border-line px-3 text-xs text-bad">
        요청 삭제
      </button>
    </form>
  );
}

/** 정비소에 보낼 견적 요청 문구: 문자 앱으로 열거나 복사한다 */
export function SmsDraft({ phone, text }: { phone: string | null; text: string }) {
  const [copied, setCopied] = useState(false);
  const digits = phone?.replace(/[^0-9+]/g, "") ?? "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("아래 문구를 복사해 주세요.", text);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {digits && (
        <a href={`tel:${digits}`} className="min-h-9 rounded-lg border border-line px-3 py-2 text-xs font-semibold">
          📞 전화
        </a>
      )}
      {digits && (
        <a href={`sms:${digits}?&body=${encodeURIComponent(text)}`} className="min-h-9 rounded-lg border border-line px-3 py-2 text-xs font-semibold">
          💬 문자 보내기
        </a>
      )}
      <button type="button" onClick={copy} className="min-h-9 rounded-lg border border-line px-3 text-xs font-semibold">
        {copied ? "복사했어요" : "요청 문구 복사"}
      </button>
    </div>
  );
}
