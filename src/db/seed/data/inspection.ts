/**
 * 시스템 기본 점검 템플릿 "블루핸즈 기본 점검" (org_id = null).
 *
 * - verified: true  → 현대차·기아 시즌별 무상점검 공지(설·여름·추석)에 나온 항목
 * - verified: false → 일반 정비 상식으로 보완한 항목(★). 공식 점검표 확인 후 확정할 것.
 * - item_code 는 maintenance.ts(정비 TOP 10)의 item_code 와 같은 값을 써서 점검·정비·주기를 연결한다.
 */
export type Powertrain = 'ev' | 'hev' | 'phev' | 'ice';
export type CheckCycle = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type CheckMethod = 'self' | 'shop' | 'both';

export type SeedInspectionItem = {
  itemCode: string;
  category: string;
  name: string;
  checkType?: 'status' | 'numeric';
  unit?: string;
  /** null/undefined = 전체 유형 */
  powertrains?: Powertrain[];
  /** 점검 TOP 10 순위 (1~10). 같은 순위에 여러 항목이 묶일 수 있다. */
  topRank?: number;
  selfCheckCycle?: CheckCycle;
  checkMethod?: CheckMethod;
  verified: boolean;
};

export const BLUEHANDS_TEMPLATE = {
  name: '블루핸즈 기본 점검',
  source: '현대차·기아 시즌별 무상점검 공지 + 일반 정비 상식 보완(verified=false)',
  version: 1,
} as const;

const FUEL_PT: Powertrain[] = ['hev', 'phev', 'ice']; // 엔진이 있는 유형
const HV_PT: Powertrain[] = ['ev', 'hev', 'phev']; // 고전압 배터리가 있는 유형

export const inspectionItems: SeedInspectionItem[] = [
  /* ===== 점검 TOP 10 ===== */
  { itemCode: 'tire', category: '타이어·휠', name: '타이어 공기압·마모', topRank: 1, selfCheckCycle: 'monthly', checkMethod: 'self', verified: true },
  { itemCode: 'brake_pad', category: '제동', name: '브레이크 패드 마모', topRank: 2, selfCheckCycle: 'semiannual', checkMethod: 'shop', verified: true },
  { itemCode: 'brake_fluid', category: '제동', name: '브레이크액', topRank: 2, selfCheckCycle: 'semiannual', checkMethod: 'shop', verified: true },
  { itemCode: 'engine_oil', category: '오일·유체', name: '엔진오일', powertrains: FUEL_PT, topRank: 3, selfCheckCycle: 'monthly', checkMethod: 'both', verified: true },
  { itemCode: 'reducer_oil', category: '오일·유체', name: '감속기오일', powertrains: ['ev'], topRank: 3, selfCheckCycle: 'annual', checkMethod: 'shop', verified: false },
  { itemCode: 'coolant', category: '오일·유체', name: '냉각수 (전기차는 배터리·모터 냉각수)', topRank: 4, selfCheckCycle: 'quarterly', checkMethod: 'both', verified: true },
  { itemCode: 'battery_12v', category: '전기·배터리', name: '12V 배터리', topRank: 5, selfCheckCycle: 'semiannual', checkMethod: 'shop', verified: true },
  { itemCode: 'lights', category: '외장·등화', name: '등화장치 (전조·후미·방향지시·브레이크등)', topRank: 6, selfCheckCycle: 'monthly', checkMethod: 'self', verified: true },
  { itemCode: 'wiper', category: '외장·등화', name: '와이퍼·워셔액', topRank: 7, selfCheckCycle: 'monthly', checkMethod: 'self', verified: true },
  { itemCode: 'hvac', category: '공조', name: '공조장치 (에어컨·히터)', topRank: 8, selfCheckCycle: 'semiannual', checkMethod: 'both', verified: true },
  { itemCode: 'underbody', category: '하체', name: '하체·서스펜션·조향', topRank: 9, selfCheckCycle: 'annual', checkMethod: 'shop', verified: false },
  { itemCode: 'warning_diag', category: '진단', name: '경고등·진단(OBD)', topRank: 10, selfCheckCycle: 'annual', checkMethod: 'both', verified: false },
  { itemCode: 'hv_battery_check', category: '전기·배터리', name: '고전압 배터리', powertrains: HV_PT, topRank: 10, selfCheckCycle: 'annual', checkMethod: 'shop', verified: true },

  /* ===== 블루핸즈 기본 점검 — 기타(★ 공식 확인 필요) ===== */
  { itemCode: 'cabin_filter', category: '공조', name: '에어컨(실내) 필터', checkMethod: 'shop', verified: false },
  { itemCode: 'drive_belt', category: '기타', name: '구동 벨트', powertrains: FUEL_PT, checkMethod: 'shop', verified: false },
  { itemCode: 'transmission_oil', category: '오일·유체', name: '변속기오일', powertrains: FUEL_PT, checkMethod: 'shop', verified: false },
  { itemCode: 'air_cleaner', category: '기타', name: '에어클리너(엔진 에어필터)', powertrains: FUEL_PT, checkMethod: 'shop', verified: false },
  { itemCode: 'wheel_alignment', category: '타이어·휠', name: '휠 얼라인먼트·밸런스', checkMethod: 'shop', verified: false },
];
