import type { MetadataRoute } from "next";

// TODO: 홈 화면 설치(특히 Android)를 위해 192×192, 512×512 PNG 아이콘을 public/icons 에 추가하고 아래 icons 에 등록한다.
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
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
