"use client";

import { useActionState, useState } from "react";
import { addInspectionAction, type FormState } from "@/app/cars/(tabs)/actions";
import { noteField, sectionsFor, statusField, STATUS_ICON, STATUS_SHORT, STATUSES, type CheckMode, type ChecklistItem, type InspectionStatus } from "@/lib/inspection";

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";
const labelCls = "mb-1 block text-xs text-muted";

const TONE: Record<InspectionStatus, string> = {
  ok: "border-ok bg-ok-soft text-ok",
  warn: "border-warn bg-warn-soft text-warn",
  replace: "border-bad bg-bad-soft text-bad",
  na: "border-line bg-soft text-muted",
};

const METHOD_LABEL = { self: "직접", shop: "정비소", both: "직접·정비소" } as const;

export function InspectionForm({ vehicleId, mode, items, today, currentKm }: { vehicleId: string; mode: CheckMode; items: ChecklistItem[]; today: string; currentKm: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addInspectionAction, {});
  const [values, setValues] = useState<Record<string, InspectionStatus>>({});
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const sections = sectionsFor(items);
  const answered = Object.keys(values).length;

  const set = (code: string, status: InspectionStatus) => setValues((v) => (v[code] === status ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== code)) : { ...v, [code]: status }));
  const allOk = (list: ChecklistItem[]) =>
    setValues((v) => {
      const next = { ...v };
      for (const i of list) if (!next[i.itemCode]) next[i.itemCode] = "ok";
      return next;
    });

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="mode" value={mode} />
      {Object.entries(values).map(([code, status]) => (
        <input key={code} type="hidden" name={statusField(code)} value={status} />
      ))}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelCls}>점검일 *</span>
          <input name="inspectedOn" type="date" max={today} defaultValue={today} required className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>주행거리 (km)</span>
          <input name="mileageKm" inputMode="numeric" defaultValue={currentKm > 0 ? String(currentKm) : ""} className={inputCls} />
        </label>
      </div>
      {mode === "shop" && (
        <label className="block">
          <span className={labelCls}>점검 장소</span>
          <input name="place" maxLength={60} placeholder="블루핸즈 ○○점" className={inputCls} />
        </label>
      )}

      {sections.map((sec) => (
        <section key={sec.key} className="space-y-2" aria-label={sec.title}>
          <div className="flex items-end justify-between gap-2">
            <div>
              <h2 className="font-bold">{sec.title}</h2>
              {sec.hint && <p className="text-xs text-muted">{sec.hint}</p>}
            </div>
            <button type="button" onClick={() => allOk(sec.items)} className="shrink-0 rounded-full border border-line px-3 py-1 text-xs font-semibold">
              남은 항목 모두 정상
            </button>
          </div>
          <ul className="space-y-2">
            {sec.items.map((item) => {
              const cur = values[item.itemCode];
              const noteOpen = openNotes.has(item.itemCode) || cur === "warn" || cur === "replace";
              return (
                <li key={item.itemCode} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-semibold">
                      {item.topRank != null && <span className="mr-1 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">TOP {item.topRank}</span>}
                      {item.name}
                    </p>
                    {item.checkMethod && <span className="shrink-0 text-[11px] text-muted">{METHOD_LABEL[item.checkMethod]}</span>}
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label={`${item.name} 점검 결과`}>
                    {STATUSES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        aria-pressed={cur === st}
                        onClick={() => set(item.itemCode, st)}
                        className={`min-h-11 rounded-lg border px-1 text-xs ${cur === st ? `${TONE[st]} font-bold` : "border-line bg-surface"}`}
                      >
                        <span aria-hidden>{STATUS_ICON[st]}</span> {STATUS_SHORT[st]}
                      </button>
                    ))}
                  </div>
                  {noteOpen ? (
                    <input name={noteField(item.itemCode)} maxLength={200} placeholder="메모 (예: 앞 왼쪽 타이어 마모 심함)" className={`${inputCls} mt-2 text-sm`} />
                  ) : (
                    <button type="button" onClick={() => setOpenNotes((s) => new Set(s).add(item.itemCode))} className="mt-2 text-xs text-muted underline">
                      메모 추가
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <label className="block">
        <span className={labelCls}>전체 메모</span>
        <textarea name="memo" rows={3} maxLength={1000} className={inputCls} />
      </label>

      {state.error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending || answered === 0} className="sticky bottom-20 min-h-12 w-full rounded-xl bg-accent font-semibold text-white shadow-lg disabled:opacity-40">
        {pending ? "저장 중…" : answered === 0 ? "점검 결과를 골라 주세요" : `점검 기록 저장 (${answered}/${items.length}개)`}
      </button>
    </form>
  );
}
