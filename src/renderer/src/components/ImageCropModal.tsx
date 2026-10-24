import React, { useState, useRef, useEffect } from 'react'
import { coverSrc } from '../utils/cover'
import { useEscapeKey } from '../hooks/useEscapeKey'

interface CropArea {
  x: number
  y: number
  w: number
  h: number
}

interface Props {
  imagePath: string
  onDone: (croppedBase64: string) => void
  onCancel: () => void
}

export default function ImageCropModal({ imagePath, onDone, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const downOnBackdrop = useRef(false)
  useEscapeKey(onCancel)
  const containerRef = useRef<HTMLDivElement>(null)
  const [crop, setCrop] = useState<CropArea | null>(null)
  const [dragging, setDragging] = useState(false)
  const [startPos, setStartPos] = useState({ x: 0, y: 0 })
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0, naturalW: 0, naturalH: 0 })

  const src = coverSrc(imagePath) ?? ''

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const maxW = 520
    const maxH = 400 // .crop-image의 max-height와 같게 — 세로로 긴 표지가 찌그러지고 선택 영역이 어긋나던 문제
    const ratio = img.naturalWidth / img.naturalHeight
    const displayW = Math.min(maxW, img.naturalWidth, maxH * ratio)
    const displayH = displayW / ratio
    setDisplaySize({ w: displayW, h: displayH, naturalW: img.naturalWidth, naturalH: img.naturalHeight })
    // Default crop: 2:3 centered
    const cropW = displayW * 0.7
    const cropH = cropW * 1.5
    const cx = (displayW - cropW) / 2
    const cy = (displayH - cropH) / 2
    setCrop({ x: cx, y: Math.max(0, cy), w: cropW, h: Math.min(cropH, displayH) })
  }

  const getRelPos = (e: React.MouseEvent) => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    const pos = getRelPos(e)
    setStartPos(pos)
    setCrop({ x: pos.x, y: pos.y, w: 0, h: 0 })
    setDragging(true)
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    const pos = getRelPos(e)
    const x = Math.min(startPos.x, pos.x)
    const y = Math.min(startPos.y, pos.y)
    const w = Math.abs(pos.x - startPos.x)
    const h = Math.abs(pos.y - startPos.y)
    setCrop({ x, y, w, h })
  }

  const onMouseUp = () => setDragging(false)

  // 컨테이너 밖에서 마우스를 놓아도 드래그 해제
  useEffect(() => {
    const handleGlobalMouseUp = () => setDragging(false)
    document.addEventListener('mouseup', handleGlobalMouseUp)
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  // ── 터치 이벤트 (모바일 크롭 지원) ──────────────────────────────
  const getTouchRelPos = (e: React.TouchEvent) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const touch = e.touches[0]
    return {
      x: Math.max(0, Math.min(displaySize.w, touch.clientX - rect.left)),
      y: Math.max(0, Math.min(displaySize.h, touch.clientY - rect.top))
    }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    const pos = getTouchRelPos(e)
    setStartPos(pos)
    setCrop({ x: pos.x, y: pos.y, w: 0, h: 0 })
    setDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    if (!dragging) return
    const pos = getTouchRelPos(e)
    setCrop({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      w: Math.abs(pos.x - startPos.x),
      h: Math.abs(pos.y - startPos.y)
    })
  }

  const onTouchEnd = () => setDragging(false)

  const handleCrop = () => {
    if (!crop || !imgRef.current || crop.w < 10 || crop.h < 10) return
    const canvas = document.createElement('canvas')
    const scaleX = displaySize.naturalW / displaySize.w
    const scaleY = displaySize.naturalH / displaySize.h
    const rawW = crop.w * scaleX
    const rawH = crop.h * scaleY
    // 표지는 DB에 이미지 데이터로 저장되므로 너비 480px로 줄여 용량을 작게 (화면 표시에는 충분)
    const MAX_PX = 480
    const downScale = rawW > MAX_PX ? MAX_PX / rawW : 1
    canvas.width = Math.round(rawW * downScale)
    canvas.height = Math.round(rawH * downScale)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(
      imgRef.current,
      crop.x * scaleX, crop.y * scaleY, rawW, rawH,
      0, 0, canvas.width, canvas.height
    )
    onDone(canvas.toDataURL('image/jpeg', 0.85))
  }

  return (
    <div
      className="modal-overlay"
      // 배경에서 누르고 배경에서 뗐을 때만 닫음 (선택 영역을 창 밖까지 끌었다 놓으면 자르기가 취소되던 문제)
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnBackdrop.current) onCancel() }}
    >
      <div className="modal" style={{ width: 580 }}>
        <div className="modal-header">
          <span className="modal-title">이미지 자르기</span>
          <button className="btn-icon" onClick={onCancel} aria-label="닫기" title="닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body" style={{ alignItems: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>드래그로 원하는 영역을 선택하세요</p>
          <div
            ref={containerRef}
            className="crop-container"
            style={{ width: displaySize.w || 'auto', height: displaySize.h || 'auto', cursor: 'crosshair' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <img
              ref={imgRef}
              src={src}
              className="crop-image"
              onLoad={onImgLoad}
              draggable={false}
              style={{ width: displaySize.w || 'auto' }}
              alt=""
            />
            {crop && crop.w > 0 && (
              <div
                className="crop-selection"
                style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
              />
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" style={{ width: 80 }} onClick={onCancel}>취소</button>
          <button className="btn-secondary" style={{ width: 100 }} onClick={() => crop && setCrop(null)}>초기화</button>
          <button className="btn-primary" onClick={handleCrop} disabled={!crop || crop.w < 10 || crop.h < 10}>
            자르기 적용
          </button>
        </div>
      </div>
    </div>
  )
}
