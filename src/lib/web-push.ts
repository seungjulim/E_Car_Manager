import "server-only";
import * as webpush from "web-push";
import type { PushPayload, PushSender, PushTarget } from "@/lib/reminder-job";

let configured: boolean | null = null;

/** VAPID 키가 모두 있을 때만 푸시를 보낼 수 있다. 없으면 알림 센터에만 쌓인다 */
export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    configured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error("[web-push] VAPID 설정이 올바르지 않아요:", error);
    configured = false;
  }
  return configured;
}

/** 실제 Web Push 발송. 구독이 만료됐으면(404·410) 'gone' 을 돌려줘 호출한 쪽이 삭제하게 한다 */
export const sendWebPush: PushSender = async (target: PushTarget, payload: PushPayload) => {
  if (!pushConfigured()) return "error";
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24, urgency: "normal" },
    );
    return "ok";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("[web-push] 발송 실패:", status ?? error);
    return "error";
  }
};
