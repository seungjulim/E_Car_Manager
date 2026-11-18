// 홈 화면 아이콘(PNG)을 만든다. 모양이나 색을 바꾸고 싶으면 아래 값을 고친 뒤
//   node scripts/make-icons.cjs
// 를 다시 실행하면 public/icons 의 이미지가 새로 만들어진다. (sharp 는 Next.js 와 함께 설치되어 있다)
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const BG = "#0f766e"; // 배경색 (앱 테마색과 같다)
const FG = "#ffffff"; // 자동차 색

/** 512×512 기준으로 그린 자동차. scale 로 크기를 줄이면 둘레에 여백이 생긴다 */
function carSvg(scale) {
  const t = (1 - scale) * 256; // 중심(256,256) 기준으로 줄이기 위한 이동량
  return `
  <g transform="translate(${t} ${t}) scale(${scale})">
    <path d="M150 270 L190 200 Q196 192 206 192 H306 Q316 192 322 200 L362 270 Z" fill="${FG}"/>
    <rect x="92" y="262" width="328" height="84" rx="24" fill="${FG}"/>
    <path d="M176 262 L204 212 H250 V262 Z M262 212 H304 L334 262 H262 Z" fill="${BG}"/>
    <circle cx="170" cy="350" r="38" fill="${FG}" stroke="${BG}" stroke-width="12"/>
    <circle cx="342" cy="350" r="38" fill="${FG}" stroke="${BG}" stroke-width="12"/>
    <circle cx="170" cy="350" r="13" fill="${BG}"/>
    <circle cx="342" cy="350" r="13" fill="${BG}"/>
  </g>`;
}

function svg({ rounded, scale }) {
  const rx = rounded ? 112 : 0;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <rect width="512" height="512" rx="${rx}" fill="${BG}"/>${carSvg(scale)}
    </svg>`,
  );
}

const outDir = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

// 이름, 크기, 모서리 둥글림, 자동차 크기(1 = 꽉 참)
const targets = [
  ["icon-192.png", 192, true, 1],
  ["icon-512.png", 512, true, 1],
  // maskable: 기기가 모양을 잘라 쓰므로 모서리를 두지 않고 자동차를 안쪽 80% 안에 둔다
  ["icon-maskable-512.png", 512, false, 0.78],
  // 아이폰 홈 화면용(기기가 모서리를 둥글게 처리한다)
  ["apple-touch-icon.png", 180, false, 0.88],
];

(async () => {
  for (const [name, size, rounded, scale] of targets) {
    await sharp(svg({ rounded, scale })).resize(size, size).png().toFile(path.join(outDir, name));
    console.log("만듦:", `public/icons/${name}`, `${size}×${size}`);
  }
})();
