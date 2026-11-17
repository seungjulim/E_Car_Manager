"use client";

import { useActionState, useState } from "react";
import {
  addEnergyAction,
  addMileageAction,
  addPolicyAction,
  addServiceAction,
  deleteRecordAction,
  saveVehicleAction,
  type FormState,
} from "@/app/cars/(tabs)/actions";
import { presetsFor, suggestNext } from "@/lib/car-care";
import { POWERTRAINS, type Powertrain } from "@/lib/powertrain";
import { compareToQuote, quoteDiffText } from "@/lib/quotes";

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";
const labelCls = "mb-1 block text-xs text-muted";

const PT_LABEL: Record<Powertrain, string> = { ev: "전기차", hev: "하이브리드", phev: "PHEV", ice: "내연기관" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
      {message}
    </p>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:opacity-40">
      {pending ? "저장 중…" : children}
    </button>
  );
}

const useForm = (action: (prev: FormState, fd: FormData) => Promise<FormState>) => useActionState<FormState, FormData>(action, {});

/* ------------------------------------------------------------------ */
/* 차량 등록·수정                                                        */
/* ------------------------------------------------------------------ */

export type VehicleFormValues = {
  id?: string;
  plateNo: string;
  nickname: string;
  brand: string;
  model: string;
  trim: string;
  powertrain: Powertrain;
  iceFuel: "" | "gasoline" | "diesel" | "lpg";
  purchaseYear: string;
  purchasedAt: string;
  vin: string;
  color: string;
  currentMileageKm: string;
  ownerUserId: string;
  notes: string;
};

export const EMPTY_VEHICLE: VehicleFormValues = {
  plateNo: "", nickname: "", brand: "", model: "", trim: "", powertrain: "ev", iceFuel: "", purchaseYear: "",
  purchasedAt: "", vin: "", color: "", currentMileageKm: "", ownerUserId: "", notes: "",
};

