# E-car-manage

가족이 함께 쓰는 차량 앱입니다. **신차 구입**을 고민할 때와 **보유 차량**을 관리할 때를 한곳에서 다룹니다. 휴대폰 홈 화면에 설치해서 쓰는 PWA 입니다.

## 주요 기능

### 신차 구입 (`/shop`)
- 차량 유형(전기·하이브리드·플러그인·내연)별 탐색과 비교
- 취향·예산 기반 추천, 구입 비용·점수 계산
- 관심 차량(위시리스트), 구입 준비 체크
- AI 로 차량 정보·판매 순위 읽기 (이미지·문서 분석)

### 차량 관리 (`/cars`)
- 정비·점검·보험·주행거리·충전/주유 기록과 비용 집계
- 수리내역서·견적서 사진을 올리면 AI 가 내용을 읽어 정리
- 점검·보험 일정 알림 (Web Push, 매일 한국 시간 09:00 크론)
- 노션 저장, 기록 내려받기(CSV·JSON 백업)

### 가족 공유
- Clerk 의 조직(Organization)을 "가족" 단위로 사용하고, 모든 자료는 가족 범위로 분리됩니다.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router), React 19, TypeScript |
| 스타일 | Tailwind CSS 4 |
| 로그인·가족 | Clerk |
| 데이터베이스 | Neon (Postgres) + Drizzle ORM |
| 파일 저장 | Vercel Blob (비공개) |
| AI | Anthropic Claude API |
| 알림 | Web Push (VAPID), Vercel Cron |
| 기타 | Notion API, Zod |
| 배포 | Vercel |

> 이 프로젝트의 Next.js 는 기존 버전과 규칙이 다를 수 있습니다. 코드를 고치기 전에 `node_modules/next/dist/docs/` 의 안내를 먼저 읽으세요 (`AGENTS.md` 참고).

## 시작하기

필요한 것: Node.js 24.x, 그리고 Neon · Clerk · Vercel Blob · Anthropic 계정의 키.

```bash
npm install
cp .env.example .env.local   # 값을 채운다 (Windows: copy)
npm run db:migrate           # 테이블 만들기
npm run db:seed              # 기본 카탈로그 데이터 넣기
npm run verify               # 키가 올바른지 점검
npm run dev                  # http://localhost:3000
```

`.env.local` 은 git 에 올라가지 않습니다. 키를 저장소에 올리지 마세요.

## 환경변수

`.env.example` 에 전체 목록과 설명이 있습니다.

| 이름 | 필수 | 용도 |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon 연결 문자열 (pooled 권장) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | ✅ | Clerk 키 (대시보드에서 Organizations 기능을 켠다) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` 등 4개 | ✅ | 로그인·가입 경로 |
| `BLOB_READ_WRITE_TOKEN` | ✅ | 서류·차량 이미지 저장 |
| `ANTHROPIC_API_KEY` | ✅ | Claude API |
| `CRON_SECRET` | ✅ | 알림 크론 호출 검증 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | 푸시 | Web Push 키 (`npx web-push generate-vapid-keys`) |
| `NOTION_TOKEN`, `NOTION_PARENT_PAGE_ID` | 선택 | 노션 저장 |

`NEXT_PUBLIC_` 로 시작하는 값은 빌드할 때 앱에 박히므로, 바꾸면 다시 배포해야 합니다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` / `npm start` | 운영 빌드 / 실행 |
| `npm run lint` | ESLint |
| `npm run typecheck` | 타입 검사 |
| `npm run db:generate` | 스키마 변경으로 마이그레이션 파일 생성 |
| `npm run db:migrate` | 마이그레이션 적용 |
| `npm run db:push` | 스키마를 DB 에 바로 반영 (개발용) |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | 시드 데이터 입력 |
| `npm run verify` | 환경설정 점검 (`-- --base-url https://배포주소` 로 배포본도 점검) |

## 폴더 구조

```
src/
  app/            화면과 API (Next.js App Router)
    shop/         신차 구입
    cars/         차량 관리
    api/          업로드, 크론, 내려받기 등
    sign-in/ sign-up/
  components/     공용 화면 조각
  db/             Drizzle 스키마, 접속, 시드
  lib/            도메인 로직 (추천, 견적·수리내역 분석, 알림, 노션 등)
  proxy.ts        로그인 보호와 환경변수 누락 안내
drizzle/          마이그레이션 SQL
scripts/          점검·보조 스크립트
public/           아이콘, 서비스 워커(sw.js)
mockup/           화면 목업
```

## 배포

Vercel 에서 GitHub 저장소를 가져와 배포합니다. 자세한 순서와 문제 해결은 [DEPLOY.md](./DEPLOY.md) 를 보세요. `main` 에 푸시하면 자동으로 배포됩니다.

## 참고 문서

- [DEPLOY.md](./DEPLOY.md) — Vercel 배포 가이드
- [신차카탈로그_조사블록.md](./신차카탈로그_조사블록.md) — 신차 카탈로그 조사 자료
