"use client";

import { useActionState, useState } from "react";
import {
  analyzeCarText,
  saveCar,
  type AnalyzeState,
  type SaveCarState,
} from "@/app/shop/new/actions";
import {
  emptyTrim,
  ICE_FUEL_LABEL,
  ICE_FUELS,
  SPEC_FIELDS,
  type CarDraft,
  type TrimDraft,
} from "@/lib/car-draft";
import { CAR_EXAMPLES, CAR_EXAMPLE_GROUPS } from "@/lib/car-examples";
import { POWERTRAINS, type Powertrain } from "@/lib/powertrain";

const POWERTRAIN_LABEL: Record<Powertrain, string> = {
  ev: "전기차",
  hev: "HEV",
  phev: "PHEV",
  ice: "내연기관",
};

// 모바일에서 입력창을 눌렀을 때 화면이 확대되지 않도록 글자 크기는 16px(text-base)
const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";
const labelCls = "mb-1 block text-xs text-muted";

export function CarAddWizard({ maxChars }: { maxChars: number }) {
  const [analysis, analyzeAction, analyzing] = useActionState<AnalyzeState, FormData>(analyzeCarText, {});
  const [saveState, saveAction, saving] = useActionState<SaveCarState, FormData>(saveCar, {});

  const [text, setText] = useState("");
  const [exampleId, setExampleId] = useState(""); // 선택한 예시 문구(빈 값 = 직접 입력)
  const [sourceUrl, setSourceUrl] = useState("");
  const [draft, setDraft] = useState<CarDraft | null>(null);
  const [seen, setSeen] = useState<AnalyzeState | null>(null);

  // 새 분석 결과가 도착하면 편집 초안으로 옮긴다(렌더 중 상태 갱신: 같은 결과는 한 번만)
  if (analysis.draft && analysis !== seen) {
    setSeen(analysis);
    setDraft(analysis.draft);
  }

  /* ---------------- 1단계: 자료 붙여넣기 ---------------- */
  if (!draft) {
    return (
      <form action={analyzeAction} className="space-y-4">
        <StepTitle n={1} title="자료 붙여넣기" sub="제조사 카탈로그·기사 텍스트를 붙여넣으면 Claude가 정리해 드려요." />
        <fieldset className="rounded-xl border border-line bg-surface p-3">
          <legend className="px-1 text-sm font-semibold">예시 문구 선택 (선택)</legend>
          <p className="mb-2 text-xs text-muted">
            고르면 아래 입력칸에 조사해 둔 자료가 채워져요. 가격과 연비는 참고용이니 결과 화면에서 공식 가격표와 맞는지 확인해 주세요.
          </p>
          <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
            <label className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm">
              <input
                type="radio"
                name="example"
                value=""
                checked={exampleId === ""}
                onChange={() => {
                  setExampleId("");
                  setText("");
                }}
              />
              직접 붙여넣기
            </label>
            {CAR_EXAMPLE_GROUPS.map((group) => {
              const items = CAR_EXAMPLES.filter((ex) => ex.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <p className="px-2 text-xs font-semibold text-muted">{group}</p>
                  {items.map((ex) => (
                    <label key={ex.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm">
                      <input
                        type="radio"
                        name="example"
                        value={ex.id}
                        checked={exampleId === ex.id}
                        onChange={() => {
                          setExampleId(ex.id);
                          setText(ex.text);
                        }}
                      />
                      {ex.label}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </fieldset>
        <div>
          <label htmlFor="text" className={labelCls}>
            자료 내용
          </label>
          <textarea
            id="text"
            name="text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              // 예시를 고친 경우에는 더 이상 그 예시 그대로가 아니므로 '직접 입력'으로 돌린다
              if (exampleId !== "" && e.target.value !== CAR_EXAMPLES.find((ex) => ex.id === exampleId)?.text) setExampleId("");
            }}
            rows={10}
            placeholder="모델명, 트림별 가격, 주요 사양, 편의사양 등이 들어 있는 텍스트"
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
          {analyzing ? "Claude가 분석 중이에요… (최대 1분)" : "Claude로 요약·분류"}
        </button>
        <p className="rounded-lg bg-soft px-3 py-2 text-xs text-muted">
          붙여넣은 내용은 분석을 위해 Claude API로 전송돼요. 개인정보가 담긴 자료는 붙여넣지 마세요.
        </p>
      </form>
    );
  }

  /* ---------------- 2단계: 결과 확인·수정 후 저장 ---------------- */
  const fields = SPEC_FIELDS[draft.powertrain];
  const showSubsidy = draft.powertrain !== "ice";

  const patch = (p: Partial<CarDraft>) => setDraft({ ...draft, ...p });
  const patchTrim = (i: number, p: Partial<TrimDraft>) =>
    patch({ trims: draft.trims.map((t, idx) => (idx === i ? { ...t, ...p } : t)) });
  const patchSpec = (i: number, key: string, value: string) =>
    patchTrim(i, { specs: { ...draft.trims[i].specs, [key]: value } });

  const payload = JSON.stringify({ draft, rawText: analysis.rawText, sourceUrl: analysis.sourceUrl });

  return (
    <form action={saveAction} className="space-y-5">
      <StepTitle n={2} title="결과 확인·수정" sub="Claude가 정리한 내용이에요. 틀린 부분은 고친 뒤 저장하세요." />

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

      {/* 모델 정보 */}
      <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <h3 className="font-bold">모델 정보</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="브랜드">
            <input className={inputCls} value={draft.brand} onChange={(e) => patch({ brand: e.target.value })} />
          </Field>
          <Field label="모델명">
            <input className={inputCls} value={draft.model} onChange={(e) => patch({ model: e.target.value })} />
          </Field>
        </div>
        <Field label="파워트레인">
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="파워트레인">
            {POWERTRAINS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={draft.powertrain === p}
                onClick={() => patch({ powertrain: p, iceFuel: p === "ice" ? draft.iceFuel || "gasoline" : "" })}
                className={`min-h-10 rounded-lg border text-sm ${
                  draft.powertrain === p ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line"
                }`}
              >
                {POWERTRAIN_LABEL[p]}
              </button>
            ))}
          </div>
        </Field>
        {draft.powertrain === "ice" && (
          <Field label="연료">
            <select
              className={inputCls}
              value={draft.iceFuel || "gasoline"}
              onChange={(e) => patch({ iceFuel: e.target.value as CarDraft["iceFuel"] })}
            >
              {ICE_FUELS.map((f) => (
                <option key={f} value={f}>
                  {ICE_FUEL_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="차급 (예: 중형 SUV)">
            <input className={inputCls} value={draft.segment} onChange={(e) => patch({ segment: e.target.value })} />
          </Field>
          <Field label="출시 연도">
            <input
              className={inputCls}
              inputMode="numeric"
              value={draft.releaseYear}
              onChange={(e) => patch({ releaseYear: e.target.value })}
            />
          </Field>
        </div>
        <Field label="요약">
          <textarea className={inputCls} rows={3} value={draft.summary} onChange={(e) => patch({ summary: e.target.value })} />
        </Field>
      </section>

      {/* 트림 */}
      {draft.trims.map((trim, i) => (
        <section key={i} className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">트림 {i + 1}</h3>
            {draft.trims.length > 1 && (
              <button
                type="button"
                onClick={() => patch({ trims: draft.trims.filter((_, idx) => idx !== i) })}
                className="rounded-full border border-line px-3 py-1 text-xs text-muted"
              >
                삭제
              </button>
            )}
          </div>
          <Field label="트림 이름">
            <input className={inputCls} value={trim.name} onChange={(e) => patchTrim(i, { name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="가격 (만원)">
              <input
                className={inputCls}
                inputMode="decimal"
                value={trim.priceMan}
                onChange={(e) => patchTrim(i, { priceMan: e.target.value })}
              />
            </Field>
            {showSubsidy && (
              <Field label="추정 보조금 (만원)">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={trim.subsidyMan}
                  onChange={(e) => patchTrim(i, { subsidyMan: e.target.value })}
                />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <Field key={f.key} label={f.unit ? `${f.label} (${f.unit})` : f.label}>
                <input
                  className={inputCls}
                  inputMode={f.kind === "number" ? "decimal" : "text"}
                  value={trim.specs[f.key] ?? ""}
                  onChange={(e) => patchSpec(i, f.key, e.target.value)}
                />
              </Field>
            ))}
          </div>
          <Field label="편의사양 (줄마다 '분류: 항목, 항목')">
            <textarea
              className={inputCls}
              rows={4}
              value={trim.featuresText}
              onChange={(e) => patchTrim(i, { featuresText: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="장점 (줄마다 1개)">
              <textarea className={inputCls} rows={4} value={trim.prosText} onChange={(e) => patchTrim(i, { prosText: e.target.value })} />
            </Field>
            <Field label="단점 (줄마다 1개)">
              <textarea className={inputCls} rows={4} value={trim.consText} onChange={(e) => patchTrim(i, { consText: e.target.value })} />
            </Field>
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={() => patch({ trims: [...draft.trims, emptyTrim()] })}
        className="min-h-11 w-full rounded-xl border border-dashed border-line text-sm"
      >
        + 트림 추가
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
          disabled={saving}
          className="min-h-12 rounded-xl bg-accent font-semibold text-white disabled:opacity-40"
        >
          {saving ? "저장 중…" : "카탈로그에 저장"}
        </button>
      </div>
      <p className="rounded-lg bg-soft px-3 py-2 text-xs text-muted">
        이미 등록된 모델이면 새 트림만 추가돼요. 이미지는 저장 후 모델 화면에서 추가할 수 있어요. (준비 중)
      </p>
    </form>
  );
}

function StepTitle({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{n}</span>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
      {message}
    </p>
  );
}