export function VehicleForm({
  initial,
  members,
  today,
}: {
  initial: VehicleFormValues;
  members: { id: string; name: string }[];
  today: string;
}) {
  const [state, action, pending] = useForm(saveVehicleAction);
  const [powertrain, setPowertrain] = useState<Powertrain>(initial.powertrain);

  return (
    <form action={action} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="powertrain" value={powertrain} />

      <Field label="차량번호 *">
        <input name="plateNo" defaultValue={initial.plateNo} required maxLength={20} placeholder="12가 3456" className={inputCls} />
      </Field>
      <Field label="별명" hint="가족이 부르는 이름 (예: 엄마 차)">
        <input name="nickname" defaultValue={initial.nickname} maxLength={30} className={inputCls} />
      </Field>

      <Field label="차량 유형 *">
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="차량 유형">
          {POWERTRAINS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={powertrain === p}
              onClick={() => setPowertrain(p)}
              className={`min-h-10 rounded-lg border text-sm ${powertrain === p ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}
            >
              {PT_LABEL[p]}
            </button>
          ))}
        </div>
      </Field>
      {powertrain === "ice" && (
        <Field label="연료">
          <select name="iceFuel" defaultValue={initial.iceFuel || "gasoline"} className={inputCls}>
            <option value="gasoline">휘발유</option>
            <option value="diesel">경유(디젤)</option>
            <option value="lpg">LPG</option>
          </select>
        </Field>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label="브랜드">
          <input name="brand" defaultValue={initial.brand} maxLength={40} className={inputCls} />
        </Field>
        <Field label="모델">
          <input name="model" defaultValue={initial.model} maxLength={60} className={inputCls} />
        </Field>
        <Field label="트림">
          <input name="trim" defaultValue={initial.trim} maxLength={60} className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="구입년도">
          <input name="purchaseYear" defaultValue={initial.purchaseYear} inputMode="numeric" placeholder="2024" className={inputCls} />
        </Field>
        <Field label="구입일">
          <input name="purchasedAt" type="date" max={today} defaultValue={initial.purchasedAt} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="현재 주행거리 (km)">
          <input name="currentMileageKm" defaultValue={initial.currentMileageKm} inputMode="numeric" className={inputCls} />
        </Field>
        <Field label="색상">
          <input name="color" defaultValue={initial.color} maxLength={20} className={inputCls} />
        </Field>
      </div>
      <Field label="차대번호(VIN)">
        <input name="vin" defaultValue={initial.vin} maxLength={30} className={inputCls} />
      </Field>

      {members.length > 0 ? (
        <Field label="주 사용자">
          <select name="ownerUserId" defaultValue={initial.ownerUserId} className={inputCls}>
            <option value="">정하지 않음</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="ownerUserId" value={initial.ownerUserId} />
      )}
      <Field label="메모">
        <textarea name="notes" defaultValue={initial.notes} rows={3} maxLength={1000} className={inputCls} />
      </Field>

      <ErrorBox message={state.error} />
      <Submit pending={pending}>{initial.id ? "수정 저장" : "차량 등록"}</Submit>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* 정비 기록                                                            */
/* ------------------------------------------------------------------ */

const OTHER = "other";

export function ServiceForm({ vehicleId, powertrain, currentKm, today, initialItem = "", initialShop = "", initialCost = "", quote = null }: { vehicleId: string; powertrain: Powertrain; currentKm: number; today: string; initialItem?: string; initialShop?: string; initialCost?: string; quote?: { id: string; shopName: string; totalAmount: number } | null }) {
  const [state, action, pending] = useForm(addServiceAction);
  const presets = presetsFor(powertrain);

  const [item, setItem] = useState<string>(presets.some((p) => p.itemCode === initialItem) ? initialItem : "");
  const [date, setDate] = useState(today);
  const [km, setKm] = useState(currentKm > 0 ? String(currentKm) : "");
  const [nextOn, setNextOn] = useState<string | null>(null); // null = 아직 직접 고치지 않음(추천값 사용)
  const [nextKm, setNextKm] = useState<string | null>(null);
  const [cost, setCost] = useState(initialCost);
  const costNum = cost.trim() === "" ? null : Number(cost.replace(/[,\s원]/g, ""));
  const cmp = quote ? compareToQuote(quote.totalAmount, costNum != null && Number.isFinite(costNum) ? costNum : null) : null;

  const preset = presets.find((p) => p.itemCode === item);
  const kmNum = Number(km.replace(/[,\s]/g, ""));
  const suggestion = suggestNext(
    { km: preset?.defaultIntervalKm, months: preset?.defaultIntervalMonths },
    date,
    km.trim() !== "" && Number.isFinite(kmNum) ? kmNum : null,
  );
  const shownOn = nextOn ?? suggestion.nextDueOn ?? "";
  const shownKm = nextKm ?? (suggestion.nextDueKm != null ? String(suggestion.nextDueKm) : "");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="itemCode" value={item === OTHER ? "" : item} />
      {quote && <input type="hidden" name="repairQuoteId" value={quote.id} />}
      {quote && (
        <p className="rounded-xl border border-accent bg-accent-soft p-3 text-sm">
          <b>{quote.shopName}</b> 견적 {quote.totalAmount.toLocaleString("ko-KR")}원과 실제 금액을 비교해요.
        </p>
      )}

      <Field label="어떤 정비였나요? *">
        <div className="flex flex-wrap gap-2" role="group" aria-label="정비 항목">
          {presets.map((p) => (
            <button
              key={p.itemCode}
              type="button"
              aria-pressed={item === p.itemCode}
              onClick={() => {
                setItem(p.itemCode);
                setNextOn(null);
                setNextKm(null);
              }}
              className={`rounded-full border px-3 py-1.5 text-sm ${item === p.itemCode ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={item === OTHER}
            onClick={() => setItem(OTHER)}
            className={`rounded-full border px-3 py-1.5 text-sm ${item === OTHER ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}
          >
            기타
          </button>
        </div>
      </Field>
      {(item === OTHER || item === "") && (
        <Field label={item === OTHER ? "정비 내용 *" : "또는 직접 입력"}>
          <input name="category" maxLength={40} placeholder="예: 사고 수리, 도어 교체" className={inputCls} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="정비일 *">
          <input name="servicedOn" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} required className={inputCls} />
        </Field>
        <Field label="주행거리 (km)">
          <input name="mileageKm" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="정비소">
          <input name="shopName" maxLength={60} defaultValue={initialShop} placeholder="블루핸즈 ○○점" className={inputCls} />
        </Field>
        <Field label="비용 (원)">
          <input name="cost" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="120,000" className={inputCls} />
        </Field>
      </div>

      {cmp && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm font-semibold ${cmp.kind === "extra" ? "bg-warn-soft text-warn" : cmp.kind === "saved" ? "bg-ok-soft text-ok" : "bg-soft"}`}>
          {quoteDiffText(cmp, (n) => `${n.toLocaleString("ko-KR")}원`)}
        </p>
      )}

      <fieldset className="space-y-3 rounded-xl border border-line bg-surface p-3">
        <legend className="px-1 text-sm font-bold">다음 예정</legend>
        {preset && (preset.defaultIntervalKm || preset.defaultIntervalMonths) ? (
          <p className="text-xs text-muted">
            기본 주기({[preset.defaultIntervalKm ? `${preset.defaultIntervalKm.toLocaleString("ko-KR")}km` : null, preset.defaultIntervalMonths ? `${preset.defaultIntervalMonths}개월` : null].filter(Boolean).join(" · ")})로 계산했어요. 제조사 지침에 맞게 고쳐 주세요.
          </p>
        ) : (
          <p className="text-xs text-muted">다음 정비 시기를 알면 적어 두세요. 일정 탭에 표시돼요.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="예정일">
            <input name="nextDueOn" type="date" value={shownOn} onChange={(e) => setNextOn(e.target.value)} className={inputCls} />
          </Field>
          <Field label="예정 주행거리 (km)">
            <input name="nextDueKm" inputMode="numeric" value={shownKm} onChange={(e) => setNextKm(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </fieldset>

      <Field label="메모">
        <textarea name="description" rows={3} maxLength={1000} className={inputCls} />
      </Field>
      <ErrorBox message={state.error} />
      <Submit pending={pending}>정비 기록 저장</Submit>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* 보험                                                                 */
/* ------------------------------------------------------------------ */

export function PolicyForm({ vehicleId }: { vehicleId: string }) {
  const [state, action, pending] = useForm(addPolicyAction);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <Field label="보험사 *">
        <input name="insurer" required maxLength={40} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="시작일">
          <input name="startOn" type="date" className={inputCls} />
        </Field>
        <Field label="만기일 *">
          <input name="endOn" type="date" required className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="보험료 (원)">
          <input name="premium" inputMode="numeric" placeholder="800,000" className={inputCls} />
        </Field>
        <Field label="보장 종류">
          <input name="coverageType" maxLength={40} placeholder="자차+대인" className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="증권번호">
          <input name="policyNo" maxLength={40} className={inputCls} />
        </Field>
        <Field label="연락처">
          <input name="contact" maxLength={40} className={inputCls} />
        </Field>
      </div>
      <Field label="메모">
        <textarea name="notes" rows={3} maxLength={1000} className={inputCls} />
      </Field>
      <p className="rounded-lg bg-soft px-3 py-2 text-xs text-muted">보험료는 시작일(없으면 입력한 날)에 한 번 낸 것으로 비용에 반영돼요.</p>
      <ErrorBox message={state.error} />
      <Submit pending={pending}>보험 저장</Submit>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* 주행거리                                                             */
/* ------------------------------------------------------------------ */

export function MileageForm({ vehicleId, today, currentKm }: { vehicleId: string; today: string; currentKm: number }) {
  const [state, action, pending] = useForm(addMileageAction);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="기록일 *">
          <input name="recordedOn" type="date" max={today} defaultValue={today} required className={inputCls} />
        </Field>
        <Field label="계기판 주행거리 (km) *" hint={currentKm > 0 ? `지금 ${currentKm.toLocaleString("ko-KR")}km` : undefined}>
          <input name="mileageKm" inputMode="numeric" required autoFocus className={inputCls} />
        </Field>
      </div>
      <Field label="메모">
        <input name="note" maxLength={200} className={inputCls} />
      </Field>
      <ErrorBox message={state.error} />
      <Submit pending={pending}>주행거리 저장</Submit>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* 충전·주유                                                            */
/* ------------------------------------------------------------------ */

export function EnergyForm({ vehicleId, powertrain, today }: { vehicleId: string; powertrain: Powertrain; today: string }) {
  const [state, action, pending] = useForm(addEnergyAction);
  const kinds: ("charging" | "fueling")[] = powertrain === "ev" ? ["charging"] : powertrain === "phev" ? ["charging", "fueling"] : ["fueling"];
  const [kind, setKind] = useState<"charging" | "fueling">(kinds[0]);
  const charging = kind === "charging";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="kind" value={kind} />
      {kinds.length > 1 && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="종류">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-10 rounded-lg border text-sm ${kind === k ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}
            >
              {k === "charging" ? "⚡ 충전" : "⛽ 주유"}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="날짜 *">
          <input name="on" type="date" max={today} defaultValue={today} required className={inputCls} />
        </Field>
        <Field label="계기판 주행거리 (km)">
          <input name="odometerKm" inputMode="numeric" className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={charging ? "충전량 (kWh)" : "주유량 (L)"}>
          <input name="amount" inputMode="decimal" className={inputCls} />
        </Field>
        <Field label="금액 (원)">
          <input name="cost" inputMode="numeric" className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={charging ? "충전 방식" : "연료 종류"}>
          {charging ? (
            <select name="detail" defaultValue="" className={inputCls}>
              <option value="">선택 안 함</option>
              <option value="dc">급속</option>
              <option value="ac">완속</option>
            </select>
          ) : (
            <select name="detail" defaultValue="" className={inputCls}>
              <option value="">선택 안 함</option>
              <option value="휘발유">휘발유</option>
              <option value="고급휘발유">고급휘발유</option>
              <option value="경유">경유</option>
              <option value="LPG">LPG</option>
            </select>
          )}
        </Field>
        <Field label="장소">
          <input name="place" maxLength={60} className={inputCls} />
        </Field>
      </div>
      <ErrorBox message={state.error} />
      <Submit pending={pending}>{charging ? "충전 기록 저장" : "주유 기록 저장"}</Submit>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* 기록 삭제 버튼                                                        */
/* ------------------------------------------------------------------ */

export function DeleteRecordButton({
  id,
  vehicleId,
  type,
  label,
}: {
  id: string;
  vehicleId: string;
  type: "service" | "policy" | "mileage" | "charging" | "fueling" | "inspection";
  label: string;
}) {
  return (
    <form
      action={deleteRecordAction}
      onSubmit={(e) => {
        if (!window.confirm(`${label}을(를) 삭제할까요?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="type" value={type} />
      <button type="submit" className="min-h-9 rounded-lg border border-line px-3 text-xs text-bad" aria-label={`${label} 삭제`}>
        삭제
      </button>
    </form>
  );
}
