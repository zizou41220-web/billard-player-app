import React, { useEffect, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Type,
  Trash2,
  Eye,
  EyeOff,
  Move,
  Plus,
  RotateCcw,
  Maximize2
} from 'lucide-react';
import {
  LiveOverlayConfig,
  LiveOverlayImageItem,
  LiveOverlayTextItem,
  OverlayImageAspect,
  OverlayImageBg,
  OverlayImageFit,
  OverlayTextTheme,
  loadLiveOverlayConfig,
  saveLiveOverlayConfig,
  subscribeToLiveOverlayConfig,
  readOverlayImageFile
} from '../utils/liveOverlay';
import { LiveCustomOverlayLayer } from './LiveCustomOverlayLayer';

interface LiveOverlayEditorPanelProps {
  clubId: string;
  channelId?: string;
  player1Name?: string;
  player2Name?: string;
  score1?: number;
  score2?: number;
  overlayPos?: 'top' | 'bottom';
  onChangeOverlayPos?: (pos: 'top' | 'bottom') => void;
}

const QUICK_POSITIONS: { label: string; x: number; y: number }[] = [
  { label: '↖ Haut-Gauche', x: 12, y: 12 },
  { label: '⬆ Haut-Centre', x: 50, y: 8 },
  { label: '↗ Haut-Droite', x: 88, y: 12 },
  { label: '⬇ Sous Score', x: 50, y: 27 },
  { label: '⏺ Centre', x: 50, y: 50 },
  { label: '↙ Bas-Gauche', x: 12, y: 86 },
  { label: '⬇ Bas-Centre', x: 50, y: 88 },
  { label: '↘ Bas-Droite', x: 88, y: 86 }
];

