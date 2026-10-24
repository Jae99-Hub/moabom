// Supabase가 앱이 보내는 요청을 받아들이는지 확인 — 칸 이름·자료형·조건이 서버 표와 맞는지
//   node scripts/check-schema.mjs        (npm run check:schema)
// 배포 스크립트(release.mjs·deploy-web.mjs)가 먼저 돌린다.
//
// 로그인하지 않은 요청으로 보내므로 기록은 절대 바뀌지 않는다:
//   넣기 → 서버의 행 단위 보안(RLS)이 막음(42501) / 고치기·지우기 → 해당 행 0개 / 읽기 → 빈 목록.
// 그 전에 칸이 없거나(PGRST204·42703) 자료형이 안 맞으면(22P02 등) 다른 오류가 나므로 그것만 잡아낸다.
// 예: 2026-06 v1.3.15부터 quotes.episode_number가 서버에 없어 명대사 저장이 넉 달 동안 모두 실패했음.
import { readFileSync, existsSync } from 'node:fs'

const env = Object.fromEntries((existsSync('.env') ? readFileSync('.env', 'utf8') : '')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const url = env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const key = env.VITE_SUPABASE_ANON_KEY
if (!url || !key) { console.error('✖ .env에 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY가 없어요.'); process.exit(1) }

const UID = '00000000-0000-4000-8000-000000000000' // 아무 계정도 아닌 id
const NOW = new Date().toISOString()

// 앱이 실제로 보내는 모양 (syncMatch.buildItemPayload · syncService · webApi와 맞출 것)
const ITEM = {
  user_id: UID, title: '점검', original_title: 'check', item_type: 'book', cover_path: 'data:image/jpeg;base64,AA',
  backdrop_path: 'https://image.tmdb.org/t/p/w500/x.jpg', author: '저자', publisher: '출판사', isbn: '9791234567890',
  page_count: 300, current_page: 120, director: '감독', platform: '넷플릭스', tmdb_id: 496243, google_books_id: 'abcDEF',
  genre: '소설 > 한국소설', year: '2019', overview: '줄거리', rating: 4.5, status: 'done', review: '감상',
  read_date: '2026-10-24', created_at: NOW, updated_at: NOW, is_deleted: false, deleted_at: null,
}
const QUOTE = {
  user_id: UID, item_id: 1, text: '문장', page_number: 12, episode_number: 3, note: '메모',
  created_at: NOW, updated_at: NOW, is_deleted: false, deleted_at: null,
}
const TRASH = { is_deleted: true, deleted_at: NOW, updated_at: NOW }
const ALIVE = { is_deleted: false, deleted_at: null, updated_at: NOW }
const MERGED = { review: '감상', current_page: 120, rating: 3, read_date: '2026-10-24', status: 'done', overview: '줄거리', genre: '소설', cover_path: null, backdrop_path: null }

const q = (s) => encodeURIComponent(s)
const CHECKS = [
  // 넣기
  ['작품 넣기 (동기화·웹·백업 되돌리기)', 'POST', 'items?select=id', ITEM],
  ['작품 넣기 (웹, 연도가 숫자)', 'POST', 'items?select=*', { ...ITEM, year: 2019, rating: 5 }],
  ['명대사 넣기', 'POST', 'quotes?select=*', QUOTE],
  ['명대사 여러 개 넣기', 'POST', 'quotes', [QUOTE, { ...QUOTE, page_number: null, episode_number: null, note: null }]],
  // 고치기 (해당 행 없음 → 0개)
  ['작품 전체 고치기', 'PATCH', `items?id=eq.1&user_id=eq.${UID}&select=id`, ITEM],
  ['표지만 고치기', 'PATCH', `items?id=eq.1&user_id=eq.${UID}&select=id`, { cover_path: 'data:image/jpeg;base64,AA', updated_at: NOW }],
  ['합치기', 'PATCH', `items?id=eq.1&user_id=eq.${UID}`, { ...MERGED, ...ALIVE }],
  ['휴지통으로', 'PATCH', `items?id=eq.1&user_id=eq.${UID}`, TRASH],
  ['명대사 함께 휴지통으로', 'PATCH', `quotes?item_id=eq.1&user_id=eq.${UID}&is_deleted=not.is.true`, TRASH],
  ['휴지통에서 되살리기', 'PATCH', `quotes?item_id=eq.1&user_id=eq.${UID}&is_deleted=eq.true&deleted_at=eq.${q(NOW)}`, ALIVE],
  ['명대사 고치기', 'PATCH', `quotes?id=eq.1&user_id=eq.${UID}&select=id`, QUOTE],
  ['명대사 일부 고치기', 'PATCH', `quotes?id=eq.1&user_id=eq.${UID}`, { text: '문장', page_number: null, episode_number: 2, note: null, updated_at: NOW }],
  // 읽기
  ['바뀐 작품 받기', 'GET', `items?select=*&user_id=eq.${UID}&updated_at=gt.${q(NOW)}&order=id.asc&offset=0&limit=1000`],
  ['바뀐 명대사 받기', 'GET', `quotes?select=*&user_id=eq.${UID}&updated_at=gt.${q(NOW)}&order=id.asc&offset=0&limit=1000`],
  ['같은 제목 찾기', 'GET', `items?select=*&user_id=eq.${UID}&title=ilike.${q('데미안')}&is_deleted=not.is.true`],
  ['같은 문장 찾기', 'GET', `quotes?select=id&user_id=eq.${UID}&item_id=eq.1&text=eq.${q('문장')}&is_deleted=not.is.true&limit=1`],
  ['웹 목록', 'GET', `items?select=*&user_id=eq.${UID}&is_deleted=not.is.true&order=created_at.desc,id.desc&offset=0&limit=1000`],
  ['웹 휴지통', 'GET', `items?select=*&user_id=eq.${UID}&is_deleted=eq.true&order=deleted_at.desc`],
  ['웹 명대사 검색', 'GET', `quotes?select=*&user_id=eq.${UID}&is_deleted=not.is.true&text=ilike.${q('%문장%')}&order=created_at.desc&limit=200`],
  ['검색 결과의 작품', 'GET', `items?select=id,title,item_type,cover_path&user_id=eq.${UID}&id=in.(1,2)&is_deleted=not.is.true`],
  ['영구삭제 전 확인', 'GET', `items?select=id,is_deleted,updated_at&id=eq.1&user_id=eq.${UID}`],
  ['메모로 명대사 검색', 'GET', `quotes?select=*&user_id=eq.${UID}&is_deleted=not.is.true&note=ilike.${q('%메모%')}&limit=200`],
  ['같은 문장 목록', 'GET', `quotes?select=text&user_id=eq.${UID}&item_id=eq.1&is_deleted=not.is.true`],
  ['휴지통에 간 시각', 'GET', `items?select=deleted_at&id=eq.1&user_id=eq.${UID}`],
  ['명대사 하나 휴지통으로', 'PATCH', `quotes?id=eq.1&user_id=eq.${UID}&select=id`, TRASH],
  ['여러 작품 휴지통으로', 'PATCH', `items?user_id=eq.${UID}&id=in.(1,2)`, TRASH],
  ['작품 영구삭제', 'DELETE', `items?id=eq.1&user_id=eq.${UID}&is_deleted=eq.true`],
  ['작품의 명대사 영구삭제', 'DELETE', `quotes?item_id=eq.1&user_id=eq.${UID}`],
  // 지우기 (해당 행 없음 → 0개)
  ['15일 지난 휴지통 비우기', 'DELETE', `items?user_id=eq.${UID}&is_deleted=eq.true&deleted_at=lt.${q(NOW)}`],
  ['15일 지난 명대사 비우기', 'DELETE', `quotes?user_id=eq.${UID}&is_deleted=eq.true&deleted_at=lt.${q(NOW)}`],
]

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const problems = []
for (const [name, method, path, body] of CHECKS) {
  const res = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { /* 빈 응답 */ }
  // 넣기는 행 단위 보안(RLS)이 막아야 정상 — 권한 없음(같은 42501)과 구별하려고 문구까지 확인.
  // 나머지는 성공(0개)이 정상. 단, 넣기는 보안 검사가 NOT NULL·외래 키 같은 제약보다 먼저라 그런 제약은 여기서 못 잡음
  const ok = method === 'POST'
    ? data?.code === '42501' && /row-level security/i.test(data?.message ?? '')
    : res.ok && (!Array.isArray(data) || data.length === 0)
  if (!ok) problems.push(`${name}: ${res.status} ${data?.code ?? ''} ${data?.message ?? text.slice(0, 120)}`)
}

if (problems.length) {
  console.error('✖ Supabase가 받아들이지 않는 요청이 있어요 (표 칸·자료형을 확인 — supabase/hardening.sql):')
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}
console.log(`✔ 앱이 보내는 요청 ${CHECKS.length}종을 Supabase가 모두 받아들여요.`)
