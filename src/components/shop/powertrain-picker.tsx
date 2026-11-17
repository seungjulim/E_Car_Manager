"use client";

import { useActionState, useState } from "react";
import { savePowertrain, type SavePowertrainState } from "@/app/shop/actions";
import { GROUPS, GROUP_INFO, HYBRID_TYPES, type Group, type HybridType } from "@/lib/powertrain";

const HYBRID_LABEL: Record<HybridType, string> = {
  hev: "HEV (충전 불필요)",
  phev: "PHEV (충전+주유)",
};

type Props = {
  initialGroups: Group[];
  initialHybridTypes: HybridType[];
};

/** 신차 구입 모드 첫 화면: 알아볼 파워트레인을 고른다(다중 선택, "아직 못 정했어요"는 단독 선택). */
export function PowertrainPicker({ initialGroups, initialHybridTypes }: Props) {
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [hybridTypes, setHybridTypes] = useState<HybridType[]>(initialHybridTypes);
  const [state, formAction, pending] = useActionState<SavePowertrainState, FormData>(savePowertrain, {});

  function toggleGroup(group: Group) {
    setGroups((prev) => {
      if (group === "undecided") {
        return prev.includes("undecided") ? [] : ["undecided"];
      }
      const withoutUndecided = prev.filter((g) => g !== "undecided");
      return withoutUndecided.includes(group)
        ? withoutUndecided.filter((g) => g !== group)
        : [...withoutUndecided, group];
    });
  }

  function toggleHybridType(type: HybridType) {
    setHybridTypes((prev) => {
      if (!prev.includes(type)) return [...prev, type];
      // 하이브리드를 선택한 상태에서는 최소 한 가지는 남긴다
      return prev.length > 1 ? prev.filter((t) => t !== type) : prev;
    });
  }

  const hybridSelected = groups.includes("hybrid");

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">어떤 차를 알아볼까요?</h2>
        <p className="mt-1 text-sm text-muted">여러 개 선택할 수 있어요. 나중에 언제든 바꿀 수 있어요.</p>
      </div>

      <div className="space-y-3" role="group" aria-label="알아볼 차량 유형">
        {GROUPS.map((group) => {
          const info = GROUP_INFO[group];
          const selected = groups.includes(group);
          return (
            <div
              key={group}
              className={`rounded-2xl border-2 transition-colors ${
                selected ? "border-accent bg-accent-soft" : "border-line bg-surface"
              }`}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => toggleGroup(group)}
                className="flex min-h-16 w-full items-center gap-3 p-4 text-left"
              >
                <span className="w-10 text-center text-3xl" aria-hidden>
                  {info.icon}
                </span>
                <span className="flex-1">
                  <span className="block font-bold">{info.title}</span>
                  <span className="block text-sm text-muted">{info.desc}</span>
                </span>
                <span
                  aria-hidden
                  className={`grid size-6 place-items-center rounded-full border-2 text-xs ${
                    selected ? "border-accent bg-accent text-white" : "border-line text-transparent"
                  }`}
                >
                  ✓
                </span>
              </button>

              {group === "hybrid" && hybridSelected && (
                <div className="flex flex-wrap gap-2 px-4 pb-4 pl-[4.25rem]">
                  {HYBRID_TYPES.map((type) => {
                    const on = hybridTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleHybridType(type)}
                        className={`min-h-9 rounded-full border px-3 text-sm ${
                          on
                            ? "border-accent bg-surface font-semibold text-accent"
                            : "border-line bg-surface text-muted"
                        }`}
                      >
                        {HYBRID_LABEL[type]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 선택한 값을 폼으로 전달 */}
      {groups.map((g) => (
        <input key={g} type="hidden" name="groups" value={g} />
      ))}
      {hybridSelected &&
        hybridTypes.map((t) => <input key={t} type="hidden" name="hybridTypes" value={t} />)}

      {state.error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || groups.length === 0}
        className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40"
      >
        {pending ? "저장 중…" : "다음"}
      </button>

      <p className="rounded-lg bg-soft px-3 py-2 text-xs text-muted">
        &ldquo;아직 못 정했어요&rdquo;를 고르면 탐색 화면에서 3가지 유형을 모두 보여 드리고, 유형 비교 가이드를 제공해요.
      </p>
    </form>
  );
}
