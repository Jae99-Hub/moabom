import React, { useState } from 'react'

interface Props {
  value: number | null
  onChange?: (v: number) => void
  readonly?: boolean
  size?: number
}

export default function StarRating({ value, onChange, readonly = false, size = 20 }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)

  const display = hovered ?? value ?? 0

  return (
    <div className="stars" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = display >= star
        const half = !filled && display >= star - 0.5
        return (
          <span
            key={star}
            className={`star${filled ? ' filled' : half ? ' half' : ''}`}
            style={{ fontSize: size, cursor: readonly ? 'default' : 'pointer' }}
            onMouseEnter={() => !readonly && setHovered(star)}
            onClick={() => !readonly && onChange?.(star)}
          >
            {half ? '★' : filled ? '★' : '☆'}
          </span>
        )
      })}
    </div>
  )
}
