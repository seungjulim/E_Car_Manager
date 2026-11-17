/**
 * 알림 계산(순수 함수): 어떤 항목을 언제 알릴지, 알림 문구, 누가 받는지.
 * DB·네트워크 없이 테스트할 수 있게 분리했다. 실제 저장·발송은 reminder-job.ts.
 */
import { addDays, daysBetween, formatDday, type UpcomingItem } from "@/lib/car-care";

/** 기본 알림 시점: 1개월 전, 1주 전 */
export const DEFAULT_OFFSETS = [30, 7] as const;
/** 설정 화면에서 고를 수 있는 시점 */
export const OFFSET_CHOICES = [30, 14, 7, 3, 1, 0] as const;
/** 기한이 지난 뒤 하루 뒤에 한 번 알리는 "지남" 알림의 offset 값 */
export const OVERDUE_OFFSET = -1;
/** 발송 시점을 놓쳤을 때(예: 서버 오류) 이 일수까지만 늦게라도 보내고, 그보다 오래되면 건너뛴다 */
export const MAX_LATE_DAYS = 3;
/** 같은 항목·같은 시점 알림을 이미 보냈다면 이 기간 안에는 날짜가 조금 바뀌어도 다시 보내지 않는다 */
export const RESEND_GUARD_DAYS = 21;

export type ReminderSourceType = "schedule" | "insurance" | "self_check" | "inspection_followup";

export function offsetLabel(offset: number): string {
  if (offset === OVERDUE_OFFSET) return "기한이 지났어요";
  if (offset === 0) return "오늘";
  if (offset === 1) return "내일";
  if (offset === 7) return "1주일 전";
  if (offset === 14) return "2주 전";
  if (offset === 30) return "한 달 전";
  return `${offset}일 전`;
}

/** 정렬된 중복 없는 offset 목록. 허용 값만 남긴다 */
export function normalizeOffsets(input: number[]): number[] {
  const allowed = new Set<number>(OFFSET_CHOICES);
  return [...new Set(input.filter((n) => Number.isInteger(n) && allowed.has(n)))].sort((a, b) => b - a);
}

/** 그 주 월요일 */
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=일
  return addDays(date, -((dow + 6) % 7));
}

export function sourceOf(item: Pick<UpcomingItem, "key" | "kind">): { type: ReminderSourceType; id: string } {
  return item.kind === "insurance"
    ? { type: "insurance", id: item.key.replace(/^policy-/, "") }
    : { type: "schedule", id: item.key.replace(/^schedule-/, "") };
}

export type DesiredReminder = { dueOn: string; offsetDays: number; remindOn: string };

/**
 * 한 일정 항목에 대해 앞으로 보낼 알림 목록.
 * - 지난 시점은 소급해서 보내지 않는다(등록 시점에 D-20이면 '한 달 전'은 건너뛰고 '1주일 전'만).
 * - 날짜가 있는 항목만. 주행거리에서 나온 날짜는 자주 바뀌므로 그 주 월요일로 맞춰 주 1회 이하로 알린다.
 * - 날짜 기준 항목이 기한을 넘기면 다음 날 한 번 "지남" 알림.
 */
export function desiredReminders(item: UpcomingItem, offsets: number[], today: string): DesiredReminder[] {
  if (item.dueOn == null) return [];
  const dueOn = item.kmBased ? mondayOf(item.dueOn) : item.dueOn;
  const out: DesiredReminder[] = [];
  for (const o of offsets) {
    const remindOn = addDays(dueOn, -o);
    if (remindOn >= today) out.push({ dueOn, offsetDays: o, remindOn });
  }
  if (!item.kmBased) {
    const remindOn = addDays(dueOn, 1);
    if (remindOn >= today) out.push({ dueOn, offsetDays: OVERDUE_OFFSET, remindOn });
  } else if (item.days != null && item.days < 0 && dueOn >= today) {
    // 주행거리가 이미 도래한 항목: 그 주 월요일에 "지났어요"를 알린다(같은 시점 알림은 3주 안에 다시 보내지 않으므로 지난 항목은 3주에 한 번 정도)
    out.push({ dueOn, offsetDays: OVERDUE_OFFSET, remindOn: dueOn });
  }
  return out;
}

export type ReminderMessage = { title: string; body: string; url: string };

/**
 * 알림 하나의 원천. 정비 일정·보험·셀프 점검·점검 후속이 모두 같은 방식(예약 → 발송)으로 처리되도록
 * "언제 알릴지(plan)"와 "무슨 문구로(message)"를 함께 담는다.
 */
export type ReminderSource = {
  type: ReminderSourceType;
  id: string;
  vehicleId: string;
  /** from 날짜 이후에 알릴 시점들 */
  plan: (offsets: number[], from: string) => DesiredReminder[];
  message: (offset: number, today: string) => ReminderMessage;
  /** 발송 직전에 이미 해결된 일이면 true(보내지 않고 취소). 없으면 항상 보냄 */
  resolved?: (dueOn: string) => boolean;
};

export function sourceFromItem(item: UpcomingItem): ReminderSource {
  const src = sourceOf(item);
  return {
    type: src.type,
    id: src.id,
    vehicleId: item.vehicleId,
    plan: (offsets, from) => desiredReminders(item, offsets, from),
    message: (offset, today) => reminderMessage(item, offset, today),
  };
}

/* ---------- 월간 셀프 점검 ---------- */

