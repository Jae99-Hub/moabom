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

/** 같은 검색어는 하루 동안 Vercel이 저장해 둔 결과를 바로 돌려줌 (빠르고 검색 사용량도 아낌) */
const CACHE = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' }

export function json(body, status = 200, cache = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cache ? CACHE : { 'Cache-Control': 'no-store' }) },
  })
}

/** 검색어 정리 — 대소문자·띄어쓰기·한글 조합 방식이 달라도 같은 검색어로 (화면 쪽 webApi.ts와 같은 규칙) */
export function normalizeQuery(q) {
  // 글자 단위로 자름 (이모지가 반으로 잘리지 않게), 자른 뒤 끝 공백도 정리
  return Array.from((q || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()).slice(0, 100).join('').trim()
}

export function readQuery(req) {
  return normalizeQuery(new URL(req.url).searchParams.get('q'))
}

/** 정리된 검색어 하나만 붙은 주소가 아니면 그 주소로 보냄.
 *  주소에 아무 값이나 덧붙여 저장된 결과를 피해 가며 검색 사용량을 소모하는 것을 막는다 */
export function canonicalRedirect(req) {
  const url = new URL(req.url)
  const params = url.searchParams
  const q = readQuery(req)
  // 글자 그대로(디코딩한 값)로 비교 — 주소 표기(%27 등)만 다른 경우는 그대로 처리 (예전엔 '가 든 검색어가 무한히 되돌려졌음)
  const extra = [...params.keys()].some((k) => k !== 'q') || params.getAll('q').length !== 1
  if (!extra && params.get('q') === q) return null
  const target = new URL(url.pathname, url)
  target.searchParams.set('q', q)
  return Response.redirect(target.toString(), 308)
}
