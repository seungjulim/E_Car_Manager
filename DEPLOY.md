# 배포 가이드 (Vercel)

이 앱은 Next.js 16 + Clerk + Neon + Vercel Blob + Claude + Web Push + Notion 으로 동작한다.
아래 순서대로 하면 CLI 없이 **Vercel 대시보드와 GitHub 만으로** 배포할 수 있다.

## 0. 준비물
- GitHub 계정, Vercel 계정(팀 가능)
- 로컬에서 `npm run verify` 가 통과한 키들(Neon, Clerk, Blob, Anthropic, VAPID)

## 1. 코드를 GitHub 에 올리기 (한 번)
```
cd D:\E-car-manage
git init
git add -A
git commit -m "E-car-manage 첫 배포"
git branch -M main
git remote add origin https://github.com/내계정/e-car-manage.git   # GitHub 에서 빈 저장소를 먼저 만든다
git push -u origin main
```
`.env.local` 은 `.gitignore` 에 있어 올라가지 않는다. 키를 저장소에 올리지 말 것.

## 2. Vercel 에서 가져오기
1. Vercel 대시보드 → **Add New → Project** → GitHub 저장소 선택 → **Import**
2. Framework Preset 은 **Next.js** 가 자동으로 잡힌다. Build/Output 설정은 바꾸지 않는다.
3. **Environment Variables** 에 아래를 **Production** 으로 입력한 뒤 **Deploy**
   (Import 화면에서 `.env` 파일 내용을 통째로 붙여 넣을 수 있다. 붙여 넣을 때 값 앞뒤에 공백·따옴표가 없게 한다.)

| 이름 | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon 연결 문자열(서버에서는 pooled 주소 권장) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk 공개키 |
| `CLERK_SECRET_KEY` | ✅ | Clerk 비밀키 |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | ✅ | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | ✅ | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | ✅ | `/` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | ✅ | `/` |
| `BLOB_READ_WRITE_TOKEN` | ✅ | Vercel Blob(비공개) 토큰 |
| `ANTHROPIC_API_KEY` | ✅ | Claude API 키 |
| `CRON_SECRET` | ✅ | 알림 크론 호출 검증용 임의의 긴 문자열 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | 푸시 | `npx web-push generate-vapid-keys`, 주제는 `mailto:메일주소` |
| `NOTION_TOKEN` / `NOTION_PARENT_PAGE_ID` | 선택 | 노션 저장 |

> `NEXT_PUBLIC_` 으로 시작하는 값은 **빌드할 때** 앱에 박힌다. 값을 바꾸거나 새로 넣었다면 반드시 다시 배포해야 한다.

## 3. 배포 후 확인
- `https://배포주소/sign-in` 이 Clerk 로그인 화면이면 성공이다.
- 설정이 빠졌다면 화면에 `서버 설정이 아직 끝나지 않았어요. 빠진 환경변수: …` 가 나온다(500 이 아니라 이 안내가 나오는 게 정상).
- 로컬에서 `npm run verify -- --base-url https://배포주소` 를 실행하면 크론 보호까지 확인한다.

## 4. 접근 보호
Vercel → 프로젝트 → **Settings → Deployment Protection → Vercel Authentication** 을 **Disabled**(또는 Only Preview) 로 한다.
켜 두면 가족이 열 때 Vercel 로그인을 요구한다. 앱의 접근 제어는 Clerk(가족 조직)가 한다.

## 5. Clerk 를 실제 운영용으로
개발 키(`pk_test_…`)는 개발용이다. 가족이 계속 쓰려면 Clerk 에서 Production 인스턴스를 만들고 도메인을 연결한 뒤 `pk_live_…` / `sk_live_…` 로 교체하고 다시 배포한다.

## 6. 알림 크론
`vercel.json` 에 하루 한 번(UTC 00:00 = 한국 09:00) 실행하도록 되어 있다. Hobby 요금제도 가능하며 실행 시각이 몇 분 흔들릴 수 있다.
크론은 `CRON_SECRET` 이 있어야 동작한다.

## 7. 문제가 생기면
| 증상 | 원인 |
|---|---|
| `서버 설정이 아직 끝나지 않았어요` (503) | 화면에 적힌 환경변수가 Vercel 프로젝트의 Production 에 없다. 추가 후 **Redeploy**(Build Cache 끄기) |
| 모든 화면이 글자 없는 500 | 환경변수가 Production 에 저장되지 않았거나 잘못된 프로젝트에 입력했다. Settings → Environment Variables 목록과 프로젝트 이름을 확인 |
| `DEPLOYMENT_NOT_FOUND` | 그 주소에 연결된 배포가 없다. 프로젝트의 Domains 에서 실제 주소를 확인 |
| 로그인 화면 대신 Vercel 로그인 | Deployment Protection 이 켜져 있다 |
| 서류 사진이 안 올라감 | Blob 스토어가 비공개(private)인지, `BLOB_READ_WRITE_TOKEN` 이 같은 스토어 것인지 |

## 8. 참고
- 환경변수가 빠지면 `src/proxy.ts` 가 500 대신 어떤 변수가 비었는지 알려 주는 안내(503)를 보여 준다. 값은 보여 주지 않는다.
- 한글 컴퓨터 이름 때문에 Vercel CLI 가 `ByteString` 오류로 죽으면 `scripts/ascii-hostname.cjs` 로 우회한다(위 방법은 CLI 가 필요 없다).
