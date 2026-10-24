// 동기화에서 '같은 작품인지' 판단하고 두 기록을 합치는 규칙.
// 서버·화면 없이 확인할 수 있도록 syncService에서 떼어 둠 (syncMatch.test.ts)

export type CloudRow = Record<string, unknown>

export function normalizeTitle(t: unknown): string {
  return String(t ?? '').toLowerCase().trim()
}

/** 완전히 같은 항목 판별 (자동 합치기 대상) */
export function isExactMatch(local: CloudRow, cloud: CloudRow): boolean {
  if (normalizeTitle(local.title) !== normalizeTitle(cloud.title)) return false
  if (local.item_type !== cloud.item_type) return false
  // 둘 다 연도 있으면 같아야 함
  if (local.year != null && cloud.year != null) {
    if (String(local.year) !== String(cloud.year)) return false
  }
  // 고유 ID 둘 다 있으면 같아야 함 (클라우드는 숫자를 문자열로 줄 때가 있어 문자열로 비교)
  const differ = (a: unknown, b: unknown) => !!a && !!b && String(a) !== String(b)
  if (differ(local.tmdb_id, cloud.tmdb_id)) return false
  if (differ(local.isbn, cloud.isbn)) return false
  if (differ(local.google_books_id, cloud.google_books_id)) return false
  return true
}

/** 비슷한 항목 판별 (사용자 판단 필요) */
export function isSimilarMatch(local: CloudRow, cloud: CloudRow): boolean {
  if (normalizeTitle(local.title) === normalizeTitle(cloud.title)) return true // 제목 같음 (연도/타입 달라도)
  const same = (a: unknown, b: unknown) => !!a && String(a) === String(b ?? '')
  return same(local.tmdb_id, cloud.tmdb_id) || same(local.isbn, cloud.isbn) || same(local.google_books_id, cloud.google_books_id)
}

export function conflictReason(local: CloudRow, cloud: CloudRow): string {
  const titleMatch = normalizeTitle(local.title) === normalizeTitle(cloud.title)
  if (titleMatch && local.item_type !== cloud.item_type) return '같은 제목이지만 유형이 달라요'
  if (titleMatch && local.year != null && cloud.year != null && String(local.year) !== String(cloud.year)) {
    return `같은 제목, 연도 다름 (이 기기 ${local.year} / 클라우드 ${cloud.year})`
  }
  if (titleMatch) return '같은 제목의 항목이 이미 있어요'
  if (local.tmdb_id && String(local.tmdb_id) === String(cloud.tmdb_id ?? '')) return '같은 작품(TMDB)이 이미 있어요'
  if (local.isbn && String(local.isbn) === String(cloud.isbn ?? '')) return '같은 ISBN의 책이 있어요'
  return '비슷한 항목이 발견됐어요'
}

// ── 스마트 합치기 ─────────────────────────────────────────────────────
const STATUS_PRIORITY: Record<string, number> = { done: 4, reading: 3, want: 2, dropped: 1 }

function mergeStatus(a: string, b: string): string {
  return (STATUS_PRIORITY[a] ?? 0) >= (STATUS_PRIORITY[b] ?? 0) ? a : b
}

const filled = (v: unknown): boolean => v != null && v !== ''

/** 표지: 어느 기기에서나 보이는 것(URL·이미지 데이터)을 우선. 다른 PC의 파일 경로는 여기서 안 보임 */
export function pickCover(cloud: unknown, local: unknown): unknown {
  const portable = (v: unknown) => typeof v === 'string' && /^(https?:|data:)/.test(v)
  if (portable(cloud)) return cloud
  if (portable(local)) return local
  return filled(cloud) ? cloud : local ?? null
}

export function mergeItemFields(local: CloudRow, cloud: CloudRow): Partial<CloudRow> {
  const localReview = String(local.review ?? '')
  const cloudReview = String(cloud.review ?? '')
  return {
    // 더 긴 감상 우선
    review: (localReview.length >= cloudReview.length ? local.review : cloud.review) ?? null,
    // 더 많이 읽은 페이지
    current_page: Math.max(Number(local.current_page ?? 0) || 0, Number(cloud.current_page ?? 0) || 0),
    // 별점: 이 기기 우선 (방금 고친 쪽)
    rating: local.rating ?? cloud.rating ?? null,
    // 완료일: 있는 것 우선
    read_date: (filled(local.read_date) ? local.read_date : cloud.read_date) ?? null,
    // 상태: 더 진행된 것
    status: mergeStatus(String(local.status ?? 'want'), String(cloud.status ?? 'want')),
    // 작품 정보: 클라우드 우선 (API 검색으로 가져온 정보), 비어 있으면 이 기기 것
    overview: (filled(cloud.overview) ? cloud.overview : local.overview) ?? null,
    genre: (filled(cloud.genre) ? cloud.genre : local.genre) ?? null,
    cover_path: pickCover(cloud.cover_path, local.cover_path),
    backdrop_path: (filled(cloud.backdrop_path) ? cloud.backdrop_path : local.backdrop_path) ?? null,
  }
}

// 합치기 결과는 항상 '살아 있는' 항목 — 휴지통 상태의 클라우드 행과 합쳐져 새 항목이 휴지통으로 가는 일 방지
export const ALIVE = { is_deleted: false, deleted_at: null }

/** 이 기기 항목 → 클라우드 행. updated_at은 올리는 시각 → 오프라인 편집이 늦게 올라와도 다른 기기의 증분 받기에 잡힘 */
export function buildItemPayload(item: CloudRow, userId: string, now = new Date().toISOString()): CloudRow {
  return {
    user_id: userId,
    title: item.title,
    original_title: item.original_title ?? null,
    item_type: item.item_type,
    cover_path: item.cover_path ?? null,
    backdrop_path: item.backdrop_path ?? null,
    author: item.author ?? null,
    publisher: item.publisher ?? null,
    isbn: item.isbn ?? null,
    page_count: item.page_count ?? null,
    current_page: item.current_page ?? 0,
    director: item.director ?? null,
    platform: item.platform ?? null,
    tmdb_id: item.tmdb_id ?? null,
    google_books_id: item.google_books_id ?? null,
    genre: item.genre ?? null,
    year: item.year != null ? String(item.year) : null, // 클라우드 year는 TEXT
    overview: item.overview ?? null,
    rating: item.rating ?? null,
    status: item.status,
    review: item.review ?? null,
    read_date: item.read_date ?? null,
    created_at: toIso(item.created_at),
    updated_at: now,
    is_deleted: !!item.is_deleted,
    deleted_at: item.deleted_at ? toIso(item.deleted_at) : null,
  }
}

/** 이 기기 시각('YYYY-MM-DD HH:MM:SS[.SSS]', UTC) → ISO. 시간대 없이 올리면 서버가 다른 시간대로 읽을 수 있음 */
export function toIso(v: unknown): unknown {
  if (typeof v !== 'string' || !v || v.includes('T')) return v
  const d = new Date(v.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? v : d.toISOString()
}
