/**
 * 구입 비용 계산기(순수 함수). 모든 금액은 "만원" 단위 숫자로 받고 돌려준다(에너지 단가만 원 단위).
 *
 * 세금·보조금·금리·에너지 단가는 해마다·지역·상품마다 달라서 이 파일은 값을 정해 두지 않고
 * 사용자가 넣은 값으로만 계산한다. 결과는 "비교용 추정치"이며 실제 견적과 다를 수 있다.
 */
import type { Powertrain } from "@/lib/powertrain";

export type LoanInput = {
  downPaymentPct: number; // 선수금 비율(%) — 실구매가 기준
  annualRatePct: number; // 연 이자율(%)
  months: number; // 개월
};

export type LeaseInput = {
  upfrontMan: number; // 보증금·선수금 등 처음에 내는 돈(만원)
  monthlyMan: number; // 월 납입액(만원)
  months: number;
};

export type CostInputs = {
  powertrain: Powertrain;
  priceMan: number; // 차량 가격
  discountMan: number; // 딜러 할인·프로모션
  subsidyMan: number; // 보조금(전기·하이브리드)
  acquisitionTaxRatePct: number; // 취득세율(%) — 과세표준은 (차량가 − 할인)으로 단순화
  acquisitionTaxReliefMan: number; // 취득세 감면액
  otherUpfrontMan: number; // 공채·번호판·탁송 등 기타 등록 비용

  years: number; // 비교 기간(년)
  annualKm: number; // 연간 주행거리
  kmPerKwh: number | null; // 전비 (전기차·PHEV 의 전기 주행)
  kmPerL: number | null; // 연비 (하이브리드·내연기관·PHEV 의 엔진 주행)
  electricityWonPerKwh: number;
  fuelWonPerL: number;
  evSharePct: number; // PHEV: 전기로 달리는 비율(%)

  insuranceManPerYear: number;
  taxManPerYear: number;
  maintenanceManPerYear: number;
  resaleMan: number; // 기간이 끝났을 때 예상 매각가

  loan: LoanInput;
  lease: LeaseInput | null;
};

export type Scenario = {
  /** 처음에 한 번에 나가는 돈 */
  upfrontMan: number;
  /** 월 납입액(현금 구매는 0) */
  monthlyPaymentMan: number;
  /** 납입 개월 수 */
  paymentMonths: number;
  /** 이자(할부) */
  interestMan: number;
  /** 기간 동안 차 값으로 쓴 총액(처음 + 납입 합계), 매각가 반영 전 */
  purchaseOutlayMan: number;
  /** 기간 동안의 총비용(차 값 + 유지비 − 매각가) */
  totalMan: number;
  /** 월 평균 */
  monthlyAverageMan: number;
  /** km당(원) */
  perKmWon: number | null;
};

export type CostResult = {
  netPriceMan: number; // 실구매가 = 차량가 − 할인 − 보조금(0 미만 방지)
  acquisitionTaxMan: number;
  /** 연간 에너지비(만원). 필요한 전비·연비가 없으면 null */
  energyManPerYear: number | null;
  runningManPerYear: number; // 에너지 + 보험 + 세금 + 정비
  cash: Scenario;
  loan: Scenario | null;
  lease: Scenario | null;
  /** 계산에 쓰지 못한 입력(결과가 실제보다 낮을 수 있음) */
  missing: string[];
  warnings: string[];
};

const num = (n: number) => (Number.isFinite(n) ? n : 0);
const pos = (n: number) => Math.max(0, num(n));
// 소수 첫째 자리 반올림. 부동소수점 오차로 생기는 -0 은 0으로 바꾼다
const round1 = (n: number) => Math.round(n * 10) / 10 || 0;

