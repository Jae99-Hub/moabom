// Supabase에 앱이 쓰는 칸이 모두 있는지 확인 (읽기만 함 — 행은 가져오지 않음)
//   node scripts/check-schema.mjs
// 배포 스크립트(release.mjs·deploy-web.mjs)가 먼저 돌린다.
// 칸이 하나라도 없으면 그 칸을 보내는 저장이 모두 실패한다 — 2026-06 v1.3.15부터 quotes.episode_number가 없어
// 데스크톱 명대사가 넉 달 동안 클라우드에 올라가지 못했고, 웹의 명대사 추가도 실패했음.
import { readFileSync, existsSync } from 'node:fs'

// 앱이 읽고 쓰는 칸 (syncMatch.buildItemPayload · syncService · webApi와 맞출 것)
const COLUMNS = {
  items: [
    'id', 'user_id', 'title', 'original_title', 'item_type', 'cover_path', 'backdrop_path', 'author', 'publisher',
    'isbn', 'page_count', 'current_page', 'director', 'platform', 'tmdb_id', 'google_books_id', 'genre', 'year',
    'overview', 'rating', 'status', 'review', 'read_date', 'created_at', 'updated_at', 'is_deleted', 'deleted_at',
  ],
  quotes: [
    'id', 'item_id', 'user_id', 'text', 'page_number', 'episode_number', 'note',
    'created_at', 'updated_at', 'is_deleted', 'deleted_at',
  ],
}

const env = Object.fromEntries((existsSync('.env') ? readFileSync('.env', 'utf8') : '')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
if (!url || !key) { console.error('✖ .env에 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY가 없어요.'); process.exit(1) }

const missing = []
for (const [table, cols] of Object.entries(COLUMNS)) {
  // 로그인하지 않은 요청이라 행은 하나도 오지 않지만, 없는 칸을 고르면 서버가 오류로 알려 줌
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?select=${cols.join(',')}&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (res.ok) continue
  const body = await res.json().catch(() => ({}))
  const m = /column \w+\.(\w+) does not exist/.exec(body.message ?? '')
  if (!m) { console.error(`✖ ${table} 표를 확인하지 못했어요 (${res.status}): ${body.message ?? ''}`); process.exit(1) }
  // 한 번에 하나씩만 알려 주므로 칸마다 다시 확인
  for (const c of cols) {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?select=${c}&limit=0`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!r.ok) missing.push(`${table}.${c}`)
  }
}

if (missing.length) {
  console.error(`✖ Supabase에 없는 칸: ${missing.join(', ')} — supabase/hardening.sql을 확인해 주세요.`)
  process.exit(1)
}
console.log('✔ Supabase 표에 앱이 쓰는 칸이 모두 있어요.')
