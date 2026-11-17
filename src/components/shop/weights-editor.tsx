"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetWeightsAction, setWeightAction } from "@/app/shop/(tabs)/prepare/actions";

export type WeightRow = { code: string; name: string; question: string; defaultWeight: number; weight: number };

const LEVEL_LABEL = ["", "별로 안 중요", "조금 중요", "보통", "중요", "매우 중요"];

/** 항목 중요도(1~5) 설정. 누르는 즉시 저장되고 총점에 반영돼요 */
export function WeightsEditor({ rows }: { rows: WeightRow[] }) {
  const router = useRouter();
  const [weights, setWeights] = useState<Record<string, number>>(Object.fromEntries(rows.map((r) => [r.code, r.weight])));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function pick(code: string, weight: number) {
    const before = weights[code];
    if (before === weight) return;
    setWeights((w) => ({ ...w, [code]: weight }));
    setError("");
    startTransition(async () => {
      const result = await setWeightAction({ criteriaCode: code, weight });
      if (!result.ok) {
        setWeights((w) => ({ ...w, [code]: before }));
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function reset() {
    if (!window.confirm("모든 항목의 중요도를 기본값으로 되돌릴까요?")) return;
    const before = weights;
    setWeights(Object.fromEntries(rows.map((r) => [r.code, r.defaultWeight])));
    startTransition(async () => {
      const result = await resetWeightsAction();
      if (!result.ok) {
        setWeights(before);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const changed = rows.some((r) => weights[r.code] !== r.defaultWeight);

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.code} className="space-y-2 rounded-xl border border-line bg-surface p-4">
            <div>
              <h3 className="font-bold">
                {i + 1}. {r.name}
              </h3>
              <p className="text-sm text-muted">{r.question}</p>
            </div>
            <div className="flex items-center gap-2" role="group" aria-label={`${r.name} 중요도`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={weights[r.code] === n}
                  onClick={() => pick(r.code, n)}
                  className={`grid size-10 place-items-center rounded-full border text-sm ${
                    weights[r.code] === n ? "border-accent bg-accent text-white" : "border-line bg-surface"
                  }`}
                >
                  {n}
                </button>
              ))}
              <span className="ml-1 text-sm text-muted">
                {LEVEL_LABEL[weights[r.code]]}
                {weights[r.code] !== r.defaultWeight && ` (기본 ${r.defaultWeight})`}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={pending || !changed}
        onClick={reset}
        className="min-h-11 w-full rounded-xl border border-line text-sm font-semibold disabled:opacity-40"
      >
        기본값으로 되돌리기
      </button>
    </div>
  );
}
