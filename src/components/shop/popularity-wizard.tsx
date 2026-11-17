"use client";

import { useActionState, useState } from "react";
import {
  analyzePopularity,
  savePopularityAction,
  type AnalyzePopularityState,
  type SavePopularityState,
} from "@/app/shop/(tabs)/popularity/actions";
import type { PopularityDraft, PopularityRowDraft } from "@/lib/popularity";

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";
const labelCls = "mb-1 block text-xs text-muted";

export function PopularityWizard({ maxChars }: { maxChars: number }) {
  const [analysis, analyzeAction, analyzing] = useActionState<AnalyzePopularityState, FormData>(analyzePopularity, {});
  const [saveState, saveAction, saving] = useActionState<SavePopularityState, FormData>(savePopularityAction, {});

  const [text, setText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [draft, setDraft] = useState<PopularityDraft | null>(null);
  const [seen, setSeen] = useState<AnalyzePopularityState | null>(null);

  if (analysis.draft && analysis !== seen) {
    setSeen(analysis);
    setDraft(analysis.draft);
  }

  if (!draft) {
    return (
      <form action={analyzeAction} className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">판매 순위 자료 붙여넣기</h2>
          <p className="mt-1 text-sm text-muted">월간 모델별 판매량 표나 기사를 붙여넣으면 Claude가 모델·판매량을 정리해 드려요.</p>
        </div>
        <div>
          <label htmlFor="text" className={labelCls}>
            자료 내용
          </label>
          <textarea
            id="text"
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder="예) 2026년 10월 국산차 모델별 판매 순위 표"
            className={inputCls}
          />
          <p className="mt-1 text-right text-xs text-muted">
            {text.length.toLocaleString("ko-KR")} / {maxChars.toLocaleString("ko-KR")}자
          </p>
        </div>
        <div>
          <label htmlFor="sourceUrl" className={labelCls}>
            출처 주소 (선택)
          </label>
          <input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            inputMode="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://"
            className={inputCls}
          />
        </div>
        {analysis.error && <ErrorBox message={analysis.error} />}
        <button
          type="submit"
          disabled={analyzing || text.trim().length === 0}
          className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40"
        >
          {analyzing ? "Claude가 분석 중이에요… (최대 1분)" : "Claude로 정리"}
        </button>
        <p className="rounded-lg bg-soft px-3 py-2 text-xs text-muted">
          판매량은 한 번에 한 달치씩 저장해요. 같은 달 자료를 다시 저장하면 이전 자료를 교체해요.
        </p>
      </form>
    );
  }

  const patchRow = (i: number, p: Partial<PopularityRowDraft>) =>
    setDraft({ ...draft, rows: draft.rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)) });
  const payload = JSON.stringify({ draft, sourceUrl: analysis.sourceUrl });

  return (
    <form action={saveAction} className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">정리 결과 확인·수정</h2>
        <p className="mt-1 text-sm text-muted">틀린 부분은 고치고, 필요 없는 행은 삭제한 뒤 저장하세요.</p>
      </div>

      {analysis.notes && analysis.notes.length > 0 && (
        <div role="note" className="rounded-xl border border-warn bg-warn-soft px-3 py-2 text-sm text-warn">
          <b>확인이 필요해요</b>
          <ul className="mt-1 list-disc pl-5">
            {analysis.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label htmlFor="period" className={labelCls}>
          판매 집계 월
        </label>
        <input
          id="period"
          type="month"
          value={draft.period}
          onChange={(e) => setDraft({ ...draft, period: e.target.value })}
          className={inputCls}
        />
        {!draft.period && <p className="mt-1 text-xs text-bad">자료에서 월을 알 수 없었어요. 직접 선택해 주세요.</p>}
      </div>

      <ul className="space-y-2">
        {draft.rows.map((row, i) => (
          <li key={i} className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={labelCls}>브랜드</span>
                <input className={inputCls} value={row.brand} onChange={(e) => patchRow(i, { brand: e.target.value })} />
              </label>
              <label className="block">
                <span className={labelCls}>모델</span>
                <input className={inputCls} value={row.model} onChange={(e) => patchRow(i, { model: e.target.value })} />
              </label>
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <label className="block">
                <span className={labelCls}>판매량(대)</span>
                <input className={inputCls} inputMode="numeric" value={row.sales} onChange={(e) => patchRow(i, { sales: e.target.value })} />
              </label>
              <label className="block">
                <span className={labelCls}>순위</span>
                <input className={inputCls} inputMode="numeric" value={row.rank} onChange={(e) => patchRow(i, { rank: e.target.value })} />
              </label>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, idx) => idx !== i) })}
                className="min-h-10 rounded-lg border border-line px-3 text-sm text-bad"
                aria-label={`${row.model || i + 1}번 행 삭제`}
              >
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setDraft({ ...draft, rows: [...draft.rows, { brand: "", model: "", sales: "", rank: "" }] })}
        className="min-h-11 w-full rounded-xl border border-dashed border-line text-sm"
      >
        + 행 추가
      </button>

      <input type="hidden" name="payload" value={payload} />
      {saveState.error && <ErrorBox message={saveState.error} />}

      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <button
          type="button"
          onClick={() => setDraft(null)}
          disabled={saving}
          className="min-h-12 rounded-xl border border-line bg-surface font-semibold disabled:opacity-40"
        >
          다시 분석
        </button>
        <button
          type="submit"
          disabled={saving || draft.rows.length === 0}
          className="min-h-12 rounded-xl bg-accent font-semibold text-white disabled:opacity-40"
        >
          {saving ? "저장 중…" : `${draft.rows.length}개 모델 저장`}
        </button>
      </div>
    </form>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
      {message}
    </p>
  );
}
