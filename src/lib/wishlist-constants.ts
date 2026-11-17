/** 관심 목록 상수 (서버·클라이언트 공용: DB 코드를 가져오지 않는다) */
export const WISHLIST_STATUSES = ["reviewing", "finalist", "dropped"] as const;
export type WishlistStatus = (typeof WISHLIST_STATUSES)[number];
export const WISHLIST_STATUS_LABEL: Record<WishlistStatus, string> = {
  reviewing: "검토중",
  finalist: "최종후보",
  dropped: "탈락",
};
export const MAX_WISHLIST_PER_USER = 100;
