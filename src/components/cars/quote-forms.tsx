"use client";

import { Fragment, useActionState, useState, useTransition } from "react";
import { addQuoteAction, createRequestAction, extractQuoteDocumentAction, updateQuoteAction, type QuoteFormState } from "@/app/cars/(tabs)/quote-actions";
import { documentImageUrl } from "@/lib/document-constants";
import type { QuoteDraft } from "@/lib/quote-extract";
import { presetsFor } from "@/lib/car-care";
import type { Powertrain } from "@/lib/powertrain";
import { MAX_RADIUS_KM, PART_PREF_LABEL, SHOP_TYPE_LABEL, SOURCE_LABEL, type ShopType } from "@/lib/quotes";

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";
const labelCls = "mb-1 block text-xs text-muted";

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

type Coords = { lat: string; lng: string } | null;

/** 브라우저 위치 권한으로 현재 위치를 받아 폼에 넣는다. 거부해도 폼은 그대로 쓸 수 있다 */
function LocationPicker({ latName, lngName, label, buttonLabel }: { latName: string; lngName: string; label: string; buttonLabel: string }) {
  const [coords, setCoords] = useState<Coords>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function locate() {
    setError("");
    if (!("geolocation" in navigator)) return setError("이 브라우저에서는 위치를 가져올 수 없어요.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude.toFixed(4), lng: pos.coords.longitude.toFixed(4) });
        setBusy(false);
      },
      (err) => {
        setBusy(false);
        setError(err.code === err.PERMISSION_DENIED ? "위치 권한이 꺼져 있어요. 브라우저 설정에서 허용하거나, 위치 없이 진행할 수 있어요." : "위치를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <p className="text-sm font-bold">{label}</p>
      <input type="hidden" name={latName} value={coords?.lat ?? ""} />
      <input type="hidden" name={lngName} value={coords?.lng ?? ""} />
      {coords ? (
        <p className="text-sm text-ok">
          ✓ 위치를 가져왔어요{" "}
          <span className="text-xs text-muted">
            ({coords.lat}, {coords.lng})
          </span>{" "}
          <button type="button" onClick={() => setCoords(null)} className="text-xs text-muted underline">
            지우기
          </button>
        </p>
      ) : (
        <button type="button" onClick={locate} disabled={busy} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-40">
          {busy ? "위치 확인 중…" : buttonLabel}
        </button>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
      <p className="text-[11px] text-muted">위치는 약 100m 단위로 줄여서 우리 가족 계정에만 저장해요.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 견적 요청                                                            */
/* ------------------------------------------------------------------ */

const OTHER = "other";

export function QuoteRequestForm({ vehicleId, powertrain, initialItem = "" }: { vehicleId: string; powertrain: Powertrain; initialItem?: string }) {
  const [state, action, pending] = useActionState<QuoteFormState, FormData>(createRequestAction, {});
  const presets = presetsFor(powertrain);
  const [item, setItem] = useState<string>(presets.some((p) => p.itemCode === initialItem) ? initialItem : "");
  const [radius, setRadius] = useState(String(MAX_RADIUS_KM));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="itemCode" value={item === OTHER ? "" : item} />

      <Field label="어떤 수리인가요? *">
        <div className="flex flex-wrap gap-2" role="group" aria-label="수리 항목">
          {presets.map((p) => (
            <button
              key={p.itemCode}
              type="button"
              aria-pressed={item === p.itemCode}
              onClick={() => setItem(p.itemCode)}
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
      <Field label={item === OTHER || item === "" ? "수리 내용 *" : "증상·요청 사항 (선택)"}>
        <textarea name="description" rows={3} maxLength={500} placeholder="예: 앞 범퍼 긁힘 도색, 브레이크 소음" className={inputCls} />
      </Field>

      <Field label="부품 종류">
        <select name="partPref" defaultValue="any" className={inputCls}>
          {Object.entries(PART_PREF_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>

      <LocationPicker latName="originLat" lngName="originLng" label="내 위치 (거리 계산용)" buttonLabel="📍 현재 위치 사용" />

      <Field label={`검색 반경 (km, 최대 ${MAX_RADIUS_KM})`}>
        <input name="radiusKm" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} className={inputCls} />
      </Field>

      <fieldset className="space-y-2">
        <legend className={labelCls}>정비소 유형 (선택하지 않으면 전체)</legend>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(SHOP_TYPE_LABEL) as ShopType[]).map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="shopTypes" value={t} className="size-4" /> {SHOP_TYPE_LABEL[t]}
            </label>
          ))}
        </div>
      </fieldset>

      <ErrorBox message={state.error} />
      <Submit pending={pending}>견적 요청 만들기</Submit>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* 견적 입력                                                            */
/* ------------------------------------------------------------------ */

export type ShopOption = { id: string; name: string; type: ShopType; distanceKm: number | null };

/** 견적서 사진을 AI 로 읽는 버튼과 결과 안내. 읽기가 끝나면 onRead 로 초안을 넘긴다 */
function QuoteReader({ documentId, hasDraft, onRead }: { documentId: string; hasDraft: boolean; onRead: (draft: QuoteDraft, shopId: string | null) => void }) {
  const [reading, start] = useTransition();
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  function read() {
    setError("");
    start(async () => {
      const r = await extractQuoteDocumentAction(documentId);
      if (!r.ok) return setError(r.error);
      setNotes(r.draft.notes);
      onRead(r.draft, r.shopId);
    });
  }
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <p className="font-bold">견적서 사진으로 입력</p>
      <p className="text-xs text-muted">AI가 사진을 읽어 정비소·금액·보증 등을 채워 줘요. 틀릴 수 있으니 꼭 확인하고 고쳐 주세요.</p>
      <button type="button" onClick={read} disabled={reading} className="min-h-11 w-full rounded-xl border border-accent font-semibold text-accent disabled:opacity-40">
        {reading ? "사진을 읽는 중… (10~30초)" : hasDraft ? "🔄 다시 읽기" : "✨ AI로 사진 읽기"}
      </button>
      {error && <ErrorBox message={error} />}
      {notes.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-lg bg-warn-soft px-6 py-2 text-xs text-warn">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

type AmountDefaults = Partial<Record<"total" | "parts" | "labor" | "tax" | "partType" | "warranty" | "validUntil", string>>;

/** 금액·부품 종류·보증·유효기간 입력칸(견적 입력과 견적 수정이 함께 쓴다) */
function AmountFields({ d }: { d: AmountDefaults }) {
  return (
    <>
      <Field label="총 견적 금액 (원) *" hint="부품비·공임·부가세를 모두 합친 금액이에요.">
        <input name="totalAmount" inputMode="numeric" required defaultValue={d.total ?? ""} placeholder="350,000" className={inputCls} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="부품비">
          <input name="partsAmount" inputMode="numeric" defaultValue={d.parts ?? ""} className={inputCls} />
        </Field>
        <Field label="공임">
          <input name="laborAmount" inputMode="numeric" defaultValue={d.labor ?? ""} className={inputCls} />
        </Field>
        <Field label="부가세">
          <input name="taxAmount" inputMode="numeric" defaultValue={d.tax ?? ""} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="부품 종류">
          <input name="partType" maxLength={30} defaultValue={d.partType ?? ""} placeholder="순정 / OEM / 애프터마켓" className={inputCls} />
        </Field>
        <Field label="보증 기간 (개월)">
          <input name="warrantyMonths" inputMode="numeric" defaultValue={d.warranty ?? ""} className={inputCls} />
        </Field>
      </div>
      <Field label="견적 유효기간">
        <input name="validUntil" type="date" defaultValue={d.validUntil ?? ""} className={inputCls} />
      </Field>
    </>
  );
}

const draftFields = (d: QuoteDraft | null): AmountDefaults =>
  d
    ? {
        total: d.totalAmount != null ? String(d.totalAmount) : "",
        parts: d.partsAmount != null ? String(d.partsAmount) : "",
        labor: d.laborAmount != null ? String(d.laborAmount) : "",
        tax: d.taxAmount != null ? String(d.taxAmount) : "",
        partType: d.partType ?? "",
        warranty: d.warrantyMonths != null ? String(d.warrantyMonths) : "",
        validUntil: d.validUntil ?? "",
      }
    : {};

export type QuoteDocument = { id: string; imageIds: string[]; draft: QuoteDraft | null };

export function QuoteForm({ requestId, shops, document }: { requestId: string; shops: ShopOption[]; document?: QuoteDocument }) {
  const [state, action, pending] = useActionState<QuoteFormState, FormData>(addQuoteAction, {});
  const [shopId, setShopId] = useState<string>(shops.length > 0 ? "" : "new");
  const [draft, setDraft] = useState<QuoteDraft | null>(document?.draft ?? null);
  const [version, setVersion] = useState(0); // 새로 읽을 때마다 입력칸을 새 값으로 다시 만든다
  const isNew = shopId === "new";

  function applyRead(d: QuoteDraft, matchedShopId: string | null) {
    setDraft(d);
    // 이미 등록한 정비소와 이름이 같으면 그 정비소를 고르고, 아니면 새 정비소로 입력
    setShopId(matchedShopId ?? (d.shopName ? "new" : shopId));
    setVersion((v) => v + 1);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="requestId" value={requestId} />
      {document && <input type="hidden" name="documentId" value={document.id} />}

      {document && (
        <>
          <div className="flex gap-2 overflow-x-auto" aria-label="올린 견적서 사진">
            {document.imageIds.map((id, i) => (
              <a key={id} href={documentImageUrl(id)} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {/* 비공개 저장소의 사진이라 로그인 확인을 거치는 경로를 쓴다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={documentImageUrl(id)} alt={`견적서 ${i + 1}번째 사진`} className="h-28 rounded-lg border border-line object-cover" />
              </a>
            ))}
          </div>
          <QuoteReader documentId={document.id} hasDraft={draft != null} onRead={applyRead} />
        </>
      )}

      <Fragment key={version}>
        <Field label="정비소 *">
          <select name="shopId" value={shopId} onChange={(e) => setShopId(e.target.value)} className={inputCls} required>
            <option value="" disabled>
              정비소를 골라 주세요
            </option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {SHOP_TYPE_LABEL[s.type]}
                {s.distanceKm != null ? ` · ${s.distanceKm}km` : ""}
              </option>
            ))}
            <option value="new">+ 새 정비소 입력</option>
          </select>
        </Field>

        {isNew ? (
          <fieldset className="space-y-3 rounded-xl border border-line bg-surface p-3">
            <legend className="px-1 text-sm font-bold">새 정비소</legend>
            <Field label="이름 *">
              <input name="shopName" maxLength={60} defaultValue={draft?.shopName ?? ""} placeholder="블루핸즈 ○○점" className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="유형">
                <select name="shopType" defaultValue="general" className={inputCls}>
                  {(Object.keys(SHOP_TYPE_LABEL) as ShopType[]).map((t) => (
                    <option key={t} value={t}>
                      {SHOP_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="전화번호">
                <input name="shopPhone" type="tel" maxLength={30} defaultValue={draft?.shopPhone ?? ""} className={inputCls} />
              </Field>
            </div>
            <Field label="주소">
              <input name="shopAddress" maxLength={120} className={inputCls} />
            </Field>
            <LocationPicker latName="shopLat" lngName="shopLng" label="정비소 위치 (거리 계산용)" buttonLabel="📍 지금 정비소 근처예요 (현재 위치 사용)" />
          </fieldset>
        ) : (
          <input type="hidden" name="shopType" value="general" />
        )}

        <AmountFields d={draftFields(draft)} />
      </Fragment>

      <Field label="견적 받은 방법">
        <select name="source" defaultValue={document ? "document" : "phone"} className={inputCls}>
          {(["phone", "document", "manual"] as const).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="메모">
        <textarea name="note" rows={2} maxLength={500} defaultValue={draft?.summary ?? ""} className={inputCls} />
      </Field>
      {!document && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="attach" className="size-4" /> 저장 후 견적서 사진도 첨부하기
        </label>
      )}

      <ErrorBox message={state.error} />
      <Submit pending={pending}>견적 저장</Submit>
    </form>
  );
}

/** 이미 입력한 견적에 붙은 견적서 사진을 읽어, 금액 등을 확인한 뒤 견적에 반영한다 */
export function QuoteDocReview({
  quoteId,
  documentId,
  current,
  initialDraft,
}: {
  quoteId: string;
  documentId: string;
  current: { totalAmount: number; partsAmount: number | null; laborAmount: number | null; taxAmount: number | null; partType: string | null; warrantyMonths: number | null; validUntil: string | null };
  initialDraft: QuoteDraft | null;
}) {
  const [state, action, pending] = useActionState<QuoteFormState, FormData>(updateQuoteAction, {});
  const [draft, setDraft] = useState<QuoteDraft | null>(initialDraft);
  const [version, setVersion] = useState(0);
  const base: AmountDefaults = {
    total: String(current.totalAmount),
    parts: current.partsAmount != null ? String(current.partsAmount) : "",
    labor: current.laborAmount != null ? String(current.laborAmount) : "",
    tax: current.taxAmount != null ? String(current.taxAmount) : "",
    partType: current.partType ?? "",
    warranty: current.warrantyMonths != null ? String(current.warrantyMonths) : "",
    validUntil: current.validUntil ?? "",
  };
  // 읽은 값이 있는 칸은 읽은 값으로, 읽지 못한 칸은 지금 입력된 값을 그대로 둔다
  const read = draftFields(draft);
  const d: AmountDefaults = { ...base, ...Object.fromEntries(Object.entries(read).filter(([, v]) => v !== "")) };
  const differs = draft?.totalAmount != null && draft.totalAmount !== current.totalAmount;

  return (
    <div className="space-y-4">
      <QuoteReader
        documentId={documentId}
        hasDraft={draft != null}
        onRead={(r) => {
          setDraft(r);
          setVersion((v) => v + 1);
        }}
      />
      {draft && (
        <p className={`rounded-lg px-3 py-2 text-sm ${differs ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>
          {differs
            ? `사진에서 읽은 총액(${draft.totalAmount?.toLocaleString("ko-KR")}원)이 입력해 둔 견적(${current.totalAmount.toLocaleString("ko-KR")}원)과 달라요. 맞는 금액으로 반영해 주세요.`
            : "사진에서 읽은 총액이 입력해 둔 견적과 같아요."}
        </p>
      )}
      <form key={version} action={action} className="space-y-4">
        <input type="hidden" name="quoteId" value={quoteId} />
        <AmountFields d={d} />
        <ErrorBox message={state.error} />
        <Submit pending={pending}>이 내용으로 견적 수정</Submit>
      </form>
    </div>
  );
}
