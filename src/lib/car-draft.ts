/**
 * 신차 추가: Claude 추출 결과(AI) ↔ 화면 편집용 초안(Draft) ↔ DB 저장값 변환.
 * 서버·클라이언트가 함께 쓰는 순수 함수만 둔다(서버 전용 코드는 car-extract.ts / car-save.ts).
 */
import { z } from "zod";
import type { PowertrainSpecs } from "@/db/schema/catalog";
import { POWERTRAINS, type Powertrain } from "@/lib/powertrain";

/** 붙여넣을 수 있는 자료의 최대 글자 수 */
export const MAX_SOURCE_CHARS = 30_000;

export const ICE_FUELS = ["gasoline", "diesel", "lpg"] as const;
export type IceFuel = (typeof ICE_FUELS)[number];
export const ICE_FUEL_LABEL: Record<IceFuel, string> = { gasoline: "휘발유", diesel: "디젤", lpg: "LPG" };

/** 파워트레인별로 입력받는 사양 항목 (키는 PowertrainSpecs 필드명) */
export type SpecField = { key: string; label: string; unit: string; kind: "number" | "text" };

export const SPEC_FIELDS: Record<Powertrain, SpecField[]> = {
  ev: [
    { key: "rangeKm", label: "1회 충전 주행거리", unit: "km", kind: "number" },
    { key: "batteryKwh", label: "배터리 용량", unit: "kWh", kind: "number" },
    { key: "dcChargeKw", label: "급속 충전 출력", unit: "kW", kind: "number" },
    { key: "acChargeKw", label: "완속 충전 출력", unit: "kW", kind: "number" },
    { key: "efficiencyKmPerKwh", label: "전비", unit: "km/kWh", kind: "number" },
  ],
  hev: [
    { key: "fuelEconomyKmpl", label: "복합 연비", unit: "km/L", kind: "number" },
    { key: "systemPowerKw", label: "시스템 출력", unit: "kW", kind: "number" },
  ],
  phev: [
    { key: "fuelEconomyKmpl", label: "복합 연비", unit: "km/L", kind: "number" },
    { key: "systemPowerKw", label: "시스템 출력", unit: "kW", kind: "number" },
    { key: "evRangeKm", label: "전기모드 주행거리", unit: "km", kind: "number" },
    { key: "batteryKwh", label: "배터리 용량", unit: "kWh", kind: "number" },
  ],
  ice: [
    { key: "displacementCc", label: "배기량", unit: "cc", kind: "number" },
    { key: "fuelEconomyKmpl", label: "복합 연비", unit: "km/L", kind: "number" },
    { key: "transmission", label: "변속기", unit: "", kind: "text" },
    { key: "powerPs", label: "최고출력", unit: "PS", kind: "number" },
    { key: "torqueKgm", label: "최대토크", unit: "kgf·m", kind: "number" },
  ],
};

/* ------------------------------------------------------------------ */
/* 1) Claude 가 돌려주는 구조 (structured output 스키마)                  */
/* ------------------------------------------------------------------ */

const nInt = z.number().int().nullable();
const nNum = z.number().nullable();

export const aiCarSchema = z.object({
  brand: z.string(),
  model: z.string(),
  segment: z.string().nullable(),
  powertrain: z.enum(POWERTRAINS),
  iceFuel: z.enum(ICE_FUELS).nullable(),
  releaseYear: nInt,
  summary: z.string(),
  trims: z.array(
    z.object({
      name: z.string(),
      priceKrw: nInt,
      subsidyEstimateKrw: nInt,
      specs: z.object({
        rangeKm: nNum,
        batteryKwh: nNum,
        dcChargeKw: nNum,
        acChargeKw: nNum,
        efficiencyKmPerKwh: nNum,
        fuelEconomyKmpl: nNum,
        systemPowerKw: nNum,
        evRangeKm: nNum,
        displacementCc: nNum,
        transmission: z.string().nullable(),
        powerPs: nNum,
        torqueKgm: nNum,
      }),
      features: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
    }),
  ),
  notes: z.array(z.string()),
});
export type AiCar = z.infer<typeof aiCarSchema>;