/** 날짜가 속한 달의 1일 */
export const firstOfMonth = (date: string): string => `${date.slice(0, 7)}-01`;
/** 다음 달 1일 */
export function firstOfNextMonth(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** from 이후(from 포함)에 오는 "매달 1일" 두 번: 이번 달 1일이 아직이면 그날, 그리고 다음 달 1일 */
export function selfCheckDates(from: string): string[] {
  const first = firstOfMonth(from);
  return first >= from ? [first, firstOfNextMonth(from)] : [firstOfNextMonth(from)];
}

/** 셀프 점검을 이 날짜 며칠 전부터 이미 했으면 그 달 알림은 보내지 않는다 */
export const SELF_CHECK_GRACE_DAYS = 10;

export function selfCheckSource(vehicle: { id: string; label: string }, lastSelfCheckOn: string | null): ReminderSource {
  return {
    type: "self_check",
    id: vehicle.id,
    vehicleId: vehicle.id,
    plan: (_offsets, from) => selfCheckDates(from).map((d) => ({ dueOn: d, offsetDays: 0, remindOn: d })),
    message: () => ({
      title: `${vehicle.label} · 이번 달 셀프 점검 해 볼까요?`,
      body: "타이어·오일·등화장치·와이퍼를 1분이면 확인할 수 있어요.",
      url: `/cars/vehicles/${vehicle.id}/inspections/new?mode=self`,
    }),
    resolved: (dueOn) => lastSelfCheckOn != null && lastSelfCheckOn >= addDays(dueOn, -SELF_CHECK_GRACE_DAYS),
  };
}

/* ---------- 점검 후속 ---------- */

/** 점검에서 '교체·정비 필요'는 1주일 뒤, '주의'는 한 달 뒤에 조치했는지 다시 물어본다 */
export const FOLLOW_UP_DAYS = { replace: 7, warn: 30 } as const;

export function followUpDueOn(inspectedOn: string, status: "replace" | "warn"): string {
  return addDays(inspectedOn, FOLLOW_UP_DAYS[status]);
}

export function followUpSource(input: {
  itemId: string;
  vehicleId: string;
  vehicleLabel: string;
  recordId: string;
  itemName: string;
  status: "replace" | "warn";
  dueOn: string;
}): ReminderSource {
  return {
    type: "inspection_followup",
    id: input.itemId,
    vehicleId: input.vehicleId,
    plan: (_offsets, from) => (input.dueOn >= from ? [{ dueOn: input.dueOn, offsetDays: 0, remindOn: input.dueOn }] : []),
    message: () => ({
      title: `${input.vehicleLabel} · ${input.itemName} 조치하셨나요?`,
      body: input.status === "replace" ? "점검에서 '교체·정비 필요'로 기록했어요. 아직이라면 견적을 받아 보세요." : "점검에서 '주의'로 기록했어요. 상태를 다시 확인해 보세요.",
      url: `/cars/vehicles/${input.vehicleId}/inspections/${input.recordId}`,
    }),
  };
}

export function reminderMessage(item: UpcomingItem, offset: number, today: string): ReminderMessage {
  const when = offsetLabel(offset);
  const d = item.dueOn ? daysBetween(today, item.dueOn) : null;
  const dday = d != null && offset !== OVERDUE_OFFSET ? ` (${formatDday(d)})` : "";
  const what = item.kind === "insurance" ? "보험 만기" : item.title;
  return {
    title: offset === OVERDUE_OFFSET ? `${item.vehicleLabel} · ${what} 기한이 지났어요` : `${item.vehicleLabel} · ${what} ${when}${dday}`,
    body: item.detail || (item.dueOn ? `${item.dueOn} 예정` : ""),
    url:
      item.kind === "insurance"
        ? `/cars/vehicles/${item.vehicleId}?tab=insurance`
        : `/cars/vehicles/${item.vehicleId}/service/new`,
  };
}

/* ------------------------------------------------------------------ */
/* 누가 받나                                                            */
/* ------------------------------------------------------------------ */

export type NotificationCategories = {
  schedule: boolean;
  inspection: boolean;
  followup: boolean;
  insurance: boolean;
  selfCheck: boolean;
};
export const DEFAULT_CATEGORIES: NotificationCategories = {
  schedule: true,
  inspection: true,
  followup: true,
  insurance: true,
  selfCheck: false,
};

export type UserSettings = {
  enabled: boolean;
  offsetsDays: number[];
  categories: NotificationCategories;
  /** all = 가족 전체 차량, primary = 내가 주 사용자인 차량(주 사용자가 없는 차량 포함), custom = 아직 미지원 → all 로 취급 */
  recipientsMode: "all" | "primary" | "custom";
};
export const DEFAULT_SETTINGS: UserSettings = {
  enabled: true,
  offsetsDays: [...DEFAULT_OFFSETS],
  categories: DEFAULT_CATEGORIES,
  recipientsMode: "all",
};

export function wantsReminder(
  settings: UserSettings | undefined,
  userId: string,
  reminder: { sourceType: ReminderSourceType; offsetDays: number },
  vehicleOwnerId: string | null,
): boolean {
  const s = settings ?? DEFAULT_SETTINGS;
  if (!s.enabled) return false;
  const category = {
    insurance: s.categories.insurance,
    schedule: s.categories.schedule,
    self_check: s.categories.selfCheck,
    inspection_followup: s.categories.followup,
  }[reminder.sourceType];
  if (!category) return false;
  // 셀프 점검·점검 후속은 정해진 날에 한 번만 알리므로 '며칠 전' 설정과 무관하다
  const fixedDay = reminder.sourceType === "self_check" || reminder.sourceType === "inspection_followup";
  if (!fixedDay && reminder.offsetDays !== OVERDUE_OFFSET && !s.offsetsDays.includes(reminder.offsetDays)) return false;
  if (s.recipientsMode === "primary" && vehicleOwnerId && vehicleOwnerId !== userId) return false;
  return true;
}
