/**
 * 신차 구입 전 체크 TOP 10 (구입 시 고려사항, org_id = null).
 * 순위는 통계가 아닌 일반 구입 가이드 기준의 추천 순서이며, 가족이 가중치를 조정한다.
 * extraQuestions: 파워트레인별로 추가로 보여 줄 질문 (키 = 'ev' | 'hev' | 'phev' | 'ice').
 */
import type { Powertrain } from './inspection';

export type SeedPurchaseCriteria = {
  code: string;
  name: string;
  question: string;
  powertrains?: Powertrain[];
  extraQuestions?: Partial<Record<Powertrain, string>>;
  defaultWeight: number; // 1~5
  estRank: number;
};

export const purchaseCriteria: SeedPurchaseCriteria[] = [
  { code: 'budget_tco', name: '예산·총소유비용(TCO)', question: '차량가 외에 5년 유지비·보험·세금까지 감당 가능한가?', defaultWeight: 5, estRank: 1 },
  { code: 'usage_pattern', name: '용도·주행 패턴', question: '출퇴근/장거리 비율, 연간 주행거리, 탑승 인원은?', defaultWeight: 4, estRank: 2 },
  {
    code: 'powertrain_fit',
    name: '파워트레인 적합성',
    question: '내 주행·충전/주유 환경에 맞는 유형인가?',
    extraQuestions: {
      ev: '집·직장에서 충전 가능한가? 겨울철 주행거리 감소를 감수할 수 있는가?',
      phev: '충전 습관을 유지할 수 있는가? (충전하지 않으면 연비 이점이 줄어듦)',
      hev: '도심 주행 비중이 높은가?',
      ice: '연료비와 연간 주행거리를 고려해도 부담이 없는가?',
    },
    defaultWeight: 5,
    estRank: 3,
  },
  { code: 'safety', name: '안전성', question: '신차안전도평가(NCAP) 등급, 충돌 방지·주행보조 사양은?', defaultWeight: 5, estRank: 4 },
  { code: 'space', name: '공간·크기', question: '가족 인원, 트렁크, 주차 가능 여부, 승하차 편의는?', defaultWeight: 4, estRank: 5 },
  {
    code: 'subsidy_tax',
    name: '보조금·세제 혜택·할인',
    question: '구매 보조금, 취득세 감면, 프로모션·재고 할인은 어떻게 되는가?',
    extraQuestions: {
      ev: '국고·지자체 보조금 대상 여부와 잔여 물량은?',
      hev: '친환경차 세제 혜택 대상인가?',
      phev: '친환경차 세제 혜택·보조금 대상인가?',
    },
    defaultWeight: 3,
    estRank: 6,
  },
  { code: 'trim_options', name: '트림·옵션 구성', question: '꼭 필요한 사양이 어느 트림부터 포함되는가? 불필요한 옵션은 없는가?', defaultWeight: 3, estRank: 7 },
  {
    code: 'service_warranty',
    name: '서비스·보증',
    question: '정비망 접근성, 보증기간·범위는?',
    extraQuestions: {
      ev: '배터리 보증 기간·주행거리·용량 기준은?',
      hev: '하이브리드 배터리 보증은?',
      phev: '배터리 보증 기간·조건은?',
    },
    defaultWeight: 3,
    estRank: 8,
  },
  { code: 'resale_value', name: '감가·잔존가치', question: '중고 시세·감가 추이, 되팔 때 인기는?', defaultWeight: 2, estRank: 9 },
  { code: 'test_drive', name: '시승·실사용 후기', question: '승차감, 시야, 소음, 인포테인먼트 사용성, 실제 오너 후기는?', defaultWeight: 4, estRank: 10 },
];
