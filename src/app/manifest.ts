import type { MetadataRoute } from "next";

// 아이콘 이미지는 `node scripts/make-icons.cjs` 로 public/icons 에 만든다(모양·색은 그 파일에서 바꾼다).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "E-car-manage",
    short_name: "E-car",
    description: "가족 차량 관리와 신차 구입을 한곳에서",
    start_url: "/",
    display: "standalone",
    background_color: "#eef0f3",
    theme_color: "#0f766e",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
