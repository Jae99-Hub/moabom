// 검색 서버 공용 도구 (밑줄로 시작하는 파일은 Vercel이 따로 주소를 만들지 않음)

const ALLOWED_HOSTS = new Set(['moabom-app.vercel.app', 'moabom-app-nu.vercel.app', 'localhost'])

/** 모아봄 웹 화면에서 온 요청만 받는다 (다른 사이트가 이 검색 서버를 대신 쓰는 것 방지) */
export function fromOurSite(req) {
  if (req.headers.get('sec-fetch-site') === 'same-origin') return true
  for (const h of ['origin', 'referer']) {
    const v = req.headers.get(h)
    if (!v) continue
    try {
      const host = new URL(v).hostname
      if (ALLOWED_HOSTS.has(host) || host.endsWith('-jungminjae329-7141s-projects.vercel.app')) return true
    } catch { /* 잘못된 헤더 */ }
  }
  return false
}

/** 같은 검색어는 1시간 동안 Vercel이 저장해 둔 결과를 바로 돌려줌 (빠르고 검색 사용량도 아낌) */
const CACHE = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }

export function json(body, status = 200, cache = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cache ? CACHE : { 'Cache-Control': 'no-store' }) },
  })
}

export function readQuery(req) {
  return (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 100)
}
