"use client";

import { useMemo, useState } from "react";
import { calcPurchaseCost, type CostInputs, type Scenario } from "@/lib/purchase-cost";
import { POWERTRAINS, type Powertrain } from "@/lib/powertrain";

export type CostCandidate = {
  key: string; // 트림 id 또는 "manual"
  label: string;
  powertrain: Powertrain;
  priceMan: number | null;
  subsidyMan: number | null;
  kmPerKwh: number | null;
  kmPerL: number | null;
};

const PT_LABEL: Record<Powertrain, string> = { ev: "전기차", hev: "HEV", phev: "PHEV", ice: "내연기관" };
const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";

/** 빈 칸·잘못된 입력은 0으로 계산하고, 잘못된 입력이면 화면에 표시한다 */
const parse = (s: string): { value: number; bad: boolean } => {
  const t = s.replace(/[,\s]/g, "");
  if (t === "") return { value: 0, bad: false };
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? { value: n, bad: false } : { value: 0, bad: true };
};

const optional = (s: string): number | null => {
  const t = s.replace(/[,\s]/g, "");
  const n = Number(t);
  return t !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

export function formatMan(n: number): string {
  const v = Math.abs(n) >= 100 ? Math.round(n).toLocaleString("ko-KR") : String(Math.round(n * 10) / 10);
  return `${v}만원`;
}

export function CostCalculator({ candidates, initialKey }: { candidates: CostCandidate[]; initialKey?: string }) {
  const options = useMemo<CostCandidate[]>(
    () => [...candidates, { key: "manual", label: "직접 입력", powertrain: "ev", priceMan: null, subsidyMan: null, kmPerKwh: null, kmPerL: null }],
    [candidates],
  );
  const start = options.find((o) => o.key === initialKey) ?? options[0];

  const [key, setKey] = useState(start.key);
  const [powertrain, setPowertrain] = useState<Powertrain>(start.powertrain);
  const [f, setF] = useState({
    price: start.priceMan != null ? String(start.priceMan) : "",
    discount: "",
    subsidy: start.subsidyMan != null ? String(start.subsidyMan) : "",
    taxRate: "7",
    taxRelief: "",
    other: "",
    annualKm: "12000",
    years: "5",
    kmPerKwh: start.kmPerKwh != null ? String(start.kmPerKwh) : "",
    kmPerL: start.kmPerL != null ? String(start.kmPerL) : "",
    elec: "300",
    fuel: "1700",
    evShare: "50",
    insurance: "",
    carTax: "",
    maintenance: "",
    resale: "",
    downPct: "20",
    rate: "5",
    months: "60",
    leaseUpfront: "",
    leaseMonthly: "",
    leaseMonths: "60",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  function selectCandidate(next: string) {
    const c = options.find((o) => o.key === next);
    if (!c) return;
    setKey(next);
    setPowertrain(c.powertrain);
    setF((p) => ({
      ...p,
      price: c.priceMan != null ? String(c.priceMan) : "",
      subsidy: c.subsidyMan != null ? String(c.subsidyMan) : "",
      kmPerKwh: c.kmPerKwh != null ? String(c.kmPerKwh) : "",
      kmPerL: c.kmPerL != null ? String(c.kmPerL) : "",
    }));
  }

  const p = Object.fromEntries((Object.keys(f) as (keyof typeof f)[]).map((k) => [k, parse(f[k])])) as Record<keyof typeof f, { value: number; bad: boolean }>;
  const hasBad = Object.values(p).some((x) => x.bad);

  const input: CostInputs = {
    powertrain,
    priceMan: p.price.value,
    discountMan: p.discount.value,
    subsidyMan: p.subsidy.value,
    acquisitionTaxRatePct: p.taxRate.value,
    acquisitionTaxReliefMan: p.taxRelief.value,
    otherUpfrontMan: p.other.value,
    years: Math.min(10, Math.max(1, Math.round(p.years.value) || 5)),
    annualKm: p.annualKm.value,
    kmPerKwh: optional(f.kmPerKwh),
    kmPerL: optional(f.kmPerL),
    electricityWonPerKwh: p.elec.value,
    fuelWonPerL: p.fuel.value,
    evSharePct: p.evShare.value,
    insuranceManPerYear: p.insurance.value,
    taxManPerYear: p.carTax.value,
    maintenanceManPerYear: p.maintenance.value,
    resaleMan: p.resale.value,
    loan: { downPaymentPct: p.downPct.value, annualRatePct: p.rate.value, months: Math.round(p.months.value) },
    lease: { upfrontMan: p.leaseUpfront.value, monthlyMan: p.leaseMonthly.value, months: Math.round(p.leaseMonths.value) },
  };
  const result = calcPurchaseCost(input); // 계산이 가벼워 입력이 바뀔 때마다 다시 계산한다

  const scenarios: { name: string; s: Scenario | null; note: string }[] = [
    { name: "현금 구매", s: result.cash, note: "한 번에 결제" },
    { name: "할부", s: result.loan, note: result.loan ? `${result.loan.paymentMonths}개월` : "금액·기간을 입력하세요" },
    { name: "리스·렌트", s: result.lease, note: result.lease ? `${result.lease.paymentMonths}개월` : "견적의 월 납입액을 입력하세요" },
  ];
  const totals = scenarios.flatMap((x) => (x.s ? [x.s.totalMan] : []));
  const cheapest = totals.length > 1 ? Math.min(...totals) : null;
  const years = input.years;

  const showFuel = powertrain !== "ev";
  const showElec = powertrain === "ev" || powertrain === "phev";

  return (
    <div className="space-y-5">
      {/* 결과 */}
      <section aria-label="계산 결과" className="space-y-3 rounded-xl border border-accent bg-accent-soft p-4">
        <h2 className="font-bold">{years}년 동안 드는 돈 (추정)</h2>
        <div className="grid gap-3">
          {scenarios.map(({ name, s, note }) => (
            <div key={name} className={`rounded-lg border bg-surface p-3 ${s && cheapest != null && s.totalMan === cheapest ? "border-ok" : "border-line"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <b>{name}</b>
                <span className="text-xs text-muted">{note}</span>
              </div>
              {s ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">처음 내는 돈</dt>
                  <dd className="text-right">{formatMan(s.upfrontMan)}</dd>
                  {s.monthlyPaymentMan > 0 && (
                    <>
                      <dt className="text-muted">월 납입</dt>
                      <dd className="text-right">{formatMan(s.monthlyPaymentMan)}</dd>
                    </>
                  )}
                  {s.interestMan > 0 && (
                    <>
                      <dt className="text-muted">이자 합계</dt>
                      <dd className="text-right">{formatMan(s.interestMan)}</dd>
                    </>
                  )}
                  <dt className="font-semibold">{years}년 총비용</dt>
                  <dd className="text-right text-base font-bold">
                    {formatMan(s.totalMan)}
                    {cheapest != null && s.totalMan === cheapest && <span className="ml-1 text-xs text-ok">가장 적게 들어요</span>}
                  </dd>
                  <dt className="text-muted">월 평균</dt>
                  <dd className="text-right">{formatMan(s.monthlyAverageMan)}</dd>
                  <dt className="text-muted">km당</dt>
                  <dd className="text-right">{s.perKmWon != null ? `${s.perKmWon.toLocaleString("ko-KR")}원` : "-"}</dd>
                </dl>
              ) : (
                <p className="mt-1 text-sm text-muted">{note}</p>
              )}
            </div>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-surface p-3 text-sm">
          <dt className="text-muted">실구매가 (가격−할인−보조금)</dt>
          <dd className="text-right">{formatMan(result.netPriceMan)}</dd>
          <dt className="text-muted">취득세 (추정)</dt>
          <dd className="text-right">{formatMan(result.acquisitionTaxMan)}</dd>
          <dt className="text-muted">에너지비 / 연</dt>
          <dd className="text-right">{result.energyManPerYear == null ? "-" : formatMan(result.energyManPerYear)}</dd>
          <dt className="text-muted">유지비 합계 / 연</dt>
          <dd className="text-right">{formatMan(result.runningManPerYear)}</dd>
        </dl>
        {result.missing.length > 0 && (
          <p role="note" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            {result.missing.join(", ")}을(를) 입력하면 에너지비가 계산돼요. 지금은 0원으로 계산했어요.
          </p>
        )}
        {result.warnings.map((w) => (
          <p key={w} role="note" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            {w}
          </p>
        ))}
        {hasBad && (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            숫자가 아닌 칸이 있어요. 그 칸은 0으로 계산했어요.
          </p>
        )}
      </section>

      {/* 입력 */}
      <Section title="어떤 차를 계산할까요?">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">후보 선택 (내 관심 목록)</span>
          <select className={inputCls} value={key} onChange={(e) => selectCandidate(e.target.value)}>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="차량 유형">
          {POWERTRAINS.map((pt) => (
            <button
              key={pt}
              type="button"
              aria-pressed={powertrain === pt}
              onClick={() => setPowertrain(pt)}
              className={`min-h-10 rounded-lg border text-sm ${powertrain === pt ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface"}`}
            >
              {PT_LABEL[pt]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="차 값">
        <Field label="차량 가격 (만원)" value={f.price} onChange={set("price")} bad={p.price.bad} />
        <Field label="딜러 할인·프로모션 (만원)" value={f.discount} onChange={set("discount")} bad={p.discount.bad} />
        {powertrain !== "ice" && <Field label="보조금 (만원)" value={f.subsidy} onChange={set("subsidy")} bad={p.subsidy.bad} hint="지자체·시기별로 달라요. 확정된 금액을 넣어 주세요." />}
      </Section>

      <Section title="세금·부대비용">
        <Field label="취득세율 (%)" value={f.taxRate} onChange={set("taxRate")} bad={p.taxRate.bad} hint="예시값(일반 승용차)이에요. 경차·감면 대상은 직접 바꿔 주세요." />
        <Field label="취득세 감면액 (만원)" value={f.taxRelief} onChange={set("taxRelief")} bad={p.taxRelief.bad} hint="전기·하이브리드 감면 등. 해마다 달라서 직접 확인해 입력하세요." />
        <Field label="공채·번호판·탁송 등 기타 (만원)" value={f.other} onChange={set("other")} bad={p.other.bad} />
      </Section>

      <Section title="주행과 에너지비">
        <div className="grid grid-cols-2 gap-3">
          <Field label="연간 주행거리 (km)" value={f.annualKm} onChange={set("annualKm")} bad={p.annualKm.bad} />
          <Field label="비교 기간 (년)" value={f.years} onChange={set("years")} bad={p.years.bad} />
        </div>
        {showElec && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="전비 (km/kWh)" value={f.kmPerKwh} onChange={set("kmPerKwh")} bad={p.kmPerKwh.bad} />
            <Field label="전기 단가 (원/kWh)" value={f.elec} onChange={set("elec")} bad={p.elec.bad} hint="예시값" />
          </div>
        )}
        {showFuel && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="연비 (km/L)" value={f.kmPerL} onChange={set("kmPerL")} bad={p.kmPerL.bad} />
            <Field label="연료 단가 (원/L)" value={f.fuel} onChange={set("fuel")} bad={p.fuel.bad} hint="예시값" />
          </div>
        )}
        {powertrain === "phev" && <Field label="전기로 달리는 비율 (%)" value={f.evShare} onChange={set("evShare")} bad={p.evShare.bad} hint="충전 환경이 좋을수록 높아요." />}
      </Section>

      <Section title="그 밖의 유지비 (연간)">
        <div className="grid grid-cols-3 gap-3">
          <Field label="보험료 (만원)" value={f.insurance} onChange={set("insurance")} bad={p.insurance.bad} />
          <Field label="자동차세 (만원)" value={f.carTax} onChange={set("carTax")} bad={p.carTax.bad} />
          <Field label="정비·소모품 (만원)" value={f.maintenance} onChange={set("maintenance")} bad={p.maintenance.bad} />
        </div>
        <Field label="기간이 끝났을 때 예상 매각가 (만원)" value={f.resale} onChange={set("resale")} bad={p.resale.bad} hint="현금·할부 구매의 총비용에서 빼요." />
      </Section>

      <Section title="할부">
        <div className="grid grid-cols-3 gap-3">
          <Field label="선수금 (%)" value={f.downPct} onChange={set("downPct")} bad={p.downPct.bad} />
          <Field label="연 이자율 (%)" value={f.rate} onChange={set("rate")} bad={p.rate.bad} hint="예시값" />
          <Field label="기간 (개월)" value={f.months} onChange={set("months")} bad={p.months.bad} />
        </div>
      </Section>

      <Section title="리스·렌트 (견적으로 받은 금액 입력)">
        <div className="grid grid-cols-3 gap-3">
          <Field label="보증금·선수금 (만원)" value={f.leaseUpfront} onChange={set("leaseUpfront")} bad={p.leaseUpfront.bad} />
          <Field label="월 납입 (만원)" value={f.leaseMonthly} onChange={set("leaseMonthly")} bad={p.leaseMonthly.bad} />
          <Field label="기간 (개월)" value={f.leaseMonths} onChange={set("leaseMonths")} bad={p.leaseMonths.bad} />
        </div>
        <p className="text-xs text-muted">리스·렌트는 계약마다 조건이 달라서 견적서의 금액을 그대로 넣어 비교해요. 취득세·매각가는 계산에서 빼요.</p>
      </Section>

      <p className="rounded-lg bg-soft px-3 py-2 text-xs text-muted">
        &lsquo;예시값&rsquo;으로 표시된 단가·세율은 가정이에요. 계산 결과는 비교용 추정치이며 실제 견적·세금과 다를 수 있어요. 비워 둔 칸은 0으로 계산해요.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <legend className="px-1 font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  value,
  onChange,
  bad,
  hint,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  bad: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input className={`${inputCls} ${bad ? "border-bad" : ""}`} inputMode="decimal" value={value} onChange={onChange} aria-invalid={bad} />
      {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}
