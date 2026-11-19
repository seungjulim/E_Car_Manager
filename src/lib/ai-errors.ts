/** Claude 크레딧(잔액)이 부족할 때 사용자에게 보여 줄 안내. 충전하면 다시 쓸 수 있다. */
export const CREDIT_LOW_MESSAGE =
  "Claude 크레딧이 부족해요. Anthropic 콘솔(console.anthropic.com)의 Plans & Billing에서 충전한 뒤 다시 시도해 주세요.";

/**
 * Anthropic API 는 잔액이 부족하면 "400 invalid_request_error"로 'credit balance is too low' 를 돌려준다.
 * 일반적인 400 오류와 구분해서 알아보기 쉬운 안내를 보여 주기 위해 상태 코드와 메시지로 확인한다.
 */
export function isCreditBalanceError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { status, message } = error as { status?: unknown; message?: unknown };
  return status === 400 && typeof message === "string" && /credit balance/i.test(message);
}
