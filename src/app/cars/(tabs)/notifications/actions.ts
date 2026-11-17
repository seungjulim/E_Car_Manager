"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { listSubscriptions, markAllRead, markRead, removeSubscription, saveSettings, saveSubscription } from "@/lib/notifications";
import { isKnownPushEndpoint } from "@/lib/push-client";
import { OFFSET_CHOICES } from "@/lib/reminders";
import { sendWebPush, pushConfigured } from "@/lib/web-push";

export type SettingsState = { error?: string; saved?: boolean };
export type SimpleResult = { ok: true; message?: string } | { ok: false; error: string };

const NEED_LOGIN = "로그인과 가족 선택이 필요해요.";
const FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

async function ctx() {
  const { userId, orgId } = await auth();
  return userId && orgId ? { userId, orgId } : null;
}

const refresh = () => revalidatePath("/cars", "layout");

/* ------------------------------------------------------------------ */
/* 알림 설정                                                            */
/* ------------------------------------------------------------------ */

const settingsSchema = z.object({
  enabled: z.boolean(),
  offsets: z.array(z.coerce.number().int()).max(OFFSET_CHOICES.length),
  schedule: z.boolean(),
  insurance: z.boolean(),
  selfCheck: z.boolean(),
  followup: z.boolean(),
  recipientsMode: z.enum(["all", "primary"]),
});

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const c = await ctx();
  if (!c) return { error: NEED_LOGIN };

  const parsed = settingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    offsets: formData.getAll("offsets").map(String),
    schedule: formData.get("schedule") === "on",
    insurance: formData.get("insurance") === "on",
    selfCheck: formData.get("selfCheck") === "on",
    followup: formData.get("followup") === "on",
    recipientsMode: formData.get("recipientsMode"),
  });
  if (!parsed.success) return { error: "입력한 내용을 확인해 주세요." };
  const d = parsed.data;
  if (d.offsets.some((n) => !(OFFSET_CHOICES as readonly number[]).includes(n))) return { error: "알림 시점이 올바르지 않아요." };

  try {
    await saveSettings(getDb(), c.orgId, c.userId, {
      enabled: d.enabled,
      offsetsDays: d.offsets,
      categories: { schedule: d.schedule, insurance: d.insurance, selfCheck: d.selfCheck, followup: d.followup },
      recipientsMode: d.recipientsMode,
    });
  } catch (error) {
    console.error("[saveSettings] 실패:", error);
    return { error: FAILED };
  }
  refresh();
  return { saved: true };
}

/* ------------------------------------------------------------------ */
/* 알림 센터                                                            */
/* ------------------------------------------------------------------ */

export async function markReadAction(id: string): Promise<SimpleResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: NEED_LOGIN };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "알림을 찾을 수 없어요." };
  try {
    await markRead(getDb(), c.orgId, c.userId, id);
  } catch (error) {
    console.error("[markRead] 실패:", error);
    return { ok: false, error: FAILED };
  }
  refresh();
  return { ok: true };
}

export async function markAllReadAction(): Promise<SimpleResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: NEED_LOGIN };
  try {
    await markAllRead(getDb(), c.orgId, c.userId);
  } catch (error) {
    console.error("[markAllRead] 실패:", error);
    return { ok: false, error: FAILED };
  }
  refresh();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 푸시 구독                                                            */
/* ------------------------------------------------------------------ */

const subscribeSchema = z.object({
  endpoint: z.string().max(1000).refine(isKnownPushEndpoint, "지원하지 않는 푸시 서비스예요."),
  p256dh: z.string().min(1).max(300),
  auth: z.string().min(1).max(100),
  deviceLabel: z.string().max(60).nullable().optional(),
});

export async function subscribePushAction(input: z.input<typeof subscribeSchema>): Promise<SimpleResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: NEED_LOGIN };
  const parsed = subscribeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "이 기기의 푸시 정보가 올바르지 않아요." };
  try {
    await saveSubscription(getDb(), c.userId, parsed.data);
  } catch (error) {
    console.error("[subscribePush] 실패:", error);
    return { ok: false, error: FAILED };
  }
  return { ok: true };
}

export async function unsubscribePushAction(endpoint: string): Promise<SimpleResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: NEED_LOGIN };
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 1000) return { ok: false, error: "푸시 주소가 올바르지 않아요." };
  try {
    await removeSubscription(getDb(), c.userId, endpoint);
  } catch (error) {
    console.error("[unsubscribePush] 실패:", error);
    return { ok: false, error: FAILED };
  }
  return { ok: true };
}

/** 지금 이 기기들로 시험 알림을 보낸다 */
export async function sendTestPushAction(): Promise<SimpleResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: NEED_LOGIN };
  if (!pushConfigured()) return { ok: false, error: "서버에 푸시 키(VAPID)가 설정되지 않았어요." };
  try {
    const subs = await listSubscriptions(getDb(), [c.userId]);
    if (subs.length === 0) return { ok: false, error: "이 계정으로 켜 둔 기기가 없어요. 먼저 푸시 알림을 켜 주세요." };
    let ok = 0;
    for (const s of subs) {
      const r = await sendWebPush(s, { title: "E-car-manage 시험 알림", body: "알림이 잘 도착했어요 🎉", url: "/cars/notifications", tag: "test" });
      if (r === "ok") ok += 1;
    }
    return ok > 0 ? { ok: true, message: `${ok}개 기기로 보냈어요.` } : { ok: false, error: "보내지 못했어요. 기기의 알림 권한을 확인해 주세요." };
  } catch (error) {
    console.error("[sendTestPush] 실패:", error);
    return { ok: false, error: FAILED };
  }
}
