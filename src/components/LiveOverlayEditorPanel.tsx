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
  Maximize2,
  Save,
  FolderOpen,
  Copy,
  Edit3,
  FilePlus2,
  Check
} from 'lucide-react';
import {
  LiveOverlayConfig,
  LiveOverlayImageItem,
  LiveOverlayProject,
  LiveOverlayTextItem,
  OVERLAY_COLOR_SWATCHES,
  OVERLAY_FONT_OPTIONS,
  OverlayFontFamily,
  OverlayImageAspect,
  OverlayImageBg,
  OverlayImageFit,
  OverlayTextTheme,
  getThemeDefaults,
  loadActiveOverlayProjectId,
  loadLiveOverlayConfig,
  loadOverlayProjects,
  readOverlayImageFile,
  resolveOverlayTextStyle,
  saveActiveOverlayProjectId,
  saveLiveOverlayConfig,
  saveOverlayProjects,
  subscribeToLiveOverlayConfig
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
  { label: 'Haut-Gauche', x: 12, y: 12 },
  { label: 'Haut-Centre', x: 50, y: 8 },
  { label: 'Haut-Droite', x: 88, y: 12 },
  { label: 'Centre', x: 50, y: 50 },
  { label: 'Bas-Gauche', x: 12, y: 82 },
  { label: 'Bas-Centre', x: 50, y: 88 },
  { label: 'Bas-Droite', x: 88, y: 82 }
];

const TEXT_THEME_OPTIONS: { value: OverlayTextTheme; label: string }[] = [
  { value: 'gold', label: 'Or Prestige' },
  { value: 'emerald', label: 'Émeraude Club' },
  { value: 'live_red', label: 'Rouge Direct' },
  { value: 'royal_blue', label: 'Bleu Broadcast TV' },
  { value: 'purple_neon', label: 'Violet Gala / Néon' },
  { value: 'dark_glass', label: 'Bandeau TV Sombre' },
  { value: 'light', label: 'Fond Blanc Chic' },
  { value: 'minimal', label: 'Texte Seul (Sans fond)' }
];

const cloneOverlayConfig = (cfg: LiveOverlayConfig): LiveOverlayConfig => ({
  scoreboardCustomPos: Boolean(cfg.scoreboardCustomPos),
  scoreboardX: cfg.scoreboardX ?? 50,
  scoreboardY: cfg.scoreboardY ?? 12,
  scoreboardScale: cfg.scoreboardScale ?? 1,
  images: (cfg.images || []).map(i => ({ ...i })),
  texts: (cfg.texts || []).map(t => ({ ...t })),
  updatedAt: Date.now()
});

const serializeConfigForDiff = (cfg: LiveOverlayConfig) =>
  JSON.stringify({
    scoreboardCustomPos: Boolean(cfg.scoreboardCustomPos),
    scoreboardX: cfg.scoreboardX ?? 50,
    scoreboardY: cfg.scoreboardY ?? 12,
    scoreboardScale: cfg.scoreboardScale ?? 1,
    images: cfg.images || [],
    texts: cfg.texts || []
  });

