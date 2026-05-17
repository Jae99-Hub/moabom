import React, { useState, useRef, useCallback, useEffect } from 'react'

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [crop, setCrop] = useState<CropArea | null>(null)
  const [dragging, setDragging] = useState(false)
  const [startPos, setStartPos] = useState({ x: 0, y: 0 })
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0, naturalW: 0, naturalH: 0 })

  const src = (imagePath.startsWith('http') || imagePath.startsWith('data:')) ? imagePath : `file://${imagePath}`

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const maxW = 520
    const ratio = img.naturalWidth / img.naturalHeight
    const displayW = Math.min(maxW, img.naturalWidth)
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

  const handleCrop = () => {
    if (!crop || !imgRef.current || crop.w < 10 || crop.h < 10) return
    const canvas = document.createElement('canvas')
    const scaleX = displaySize.naturalW / displaySize.w
    const scaleY = displaySize.naturalH / displaySize.h
    const rawW = crop.w * scaleX
    const rawH = crop.h * scaleY
    // 최대 800px 제한으로 메모리 절약
    const MAX_PX = 800
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
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ width: 580 }}>
        <div className="modal-header">
          <span className="modal-title">이미지 자르기</span>
          <button className="btn-icon" onClick={onCancel}>
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
          <button className="btn-primary" onClick={handleCrop} disabled={!crop || crop.w < 10}>
            자르기 적용
          </button>
        </div>
      </div>
    </div>
  )
}
