import React, { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Item } from '../types'

// ── 데이터 계산 헬퍼 ────────────────────────────────────────────────

function getDateYear(item: Item): number | null {
  const d = item.read_date || (item.status === 'done' ? item.updated_at : null)
  if (!d) return null
  const y = new Date(d.includes('T') ? d : d.replace(' ', 'T') + 'Z').getFullYear()
  return isNaN(y) ? null : y
}

function getDateMonth(item: Item, year: number): number | null {
  const d = item.read_date || (item.status === 'done' ? item.updated_at : null)
  if (!d) return null
  const dt = new Date(d.includes('T') ? d : d.replace(' ', 'T') + 'Z')
  return dt.getFullYear() === year ? dt.getMonth() : null
}

interface MonthSlot { month: number; book: number; movie: number; drama: number; documentary: number }

function buildMonthly(items: Item[], year: number): MonthSlot[] {
  const slots: MonthSlot[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, book: 0, movie: 0, drama: 0, documentary: 0,
  }))
  items
    .filter((m) => m.status === 'done')
    .forEach((m) => {
      const mo = getDateMonth(m, year)
      if (mo == null) return
      const t = m.item_type as 'book' | 'movie' | 'drama' | 'documentary'
      if (t in slots[mo]) slots[mo][t]++
    })
  return slots
}

interface RatingStat { dist: Record<number, number>; avg: number; count: number }

function buildRating(items: Item[]): RatingStat {
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0, count = 0
  items.forEach((m) => {
    if (m.rating != null) {
      const r = Math.min(5, Math.max(1, Math.round(m.rating)))
      dist[r] = (dist[r] || 0) + 1
      sum += m.rating
      count++
    }
  })
  return { dist, avg: count > 0 ? sum / count : 0, count }
}

function buildGenre(items: Item[]): [string, number][] {
  const map = new Map<string, number>()
  items.forEach((m) => {
    if (!m.genre) return
    m.genre.split(',').forEach((g) => {
      const name = g.split('>')[0].trim()
      if (name) map.set(name, (map.get(name) || 0) + 1)
    })
  })
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
}

// ── SVG 레이더 차트 (오각형) ────────────────────────────────────────

interface RadarPoint { label: string; value: number; max: number }

function RadarChart({ points, color }: { points: RadarPoint[]; color: string }) {
  const N = points.length
  if (N < 3) return null
  const cx = 90, cy = 90, R = 65

  const angleOf = (i: number) => (Math.PI * 2 * i) / N - Math.PI / 2

  const gridPts = points.map((_, i) => {
    const a = angleOf(i)
    return `${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}`
  }).join(' ')

  const dataPts = points.map((p, i) => {
    const a = angleOf(i)
    const r = p.max > 0 ? (p.value / p.max) * R : 0
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
  }).join(' ')

  // inner grid rings (25%, 50%, 75%)
  const rings = [0.25, 0.5, 0.75].map((scale) =>
    points.map((_, i) => {
      const a = angleOf(i)
      return `${cx + R * scale * Math.cos(a)},${cy + R * scale * Math.sin(a)}`
    }).join(' ')
  )

  return (
    <svg width="180" height="180" viewBox="0 0 180 180">
      {/* 그리드 링 */}
      {rings.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="var(--border)" strokeWidth="1" />
      ))}
      {/* 바깥 그리드 */}
      <polygon points={gridPts} fill="none" stroke="var(--border)" strokeWidth="1" />
      {/* 축선 */}
      {points.map((_, i) => {
        const a = angleOf(i)
        return (
          <line key={i}
            x1={cx} y1={cy}
            x2={cx + R * Math.cos(a)} y2={cy + R * Math.sin(a)}
            stroke="var(--border)" strokeWidth="1" />
        )
      })}
      {/* 데이터 영역 */}
      <polygon points={dataPts} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="2" />
      {/* 라벨 */}
      {points.map((p, i) => {
        const a = angleOf(i)
        const lx = cx + (R + 18) * Math.cos(a)
        const ly = cy + (R + 18) * Math.sin(a)
        const anchor = lx < cx - 5 ? 'end' : lx > cx + 5 ? 'start' : 'middle'
        return (
          <text key={i} x={lx} y={ly + 4} textAnchor={anchor}
            fontSize="10" fill="var(--text-muted)" fontFamily="inherit">
            {p.label}
          </text>
        )
      })}
      {/* 값 점 */}
      {points.map((p, i) => {
        const a = angleOf(i)
        const r = p.max > 0 ? (p.value / p.max) * R : 0
        return (
          <circle key={i}
            cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)}
            r="3" fill={color} />
        )
      })}
    </svg>
  )
}

