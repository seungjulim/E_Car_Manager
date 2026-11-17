"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveCheckAction, type PrepareActionResult } from "@/app/shop/(tabs)/prepare/actions";
import {
  CHECK_STATUSES,
  CHECK_STATUS_LABEL,
  weightedScore,
  type CheckStatus,
  type CheckValue,
} from "@/lib/purchase-score";

export type ChecklistCriterion = {
  code: string;
  name: string;
  question: string;
  /** 이 후보의 파워트레인에 맞는 추가 질문(없으면 null) */
  extraQuestion: string | null;
  /** 내가 정한 중요도(없으면 기본 중요도) */
  weight: number;
};

const EMPTY: CheckValue = { status: "todo", score: null, note: null };

const STATUS_STYLE: Record<CheckStatus, string> = {
  todo: "border-accent bg-accent-soft text-accent",
  ok: "border-ok bg-ok-soft text-ok",
  issue: "border-bad bg-bad-soft text-bad",
};

export function ChecklistEditor({
  wishlistId,
  criteria,
  initial,
}: {
  wishlistId: string;
  criteria: ChecklistCriterion[];
  initial: Record<string, CheckValue>;
}) {
  const router = useRouter();
  const [checks, setChecks] = useState<Record<string, CheckValue>>(initial);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const summary = useMemo(
    () => weightedScore(criteria.map((c) => ({ code: c.code, defaultWeight: c.weight })), checks, {}),
    [criteria, checks],
  );

  const get = (code: string) => checks[code] ?? EMPTY;

  /** 화면에 먼저 반영하고 저장한다. 실패하면 이전 값으로 되돌린다 */
  function change(code: string, patch: Partial<CheckValue>) {
    const before = get(code);
    setChecks((prev) => ({ ...prev, [code]: { ...before, ...patch } }));
    setError("");
    startTransition(async () => {
      const result: PrepareActionResult = await saveCheckAction({
        wishlistId,
        criteriaCode: code,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.score !== undefined ? { score: patch.score } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      });
      if (!result.ok) {
        setChecks((prev) => ({ ...prev, [code]: before }));
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section aria-label="진행 상황" className="sticky top-14 z-10 space-y-2 rounded-xl border border-accent bg-accent-soft p-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm">
            가중 총점{" "}
            <b className="text-2xl">{summary.score == null ? "–" : summary.score.toFixed(1)}</b>
            <span className="text-muted"> / 5</span>
          </p>
          <p className="text-right text-xs text-muted">
            확인 {summary.confirmed}/{summary.total} · 점수 {summary.scored}/{summary.total}
            {summary.issues > 0 && <b className="text-bad"> · 문제 {summary.issues}건</b>}
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={summary.total} aria-valuenow={summary.confirmed} aria-label="확인한 항목">
          <div className="h-full bg-accent transition-all" style={{ width: `${(summary.confirmed / summary.total) * 100}%` }} />
        </div>
        {summary.score == null && <p className="text-xs text-muted">항목에 점수를 매기면 총점이 계산돼요. 점수를 매긴 항목만 반영해요.</p>}
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <ol className="space-y-3">
        {criteria.map((c, i) => {
          const v = get(c.code);
          return (
            <li key={c.code} className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <div className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold">{c.name}</h3>
                    <span className="shrink-0 text-xs text-muted">중요도 {"●".repeat(c.weight)}{"○".repeat(5 - c.weight)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{c.question}</p>
                  {c.extraQuestion && (
                    <p className="mt-1 rounded-lg bg-soft px-2 py-1 text-sm">
                      <b>이 유형은 이것도 확인하세요</b> · {c.extraQuestion}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2" role="group" aria-label={`${c.name} 상태`}>
                {CHECK_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={v.status === s}
                    onClick={() => v.status !== s && change(c.code, { status: s })}
                    className={`min-h-9 rounded-full border px-3 text-sm ${
                      v.status === s ? `${STATUS_STYLE[s]} font-semibold` : "border-line bg-surface"
                    }`}
                  >
                    {CHECK_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1" role="group" aria-label={`${c.name} 점수`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n}점`}
                    aria-pressed={v.score != null && n <= v.score}
                    onClick={() => change(c.code, { score: v.score === n ? null : n })}
                    className={`grid size-10 place-items-center text-2xl ${v.score != null && n <= v.score ? "text-warn" : "text-line"}`}
                  >
                    ★
                  </button>
                ))}
                <span className="ml-1 text-sm text-muted">{v.score ? `${v.score}점` : "점수 없음"}</span>
              </div>

              {openNote === c.code || v.note ? (
                <NoteField label={`${c.name} 메모`} value={v.note ?? ""} onSave={(note) => change(c.code, { note })} />
              ) : (
                <button type="button" onClick={() => setOpenNote(c.code)} className="text-sm text-muted underline">
                  + 메모
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {pending && <p className="text-center text-xs text-muted">저장 중…</p>}
    </div>
  );
}

function NoteField({ label, value, onSave }: { label: string; value: string; onSave: (note: string | null) => void }) {
  const [text, setText] = useState(value);
  return (
    <div className="flex gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== value.trim() && onSave(text.trim() === "" ? null : text.trim())}
        rows={2}
        maxLength={500}
        aria-label={label}
        placeholder="확인한 내용, 딜러에게 물어볼 것"
        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-base"
      />
    </div>
  );
}