/* ------------------------------------------------------------------ */
/* 2) 화면 편집용 초안 (입력창은 전부 문자열, 가격은 만원 단위)             */
/* ------------------------------------------------------------------ */

export type TrimDraft = {
  name: string;
  priceMan: string; // 만원
  subsidyMan: string; // 만원
  specs: Record<string, string>;
  featuresText: string; // 줄마다 "카테고리: 항목, 항목"
  prosText: string; // 줄마다 1개
  consText: string;
};

export type CarDraft = {
  brand: string;
  model: string;
  segment: string;
  powertrain: Powertrain;
  iceFuel: "" | IceFuel;
  releaseYear: string;
  summary: string;
  trims: TrimDraft[];
};

export function emptyTrim(): TrimDraft {
  return { name: "", priceMan: "", subsidyMan: "", specs: {}, featuresText: "", prosText: "", consText: "" };
}

const toMan = (krw: number | null) => (krw == null ? "" : String(Math.round(krw / 10_000)));
const numStr = (n: number | string | null | undefined) => (n == null ? "" : String(n));

/** "안전: 전방충돌방지, 차로유지" 형식의 여러 줄 텍스트로 */
export function formatFeatures(features: { category: string; items: string[] }[]): string {
  return features
    .filter((f) => f.items.length > 0)
    .map((f) => `${f.category}: ${f.items.join(", ")}`)
    .join("\n");
}

/** 여러 줄 텍스트 → { 카테고리: [항목…] }. 콜론이 없는 줄은 '기타'. 중복·빈 항목은 제거 */
export function parseFeatures(text: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.search(/[:：]/);
    const category = (idx > 0 ? line.slice(0, idx) : "기타").trim() || "기타";
    const body = idx > 0 ? line.slice(idx + 1) : line;
    const items = body
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) continue;
    const bucket = (result[category] ??= []);
    for (const item of items) if (!bucket.includes(item)) bucket.push(item);
  }
  return result;
}

export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(/^[-•·*\s]+/, "").trim())
    .filter(Boolean);
}