// ── 바 차트 (월별) ────────────────────────────────────────────────────

function MonthlyBarChart({ data }: { data: MonthSlot[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const maxVal = Math.max(...data.map((d) => d.book + d.movie + d.drama + d.documentary), 1)
  const yTicks = useMemo(() => {
    const step = maxVal <= 5 ? 1 : maxVal <= 10 ? 2 : Math.ceil(maxVal / 5)
    const ticks: number[] = []
    for (let i = 0; i <= maxVal; i += step) ticks.push(i)
    return ticks
  }, [maxVal])

  return (
    <div className="stat-bar-chart-wrap">
      <div className="stat-bar-y-axis">
        {[...yTicks].reverse().map((v) => (
          <div key={v} className="stat-bar-y-tick">{v}</div>
        ))}
      </div>
      <div className="stat-bar-chart">
        <div className="stat-bar-grid">
          {yTicks.map((v) => (
            <div key={v} className="stat-bar-grid-line" style={{ bottom: `${(v / maxVal) * 100}%` }} />
          ))}
        </div>
        {data.map((d) => {
          const total = d.book + d.movie + d.drama + d.documentary
          const bookH = (d.book / maxVal) * 100
          const movieH = (d.movie / maxVal) * 100
          const dramaH = (d.drama / maxVal) * 100
          const docH = (d.documentary / maxVal) * 100
          const isHov = hovered === d.month
          return (
            <div key={d.month} className="stat-bar-col"
              onMouseEnter={() => setHovered(d.month)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="stat-bar-col-inner">
                {isHov && total > 0 && (
                  <div className="stat-bar-tooltip">
                    {total}개
                    {d.book > 0 && <span style={{ color: '#60a5fa' }}> 📚{d.book}</span>}
                    {d.movie > 0 && <span style={{ color: '#a78bfa' }}> 🎬{d.movie}</span>}
                    {d.drama > 0 && <span style={{ color: '#f472b6' }}> 📺{d.drama}</span>}
                    {d.documentary > 0 && <span style={{ color: '#fbbf24' }}> 🎞️{d.documentary}</span>}
                  </div>
                )}
                <div className="stat-bar-stack">
                  {d.documentary > 0 && (
                    <div className="stat-bar-seg" style={{ height: `${docH}%`, background: '#f59e0b' }} />
                  )}
                  {d.drama > 0 && (
                    <div className="stat-bar-seg" style={{ height: `${dramaH}%`, background: '#ec4899' }} />
                  )}
                  {d.movie > 0 && (
                    <div className="stat-bar-seg" style={{ height: `${movieH}%`, background: '#8b5cf6' }} />
                  )}
                  {d.book > 0 && (
                    <div className="stat-bar-seg" style={{ height: `${bookH}%`, background: '#3b82f6' }} />
                  )}
                </div>
              </div>
              <div className={`stat-bar-label ${isHov ? 'hov' : ''}`}>{d.month}월</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 평점 분포 차트 ───────────────────────────────────────────────────

function RatingDistChart({ stat }: { stat: RatingStat }) {
  const maxCount = Math.max(...Object.values(stat.dist), 1)
  const STAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']

  return (
    <div className="stat-rating-dist">
      {[5, 4, 3, 2, 1].map((stars) => {
        const count = stat.dist[stars] || 0
        const pct = (count / maxCount) * 100
        return (
          <div key={stars} className="stat-rating-row">
            <div className="stat-rating-stars">
              {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
            </div>
            <div className="stat-rating-bar-wrap">
              <div className="stat-rating-bar" style={{ width: `${pct}%`, background: STAR_COLORS[stars - 1] }} />
            </div>
            <div className="stat-rating-count">{count}개</div>
          </div>
        )
      })}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────

type StatsTab = 'monthly' | 'rating' | 'genre'

export default function StatsModal() {
  const { isStatsOpen, closeStats, itemList } = useStore()
  const [tab, setTab] = useState<StatsTab>('monthly')

  // 연도 목록 계산
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    const curY = new Date().getFullYear()
    years.add(curY)
    itemList.filter((m) => m.status === 'done').forEach((m) => {
      const y = getDateYear(m)
      if (y) years.add(y)
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [itemList])

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear())

  // 요약 숫자
  const totalDone = useMemo(() => itemList.filter((m) => m.status === 'done').length, [itemList])
  const yearDone = useMemo(() =>
    itemList.filter((m) => m.status === 'done' && getDateYear(m) === selectedYear).length,
    [itemList, selectedYear])
  const ratingAll = useMemo(() => buildRating(itemList), [itemList])
  const monthlyData = useMemo(() => buildMonthly(itemList, selectedYear), [itemList, selectedYear])
  const genreData = useMemo(() => buildGenre(itemList), [itemList])
  const maxGenre = genreData[0]?.[1] || 1

  // 장르 레이더 (상위 5개)
  const top5Genres = useMemo(() => genreData.slice(0, 5), [genreData])
  const radarPoints = useMemo(() =>
    top5Genres.map(([label, value]) => ({ label, value, max: top5Genres[0]?.[1] || 1 })),
    [top5Genres])

  // 타입별 완독 수
  const byType = useMemo(() => ({
    book:  itemList.filter((m) => m.status === 'done' && m.item_type === 'book').length,
    movie: itemList.filter((m) => m.status === 'done' && m.item_type === 'movie').length,
    drama: itemList.filter((m) => m.status === 'done' && m.item_type === 'drama').length,
    documentary: itemList.filter((m) => m.status === 'done' && m.item_type === 'documentary').length,
  }), [itemList])

  if (!isStatsOpen) return null

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeStats()}>
      <div className="stats-modal">
        {/* 헤더 */}
        <div className="modal-header">
          <span className="modal-title">📊 나의 기록 통계</span>
          <button className="btn-icon" onClick={closeStats}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="stats-body">
          {/* 요약 카드 */}
          <div className="stats-summary">
            <div className="stats-card">
              <div className="stats-card-num">{itemList.length}</div>
              <div className="stats-card-label">전체 작품</div>
            </div>
            <div className="stats-card stats-card--accent">
              <div className="stats-card-num">{totalDone}</div>
              <div className="stats-card-label">총 완독·완료</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-num">{yearDone}</div>
              <div className="stats-card-label">{selectedYear}년 완료</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-num">
                {ratingAll.count > 0 ? `⭐ ${ratingAll.avg.toFixed(1)}` : '–'}
              </div>
              <div className="stats-card-label">
                {ratingAll.count > 0 ? `평균 평점 (${ratingAll.count}개)` : '평점 없음'}
              </div>
            </div>
          </div>

          {/* 타입별 */}
          <div className="stats-type-row">
            <div className="stats-type-item">
              <div className="stats-type-dot" style={{ background: '#3b82f6' }} />
              <span className="stats-type-label">📚 도서</span>
              <span className="stats-type-num" style={{ color: '#60a5fa' }}>{byType.book}권</span>
            </div>
            <div className="stats-type-item">
              <div className="stats-type-dot" style={{ background: '#8b5cf6' }} />
              <span className="stats-type-label">🎬 영화</span>
              <span className="stats-type-num" style={{ color: '#a78bfa' }}>{byType.movie}편</span>
            </div>
            <div className="stats-type-item">
              <div className="stats-type-dot" style={{ background: '#ec4899' }} />
              <span className="stats-type-label">📺 드라마</span>
              <span className="stats-type-num" style={{ color: '#f472b6' }}>{byType.drama}편</span>
            </div>
            <div className="stats-type-item">
              <div className="stats-type-dot" style={{ background: '#f59e0b' }} />
              <span className="stats-type-label">🎞️ 다큐</span>
              <span className="stats-type-num" style={{ color: '#fbbf24' }}>{byType.documentary}편</span>
            </div>
          </div>

          {/* 탭 */}
          <div className="stats-tabs">
            {(['monthly', 'rating', 'genre'] as StatsTab[]).map((t) => (
              <button
                key={t}
                className={`stats-tab ${tab === t ? 'active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'monthly' ? '📅 월별' : t === 'rating' ? '⭐ 평점' : '🏷️ 장르'}
              </button>
            ))}
          </div>

          {/* 탭 콘텐츠 */}
          {tab === 'monthly' && (() => {
            const yearTotal = monthlyData.reduce((s, d) => s + d.book + d.movie + d.drama + d.documentary, 0)
            return (
              <div className="stats-tab-content">
                <div className="stats-section-header">
                  <span>월별 완료 현황{yearTotal > 0 && <strong style={{ color: 'var(--accent)', marginLeft: 6 }}>총 {yearTotal}개</strong>}</span>
                  <select
                    className="stats-year-select"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                  >
                    {availableYears.map((y) => (
                      <option key={y} value={y}>{y}년</option>
                    ))}
                  </select>
                </div>
                {yearTotal === 0 ? (
                  <div className="stats-empty">
                    <div className="stats-empty-icon">📭</div>
                    <div className="stats-empty-title">{selectedYear}년에 완료한 기록이 아직 없어요</div>
                    <div className="stats-empty-desc">작품을 ‘완료’로 표시하면 월별로 쌓여요</div>
                  </div>
                ) : (
                  <>
                    <MonthlyBarChart data={monthlyData} />
                    <div className="stats-legend">
                      <div className="stats-legend-item"><span className="stats-legend-dot" style={{ background: '#3b82f6' }} />도서</div>
                      <div className="stats-legend-item"><span className="stats-legend-dot" style={{ background: '#8b5cf6' }} />영화</div>
                      <div className="stats-legend-item"><span className="stats-legend-dot" style={{ background: '#ec4899' }} />드라마</div>
                      <div className="stats-legend-item"><span className="stats-legend-dot" style={{ background: '#f59e0b' }} />다큐</div>
                    </div>
                  </>
                )}
              </div>
            )
          })()}

          {tab === 'rating' && ratingAll.count === 0 && (
            <div className="stats-tab-content">
              <div className="stats-empty">
                <div className="stats-empty-icon">⭐</div>
                <div className="stats-empty-title">아직 별점을 매긴 작품이 없어요</div>
                <div className="stats-empty-desc">작품에 별점을 남기면 분포가 여기에 표시돼요</div>
              </div>
            </div>
          )}

          {tab === 'rating' && ratingAll.count > 0 && (
            <div className="stats-tab-content">
              <div className="stats-rating-header">
                <div className="stats-avg-rating">
                  <div className="stats-avg-num">{ratingAll.avg.toFixed(1)}</div>
                  <div className="stats-avg-stars">
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} style={{
                        color: i < Math.round(ratingAll.avg) ? '#f59e0b' : 'var(--border)',
                        fontSize: 20
                      }}>★</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>평균 별점</div>
                </div>
                <RatingDistChart stat={ratingAll} />
              </div>

              {/* 타입별 평균 평점 */}
              <div className="stats-section-header" style={{ marginTop: 16 }}>타입별 평균 평점</div>
              <div className="stats-type-rating">
                {(['book', 'movie', 'drama', 'documentary'] as const).map((type) => {
                  const typed = buildRating(itemList.filter((m) => m.item_type === type))
                  const COLOR = type === 'book' ? '#3b82f6' : type === 'movie' ? '#8b5cf6' : type === 'drama' ? '#ec4899' : '#f59e0b'
                  const LABEL = type === 'book' ? '📚 도서' : type === 'movie' ? '🎬 영화' : type === 'drama' ? '📺 드라마' : '🎞️ 다큐'
                  return (
                    <div key={type} className="stats-type-rating-item">
                      <div className="stats-type-rating-label">{LABEL}</div>
                      <div className="stats-type-rating-bar-wrap">
                        <div className="stats-type-rating-bar"
                          style={{ width: `${(typed.avg / 5) * 100}%`, background: COLOR }} />
                      </div>
                      <div className="stats-type-rating-val" style={{ color: COLOR }}>
                        {typed.count > 0 ? typed.avg.toFixed(1) : '-'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'genre' && genreData.length === 0 && (
            <div className="stats-tab-content">
              <div className="stats-empty">
                <div className="stats-empty-icon">🏷️</div>
                <div className="stats-empty-title">장르 정보가 아직 없어요</div>
                <div className="stats-empty-desc">작품에 장르를 입력하면 분석이 표시돼요</div>
              </div>
            </div>
          )}

          {tab === 'genre' && genreData.length > 0 && (
            <div className="stats-tab-content">
              <div className="stats-genre-wrap">
                {/* 상위 장르 바 차트 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="stats-section-header">장르별 작품 수 (상위 10)</div>
                  <div className="stats-genre-list">
                    {genreData.map(([name, count]) => (
                      <div key={name} className="stats-genre-row">
                        <div className="stats-genre-name" title={name}>{name}</div>
                        <div className="stats-genre-bar-wrap">
                          <div className="stats-genre-bar"
                            style={{ width: `${(count / maxGenre) * 100}%` }} />
                        </div>
                        <div className="stats-genre-count">{count}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 레이더 차트 */}
                {top5Genres.length >= 3 && (
                  <div className="stats-radar-wrap">
                    <div className="stats-section-header" style={{ textAlign: 'center' }}>
                      상위 {top5Genres.length}개 장르
                    </div>
                    <RadarChart points={radarPoints} color="var(--accent)" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