export const LiveOverlayEditorPanel: React.FC<LiveOverlayEditorPanelProps> = ({
  clubId,
  channelId = 'live',
  player1Name = 'Joueur 1',
  player2Name = 'Joueur 2',
  score1 = 0,
  score2 = 0,
  overlayPos = 'top',
  onChangeOverlayPos
}) => {
  const [config, setConfig] = useState<LiveOverlayConfig>(() =>
    loadLiveOverlayConfig(clubId, channelId)
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [newTextValue, setNewTextValue] = useState<string>('');
  const [newTextTheme, setNewTextTheme] = useState<OverlayTextTheme>('gold');
  const [newImageUrlInput, setNewImageUrlInput] = useState<string>('');
  const [draggingScoreboard, setDraggingScoreboard] = useState<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setConfig(loadLiveOverlayConfig(clubId, channelId));
    return subscribeToLiveOverlayConfig(clubId, channelId, (updated) => {
      setConfig(updated);
    });
  }, [clubId, channelId]);

  const updateConfig = (next: LiveOverlayConfig) => {
    setConfig(next);
    saveLiveOverlayConfig(clubId, next, channelId, true);
  };

  // Add a new text item
  const handleAddText = (presetText?: string) => {
    const val = (presetText ?? newTextValue).trim();
    if (!val) return;
    const defaultY = overlayPos === 'top' ? 27 : 74;
    const offset = (config.texts.length % 4) * 6;
    const newItem: LiveOverlayTextItem = {
      id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: val,
      x: 50,
      y: Math.min(92, defaultY + offset),
      scale: 1.1,
      theme: newTextTheme,
      uppercase: false,
      visible: true
    };
    const next: LiveOverlayConfig = {
      ...config,
      texts: [...config.texts, newItem]
    };
    updateConfig(next);
    setSelectedItemId(newItem.id);
    if (!presetText) setNewTextValue('');
  };

  // Add a new image item
  const addImageFromUrl = (dataUrl: string, label: string = 'Image') => {
    if (!dataUrl) return;
    // Smart default corner placement so multiple images don't stack on the exact same pixel
    const corners = [
      { x: 11, y: 15 },
      { x: 89, y: 15 },
      { x: 11, y: 84 },
      { x: 89, y: 84 }
    ];
    const pos = corners[config.images.length % corners.length];
    const newItem: LiveOverlayImageItem = {
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      url: dataUrl,
      label,
      x: pos.x,
      y: pos.y,
      width: 14,
      height: 18,
      aspectRatio: 'free',
      fitMode: 'contain',
      bgStyle: 'transparent',
      borderRadius: 10,
      opacity: 1,
      visible: true
    };
    const next: LiveOverlayConfig = {
      ...config,
      images: [...config.images, newItem]
    };
    updateConfig(next);
    setSelectedItemId(newItem.id);
  };

  const selectedImage = config.images.find(i => i.id === selectedItemId) || null;
  const selectedText = config.texts.find(t => t.id === selectedItemId) || null;

  const updateSelectedImage = (patch: Partial<LiveOverlayImageItem>) => {
    if (!selectedImage) return;
    updateConfig({
      ...config,
      images: config.images.map(img =>
        img.id === selectedImage.id ? { ...img, ...patch } : img
      )
    });
  };

  const updateSelectedText = (patch: Partial<LiveOverlayTextItem>) => {
    if (!selectedText) return;
    updateConfig({
      ...config,
      texts: config.texts.map(txt =>
        txt.id === selectedText.id ? { ...txt, ...patch } : txt
      )
    });
  };

  const deleteItem = (id: string) => {
    updateConfig({
      ...config,
      images: config.images.filter(i => i.id !== id),
      texts: config.texts.filter(t => t.id !== id)
    });
    if (selectedItemId === id) setSelectedItemId(null);
  };

  const sbX = config.scoreboardCustomPos ? (config.scoreboardX ?? 50) : 50;
  const sbY = config.scoreboardCustomPos
    ? (config.scoreboardY ?? 13)
    : (overlayPos === 'bottom' ? 86 : 13);

  return (
    <div style={{
      background: 'rgba(4, 20, 18, 0.92)',
      border: '1px solid rgba(245, 158, 11, 0.38)',
      borderRadius: '16px',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.1rem',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.55)'
    }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontWeight: 900, fontSize: '1.05rem', color: '#FBBF24' }}>
            <Move size={19} /> Habillage Écran Live — Images, Logos & Informations
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Ajoutez des images (format libre, carré, affiche, rond...) et des textes (ex: « Finale du tournoi régional ») puis glissez-les où vous voulez sur l'écran.
          </div>
        </div>

        {(config.images.length > 0 || config.texts.length > 0 || config.scoreboardCustomPos) && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ width: 'auto', fontSize: '0.72rem', padding: '4px 10px', color: '#F87171', borderColor: 'rgba(248, 113, 113, 0.35)' }}
            onClick={() => {
              if (window.confirm('Réinitialiser tous les textes, images et positions personnalisées de l\'écran Live ?')) {
                updateConfig({
                  scoreboardCustomPos: false,
                  scoreboardX: 50,
                  scoreboardY: 12,
                  scoreboardScale: 1,
                  images: [],
                  texts: [],
                  updatedAt: Date.now()
                });
                setSelectedItemId(null);
              }
            }}
          >
            <RotateCcw size={13} /> Tout réinitialiser
          </button>
        )}
      </div>

      {/* 1. INTERACTIVE 16:9 SCREEN PREVIEW (DRAG & DROP) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#34D399', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Maximize2 size={14} /> Aperçu Écran TV 16:9 — Glissez-déposez les éléments directement à la souris
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Score :</span>
            <button
              type="button"
              className="btn btn-outline"
              style={{
                width: 'auto',
                fontSize: '0.7rem',
                padding: '2px 8px',
                background: !config.scoreboardCustomPos && overlayPos === 'top' ? 'rgba(245, 158, 11, 0.25)' : 'transparent',
                borderColor: !config.scoreboardCustomPos && overlayPos === 'top' ? '#F59E0B' : 'rgba(255,255,255,0.15)',
                color: '#fff'
              }}
              onClick={() => {
                onChangeOverlayPos?.('top');
                updateConfig({ ...config, scoreboardCustomPos: false, scoreboardX: 50, scoreboardY: 13 });
              }}
            >
              ⬆ Haut
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{
                width: 'auto',
                fontSize: '0.7rem',
                padding: '2px 8px',
                background: !config.scoreboardCustomPos && overlayPos === 'bottom' ? 'rgba(245, 158, 11, 0.25)' : 'transparent',
                borderColor: !config.scoreboardCustomPos && overlayPos === 'bottom' ? '#F59E0B' : 'rgba(255,255,255,0.15)',
                color: '#fff'
              }}
              onClick={() => {
                onChangeOverlayPos?.('bottom');
                updateConfig({ ...config, scoreboardCustomPos: false, scoreboardX: 50, scoreboardY: 86 });
              }}
            >
              ⬇ Bas
            </button>
          </div>
        </div>

        {/* 16:9 Canvas */}
        <div
          ref={previewRef}
          onPointerMove={(e) => {
            if (!draggingScoreboard || !previewRef.current) return;
            const rect = previewRef.current.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const dx = ((e.clientX - draggingScoreboard.startX) / rect.width) * 100;
            const dy = ((e.clientY - draggingScoreboard.startY) / rect.height) * 100;
            const nextX = Math.max(10, Math.min(90, Math.round((draggingScoreboard.initX + dx) * 10) / 10));
            const nextY = Math.max(8, Math.min(92, Math.round((draggingScoreboard.initY + dy) * 10) / 10));
            updateConfig({
              ...config,
              scoreboardCustomPos: true,
              scoreboardX: nextX,
              scoreboardY: nextY
            });
          }}
          onPointerUp={() => setDraggingScoreboard(null)}
          onPointerCancel={() => setDraggingScoreboard(null)}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: '14px',
            overflow: 'hidden',
            background:
              'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.26) 0%, rgba(4, 24, 20, 0.95) 70%, #020a09 100%)',
            border: '2px solid rgba(255, 255, 255, 0.16)',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.75)',
            userSelect: 'none'
          }}
        >
          {/* Subtle Pool Table Grid Guide */}
          <div style={{
            position: 'absolute',
            inset: '8%',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: '10px',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.16)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Zone Vidéo Billard (Glissez vos éléments ici)
            </span>
          </div>

          {/* Draggable Scoreboard Representation */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setDraggingScoreboard({
                startX: e.clientX,
                startY: e.clientY,
                initX: sbX,
                initY: sbY
              });
            }}
            title="Glisser pour déplacer le bandeau de score où vous voulez"
            style={{
              position: 'absolute',
              left: `${sbX}%`,
              top: `${sbY}%`,
              transform: `translate(-50%, -50%) scale(${config.scoreboardScale || 1})`,
              width: '58%',
              background: 'rgba(8, 14, 28, 0.92)',
              border: '1.5px solid rgba(245, 158, 11, 0.55)',
              borderRadius: '10px',
              padding: '5px 10px',
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              gap: '6px',
              cursor: 'grab',
              zIndex: 12,
              boxShadow: '0 6px 18px rgba(0,0,0,0.7)'
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player1Name}
            </div>
            <div style={{ background: '#F59E0B', color: '#000', fontWeight: 900, fontSize: '0.76rem', padding: '1px 8px', borderRadius: '6px' }}>
              {score1} - {score2}
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fff', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player2Name}
            </div>
          </div>

          {/* Interactive Custom Images & Texts Layer */}
          <LiveCustomOverlayLayer
            config={config}
            interactive={true}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onChangeConfig={updateConfig}
            previewScale={0.52}
          />
        </div>
      </div>

      {/* 2. ADD / MANAGE TEXT INFORMATION (ex: "Finale du tournoi régional") */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(52, 211, 153, 0.28)',
        borderRadius: '12px',
        padding: '0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.7rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
          <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#34D399', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Type size={16} /> Noter une information sur l'écran (Titre, Finale, Tournoi...)
          </span>
        </div>

        {/* Input + Style + Add Button */}
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Ex: Finale du tournoi régional"
            value={newTextValue}
            onChange={(e) => setNewTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddText();
              }
            }}
            style={{ flex: '1 1 210px', fontSize: '0.84rem', padding: '0.5rem 0.75rem' }}
          />
          <select
            className="input-field"
            value={newTextTheme}
            onChange={(e) => setNewTextTheme(e.target.value as OverlayTextTheme)}
            style={{ width: 'auto', fontSize: '0.8rem', padding: '0.45rem 0.65rem', background: '#041815', color: '#fff', fontWeight: 700 }}
          >
            <option value="gold">Style Or Prestige</option>
            <option value="emerald">Style Émeraude Club</option>
            <option value="live_red">Style Rouge Direct</option>
            <option value="dark_glass">Style Bandeau TV Sombre</option>
            <option value="light">Style Fond Blanc</option>
            <option value="minimal">Texte Seul (Sans fond)</option>
          </select>
          <button
            type="button"
            className="btn btn-neon"
            style={{ width: 'auto', padding: '0.5rem 0.9rem', fontSize: '0.8rem', fontWeight: 800 }}
            onClick={() => handleAddText()}
          >
            <Plus size={15} /> Afficher sur l'écran
          </button>
        </div>

        {/* Quick 1-click suggestions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Exemples rapides :</span>
          {[
            'Finale du tournoi régional',
            'Grande Finale',
            'Demi-Finale',
            'Match de Gala'
          ].map(preset => (
            <button
              key={preset}
              type="button"
              className="btn btn-outline"
              style={{ width: 'auto', fontSize: '0.68rem', padding: '2px 8px', borderRadius: '999px' }}
              onClick={() => handleAddText(preset)}
            >
              + {preset}
            </button>
          ))}
        </div>

        {/* List of active texts */}
        {config.texts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.2rem' }}>
            {config.texts.map((txt) => {
              const isSel = selectedItemId === txt.id;
              return (
                <div
                  key={txt.id}
                  onClick={() => setSelectedItemId(txt.id)}
                  style={{
                    background: isSel ? 'rgba(16, 185, 129, 0.14)' : 'rgba(0,0,0,0.28)',
                    border: `1px solid ${isSel ? '#34D399' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '10px',
                    padding: '0.55rem 0.7rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <input
                      type="text"
                      className="input-field"
                      value={txt.text}
                      onChange={(e) =>
                        updateConfig({
                          ...config,
                          texts: config.texts.map(t => (t.id === txt.id ? { ...t, text: e.target.value } : t))
                        })
                      }
                      style={{ flex: 1, fontSize: '0.82rem', padding: '0.35rem 0.6rem', fontWeight: 700 }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ width: 'auto', padding: '4px 7px', fontSize: '0.72rem' }}
                      title={txt.visible ? 'Masquer ce texte' : 'Afficher ce texte'}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateConfig({
                          ...config,
                          texts: config.texts.map(t => (t.id === txt.id ? { ...t, visible: !t.visible } : t))
                        });
                      }}
                    >
                      {txt.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ width: 'auto', padding: '4px 7px', fontSize: '0.72rem', color: '#F87171', borderColor: 'rgba(248,113,113,0.35)' }}
                      title="Supprimer ce texte"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteItem(txt.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Fine controls when selected */}
                  {isSel && selectedText && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', paddingTop: '0.35rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.45rem', alignItems: 'center' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>Style du bandeau</label>
                          <select
                            className="input-field"
                            value={selectedText.theme}
                            onChange={(e) => updateSelectedText({ theme: e.target.value as OverlayTextTheme })}
                            style={{ fontSize: '0.75rem', padding: '4px 6px', background: '#041815', color: '#fff' }}
                          >
                            <option value="gold">Or Prestige</option>
                            <option value="emerald">Émeraude Club</option>
                            <option value="live_red">Rouge Direct</option>
                            <option value="dark_glass">Bandeau Vitré</option>
                            <option value="light">Fond Blanc</option>
                            <option value="minimal">Texte Seul (Sans fond)</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            Taille ({Math.round((selectedText.scale || 1) * 100)}%)
                          </label>
                          <input
                            type="range"
                            min={0.5}
                            max={2.6}
                            step={0.05}
                            value={selectedText.scale || 1}
                            onChange={(e) => updateSelectedText({ scale: parseFloat(e.target.value) })}
                            style={{ width: '100%', accentColor: '#10B981' }}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '12px' }}>
                          <input
                            type="checkbox"
                            checked={selectedText.uppercase}
                            onChange={(e) => updateSelectedText({ uppercase: e.target.checked })}
                            id={`upper_${selectedText.id}`}
                          />
                          <label htmlFor={`upper_${selectedText.id}`} style={{ fontSize: '0.74rem', cursor: 'pointer' }}>
                            MAJUSCULES
                          </label>
                        </div>
                      </div>

                      {/* Quick placement buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Placer :</span>
                        {QUICK_POSITIONS.map(p => (
                          <button
                            key={p.label}
                            type="button"
                            className="btn btn-outline"
                            style={{ width: 'auto', fontSize: '0.66rem', padding: '2px 6px' }}
                            onClick={() => updateSelectedText({ x: p.x, y: p.y })}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. ADD / MANAGE IMAGES (LOGOS, SPONSORS, POSTERS, ANY FORMAT & POSITION) */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        borderRadius: '12px',
        padding: '0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.7rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
          <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FBBF24', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ImageIcon size={16} /> Ajouter des images sur l'écran (Logos, Sponsors, Affiches...)
          </span>
        </div>

        {/* Upload file or paste image URL */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              files.forEach((f) => {
                readOverlayImageFile(f, (dataUrl) => {
                  addImageFromUrl(dataUrl, f.name.replace(/\.[^.]+$/, ''));
                });
              });
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-neon"
            style={{ width: 'auto', fontSize: '0.8rem', padding: '0.5rem 0.95rem', fontWeight: 800 }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={15} /> Choisir une image / logo (PC ou Téléphone)
          </button>

          <div style={{ display: 'flex', flex: '1 1 220px', gap: '0.35rem' }}>
            <input
              type="url"
              className="input-field"
              placeholder="Ou coller l'URL d'une image (https://...)"
              value={newImageUrlInput}
              onChange={(e) => setNewImageUrlInput(e.target.value)}
              style={{ flex: 1, fontSize: '0.78rem', padding: '0.45rem 0.65rem' }}
            />
            {newImageUrlInput.trim() && (
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: 'auto', fontSize: '0.76rem', padding: '0.45rem 0.75rem' }}
                onClick={() => {
                  addImageFromUrl(newImageUrlInput.trim(), 'Image Web');
                  setNewImageUrlInput('');
                }}
              >
                Ajouter URL
              </button>
            )}
          </div>
        </div>

        {/* List of added images and format controls */}
        {config.images.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.2rem' }}>
            {config.images.map((img, idx) => {
              const isSel = selectedItemId === img.id;
              return (
                <div
                  key={img.id}
                  onClick={() => setSelectedItemId(img.id)}
                  style={{
                    background: isSel ? 'rgba(245, 158, 11, 0.12)' : 'rgba(0,0,0,0.28)',
                    border: `1px solid ${isSel ? '#F59E0B' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '10px',
                    padding: '0.6rem 0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                      <img
                        src={img.url}
                        alt={img.label}
                        style={{
                          width: '38px',
                          height: '38px',
                          objectFit: 'contain',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          padding: '2px',
                          flexShrink: 0
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {img.label || `Image #${idx + 1}`}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          Position : X {Math.round(img.x)}% • Y {Math.round(img.y)}% • Largeur {Math.round(img.width)}%
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ width: 'auto', padding: '4px 7px', fontSize: '0.72rem' }}
                        title={img.visible ? 'Masquer cette image' : 'Afficher cette image'}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateConfig({
                            ...config,
                            images: config.images.map(item =>
                              item.id === img.id ? { ...item, visible: !item.visible } : item
                            )
                          });
                        }}
                      >
                        {img.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ width: 'auto', padding: '4px 7px', fontSize: '0.72rem', color: '#F87171', borderColor: 'rgba(248,113,113,0.35)' }}
                        title="Supprimer cette image"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteItem(img.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Format, Size & Position Controls when selected */}
                  {isSel && selectedImage && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', paddingTop: '0.45rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.5rem' }}>
                        {/* Format / Shape */}
                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: '#FBBF24', fontWeight: 700, marginBottom: '2px' }}>
                            Format de l'image
                          </label>
                          <select
                            className="input-field"
                            value={selectedImage.aspectRatio}
                            onChange={(e) => updateSelectedImage({ aspectRatio: e.target.value as OverlayImageAspect })}
                            style={{ fontSize: '0.75rem', padding: '4px 6px', background: '#041815', color: '#fff' }}
                          >
                            <option value="free">Original (Proportions libres)</option>
                            <option value="1:1">Carré (1:1)</option>
                            <option value="16:9">Paysage Large (16:9)</option>
                            <option value="4:3">Paysage Standard (4:3)</option>
                            <option value="3:4">Affiche / Portrait (3:4)</option>
                            <option value="circle">Rond / Médaillon</option>
                            <option value="custom_box">Sur-mesure (Largeur × Hauteur)</option>
                          </select>
                        </div>

                        {/* Fit Mode */}
                        {selectedImage.aspectRatio !== 'free' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                              Ajustement dans le cadre
                            </label>
                            <select
                              className="input-field"
                              value={selectedImage.fitMode}
                              onChange={(e) => updateSelectedImage({ fitMode: e.target.value as OverlayImageFit })}
                              style={{ fontSize: '0.75rem', padding: '4px 6px', background: '#041815', color: '#fff' }}
                            >
                              <option value="cover">Remplir le format (Cover)</option>
                              <option value="contain">Voir en entier (Contain)</option>
                              <option value="fill">Étirer (Fill)</option>
                            </select>
                          </div>
                        )}

                        {/* Background / Frame style */}
                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                            Fond / Cadre
                          </label>
                          <select
                            className="input-field"
                            value={selectedImage.bgStyle}
                            onChange={(e) => updateSelectedImage({ bgStyle: e.target.value as OverlayImageBg })}
                            style={{ fontSize: '0.75rem', padding: '4px 6px', background: '#041815', color: '#fff' }}
                          >
                            <option value="transparent">Transparent (Aucun fond)</option>
                            <option value="white">Fond Blanc (Idéal Logo)</option>
                            <option value="dark">Verre Sombre</option>
                            <option value="gold">Cadre Or Prestige</option>
                            <option value="emerald">Cadre Émeraude</option>
                          </select>
                        </div>
                      </div>

                      {/* Sliders for Width, Height (if custom_box), Radius, Opacity */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.5rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            Largeur ({Math.round(selectedImage.width)}% de l'écran)
                          </label>
                          <input
                            type="range"
                            min={3}
                            max={85}
                            step={0.5}
                            value={selectedImage.width}
                            onChange={(e) => updateSelectedImage({ width: parseFloat(e.target.value) })}
                            style={{ width: '100%', accentColor: '#F59E0B' }}
                          />
                        </div>

                        {selectedImage.aspectRatio === 'custom_box' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              Hauteur ({Math.round(selectedImage.height || 18)}% de l'écran)
                            </label>
                            <input
                              type="range"
                              min={3}
                              max={85}
                              step={0.5}
                              value={selectedImage.height || 18}
                              onChange={(e) => updateSelectedImage({ height: parseFloat(e.target.value) })}
                              style={{ width: '100%', accentColor: '#F59E0B' }}
                            />
                          </div>
                        )}

                        {selectedImage.aspectRatio !== 'circle' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              Arrondi des coins ({selectedImage.borderRadius ?? 10}px)
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={40}
                              step={2}
                              value={selectedImage.borderRadius ?? 10}
                              onChange={(e) => updateSelectedImage({ borderRadius: parseInt(e.target.value, 10) })}
                              style={{ width: '100%', accentColor: '#F59E0B' }}
                            />
                          </div>
                        )}

                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            Opacité ({Math.round((selectedImage.opacity ?? 1) * 100)}%)
                          </label>
                          <input
                            type="range"
                            min={0.2}
                            max={1}
                            step={0.05}
                            value={selectedImage.opacity ?? 1}
                            onChange={(e) => updateSelectedImage({ opacity: parseFloat(e.target.value) })}
                            style={{ width: '100%', accentColor: '#F59E0B' }}
                          />
                        </div>
                      </div>

                      {/* Quick placement buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Placer :</span>
                        {QUICK_POSITIONS.map(p => (
                          <button
                            key={p.label}
                            type="button"
                            className="btn btn-outline"
                            style={{ width: 'auto', fontSize: '0.66rem', padding: '2px 6px' }}
                            onClick={() => updateSelectedImage({ x: p.x, y: p.y })}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
