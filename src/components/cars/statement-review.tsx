"use client";

import { useActionState, useState, useTransition } from "react";
import { extractDocumentAction, saveStatementAction, type StatementFormState } from "@/app/cars/(tabs)/statement-actions";
import type { StatementDraft } from "@/lib/statement-extract";

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";
const labelCls = "mb-1 block text-xs text-muted";

export type PresetChoice = { itemCode: string; name: string };
export type QuoteChoice = { quoteId: string; shopName: string; totalAmount: number; itemCode: string | null; description: string | null };

/** 사진 내용을 AI 로 읽어 채우고, 사용자가 확인·수정한 뒤 정비 기록으로 저장한다 */
export function StatementReview({
  documentId,
  presets,
  initialDraft,
  today,
  currentKm,
  quotes,
}: {
  documentId: string;
  presets: PresetChoice[];
  initialDraft: StatementDraft | null;
  today: string;
  currentKm: number;
  quotes: QuoteChoice[];
}) {
  const [state, action, pending] = useActionState<StatementFormState, FormData>(saveStatementAction, {});
  const [draft, setDraft] = useState<StatementDraft | null>(initialDraft);
  const [version, setVersion] = useState(0); // 새로 읽을 때마다 폼 입력칸을 새 값으로 다시 만든다
  const [reading, startReading] = useTransition();
  const [readError, setReadError] = useState("");

  function read() {
    setReadError("");
    startReading(async () => {
      const r = await extractDocumentAction(documentId);
      if (!r.ok) return setReadError(r.error);
      setDraft(r.draft);
      setVersion((v) => v + 1);
    });
  }

  const d = draft;
  // 읽은 항목과 같은 항목의 견적이 하나뿐이면 미리 골라 둔다(바꿀 수 있다)
  const sameItem = d?.itemCode ? quotes.filter((q) => q.itemCode === d.itemCode) : [];
  const suggestedQuote = sameItem.length === 1 ? sameItem[0].quoteId : "";
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
        <p className="font-bold">사진 내용으로 정비 기록 채우기</p>
        <p className="text-xs text-muted">AI가 사진을 읽어 날짜·정비소·금액 등을 채워 줘요. 틀릴 수 있으니 꼭 확인하고 고쳐 주세요. 직접 입력해도 돼요.</p>
        <button type="button" onClick={read} disabled={reading} className="min-h-11 w-full rounded-xl border border-accent font-semibold text-accent disabled:opacity-40">
          {reading ? "사진을 읽는 중… (10~30초)" : draft ? "🔄 다시 읽기" : "✨ AI로 사진 읽기"}
        </button>
        {readError && (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {readError}
          </p>
        )}
        {d && d.notes.length > 0 && (
          <ul className="list-disc space-y-0.5 rounded-lg bg-warn-soft px-6 py-2 text-xs text-warn">
            {d.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </div>

      <form key={version} action={action} className="space-y-4">
        <input type="hidden" name="documentId" value={documentId} />
        <label className="block">
          <span className={labelCls}>정비 항목 *</span>
          <select name="itemCode" defaultValue={d?.itemCode ?? ""} className={inputCls}>
            <option value="">기타 (아래에 직접 입력)</option>
            {presets.map((p) => (
              <option key={p.itemCode} value={p.itemCode}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>기타 정비 내용 (항목이 목록에 없을 때)</span>
          <input name="category" maxLength={40} placeholder="예: 사고 수리, 도어 교체" className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>정비일 *</span>
            <input name="servicedOn" type="date" max={today} defaultValue={d?.servicedOn ?? today} required className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>주행거리 (km)</span>
            <input name="mileageKm" inputMode="numeric" defaultValue={d?.mileageKm != null ? String(d.mileageKm) : currentKm > 0 ? String(currentKm) : ""} className={inputCls} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>정비소</span>
            <input name="shopName" maxLength={60} defaultValue={d?.shopName ?? ""} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>실제 지불 금액 (원)</span>
            <input name="cost" inputMode="numeric" defaultValue={d?.totalAmount != null ? String(d.totalAmount) : ""} className={inputCls} />
          </label>
        </div>
        {quotes.length > 0 && (
          <label className="block">
            <span className={labelCls}>비교할 견적 (선택)</span>
            <select name="repairQuoteId" defaultValue={suggestedQuote} className={inputCls}>
              <option value="">견적과 비교하지 않음</option>
              {quotes.map((q) => (
                <option key={q.quoteId} value={q.quoteId}>
                  {q.shopName} · {q.totalAmount.toLocaleString("ko-KR")}원{q.description ? ` · ${q.description.slice(0, 20)}` : ""}
                </option>
              ))}
            </select>
            <span className="mt-0.5 block text-[11px] text-muted">내가 정한 견적을 고르면 저장 후 견적 대비 실제 금액 차이를 보여 드려요.</span>
          </label>
        )}
        <label className="block">
          <span className={labelCls}>수리 내용·메모</span>
          <textarea name="description" rows={5} maxLength={1000} defaultValue={d?.description ?? ""} className={inputCls} />
        </label>

        {state.error && (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40">
          {pending ? "저장 중…" : "정비 기록으로 저장"}
        </button>
      </form>
    </div>
  );
}
