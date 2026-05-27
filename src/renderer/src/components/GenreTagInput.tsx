import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'

interface Props {
  value: string          // 현재 장르 문자열 (쉼표 구분, "SF, 애니>2025년")
  onChange: (v: string) => void
  suggestions?: string[] // 추천 칩
}

/** 쉼표로 된 장르 문자열 ↔ 태그 배열 */
const toTags = (v: string) =>
  v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
const fromTags = (tags: string[]) => tags.join(', ')

export default function GenreTagInput({ value, onChange, suggestions = [] }: Props) {
  const [tags, setTags] = useState<string[]>(() => toTags(value))
  const [inputText, setInputText] = useState('')
  const [segments, setSegments] = useState<string[]>([]) // Tab으로 쌓인 상위 경로
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // 부모가 value를 외부에서 바꿀 때 (예: 검색 초기화) 내부 tags도 동기화
  useEffect(() => {
    setTags(toTags(value))
  }, [value])

  // 내부 tags → 부모에게 전달
  const pushTags = (next: string[]) => {
    setTags(next)
    onChange(fromTags(next))
  }

  // 태그 하나 확정
  const commitTag = () => {
    const text = inputText.trim()
    const parts = [...segments, text].filter(Boolean)
    if (parts.length === 0) return
    const tag = parts.join('>')
    if (!tags.includes(tag)) pushTags([...tags, tag])
    setInputText('')
    setSegments([])
  }

  // 태그 삭제
  const removeTag = (i: number) => {
    const next = tags.filter((_, idx) => idx !== i)
    pushTags(next)
  }

  // 추천 칩 클릭
  const addSuggestion = (g: string) => {
    if (!tags.includes(g)) pushTags([...tags, g])
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const text = inputText.trim()
      if (text) {
        // 현재 입력값을 상위 경로로 쌓고 새 레벨 시작
        setSegments(prev => [...prev, text])
        setInputText('')
      } else if (segments.length === 0) {
        // 아무것도 없을 때 Tab → 무시
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commitTag()
    } else if (e.key === 'Backspace' && inputText === '') {
      e.preventDefault()
      if (segments.length > 0) {
        // 상위로 돌아가기: 마지막 segment를 inputText로 복원
        const prev = [...segments]
        const last = prev.pop()!
        setSegments(prev)
        setInputText(last)
      } else if (tags.length > 0) {
        // 마지막 태그 삭제
        removeTag(tags.length - 1)
      }
    }
  }

  // 현재 경로 표시 (Tab으로 쌓인 상위들)
  const breadcrumb = segments.join(' › ')

  return (
    <div ref={wrapRef} className="genre-tag-input-wrap" onClick={() => inputRef.current?.focus()}>
      {/* 저장된 태그들 */}
      {tags.map((tag, i) => (
        <span key={i} className="genre-tag">
          {tag.split('>').join(' › ')}
          <button
            className="genre-tag-remove"
            onClick={e => { e.stopPropagation(); removeTag(i) }}
            tabIndex={-1}
          >×</button>
        </span>
      ))}

      {/* 입력 영역 */}
      <span className="genre-tag-input-row">
        {/* 상위 경로 breadcrumb */}
        {breadcrumb && (
          <span className="genre-tag-breadcrumb">{breadcrumb} ›&nbsp;</span>
        )}
        <input
          ref={inputRef}
          className="genre-tag-inner-input"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            // 포커스가 컴포넌트 내부(태그 삭제 버튼 등)로 이동한 경우 커밋 안 함
            const movingTo = e.relatedTarget as Node | null
            if (wrapRef.current && movingTo && wrapRef.current.contains(movingTo)) return
            if (inputText.trim() || segments.length > 0) commitTag()
          }}
          placeholder={tags.length === 0 && segments.length === 0
            ? 'SF, 판타지... (Tab으로 하위장르, Enter로 저장)'
            : ''}
          size={Math.max(
            2,
            inputText.length || (tags.length === 0 && segments.length === 0 ? 32 : 2)
          )}
        />
      </span>

      {/* 추천 칩 */}
      {suggestions.length > 0 && (
        <div className="genre-chips" style={{ marginTop: 6 }}>
          {suggestions.map(g => (
            <button
              key={g}
              className="genre-recent-chip"
              tabIndex={-1}
              onMouseDown={e => { e.preventDefault(); addSuggestion(g) }}
            >
              + {g.split('>').join(' › ')}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
