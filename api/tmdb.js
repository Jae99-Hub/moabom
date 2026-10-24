// 영화·드라마 검색 (TMDB) — 검색 키를 브라우저 코드에 두지 않으려고 서버에서 대신 요청한다.
// 감독 정보까지 서버에서 한 번에 모아 돌려줘서, 휴대폰에서 요청을 여러 번 보내지 않아도 된다.
import { fromOurSite, json, readQuery, canonicalRedirect } from './_shared.js'

// TMDB 서버(미국) 가까이에서 실행 — 검색 1번 + 감독 정보 여러 번을 서버끼리 빠르게 주고받고, 결과만 한 번에 돌려줌
export const config = { runtime: 'edge', regions: ['iad1'] }

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
const MOVIE_GENRES = {
  28: '액션', 12: '모험', 16: '애니메이션', 35: '코미디', 80: '범죄',
  99: '다큐멘터리', 18: '드라마', 10751: '가족', 14: '판타지', 36: '역사',
  27: '공포', 10402: '음악', 9648: '미스터리', 10749: '로맨스', 878: 'SF',
  53: '스릴러', 10752: '전쟁', 37: '서부',
}
const TV_GENRES = {
  10759: '액션어드벤처', 16: '애니메이션', 35: '코미디', 80: '범죄',
  99: '다큐멘터리', 18: '드라마', 10751: '가족', 10762: '키즈',
  9648: '미스터리', 10765: 'SF판타지', 10768: '전쟁정치', 37: '서부',
}

async function getDirector(mediaType, id, key) {
  try {
    const params = new URLSearchParams({ api_key: key, language: 'ko-KR' })
    const res = await fetch(`https://api.themoviedb.org/3/${mediaType === 'movie' ? 'movie' : 'tv'}/${id}/credits?${params}`)
    if (!res.ok) return ''
    const data = await res.json()
    if (mediaType === 'movie') return data.crew?.find((c) => c.job === 'Director')?.name || ''
    return data.crew?.find((c) => ['Creator', 'Executive Producer', 'Series Director'].includes(c.job))?.name || ''
  } catch {
    return ''
  }
}

export default async function handler(req) {
  if (!fromOurSite(req)) return json({ error: '허용되지 않은 요청이에요.' }, 403)
  const redirect = canonicalRedirect(req)
  if (redirect) return redirect
  const q = readQuery(req)
  if (!q) return json([])
  const key = process.env.TMDB_API_KEY
  if (!key) return json({ error: '영화·드라마 검색이 아직 준비되지 않았어요.' }, 500)

  const params = new URLSearchParams({ api_key: key, query: q, language: 'ko-KR', page: '1' })
  const res = await fetch(`https://api.themoviedb.org/3/search/multi?${params}`)
  if (!res.ok) return json({ error: `영화·드라마 검색 서버에 문제가 있어요. 잠시 뒤 다시 시도해 주세요. (${res.status})` }, 502)
  const data = await res.json()
  const items = (data.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 6)

  const results = await Promise.all(items.map(async (item) => {
    const isMovie = item.media_type === 'movie'
    const genreMap = isMovie ? MOVIE_GENRES : TV_GENRES
    return {
      tmdb_id: item.id,
      title: item.title || item.name || '',
      original_title: item.original_title || item.original_name || '',
      item_type: isMovie ? 'movie' : 'drama',
      cover_path: item.poster_path ? `${IMAGE_BASE}${item.poster_path}` : null,
      backdrop_path: item.backdrop_path ? `${IMAGE_BASE}${item.backdrop_path}` : null,
      year: (item.release_date || item.first_air_date || '').slice(0, 4) || null,
      overview: item.overview || '',
      genre: (item.genre_ids || []).map((id) => genreMap[id]).filter(Boolean).slice(0, 3).join(', '),
      director: await getDirector(item.media_type, item.id, key),
      vote_average: item.vote_average ?? 0,
    }
  }))
  return json(results, 200, true)
}
