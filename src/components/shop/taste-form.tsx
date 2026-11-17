"use client";

import { useActionState, useState } from "react";
import { saveTasteAction, type TasteState } from "@/app/shop/(tabs)/taste/actions";
import { SEGMENT_OPTIONS } from "@/lib/budget-query";
import { FEATURE_NAME_MAX, FEATURE_SUGGESTIONS, MAX_FEATURES, WEIGHT_CHOICES, featureKey, type TasteFeature, type TasteInput } from "@/lib/taste";

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-10 rounded-full border px-3 text-sm ${active ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}
    >
      {children}
    </button>
  );
}

export function TasteForm({ initial, catalogFeatures }: { initial: TasteInput; catalogFeatures: string[] }) {
  const [state, action, pending] = useActionState<TasteState, FormData>(saveTasteAction, {});
  const [segments, setSegments] = useState<string[]>(initial.segments);
  const [features, setFeatures] = useState<TasteFeature[]>(initial.features);
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState("");

  const has = (name: string) => features.some((f) => featureKey(f.name) === featureKey(name));
  const toggleFeature = (name: string) =>
    setFeatures((list) => (has(name) ? list.filter((f) => featureKey(f.name) !== featureKey(name)) : list.length >= MAX_FEATURES ? list : [...list, { name, weight: 3 }]));
  const setWeight = (name: string, weight: number) => setFeatures((list) => list.map((f) => (featureKey(f.name) === featureKey(name) ? { ...f, weight } : f)));

  function addCustom() {
    const name = custom.replace(/\s+/g, " ").trim();
    setCustomError("");
    if (name === "") return;
    if (name.length > FEATURE_NAME_MAX) return setCustomError(`사양 이름은 ${FEATURE_NAME_MAX}자까지 쓸 수 있어요.`);
    if (!has(name)) {
      if (features.length >= MAX_FEATURES) return setCustomError(`중요한 사양은 ${MAX_FEATURES}개까지 고를 수 있어요.`);
      setFeatures((list) => [...list, { name, weight: 3 }]);
    }
    setCustom("");
  }

  // 카탈로그에서 자주 나오는 사양 중 아래 예시와 겹치는 것은 한 번만 보여 준다
  const suggested = new Set(FEATURE_SUGGESTIONS.flatMap((g) => g.items.map(featureKey)));
  const fromCatalog = catalogFeatures.filter((n) => !suggested.has(featureKey(n)));

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="features" value={JSON.stringify(features)} />
      {segments.map((s) => (
        <input key={s} type="hidden" name="segments" value={s} />
      ))}

      <section className="space-y-2" aria-label="선호 차급">
        <h2 className="font-bold">
          선호하는 차급 <span className="text-sm font-normal text-muted">(선택 안 하면 상관없음)</span>
        </h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="선호 차급">
          {SEGMENT_OPTIONS.map((s) => (
            <Chip key={s} active={segments.includes(s)} onClick={() => setSegments((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]))}>
              {s}
            </Chip>
          ))}
        </div>
      </section>

      <section className="space-y-2" aria-label="기본 예산">
        <h2 className="font-bold">
          기본 예산 <span className="text-sm font-normal text-muted">(예산 추천 화면에 미리 채워져요)</span>
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">최소 (만원)</span>
            <input name="minMan" inputMode="numeric" defaultValue={initial.minMan ?? ""} placeholder="3,000" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">최대 (만원)</span>
            <input name="maxMan" inputMode="numeric" defaultValue={initial.maxMan ?? ""} placeholder="5,000" className={inputCls} />
          </label>
        </div>
      </section>

      <section className="space-y-3" aria-label="중요한 사양">
        <div>
          <h2 className="font-bold">
            중요한 사양 <span className="text-sm font-normal text-muted">{features.length}/{MAX_FEATURES}</span>
          </h2>
          <p className="text-xs text-muted">고른 사양을 많이 갖춘 모델이 추천에서 더 높은 취향 점수를 받아요. 사양 이름이 포함돼 있으면 일치로 봐요.</p>
        </div>

        {features.length > 0 && (
          <ul className="space-y-2">
            {features.map((f) => (
              <li key={featureKey(f.name)} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-semibold">{f.name}</p>
                  <button type="button" onClick={() => toggleFeature(f.name)} className="shrink-0 text-xs text-bad" aria-label={`${f.name} 빼기`}>
                    빼기
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label={`${f.name} 중요도`}>
                  {WEIGHT_CHOICES.map((w) => (
                    <button
                      key={w.value}
                      type="button"
                      aria-pressed={f.weight === w.value}
                      onClick={() => setWeight(f.name, w.value)}
                      className={`min-h-10 rounded-lg border px-1 text-xs ${f.weight === w.value ? "border-accent bg-accent-soft font-bold text-accent" : "border-line bg-surface"}`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        {fromCatalog.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold">등록한 차량에 자주 나오는 사양</h3>
            <div className="flex flex-wrap gap-2">
              {fromCatalog.map((n) => (
                <Chip key={n} active={has(n)} onClick={() => toggleFeature(n)}>
                  {n}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {FEATURE_SUGGESTIONS.map((g) => (
          <div key={g.category} className="space-y-1.5">
            <h3 className="text-sm font-semibold">{g.category}</h3>
            <div className="flex flex-wrap gap-2">
              {g.items.map((n) => (
                <Chip key={n} active={has(n)} onClick={() => toggleFeature(n)}>
                  {n}
                </Chip>
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">직접 추가</h3>
          <div className="flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              maxLength={FEATURE_NAME_MAX}
              placeholder="예: 적외선 무드등"
              className={inputCls}
            />
            <button type="button" onClick={addCustom} className="shrink-0 rounded-lg border border-line px-4 font-semibold">
              추가
            </button>
          </div>
          {customError && <p className="text-xs text-bad">{customError}</p>}
        </div>
      </section>

      {state.error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      {state.saved && !pending && (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
          저장했어요. 예산 추천에 바로 반영돼요.
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40">
        {pending ? "저장 중…" : "취향 저장"}
      </button>
    </form>
  );
}
