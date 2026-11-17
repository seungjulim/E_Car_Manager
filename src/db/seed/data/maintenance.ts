/**
 * 자주 하는 정비 TOP 10 (소모품 정비 프리셋, org_id = null).
 *
 * est_rank 는 공식 통계가 아닌 일반 정비 가이드 기준 "추정 순서"이다.
 * 주기 수치는 일반 정비 가이드/상식 기준의 시작값이며 모두 verified=false:
 *  - 제조사 정비 지침서로 확인 후 확정하고, 가족이 항목별로 수정할 수 있다.
 *  - 확실하지 않은 항목(냉각수, 감속기오일, 고전압 배터리)은 주기를 비워 두어
 *    사용자가 직접 설정하기 전에는 자동 알림이 생기지 않게 한다.
 */
import type { Powertrain } from './inspection';

export type SeedMaintenancePreset = {
  itemCode: string;
  name: string;
  category: string;
  powertrains?: Powertrain[];
  defaultIntervalKm?: number;
  defaultIntervalMonths?: number;
  estRank: number;
  verified: boolean;
};

const FUEL_PT: Powertrain[] = ['hev', 'phev', 'ice'];

export const maintenancePresets: SeedMaintenancePreset[] = [
  // 1 (전기차는 감속기오일로 대체)
  { itemCode: 'engine_oil', name: '엔진오일·오일필터', category: '오일·유체', powertrains: FUEL_PT, defaultIntervalKm: 7500, defaultIntervalMonths: 12, estRank: 1, verified: false },
  { itemCode: 'reducer_oil', name: '감속기오일 점검·교체', category: '오일·유체', powertrains: ['ev'], estRank: 1, verified: false },
  // 2
  { itemCode: 'tire', name: '타이어(교체·위치교환·공기압)', category: '타이어·휠', defaultIntervalKm: 10000, estRank: 2, verified: false },
  // 3
  { itemCode: 'brake_pad', name: '브레이크 패드·디스크', category: '제동', defaultIntervalMonths: 12, estRank: 3, verified: false },
  // 4
  { itemCode: 'battery_12v', name: '12V 배터리', category: '전기·배터리', defaultIntervalMonths: 48, estRank: 4, verified: false },
  // 5
  { itemCode: 'wiper', name: '와이퍼 블레이드', category: '외장·등화', defaultIntervalMonths: 9, estRank: 5, verified: false },
  // 6
  { itemCode: 'cabin_filter', name: '에어컨(실내) 필터', category: '공조', defaultIntervalKm: 15000, defaultIntervalMonths: 12, estRank: 6, verified: false },
  // 7 (전기차는 고전압 배터리 점검으로 대체)
  { itemCode: 'air_cleaner', name: '에어클리너(엔진 에어필터)', category: '기타', powertrains: FUEL_PT, defaultIntervalKm: 20000, defaultIntervalMonths: 18, estRank: 7, verified: false },
  { itemCode: 'hv_battery_check', name: '고전압 배터리 점검', category: '전기·배터리', powertrains: ['ev'], estRank: 7, verified: false },
  // 8
  { itemCode: 'brake_fluid', name: '브레이크액', category: '제동', defaultIntervalKm: 40000, defaultIntervalMonths: 24, estRank: 8, verified: false },
  // 9 (주기는 제조사 지침 확인 후 입력)
  { itemCode: 'coolant', name: '냉각수(부동액)', category: '오일·유체', estRank: 9, verified: false },
  // 10
  { itemCode: 'wheel_alignment', name: '휠 얼라인먼트·밸런스', category: '타이어·휠', defaultIntervalKm: 20000, defaultIntervalMonths: 12, estRank: 10, verified: false },
];