/** AI 추출 결과 → 편집 초안. 해당 파워트레인에 없는 사양은 버린다 */
export function aiToDraft(ai: AiCar): CarDraft {
  const fields = SPEC_FIELDS[ai.powertrain];
  return {
    brand: ai.brand.trim(),
    model: ai.model.trim(),
    segment: ai.segment?.trim() ?? "",
    powertrain: ai.powertrain,
    iceFuel: ai.powertrain === "ice" ? (ai.iceFuel ?? "") : "",
    releaseYear: numStr(ai.releaseYear),
    summary: ai.summary.trim(),
    trims: ai.trims.map((t) => ({
      name: t.name.trim(),
      priceMan: toMan(t.priceKrw),
      subsidyMan: toMan(t.subsidyEstimateKrw),
      specs: Object.fromEntries(
        fields.map((f) => [f.key, numStr(t.specs[f.key as keyof typeof t.specs] as number | string | null)]),
      ),
      featuresText: formatFeatures(t.features),
      prosText: t.pros.join("\n"),
      consText: t.cons.join("\n"),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 3) 저장 입력 검증 + DB 값으로 변환                                     */
/* ------------------------------------------------------------------ */

const text = (max: number) => z.string().trim().max(max);

export const trimDraftSchema = z.object({
  name: text(80).min(1, "트림 이름을 입력해 주세요."),
  priceMan: text(12),
  subsidyMan: text(12),
  specs: z.record(z.string(), text(60)),
  featuresText: text(6000),
  prosText: text(3000),
  consText: text(3000),
});

export const carDraftSchema = z.object({
  brand: text(60).min(1, "브랜드를 입력해 주세요."),
  model: text(80).min(1, "모델명을 입력해 주세요."),
  segment: text(30),
  powertrain: z.enum(POWERTRAINS),
  iceFuel: z.enum(["", ...ICE_FUELS]),
  releaseYear: text(4),
  summary: text(2000),
  trims: z.array(trimDraftSchema).min(1, "트림을 하나 이상 입력해 주세요.").max(30, "트림은 최대 30개까지 저장할 수 있어요."),
});

export const savePayloadSchema = z.object({
  draft: carDraftSchema,
  rawText: z.string().max(60_000).optional(),
  sourceUrl: z.string().max(2000).optional(),
});

/** "5,000" / "5000만" / " 4.5 " → 숫자. 비어 있으면 null, 숫자가 아니면 undefined(오류) */
export function parseNumber(input: string): number | null | undefined {
  const s = input.replace(/[,\s]/g, "").replace(/(만원|만|원|km|kwh|kw|cc|ps|km\/l|km\/kwh|kgf·m|kgm)$/i, "");
  if (s === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  return Number(s);
}

export type CarRecord = {
  brandName: string;
  model: {
    name: string;
    segment: string | null;
    powertrain: Powertrain;
    iceFuel: IceFuel | null;
    releaseYear: number | null;
    summary: string | null;
  };
  trims: {
    name: string;
    price: number | null; // 원
    subsidyEstimate: number | null; // 원
    features: Record<string, string[]>;
    powertrainSpecs: PowertrainSpecs;
    pros: string[];
    cons: string[];
  }[];
};

/** 검증된 초안 → DB 에 넣을 값. 숫자 형식이 틀리면 사용자에게 보여줄 오류 메시지를 돌려준다 */
export function draftToRecord(draft: z.infer<typeof carDraftSchema>): { ok: true; record: CarRecord } | { ok: false; error: string } {
  const year = parseNumber(draft.releaseYear);
  if (year === undefined || (year !== null && (!Number.isInteger(year) || year < 1990 || year > 2100))) {
    return { ok: false, error: "출시 연도를 4자리 숫자로 입력해 주세요." };
  }

  const fields = SPEC_FIELDS[draft.powertrain];
  const trims: CarRecord["trims"] = [];
  const seen = new Set<string>();

  for (const [i, t] of draft.trims.entries()) {
    const label = `트림 ${i + 1}(${t.name})`;
    if (seen.has(t.name)) return { ok: false, error: `${label}: 같은 이름의 트림이 있어요.` };
    seen.add(t.name);

    const price = parseNumber(t.priceMan);
    if (price === undefined || (price !== null && (price < 0 || price > 1_000_000))) {
      return { ok: false, error: `${label}: 가격(만원)을 숫자로 입력해 주세요.` };
    }
    const subsidy = parseNumber(t.subsidyMan);
    if (subsidy === undefined || (subsidy !== null && (subsidy < 0 || subsidy > 100_000))) {
      return { ok: false, error: `${label}: 보조금(만원)을 숫자로 입력해 주세요.` };
    }

    const specValues: Record<string, number | string> = {};
    for (const f of fields) {
      const raw = t.specs[f.key] ?? "";
      if (f.kind === "text") {
        if (raw) specValues[f.key] = raw;
        continue;
      }
      const n = parseNumber(raw);
      if (n === undefined || (n !== null && n < 0)) {
        return { ok: false, error: `${label}: ${f.label}을(를) 숫자로 입력해 주세요.` };
      }
      if (n !== null) specValues[f.key] = n;
    }

    trims.push({
      name: t.name,
      price: price == null ? null : Math.round(price * 10_000),
      subsidyEstimate: subsidy == null ? null : Math.round(subsidy * 10_000),
      features: parseFeatures(t.featuresText),
      powertrainSpecs: { type: draft.powertrain, ...specValues } as PowertrainSpecs,
      pros: parseLines(t.prosText).slice(0, 10),
      cons: parseLines(t.consText).slice(0, 10),
    });
  }

  return {
    ok: true,
    record: {
      brandName: draft.brand,
      model: {
        name: draft.model,
        segment: draft.segment || null,
        powertrain: draft.powertrain,
        iceFuel: draft.powertrain === "ice" ? (draft.iceFuel || "gasoline") : null,
        releaseYear: year,
        summary: draft.summary || null,
      },
      trims,
    },
  };
}
