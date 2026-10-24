// 모아봄 웹앱 서비스 워커
// 앱 화면 파일만 저장해 두고(인터넷이 잠깐 끊겨도 화면은 열림), 기록·검색·표지 같은 다른 곳 요청은 건드리지 않는다.
const CACHE = 'moabom-shell-v1'

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
    // 화면: 항상 최신을 먼저 받고, 오프라인일 때만 저장해 둔 것
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copy)) }
          return res
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    // 이름에 해시가 붙은 빌드 파일은 내용이 바뀌지 않으므로 저장본 우선
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      }))
    )
  }
})
