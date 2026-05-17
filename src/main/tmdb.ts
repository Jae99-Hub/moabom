const BASE_URL = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

const MOVIE_GENRES: Record<number, string> = {
  28: '액션', 12: '모험', 16: '애니메이션', 35: '코미디', 80: '범죄',
  99: '다큐멘터리', 18: '드라마', 10751: '가족', 14: '판타지', 36: '역사',
  27: '공포', 10402: '음악', 9648: '미스터리', 10749: '로맨스', 878: 'SF',
  53: '스릴러', 10752: '전쟁', 37: '서부'
}
const TV_GENRES: Record<number, string> = {
  10759: '액션어드벤처', 16: '애니메이션', 35: '코미디', 80: '범죄',
  99: '다큐멘터리', 18: '드라마', 10751: '가족', 10762: '키즈',
  9648: '미스터리', 10765: 'SF판타지', 10768: '전쟁정치', 37: '서부'
}

function mapGenreIds(ids: number[], type: 'movie' | 'tv'): string {
  const map = type === 'movie' ? MOVIE_GENRES : TV_GENRES
  return ids.map((id) => map[id]).filter(Boolean).slice(0, 3).join(', ')
}

export type TmdbResult = {
  tmdb_id: number
  title: string
  original_title: string
  item_type: string
  cover_path: string | null
  backdrop_path: string | null
  year: string | null
  overview: string
  genre: string
  director: string
  vote_average: number
}

async function getDirector(mediaType: string, id: number, apiKey: string): Promise<string> {
  try {
    const endpoint = mediaType === 'movie' ? 'movie' : 'tv'
    const params = new URLSearchParams({ api_key: apiKey, language: 'ko-KR' })
    const res = await fetch(`${BASE_URL}/${endpoint}/${id}/credits?${params}`)
    if (!res.ok) return ''
    const data = await res.json() as { crew?: { job: string; name: string }[] }
    if (mediaType === 'movie') {
      return data.crew?.find((c) => c.job === 'Director')?.name ?? ''
    } else {
      return data.crew?.filter((c) =>
        ['Creator', 'Executive Producer', 'Series Director'].includes(c.job)
      )?.[0]?.name ?? ''
    }
  } catch {
    return ''
  }
}

export async function searchTmdb(query: string, apiKey: string): Promise<TmdbResult[]> {
  if (!apiKey || !query.trim()) return []

  const params = new URLSearchParams({ api_key: apiKey, query: query.trim(), language: 'ko-KR', page: '1' })
  const res = await fetch(`${BASE_URL}/search/multi?${params}`)
  if (!res.ok) throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)

  const data = await res.json() as {
    results?: Array<{
      id: number
      media_type: string
      title?: string
      name?: string
      original_title?: string
      original_name?: string
      poster_path?: string
      backdrop_path?: string
      release_date?: string
      first_air_date?: string
      overview?: string
      vote_average?: number
      genre_ids?: number[]
    }>
  }

  const items = data.results
    ?.filter((r) => ['movie', 'tv'].includes(r.media_type))
    ?.slice(0, 6) ?? []

  const results: TmdbResult[] = await Promise.all(
    items.map(async (item) => {
      const director = await getDirector(item.media_type, item.id, apiKey)
      return {
        tmdb_id: item.id,
        title: item.title ?? item.name ?? '',
        original_title: item.original_title ?? item.original_name ?? '',
        item_type: item.media_type === 'movie' ? 'movie' : 'drama',
        cover_path: item.poster_path ? `${IMAGE_BASE}${item.poster_path}` : null,
        backdrop_path: item.backdrop_path ? `${IMAGE_BASE}${item.backdrop_path}` : null,
        year: (item.release_date ?? item.first_air_date ?? '').slice(0, 4) || null,
        overview: item.overview ?? '',
        genre: mapGenreIds(item.genre_ids ?? [], item.media_type === 'movie' ? 'movie' : 'tv'),
        director,
        vote_average: item.vote_average ?? 0
      }
    })
  )

  return results
}
