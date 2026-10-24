// 모아봄 웹앱 서비스 워커
// 앱 화면 파일만 저장해 두고(인터넷이 잠깐 끊겨도 화면은 열림), 기록·검색·표지 같은 다른 곳 요청은 건드리지 않는다.
// 배포할 때마다 이름이 바뀜(vite.web.config.ts) → 새 버전이 깔리면 지난 버전의 파일은 통째로 지움
const CACHE = 'moabom-__BUILD_ID__'
const NAV_TIMEOUT_MS = 4000

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase·TMDB·표지 이미지 등은 그대로 통과

  if (req.mode === 'navigate') {
    // 화면: 항상 최신을 먼저 받고, 오프라인이거나 4초 넘게 응답이 없으면 저장해 둔 것
    event.respondWith((async () => {
      const network = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copy)) }
        return res
      })
      const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS))
      const first = await Promise.race([network.catch(() => null), timeout])
      if (first) return first
      return (await caches.match('/index.html')) || network
    })())
    return
  }

  const isAsset = url.pathname.startsWith('/assets/')
  if (isAsset || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    // 이름에 해시가 붙은 빌드 파일은 내용이 바뀌지 않으므로 저장본 우선. 아이콘 등은 최신을 먼저.
    event.respondWith((async () => {
      const cached = await caches.match(req)
      if (cached && isAsset) return cached
      try {
        const res = await fetch(req)
        // 없는 파일에 화면(HTML)이 대신 오면 저장하지 않음
        if (res.ok && !(res.headers.get('content-type') || '').includes('text/html')) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      } catch (e) {
        if (cached) return cached
        throw e
      }
    })())
  }
})