export const LiveOverlayEditorPanel: React.FC<LiveOverlayEditorPanelProps> = ({
  clubId,
  channelId = 'live',
  player1Name = 'Joueur 1',
  player2Name = 'Joueur 2',
  score1 = 0,
  score2 = 0,
  overlayPos = 'bottom',
  onChangeOverlayPos
}) => {
  const [config, setConfig] = useState<LiveOverlayConfig>(() =>
    loadLiveOverlayConfig(clubId, channelId)
  );
  const [projects, setProjects] = useState<LiveOverlayProject[]>(() =>
    loadOverlayProjects(clubId)
  );
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    loadActiveOverlayProjectId(clubId)
  );
  const [projectNameInput, setProjectNameInput] = useState<string>(() => {
    const list = loadOverlayProjects(clubId);
    const activeId = loadActiveOverlayProjectId(clubId);
    return list.find(p => p.id === activeId)?.name || '';
  });
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [newTextValue, setNewTextValue] = useState<string>('');
  const [newTextTheme, setNewTextTheme] = useState<OverlayTextTheme>('gold');
  const [newTextFont, setNewTextFont] = useState<OverlayFontFamily>('Outfit');
  const [newTextColor, setNewTextColor] = useState<string>('');
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
    const list = loadOverlayProjects(clubId);
    const activeId = loadActiveOverlayProjectId(clubId);
    setProjects(list);
    setActiveProjectId(activeId);
    setProjectNameInput(list.find(p => p.id === activeId)?.name || '');
    return subscribeToLiveOverlayConfig(clubId, channelId, (updated) => {
      setConfig(updated);
    });
  }, [clubId, channelId]);

  const updateConfig = (next: LiveOverlayConfig) => {
    setConfig(next);
    saveLiveOverlayConfig(clubId, next, channelId, true);
  };

  const triggerSaveFeedback = (msg: string) => {
    setSaveFeedback(msg);
    window.setTimeout(() => {
      setSaveFeedback(prev => (prev === msg ? null : prev));
    }, 2200);
  };

  const activeProject = projects.find(p => p.id === activeProjectId) || null;
  const hasUnsavedProjectChanges = Boolean(
    activeProject && serializeConfigForDiff(activeProject.config) !== serializeConfigForDiff(config)
  );

  // Save current overlay into active project (or create new one)
  const handleSaveProject = (forceAsNew: boolean = false) => {
    const trimmedName = projectNameInput.trim();
    const now = Date.now();

    if (!forceAsNew && activeProject) {
      const finalName = trimmedName || activeProject.name;
      const updatedList = projects
        .map(p =>
          p.id === activeProject.id
            ? { ...p, name: finalName, config: cloneOverlayConfig(config), updatedAt: now }
            : p
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);

      if (!saveOverlayProjects(clubId, updatedList)) {
        alert("Mémoire du navigateur pleine : essayez de réduire le nombre ou la taille des images enregistrées dans vos projets.");
        return;
      }
      setProjects(updatedList);
      setProjectNameInput(finalName);
      triggerSaveFeedback(`Projet « ${finalName} » mis à jour !`);
      return;
    }

    const defaultName = trimmedName || `Habillage #${projects.length + 1}`;
    const newProj: LiveOverlayProject = {
      id: `proj_${now}_${Math.random().toString(36).slice(2, 6)}`,
      name: defaultName,
      config: cloneOverlayConfig(config),
      createdAt: now,
      updatedAt: now
    };
    const nextList = [newProj, ...projects];
    if (!saveOverlayProjects(clubId, nextList)) {
      alert("Mémoire du navigateur pleine : supprimez un ancien projet contenant de grosses images avant d'en enregistrer un nouveau.");
      return;
    }
    setProjects(nextList);
    setActiveProjectId(newProj.id);
    saveActiveOverlayProjectId(clubId, newProj.id);
    setProjectNameInput(newProj.name);
    triggerSaveFeedback(`Projet « ${newProj.name} » enregistré !`);
  };

  const handleLoadProject = (proj: LiveOverlayProject) => {
    const loaded = cloneOverlayConfig(proj.config);
    updateConfig(loaded);
    setActiveProjectId(proj.id);
    saveActiveOverlayProjectId(clubId, proj.id);
    setProjectNameInput(proj.name);
    setSelectedItemId(null);
    triggerSaveFeedback(`Projet « ${proj.name} » chargé sur l'écran Live`);
  };

  const handleNewBlankProject = () => {
    updateConfig({
      scoreboardCustomPos: false,
      scoreboardX: 50,
      scoreboardY: overlayPos === 'top' ? 12 : 90,
      scoreboardScale: 1,
      images: [],
      texts: [],
      updatedAt: Date.now()
    });
    setActiveProjectId(null);
    saveActiveOverlayProjectId(clubId, null);
    setProjectNameInput('');
    setSelectedItemId(null);
  };

  const handleRenameProject = (proj: LiveOverlayProject) => {
    const nextName = window.prompt('Nouveau nom du projet :', proj.name);
    if (!nextName || !nextName.trim()) return;
    const trimmed = nextName.trim();
    const updatedList = projects.map(p =>
      p.id === proj.id ? { ...p, name: trimmed, updatedAt: Date.now() } : p
    );
    saveOverlayProjects(clubId, updatedList);
    setProjects(updatedList);
    if (activeProjectId === proj.id) {
      setProjectNameInput(trimmed);
    }
  };

  const handleDuplicateProject = (proj: LiveOverlayProject) => {
    const now = Date.now();
    const copy: LiveOverlayProject = {
      id: `proj_${now}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${proj.name} (copie)`,
      config: cloneOverlayConfig(proj.config),
      createdAt: now,
      updatedAt: now
    };
    const nextList = [copy, ...projects];
    if (!saveOverlayProjects(clubId, nextList)) {
      alert("Mémoire du navigateur pleine : impossible de dupliquer ce projet.");
      return;
    }
    setProjects(nextList);
    handleLoadProject(copy);
  };

  const handleDeleteProject = (proj: LiveOverlayProject) => {
    if (!window.confirm(`Supprimer définitivement le projet « ${proj.name} » ?`)) return;
    const nextList = projects.filter(p => p.id !== proj.id);
    saveOverlayProjects(clubId, nextList);
    setProjects(nextList);
    if (activeProjectId === proj.id) {
      setActiveProjectId(null);
      saveActiveOverlayProjectId(clubId, null);
      setProjectNameInput('');
    }
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
      scale: 1.15,
      theme: newTextTheme,
      fontFamily: newTextFont,
      ...(newTextColor ? { textColor: newTextColor } : {}),
      uppercase: false,
      textShadow: true,
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

  const duplicateTextItem = (txt: LiveOverlayTextItem) => {
    const copy: LiveOverlayTextItem = {
      ...txt,
      id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: Math.min(92, txt.x + 3),
      y: Math.min(92, txt.y + 6)
    };
    updateConfig({ ...config, texts: [...config.texts, copy] });
    setSelectedItemId(copy.id);
  };

  const duplicateImageItem = (img: LiveOverlayImageItem) => {
    const copy: LiveOverlayImageItem = {
      ...img,
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: `${img.label} (copie)`,
      x: Math.min(92, img.x + 5),
      y: Math.min(92, img.y + 5)
    };
    updateConfig({ ...config, images: [...config.images, copy] });
    setSelectedItemId(copy.id);
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
    ? (config.scoreboardY ?? 90)
    : (overlayPos === 'top' ? 12 : 90);

  return (
    <div style={{
      background: '#0B0F17',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '12px',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.1rem',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
    }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontWeight: 800, fontSize: '1.02rem', color: '#F8FAFC' }}>
            <Move size={18} color="#D4AF37" /> Habillage TV — Projets, Logos, Sponsors & Textes
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Personnalisez polices, couleurs, bandeaux et logos, puis enregistrez vos projets pour les recharger et les modifier à tout moment.
          </div>
        </div>

        {(config.images.length > 0 || config.texts.length > 0 || config.scoreboardCustomPos) && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ width: 'auto', fontSize: '0.72rem', padding: '4px 10px', color: '#F87171', borderColor: 'rgba(248, 113, 113, 0.35)' }}
            onClick={() => {
              if (window.confirm("Vider tous les textes et images de l'écran actuel ? (Vos projets enregistrés restent intacts.)")) {
                updateConfig({
                  scoreboardCustomPos: false,
                  scoreboardX: 50,
                  scoreboardY: overlayPos === 'top' ? 12 : 90,
                  scoreboardScale: 1,
                  images: [],
                  texts: [],
                  updatedAt: Date.now()
                });
                setSelectedItemId(null);
              }
            }}
          >
            <RotateCcw size={13} /> Vider l'écran
          </button>
        )}
      </div>

      {/* 0. MES PROJETS D'HABILLAGE TV (ENREGISTRER, CHARGER, MODIFIER) */}
      <div style={{
        background: 'rgba(212, 175, 55, 0.06)',
        border: '1px solid rgba(212, 175, 55, 0.32)',
        borderRadius: '12px',
        padding: '0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.7rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.45rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FDE68A', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <FolderOpen size={16} color="#D4AF37" /> Mes Projets d'Habillage TV ({projects.length})
            </span>
            {activeProject && (
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '999px',
                background: hasUnsavedProjectChanges ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                border: `1px solid ${hasUnsavedProjectChanges ? '#F59E0B' : '#10B981'}`,
                color: hasUnsavedProjectChanges ? '#FCD34D' : '#6EE7B7'
              }}>
                {hasUnsavedProjectChanges
                  ? `Projet « ${activeProject.name} » • Modifié`
                  : `Projet « ${activeProject.name} » • Enregistré`}
              </span>
            )}
            {saveFeedback && (
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#34D399', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Check size={13} /> {saveFeedback}
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={handleNewBlankProject}
            style={{ width: 'auto', fontSize: '0.72rem', padding: '4px 9px', borderColor: 'rgba(255,255,255,0.2)', color: '#E2E8F0' }}
            title="Repartir d'un écran vierge pour créer un nouveau projet"
          >
            <FilePlus2 size={13} /> Nouveau projet vierge
          </button>
        </div>

        {/* Save / Save As Bar */}
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Nom du projet (ex: Finale Régionale, Tournoi Vendredi, Open Sponsors...)"
            value={projectNameInput}
            onChange={(e) => setProjectNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveProject(false);
              }
            }}
            style={{ flex: '1 1 240px', fontSize: '0.82rem', padding: '0.48rem 0.75rem' }}
          />
          <button
            type="button"
            className="btn btn-neon"
            onClick={() => handleSaveProject(false)}
            style={{ width: 'auto', padding: '0.48rem 0.95rem', fontSize: '0.78rem', fontWeight: 900, color: '#000' }}
          >
            <Save size={14} /> {activeProject ? 'Enregistrer les modifications' : 'Enregistrer le projet'}
          </button>
          {activeProject && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleSaveProject(true)}
              style={{ width: 'auto', padding: '0.48rem 0.85rem', fontSize: '0.76rem', fontWeight: 700, borderColor: 'rgba(212,175,55,0.5)', color: '#FDE68A' }}
              title="Enregistrer une nouvelle copie sous le nom saisi sans écraser le projet actuel"
            >
              <Plus size={14} /> Enregistrer comme nouveau
            </button>
          )}
        </div>

        {/* Saved Projects Clickable Grid */}
        {projects.length === 0 ? (
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Aucun projet enregistré pour l'instant. Composez votre habillage ci-dessous (textes, polices, couleurs, logos) puis donnez-lui un nom et cliquez sur « Enregistrer le projet ».
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '0.55rem'
          }}>
            {projects.map((proj) => {
              const isAct = proj.id === activeProjectId;
              const txtCount = proj.config.texts?.length || 0;
              const imgCount = proj.config.images?.length || 0;
              const dateStr = proj.updatedAt
                ? new Date(proj.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '';
              return (
                <div
                  key={proj.id}
                  onClick={() => handleLoadProject(proj)}
                  title="Cliquer pour charger et modifier ce projet"
                  style={{
                    background: isAct ? 'rgba(16, 185, 129, 0.14)' : 'rgba(5, 9, 18, 0.72)',
                    border: `1.5px solid ${isAct ? '#10B981' : 'rgba(255, 255, 255, 0.12)'}`,
                    borderRadius: '10px',
                    padding: '0.6rem 0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease, background 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                    <span style={{
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      color: isAct ? '#6EE7B7' : '#F8FAFC',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {proj.name}
                    </span>
                    {isAct && (
                      <span style={{ fontSize: '0.62rem', fontWeight: 900, background: '#10B981', color: '#000', padding: '1px 6px', borderRadius: '999px', flexShrink: 0 }}>
                        ACTIF
                      </span>
                    )}
                  </div>

                  {/* Mini preview strip of logos + first text */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minHeight: '22px' }}>
                    {(proj.config.images || []).slice(0, 3).map(im => (
                      <img
                        key={im.id}
                        src={im.url}
                        alt=""
                        style={{
                          width: '22px',
                          height: '22px',
                          objectFit: 'contain',
                          borderRadius: '4px',
                          background: 'rgba(255,255,255,0.08)',
                          padding: '1px'
                        }}
                      />
                    ))}
                    <span style={{ fontSize: '0.68rem', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {txtCount} texte{txtCount > 1 ? 's' : ''} • {imgCount} image{imgCount > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem', paddingTop: '0.2rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.45)' }}>{dateStr}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ width: 'auto', padding: '2px 5px', fontSize: '0.66rem' }}
                        title="Renommer ce projet"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameProject(proj);
                        }}
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ width: 'auto', padding: '2px 5px', fontSize: '0.66rem' }}
                        title="Dupliquer ce projet"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateProject(proj);
                        }}
                      >
                        <Copy size={11} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ width: 'auto', padding: '2px 5px', fontSize: '0.66rem', color: '#F87171', borderColor: 'rgba(248,113,113,0.35)' }}
                        title="Supprimer ce projet"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(proj);
                        }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 1. INTERACTIVE 16:9 SCREEN PREVIEW (DRAG & DROP) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#34D399', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Maximize2 size={14} /> Aperçu Écran TV 16:9 — Cliquez un élément pour le styliser ou glissez-le à la souris
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

      {/* 2. ADD / MANAGE TEXT INFORMATION */}
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

        {/* Input + Font + Theme + Color + Add Button */}
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
            style={{ flex: '1 1 200px', fontSize: '0.84rem', padding: '0.5rem 0.75rem' }}
          />
          <select
            className="input-field"
            value={newTextFont}
            onChange={(e) => setNewTextFont(e.target.value as OverlayFontFamily)}
            title="Police d'écriture"
            style={{
              width: 'auto',
              fontSize: '0.78rem',
              padding: '0.45rem 0.6rem',
              background: '#041815',
              color: '#fff',
              fontWeight: 700,
              fontFamily: OVERLAY_FONT_OPTIONS.find(f => f.id === newTextFont)?.css
            }}
          >
            {OVERLAY_FONT_OPTIONS.map(f => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className="input-field"
            value={newTextTheme}
            onChange={(e) => {
              const t = e.target.value as OverlayTextTheme;
              setNewTextTheme(t);
              setNewTextColor('');
            }}
            title="Style du bandeau"
            style={{ width: 'auto', fontSize: '0.78rem', padding: '0.45rem 0.6rem', background: '#041815', color: '#fff', fontWeight: 700 }}
          >
            {TEXT_THEME_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label
            title="Couleur du texte"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#041815',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '8px',
              padding: '3px 7px',
              fontSize: '0.72rem',
              color: '#CBD5E1',
              cursor: 'pointer'
            }}
          >
            <span>Couleur</span>
            <input
              type="color"
              value={newTextColor || getThemeDefaults(newTextTheme).textColor}
              onChange={(e) => setNewTextColor(e.target.value)}
              style={{ width: '22px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
            />
          </label>
          <button
            type="button"
            className="btn btn-neon"
            style={{ width: 'auto', padding: '0.5rem 0.9rem', fontSize: '0.8rem', fontWeight: 800, color: '#000' }}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.2rem' }}>
            {config.texts.map((txt) => {
              const isSel = selectedItemId === txt.id;
              const resolved = resolveOverlayTextStyle(txt);
              const themeDef = getThemeDefaults(txt.theme);
              const curTextColor = txt.textColor || themeDef.textColor;
              const curBgColor = txt.bgColor || themeDef.bgColor;
              const curBgOpacity = txt.bgOpacity !== undefined ? txt.bgOpacity : themeDef.bgOpacity;
              const curBorderColor = txt.borderColor || themeDef.borderColor;
              const curBorderWidth = txt.borderWidth !== undefined ? txt.borderWidth : themeDef.borderWidth;
              const curBorderRadius = txt.borderRadius !== undefined ? txt.borderRadius : themeDef.borderRadius;
              const curLetterSpacing = txt.letterSpacing !== undefined ? txt.letterSpacing : (txt.uppercase ? 2 : 0.5);

              return (
                <div
                  key={txt.id}
                  onClick={() => setSelectedItemId(txt.id)}
                  style={{
                    background: isSel ? 'rgba(16, 185, 129, 0.14)' : 'rgba(0,0,0,0.28)',
                    border: `1px solid ${isSel ? '#34D399' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '10px',
                    padding: '0.6rem 0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
                      style={{
                        flex: 1,
                        fontSize: '0.84rem',
                        padding: '0.35rem 0.6rem',
                        fontWeight: 700,
                        fontFamily: resolved.fontCss
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ width: 'auto', padding: '4px 7px', fontSize: '0.72rem' }}
                      title="Dupliquer ce texte"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateTextItem(txt);
                      }}
                    >
                      <Copy size={13} />
                    </button>
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

                  {/* Full Typography & Style Controls when selected */}
                  {isSel && selectedText && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingTop: '0.45rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      {/* Row 1: Font + Theme + Format toggles (B / I / U / AA / Ombre) */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', alignItems: 'end' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: '#34D399', fontWeight: 700, marginBottom: '2px' }}>
                            Police d'écriture
                          </label>
                          <select
                            className="input-field"
                            value={selectedText.fontFamily || 'Outfit'}
                            onChange={(e) => updateSelectedText({ fontFamily: e.target.value as OverlayFontFamily })}
                            style={{
                              fontSize: '0.76rem',
                              padding: '5px 7px',
                              background: '#041815',
                              color: '#fff',
                              fontFamily: resolved.fontCss
                            }}
                          >
                            {OVERLAY_FONT_OPTIONS.map(f => (
                              <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                            Thème prédéfini
                          </label>
                          <select
                            className="input-field"
                            value={selectedText.theme}
                            onChange={(e) => {
                              const nextTheme = e.target.value as OverlayTextTheme;
                              updateSelectedText({
                                theme: nextTheme,
                                textColor: undefined,
                                bgColor: undefined,
                                bgOpacity: undefined,
                                borderColor: undefined,
                                borderWidth: undefined
                              });
                            }}
                            style={{ fontSize: '0.75rem', padding: '5px 7px', background: '#041815', color: '#fff' }}
                          >
                            {TEXT_THEME_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                            Style du texte
                          </label>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {[
                              {
                                key: 'bold',
                                label: 'B',
                                title: 'Gras / Extra-gras',
                                active: (selectedText.fontWeight ?? 800) >= 700,
                                style: { fontWeight: 900 },
                                onClick: () => updateSelectedText({ fontWeight: (selectedText.fontWeight ?? 800) >= 700 ? 400 : 900 })
                              },
                              {
                                key: 'italic',
                                label: 'I',
                                title: 'Italique',
                                active: Boolean(selectedText.italic),
                                style: { fontStyle: 'italic', fontWeight: 700 },
                                onClick: () => updateSelectedText({ italic: !selectedText.italic })
                              },
                              {
                                key: 'underline',
                                label: 'U',
                                title: 'Souligné',
                                active: Boolean(selectedText.underline),
                                style: { textDecoration: 'underline', fontWeight: 700 },
                                onClick: () => updateSelectedText({ underline: !selectedText.underline })
                              },
                              {
                                key: 'upper',
                                label: 'AA',
                                title: 'Majuscules',
                                active: Boolean(selectedText.uppercase),
                                style: { fontWeight: 800 },
                                onClick: () => updateSelectedText({ uppercase: !selectedText.uppercase })
                              },
                              {
                                key: 'shadow',
                                label: 'Ombre',
                                title: 'Ombre portée pour lisibilité sur vidéo',
                                active: selectedText.textShadow !== false,
                                style: { fontWeight: 700 },
                                onClick: () => updateSelectedText({ textShadow: selectedText.textShadow === false })
                              }
                            ].map(btn => (
                              <button
                                key={btn.key}
                                type="button"
                                title={btn.title}
                                onClick={btn.onClick}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  cursor: 'pointer',
                                  border: `1px solid ${btn.active ? '#34D399' : 'rgba(255,255,255,0.16)'}`,
                                  background: btn.active ? 'rgba(16, 185, 129, 0.24)' : 'rgba(255,255,255,0.04)',
                                  color: btn.active ? '#6EE7B7' : '#CBD5E1',
                                  ...btn.style
                                }}
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Text Color Swatches + Custom Color Picker */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                            Couleur du texte :
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                            {OVERLAY_COLOR_SWATCHES.map(sw => (
                              <button
                                key={sw.hex}
                                type="button"
                                title={sw.label}
                                onClick={() => updateSelectedText({ textColor: sw.hex })}
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  background: sw.hex,
                                  border: curTextColor.toLowerCase() === sw.hex.toLowerCase()
                                    ? '2.5px solid #34D399'
                                    : '1.5px solid rgba(255,255,255,0.35)',
                                  cursor: 'pointer',
                                  padding: 0
                                }}
                              />
                            ))}
                            <input
                              type="color"
                              value={curTextColor}
                              onChange={(e) => updateSelectedText({ textColor: e.target.value })}
                              title="Choisir n'importe quelle couleur"
                              style={{ width: '24px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Row 3: Background Color + Opacity + Border Color + Border Width */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.55rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Fond :</label>
                          <input
                            type="color"
                            value={curBgColor}
                            onChange={(e) => updateSelectedText({ bgColor: e.target.value, bgOpacity: curBgOpacity === 0 ? 0.88 : curBgOpacity })}
                            style={{ width: '26px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                          />
                          <div style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                              Opacité fond ({Math.round(curBgOpacity * 100)}%)
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={curBgOpacity}
                              onChange={(e) => updateSelectedText({ bgOpacity: parseFloat(e.target.value) })}
                              style={{ width: '100%', accentColor: '#10B981' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Bordure :</label>
                          <input
                            type="color"
                            value={curBorderColor}
                            onChange={(e) => updateSelectedText({ borderColor: e.target.value, borderWidth: curBorderWidth === 0 ? 2 : curBorderWidth })}
                            style={{ width: '26px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                          />
                          <div style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                              Épaisseur ({curBorderWidth}px)
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={5}
                              step={0.5}
                              value={curBorderWidth}
                              onChange={(e) => updateSelectedText({ borderWidth: parseFloat(e.target.value) })}
                              style={{ width: '100%', accentColor: '#F59E0B' }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Row 4: Size + Letter spacing + Corner radius */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: '0.5rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            Taille ({Math.round((selectedText.scale || 1) * 100)}%)
                          </label>
                          <input
                            type="range"
                            min={0.5}
                            max={2.8}
                            step={0.05}
                            value={selectedText.scale || 1}
                            onChange={(e) => updateSelectedText({ scale: parseFloat(e.target.value) })}
                            style={{ width: '100%', accentColor: '#10B981' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            Espacement lettres ({curLetterSpacing}px)
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={8}
                            step={0.5}
                            value={curLetterSpacing}
                            onChange={(e) => updateSelectedText({ letterSpacing: parseFloat(e.target.value) })}
                            style={{ width: '100%', accentColor: '#38BDF8' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            Arrondi bandeau ({curBorderRadius}px)
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={30}
                            step={2}
                            value={curBorderRadius}
                            onChange={(e) => updateSelectedText({ borderRadius: parseInt(e.target.value, 10) })}
                            style={{ width: '100%', accentColor: '#D4AF37' }}
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

      {/* 3. ADD / MANAGE IMAGES (LOGOS, SPONSORS, POSTERS) */}
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
            style={{ width: 'auto', fontSize: '0.8rem', padding: '0.5rem 0.95rem', fontWeight: 800, color: '#000' }}
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
                        title="Dupliquer cette image"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateImageItem(img);
                        }}
                      >
                        <Copy size={13} />
                      </button>
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

                  {isSel && selectedImage && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', paddingTop: '0.45rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.5rem' }}>
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
