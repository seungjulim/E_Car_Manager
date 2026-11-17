import { z } from "zod";

/** DB `powertrain` enum 과 같은 값 */
export const POWERTRAINS = ["ev", "hev", "phev", "ice"] as const;
export type Powertrain = (typeof POWERTRAINS)[number];

/** 선택 화면의 카드 단위. 하이브리드 카드는 HEV/PHEV 두 유형을 묶는다. */
export const GROUPS = ["ev", "hybrid", "ice", "undecided"] as const;
export type Group = (typeof GROUPS)[number];

export const GROUP_INFO: Record<Group, { icon: string; title: string; desc: string }> = {
  ev: { icon: "⚡", title: "전기차", desc: "충전해서 타요 · 보조금·충전 환경 확인" },
  hybrid: { icon: "🔋", title: "하이브리드", desc: "HEV(충전 불필요) / PHEV(충전+주유)" },
  ice: { icon: "⛽", title: "내연기관", desc: "휘발유 · 디젤 · LPG" },
  undecided: { icon: "❓", title: "아직 못 정했어요", desc: "3가지 모두 보고 비교할래요" },
};

export const HYBRID_TYPES = ["hev", "phev"] as const;
export type HybridType = (typeof HYBRID_TYPES)[number];

export const powertrainFormSchema = z
  .object({
    groups: z.array(z.enum(GROUPS)),
    hybridTypes: z.array(z.enum(HYBRID_TYPES)),
  })
  .superRefine((v, ctx) => {
    if (v.groups.length === 0) {
      ctx.addIssue({ code: "custom", message: "알아볼 차량 유형을 하나 이상 선택해 주세요." });
      return;
    }
    if (v.groups.includes("undecided") && v.groups.length > 1) {
      ctx.addIssue({ code: "custom", message: "'아직 못 정했어요'는 다른 유형과 함께 선택할 수 없어요." });
    }
    if (v.groups.includes("hybrid") && v.hybridTypes.length === 0) {
      ctx.addIssue({ code: "custom", message: "하이브리드는 HEV와 PHEV 중 하나 이상 선택해 주세요." });
    }
  });

export type PowertrainFormInput = z.infer<typeof powertrainFormSchema>;

/** 화면 입력 → DB 에 저장할 값. 못 정한 경우에는 모든 유형을 보여 주되 decided=false 로 기록한다. */
export function resolvePowertrains(input: PowertrainFormInput): { powertrains: Powertrain[]; decided: boolean } {
  if (input.groups.includes("undecided")) {
    return { powertrains: [...POWERTRAINS], decided: false };
  }
  const result: Powertrain[] = [];
  if (input.groups.includes("ev")) result.push("ev");
  if (input.groups.includes("hybrid")) {
    for (const t of HYBRID_TYPES) if (input.hybridTypes.includes(t)) result.push(t);
  }
  if (input.groups.includes("ice")) result.push("ice");
  return { powertrains: result, decided: true };
}

/** DB 값 → 화면 초기 선택 상태 */
export function toInitialSelection(pref: { powertrains: Powertrain[]; decided: boolean } | null): {
  groups: Group[];
  hybridTypes: HybridType[];
} {
  if (!pref) return { groups: [], hybridTypes: ["hev", "phev"] };
  if (!pref.decided) return { groups: ["undecided"], hybridTypes: ["hev", "phev"] };
  const groups: Group[] = [];
  if (pref.powertrains.includes("ev")) groups.push("ev");
  const hybridTypes = HYBRID_TYPES.filter((t) => pref.powertrains.includes(t));
  if (hybridTypes.length > 0) groups.push("hybrid");
  if (pref.powertrains.includes("ice")) groups.push("ice");
  return { groups, hybridTypes: hybridTypes.length > 0 ? [...hybridTypes] : ["hev", "phev"] };
}

/** 탐색 화면 상단의 유형 칩 라벨 */
export function selectionChips(pref: { powertrains: Powertrain[]; decided: boolean }): string[] {
  if (!pref.decided) return ["❓ 모든 유형 (비교 중)"];
  const chips: string[] = [];
  if (pref.powertrains.includes("ev")) chips.push("⚡ 전기차");
  const hybrids = HYBRID_TYPES.filter((t) => pref.powertrains.includes(t));
  if (hybrids.length > 0) chips.push(`🔋 하이브리드(${hybrids.map((t) => t.toUpperCase()).join("·")})`);
  if (pref.powertrains.includes("ice")) chips.push("⛽ 내연기관");
  return chips;
}
