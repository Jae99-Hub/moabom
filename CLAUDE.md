# 모아봄 (moabom)

책·영화·드라마·다큐 기록 앱. Windows 데스크톱(Electron)과 웹(Vercel) 두 가지로 나간다. 사용자는 개발자 본인과 지인들.

## 명령

| 하는 일 | 명령 |
| --- | --- |
| 데스크톱 개발 실행 | `npm run dev` |
| 웹 개발 실행 | `npm run dev:web` |
| 타입 검사 + 자동 테스트 | `npm run check` |
| 데스크톱 배포 (GitHub 릴리스 → 자동 업데이트) | `npm run release -- --notes 노트.md` |
| 웹 배포 (Vercel 두 주소) | `npm run deploy:web` |

배포 순서는 항상 **타입 검사 → 리뷰 → 버그 수정 → 빌드 → 배포**. 개선했으면 버전을 올려 바로 배포한다.

## 구조

- `src/main` — Electron 메인 프로세스. `database.ts`는 sql.js(메모리 DB)를 `%APPDATA%\moabom\bookvault.db`로 저장
  (300ms 묶어 저장, 종료·업데이트 직전 `flushSave`). 손상되면 자동 백업(`Documents\모아봄 백업`)으로 복구.
- `src/preload` — 화면에 여는 기능(`window.api`, `authBridge`, `updaterBridge`). sandbox + contextIsolation.
- `src/renderer/src` — React 화면. 데스크톱은 `main.tsx`, 웹은 `main.web.tsx` + `api/webApi.ts`(같은 `window.api`를 Supabase로 구현).
- `api/` — Vercel Edge 함수(도서·영화 검색 대리 요청). 검색 키는 서버 환경 변수에만.
- 동기화(`api/syncService.ts`): 로컬 우선. 바뀐 행은 `is_dirty`, 삭제는 `is_deleted` 표시(휴지통 15일).
  올릴 때 읽은 `updated_at`이 그대로일 때만 dirty를 지운다. 같은 작품 판단·합치기 규칙은 `api/syncMatch.ts`.

## 지킬 것

- **화면 문구는 한국어, 쉬운 말로.** 조사는 `utils/korean.ts`의 `josa()`.
- **기록을 지우는 코드는 두 번 확인한다.** 영구삭제는 휴지통에 있는 것만(`purgeItem`), 클라우드도 `is_deleted=true`인 행만.
- **테스트는 실제 데이터에 손대지 않는다.** 앱을 띄워 볼 때는 `MOABOM_USER_DATA=<임시 폴더>`
  (그 폴더에 `backup-dir.txt`로 백업 폴더도 따로). 자동 테스트는 Supabase 주소를 비워 둔 채 돈다(`src/test/setup.ts`).
- **키는 코드·채팅에 쓰지 않는다.** 데스크톱 검색 키는 빌드할 때 `.env`의 `MAIN_VITE_*`에서 들어간다(없으면 빌드가 멈춤).
- **Supabase에 칸을 새로 쓰면 먼저 표에 칸을 추가한다.** 없는 칸을 보내면 그 저장이 통째로 실패한다.
  `scripts/check-schema.mjs`의 목록에도 넣는다(배포 스크립트가 먼저 검사함). 표 변경 SQL은 `supabase/hardening.sql`에.
- 로그인은 PKCE(`supabaseClient.ts`의 `flowType: 'pkce'`)만 받는다.
- 데스크톱 로그인은 `http://localhost:3000`(앱이 띄우는 작은 서버) → `moabom://`로 돌아온다. Supabase Site URL이 이 주소다.
