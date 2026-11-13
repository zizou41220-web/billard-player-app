import React, { useRef, useState } from 'react';
import {
  LiveOverlayConfig,
  LiveOverlayImageItem,
  LiveOverlayTextItem,
  getImageBgStyles,
  getTextThemeStyles
} from '../utils/liveOverlay';

interface LiveCustomOverlayLayerProps {
  config: LiveOverlayConfig;
  interactive?: boolean;
  selectedItemId?: string | null;
  onSelectItem?: (id: string | null) => void;
  onChangeConfig?: (next: LiveOverlayConfig) => void;
  previewScale?: number; // e.g., 0.45 inside small 16:9 studio preview, 1 on full 1080p screen
}

export const LiveCustomOverlayLayer: React.FC<LiveCustomOverlayLayerProps> = ({
  config,
  interactive = false,
  selectedItemId = null,
  onSelectItem,
  onChangeConfig,
  previewScale = 1
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [draggingState, setDraggingState] = useState<{
    kind: 'move-image' | 'resize-image' | 'move-text' | 'scale-text';
    id: string;
    startClientX: number;
    startClientY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
    initialScale: number;
  } | null>(null);

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingState || !containerRef.current || !onChangeConfig) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dxPct = ((e.clientX - draggingState.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - draggingState.startClientY) / rect.height) * 100;

    if (draggingState.kind === 'move-image') {
      const nextX = Math.round(clamp(draggingState.initialX + dxPct, 2, 98) * 10) / 10;
      const nextY = Math.round(clamp(draggingState.initialY + dyPct, 2, 98) * 10) / 10;
      onChangeConfig({
        ...config,
        images: config.images.map(img =>
          img.id === draggingState.id ? { ...img, x: nextX, y: nextY } : img
        )
      });
    } else if (draggingState.kind === 'resize-image') {
      const nextW = Math.round(clamp(draggingState.initialW + dxPct * 1.5, 3, 90) * 10) / 10;
      const nextH = Math.round(clamp(draggingState.initialH + dyPct * 1.5, 3, 90) * 10) / 10;
      onChangeConfig({
        ...config,
        images: config.images.map(img =>
          img.id === draggingState.id
            ? {
                ...img,
                width: nextW,
                ...(img.aspectRatio === 'custom_box' ? { height: nextH } : {})
              }
            : img
        )
      });
    } else if (draggingState.kind === 'move-text') {
      const nextX = Math.round(clamp(draggingState.initialX + dxPct, 2, 98) * 10) / 10;
      const nextY = Math.round(clamp(draggingState.initialY + dyPct, 2, 98) * 10) / 10;
      onChangeConfig({
        ...config,
        texts: config.texts.map(txt =>
          txt.id === draggingState.id ? { ...txt, x: nextX, y: nextY } : txt
        )
      });
    } else if (draggingState.kind === 'scale-text') {
      const nextScale = Math.round(clamp(draggingState.initialScale + dxPct * 0.03, 0.5, 3.2) * 100) / 100;
      onChangeConfig({
        ...config,
        texts: config.texts.map(txt =>
          txt.id === draggingState.id ? { ...txt, scale: nextScale } : txt
        )
      });
    }
  };

  const handlePointerUp = () => {
    if (draggingState) {
      setDraggingState(null);
    }
  };

  const getAspectStyle = (img: LiveOverlayImageItem): React.CSSProperties => {
    switch (img.aspectRatio) {
      case '1:1':
        return { aspectRatio: '1 / 1' };
      case '16:9':
        return { aspectRatio: '16 / 9' };
      case '4:3':
        return { aspectRatio: '4 / 3' };
      case '3:4':
        return { aspectRatio: '3 / 4' };
      case 'circle':
        return { aspectRatio: '1 / 1', borderRadius: '50%' };
      case 'custom_box':
        return { height: `${img.height || 20}%` };
      case 'free':
      default:
        return {};
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? handlePointerUp : undefined}
      onPointerCancel={interactive ? handlePointerUp : undefined}
      onClick={() => {
        if (interactive && onSelectItem) onSelectItem(null);
      }}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: interactive ? 'auto' : 'none',
        zIndex: 14,
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* RENDER CUSTOM IMAGES */}
      {config.images
        .filter(img => img.visible && img.url)
        .map((img: LiveOverlayImageItem) => {
          const isSelected = interactive && selectedItemId === img.id;
          const bgStyles = getImageBgStyles(img.bgStyle);
          const aspectStyles = getAspectStyle(img);
          const isCircle = img.aspectRatio === 'circle';
          const effectiveRadius = isCircle ? '50%' : `${img.borderRadius ?? 10}px`;

          return (
            <div
              key={img.id}
              onClick={e => {
                e.stopPropagation();
                if (interactive && onSelectItem) onSelectItem(img.id);
              }}
              onPointerDown={e => {
                if (!interactive) return;
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                onSelectItem?.(img.id);
                setDraggingState({
                  kind: 'move-image',
                  id: img.id,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  initialX: img.x,
                  initialY: img.y,
                  initialW: img.width,
                  initialH: img.height || 20,
                  initialScale: 1
                });
              }}
              style={{
                position: 'absolute',
                left: `${img.x}%`,
                top: `${img.y}%`,
                transform: 'translate(-50%, -50%)',
                width: `${img.width}%`,
                opacity: img.opacity ?? 1,
                borderRadius: effectiveRadius,
                cursor: interactive ? 'grab' : 'default',
                pointerEvents: interactive ? 'auto' : 'none',
                boxSizing: 'border-box',
                outline: isSelected ? '2px dashed #F59E0B' : 'none',
                outlineOffset: '3px',
                ...bgStyles,
                ...aspectStyles
              }}
            >
              <img
                src={img.url}
                alt={img.label || 'Image Live'}
                draggable={false}
                style={{
                  width: '100%',
                  height: img.aspectRatio === 'free' ? 'auto' : '100%',
                  display: 'block',
                  objectFit: img.aspectRatio === 'free' ? 'contain' : (img.fitMode || 'cover'),
                  borderRadius: effectiveRadius,
                  pointerEvents: 'none'
                }}
              />

              {/* Resize Handle when interactive */}
              {interactive && isSelected && (
                <div
                  onPointerDown={e => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDraggingState({
                      kind: 'resize-image',
                      id: img.id,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      initialX: img.x,
                      initialY: img.y,
                      initialW: img.width,
                      initialH: img.height || 20,
                      initialScale: 1
                    });
                  }}
                  title="Glisser pour redimensionner l'image"
                  style={{
                    position: 'absolute',
                    right: '-8px',
                    bottom: '-8px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#F59E0B',
                    border: '2px solid #000',
                    cursor: 'nwse-resize',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    color: '#000',
                    fontWeight: 900
                  }}
                >
                  ↘
                </div>
              )}
            </div>
          );
        })}

      {/* RENDER CUSTOM TEXTS / INFO BANNERS */}
      {config.texts
        .filter(txt => txt.visible && txt.text.trim().length > 0)
        .map((txt: LiveOverlayTextItem) => {
          const isSelected = interactive && selectedItemId === txt.id;
          const themeStyles = getTextThemeStyles(txt.theme);
          const baseFontRem = 1.25 * (txt.scale || 1) * previewScale;

          return (
            <div
              key={txt.id}
              onClick={e => {
                e.stopPropagation();
                if (interactive && onSelectItem) onSelectItem(txt.id);
              }}
              onPointerDown={e => {
                if (!interactive) return;
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                onSelectItem?.(txt.id);
                setDraggingState({
                  kind: 'move-text',
                  id: txt.id,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  initialX: txt.x,
                  initialY: txt.y,
                  initialW: 0,
                  initialH: 0,
                  initialScale: txt.scale || 1
                });
              }}
              style={{
                position: 'absolute',
                left: `${txt.x}%`,
                top: `${txt.y}%`,
                transform: 'translate(-50%, -50%)',
                fontSize: `${baseFontRem}rem`,
                fontWeight: 900,
                letterSpacing: txt.uppercase ? '0.07em' : '0.02em',
                textTransform: txt.uppercase ? 'uppercase' : 'none',
                whiteSpace: 'pre-wrap',
                textAlign: 'center',
                lineHeight: 1.2,
                maxWidth: '92%',
                cursor: interactive ? 'grab' : 'default',
                pointerEvents: interactive ? 'auto' : 'none',
                outline: isSelected ? '2px dashed #34D399' : 'none',
                outlineOffset: '4px',
                fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif",
                ...themeStyles
              }}
            >
              {txt.text}

              {/* Scale Handle when interactive */}
              {interactive && isSelected && (
                <div
                  onPointerDown={e => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDraggingState({
                      kind: 'scale-text',
                      id: txt.id,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      initialX: txt.x,
                      initialY: txt.y,
                      initialW: 0,
                      initialH: 0,
                      initialScale: txt.scale || 1
                    });
                  }}
                  title="Glisser pour agrandir ou réduire le texte"
                  style={{
                    position: 'absolute',
                    right: '-9px',
                    bottom: '-9px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#10B981',
                    border: '2px solid #000',
                    cursor: 'ew-resize',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    color: '#000',
                    fontWeight: 900
                  }}
                >
                  ↔
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};