/** 원리금 균등 상환 월 납입액(원). 이자율 0이면 단순히 나눈다 */
export function monthlyPayment(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

function annualEnergyMan(i: CostInputs): { value: number | null; missing: string[] } {
  const km = pos(i.annualKm);
  const elec = (share: number) =>
    i.kmPerKwh && i.kmPerKwh > 0 ? (km * share * pos(i.electricityWonPerKwh)) / i.kmPerKwh / 10_000 : null;
  const fuel = (share: number) =>
    i.kmPerL && i.kmPerL > 0 ? (km * share * pos(i.fuelWonPerL)) / i.kmPerL / 10_000 : null;

  switch (i.powertrain) {
    case "ev": {
      const v = elec(1);
      return { value: v, missing: v == null ? ["전비(km/kWh)"] : [] };
    }
    case "hev":
    case "ice": {
      const v = fuel(1);
      return { value: v, missing: v == null ? ["연비(km/L)"] : [] };
    }
    case "phev": {
      const share = Math.min(1, Math.max(0, num(i.evSharePct) / 100));
      const e = elec(share);
      const f = fuel(1 - share);
      const missing = [...(e == null && share > 0 ? ["전기 전비(km/kWh)"] : []), ...(f == null && share < 1 ? ["연비(km/L)"] : [])];
      return { value: (e ?? 0) + (f ?? 0), missing };
    }
  }
}

export function calcPurchaseCost(input: CostInputs): CostResult {
  const years = Math.max(1, Math.round(num(input.years)));
  const warnings: string[] = [];

  const price = pos(input.priceMan);
  const discount = pos(input.discountMan);
  const subsidy = input.powertrain === "ice" ? 0 : pos(input.subsidyMan);
  if (discount + subsidy > price && price > 0) warnings.push("할인과 보조금이 차량 가격보다 커서 실구매가를 0으로 계산했어요.");
  const net = Math.max(0, price - discount - subsidy);

  const taxBase = Math.max(0, price - discount);
  const acquisitionTax = Math.max(0, (taxBase * pos(input.acquisitionTaxRatePct)) / 100 - pos(input.acquisitionTaxReliefMan));
  const other = pos(input.otherUpfrontMan);

  const energy = annualEnergyMan(input);
  const running = (energy.value ?? 0) + pos(input.insuranceManPerYear) + pos(input.taxManPerYear) + pos(input.maintenanceManPerYear);
  const runningTotal = running * years;
  const resale = pos(input.resaleMan);
  const totalKm = pos(input.annualKm) * years;
  const months = years * 12;

  const finish = (s: { upfront: number; monthly: number; months: number; interest: number; outlay: number }): Scenario => {
    const total = s.outlay + runningTotal - resale;
    return {
      upfrontMan: round1(s.upfront),
      monthlyPaymentMan: round1(s.monthly),
      paymentMonths: s.months,
      interestMan: round1(s.interest),
      purchaseOutlayMan: round1(s.outlay),
      totalMan: round1(total),
      monthlyAverageMan: round1(total / months),
      perKmWon: totalKm > 0 ? Math.round((total * 10_000) / totalKm) : null,
    };
  };

  // ----- 현금 -----
  const cashUpfront = net + acquisitionTax + other;
  const cash = finish({ upfront: cashUpfront, monthly: 0, months: 0, interest: 0, outlay: cashUpfront });

  // ----- 할부 -----
  let loan: Scenario | null = null;
  const lm = Math.round(num(input.loan.months));
  if (lm > 0 && net > 0) {
    const down = (net * Math.min(100, pos(input.loan.downPaymentPct))) / 100;
    const financed = net - down;
    const monthly = monthlyPayment(financed * 10_000, num(input.loan.annualRatePct), lm) / 10_000;
    const interest = Math.max(0, monthly * lm - financed); // 계산 오차로 음수가 되지 않게
    const paidInHorizon = Math.min(lm, months);
    if (lm > months) warnings.push(`할부 기간(${lm}개월)이 비교 기간(${years}년)보다 길어서, 비교 기간 안에 낸 금액만 계산했어요.`);
    const upfront = down + acquisitionTax + other;
    loan = finish({ upfront, monthly, months: lm, interest, outlay: upfront + monthly * paidInHorizon });
  }

  // ----- 리스·렌트(견적으로 받은 월 납입액을 직접 입력) -----
  let lease: Scenario | null = null;
  if (input.lease && input.lease.months > 0 && (input.lease.monthlyMan > 0 || input.lease.upfrontMan > 0)) {
    const paid = Math.min(Math.round(input.lease.months), months);
    if (input.lease.months > months) warnings.push("리스·렌트 기간이 비교 기간보다 길어서, 비교 기간 안에 낸 금액만 계산했어요.");
    const upfront = pos(input.lease.upfrontMan);
    // 리스·렌트는 차를 사는 것이 아니므로 취득세·매각가는 계산에서 뺀다
    const outlay = upfront + pos(input.lease.monthlyMan) * paid;
    const total = outlay + runningTotal;
    lease = {
      upfrontMan: round1(upfront),
      monthlyPaymentMan: round1(pos(input.lease.monthlyMan)),
      paymentMonths: Math.round(input.lease.months),
      interestMan: 0,
      purchaseOutlayMan: round1(outlay),
      totalMan: round1(total),
      monthlyAverageMan: round1(total / months),
      perKmWon: totalKm > 0 ? Math.round((total * 10_000) / totalKm) : null,
    };
  }

  return {
    netPriceMan: round1(net),
    acquisitionTaxMan: round1(acquisitionTax),
    energyManPerYear: energy.value == null ? null : round1(energy.value),
    runningManPerYear: round1(running),
    cash,
    loan,
    lease,
    missing: energy.missing,
    warnings,
  };
}

/** 트림 사양에서 전비·연비를 뽑아 계산기 기본값으로 쓴다 */
export function defaultsFromSpecs(
  powertrain: Powertrain,
  specs: Record<string, unknown> | null | undefined,
): { kmPerKwh: number | null; kmPerL: number | null } {
  const n = (k: string): number | null => {
    const v = specs?.[k];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  };
  const ratio = (a: number | null, b: number | null) => (a && b ? Math.round((a / b) * 100) / 100 : null);
  if (powertrain === "ev") return { kmPerKwh: n("efficiencyKmPerKwh") ?? ratio(n("rangeKm"), n("batteryKwh")), kmPerL: null };
  if (powertrain === "phev") return { kmPerKwh: ratio(n("evRangeKm"), n("batteryKwh")), kmPerL: n("fuelEconomyKmpl") };
  return { kmPerKwh: null, kmPerL: n("fuelEconomyKmpl") };
}
