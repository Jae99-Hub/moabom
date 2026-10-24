import React, { useMemo, useRef, useState } from 'react'
import { useStore, useStorePick } from '../store/useStore'
import { TYPE_COLOR, TYPE_TEXT_COLOR, typeEmojiLabel } from '../constants/itemMeta'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { getDateYear, buildMonthly, buildRating, buildGenre, niceScale, MonthSlot, RatingStat } from '../utils/stats'

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

  // 라벨이 오각형 바깥으로 나가므로 양옆에 여백을 둔 viewBox (예전엔 '문학'이 '학'으로 잘렸음)
  return (
    <svg width="240" height="196" viewBox="-30 -8 240 196" role="img" aria-label={points.map((p) => `${p.label} ${p.value}`).join(', ')}>
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
            {p.label.length > 7 ? p.label.slice(0, 7) + '…' : p.label}
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
  // 맨 위 눈금 = 그래프 꼭대기 (눈금 글자와 가로선 위치가 어긋나지 않게)
  const { max: maxVal, ticks: yTicks } = useMemo(
    () => niceScale(Math.max(...data.map((d) => d.book + d.movie + d.drama + d.documentary))),
    [data])

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
          // 막대 전체 높이는 그래프 대비, 칸마다의 높이는 막대 안에서의 비율
          const part = (n: number) => (total > 0 ? (n / total) * 100 : 0)
          const bookH = part(d.book)
          const movieH = part(d.movie)
          const dramaH = part(d.drama)
          const docH = part(d.documentary)
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
                    {d.book > 0 && <span style={{ color: TYPE_TEXT_COLOR.book }}> 📚{d.book}</span>}
                    {d.movie > 0 && <span style={{ color: TYPE_TEXT_COLOR.movie }}> 🎬{d.movie}</span>}
                    {d.drama > 0 && <span style={{ color: TYPE_TEXT_COLOR.drama }}> 📺{d.drama}</span>}
                    {d.documentary > 0 && <span style={{ color: TYPE_TEXT_COLOR.documentary }}> 🎞️{d.documentary}</span>}
                  </div>
                )}
                <div className="stat-bar-stack" style={{ height: `${(total / maxVal) * 100}%` }}>
                  {d.documentary > 0 && (
                    <div className="stat-bar-seg" style={{ height: `${docH}%`, background: TYPE_COLOR.documentary }} />
                  )}
                  {d.drama > 0 && (
                    <div className="stat-bar-seg" style={{ height: `${dramaH}%`, background: TYPE_COLOR.drama }} />
                  )}
                  {d.movie > 0 && (
                    <div className="stat-bar-seg" style={{ height: `${movieH}%`, background: TYPE_COLOR.movie }} />
                  )}
                  {d.book > 0 && (
                    <div className="stat-bar-seg" style={{ height: `${bookH}%`, background: TYPE_COLOR.book }} />
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

// 닫혀 있을 때는 통계 계산을 아예 하지 않도록 열렸을 때만 내용을 그림
export default function StatsModal() {
  const isStatsOpen = useStore((s) => s.isStatsOpen)
  return isStatsOpen ? <StatsContent /> : null
}

function StatsContent() {
  const { closeStats, itemList } = useStorePick('closeStats', 'itemList')
  const [tab, setTab] = useState<StatsTab>('monthly')
  useEscapeKey(closeStats)
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef)

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

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeStats()}>
      <div className="stats-modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="나의 기록 통계">
        {/* 헤더 */}
        <div className="modal-header">
          <span className="modal-title">📊 나의 기록 통계</span>
          <button className="btn-icon" onClick={closeStats} aria-label="닫기" title="닫기">
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
              <div className="stats-type-dot" style={{ background: TYPE_COLOR.book }} />
              <span className="stats-type-label">📚 도서</span>
              <span className="stats-type-num" style={{ color: TYPE_TEXT_COLOR.book }}>{byType.book}권</span>
            </div>
            <div className="stats-type-item">
              <div className="stats-type-dot" style={{ background: TYPE_COLOR.movie }} />
              <span className="stats-type-label">🎬 영화</span>
              <span className="stats-type-num" style={{ color: TYPE_TEXT_COLOR.movie }}>{byType.movie}편</span>
            </div>
            <div className="stats-type-item">
              <div className="stats-type-dot" style={{ background: TYPE_COLOR.drama }} />
              <span className="stats-type-label">📺 드라마</span>
              <span className="stats-type-num" style={{ color: TYPE_TEXT_COLOR.drama }}>{byType.drama}편</span>
            </div>
            <div className="stats-type-item">
              <div className="stats-type-dot" style={{ background: TYPE_COLOR.documentary }} />
              <span className="stats-type-label">🎞️ 다큐</span>
              <span className="stats-type-num" style={{ color: TYPE_TEXT_COLOR.documentary }}>{byType.documentary}편</span>
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
                      <div className="stats-legend-item"><span className="stats-legend-dot" style={{ background: TYPE_COLOR.book }} />도서</div>
                      <div className="stats-legend-item"><span className="stats-legend-dot" style={{ background: TYPE_COLOR.movie }} />영화</div>
                      <div className="stats-legend-item"><span className="stats-legend-dot" style={{ background: TYPE_COLOR.drama }} />드라마</div>
                      <div className="stats-legend-item"><span className="stats-legend-dot" style={{ background: TYPE_COLOR.documentary }} />다큐</div>
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
                        color: i < Math.round(ratingAll.avg) ? 'var(--star)' : 'var(--border)',
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
                  const COLOR = TYPE_COLOR[type]
                  const LABEL = typeEmojiLabel(type)
                  return (
                    <div key={type} className="stats-type-rating-item">
                      <div className="stats-type-rating-label">{LABEL}</div>
                      <div className="stats-type-rating-bar-wrap">
                        <div className="stats-type-rating-bar"
                          style={{ width: `${(typed.avg / 5) * 100}%`, background: COLOR }} />
                      </div>
                      <div className="stats-type-rating-val" style={{ color: TYPE_TEXT_COLOR[type] }}>
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
