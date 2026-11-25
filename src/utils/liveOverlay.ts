import { supabase } from '../supabase';
import { Match, Player, Table, Tournament } from '../types';

export type OverlayImageAspect = 'free' | '1:1' | '16:9' | '4:3' | '3:4' | 'circle' | 'custom_box';
export type OverlayImageFit = 'contain' | 'cover' | 'fill';
export type OverlayImageBg = 'transparent' | 'white' | 'dark' | 'gold' | 'emerald';

export interface LiveOverlayImageItem {
  id: string;
  url: string;
  label: string;
  x: number; // 0..100 (% from left, center-anchored)
  y: number; // 0..100 (% from top, center-anchored)
  width: number; // 2..90 (% of screen width)
  height: number; // 2..90 (% of screen height, used when aspectRatio === 'custom_box')
  aspectRatio: OverlayImageAspect;
  fitMode: OverlayImageFit;
  bgStyle: OverlayImageBg;
  borderRadius: number; // px
  opacity: number; // 0.1..1
  visible: boolean;
}

export type OverlayTextTheme =
  | 'gold'
  | 'emerald'
  | 'live_red'
  | 'royal_blue'
  | 'purple_neon'
  | 'dark_glass'
  | 'light'
  | 'minimal';

export type OverlayFontFamily =
  | 'Outfit'
  | 'Bebas Neue'
  | 'Oswald'
  | 'Montserrat'
  | 'Russo One'
  | 'Anton'
  | 'Orbitron'
  | 'Playfair Display'
  | 'Cinzel'
  | 'Pacifico';

export const OVERLAY_FONT_OPTIONS: { id: OverlayFontFamily; label: string; css: string }[] = [
  { id: 'Outfit', label: 'Outfit — Moderne TV', css: "'Outfit', sans-serif" },
  { id: 'Bebas Neue', label: 'Bebas Neue — Sport Impact', css: "'Bebas Neue', sans-serif" },
  { id: 'Oswald', label: 'Oswald — Broadcast Pro', css: "'Oswald', sans-serif" },
  { id: 'Montserrat', label: 'Montserrat — Géométrique', css: "'Montserrat', sans-serif" },
  { id: 'Russo One', label: 'Russo One — Billard / Esport', css: "'Russo One', sans-serif" },
  { id: 'Anton', label: 'Anton — Affiche Ultra-Gras', css: "'Anton', sans-serif" },
  { id: 'Orbitron', label: 'Orbitron — Futuriste Néon', css: "'Orbitron', sans-serif" },
  { id: 'Playfair Display', label: 'Playfair — Prestige Gala', css: "'Playfair Display', serif" },
  { id: 'Cinzel', label: 'Cinzel — Tournoi Royal', css: "'Cinzel', serif" },
  { id: 'Pacifico', label: 'Pacifico — Script Manuscrit', css: "'Pacifico', cursive" }
];

export const OVERLAY_COLOR_SWATCHES: { label: string; hex: string }[] = [
  { label: 'Blanc', hex: '#FFFFFF' },
  { label: 'Or', hex: '#F59E0B' },
  { label: 'Jaune', hex: '#FACC15' },
  { label: 'Émeraude', hex: '#34D399' },
  { label: 'Cyan', hex: '#38BDF8' },
  { label: 'Bleu', hex: '#3B82F6' },
  { label: 'Rouge', hex: '#EF4444' },
  { label: 'Rose', hex: '#F472B6' },
  { label: 'Violet', hex: '#A855F7' },
  { label: 'Noir', hex: '#090D16' }
];

export interface LiveOverlayTextItem {
  id: string;
  text: string;
  x: number; // 0..100 (% from left, center-anchored)
  y: number; // 0..100 (% from top, center-anchored)
  scale: number; // 0.6..2.8 (font scale multiplier)
  theme: OverlayTextTheme;
  uppercase: boolean;
  visible: boolean;
  fontFamily?: OverlayFontFamily;
  fontWeight?: number; // 400 | 700 | 900
  italic?: boolean;
  underline?: boolean;
  textColor?: string; // custom hex override
  bgColor?: string; // custom background hex override
  bgOpacity?: number; // 0..1
  borderColor?: string; // custom border hex override
  borderWidth?: number; // 0..5 px
  borderRadius?: number; // 0..32 px
  letterSpacing?: number; // 0..8 px
  textShadow?: boolean;
}

export interface LiveOverlayProject {
  id: string;
  name: string;
  config: LiveOverlayConfig;
  createdAt: number;
  updatedAt: number;
}

export interface LiveTickerConfig {
  enabled: boolean;
  customMessage: string;
  includeTournamentResults: boolean;
  speed: 1 | 2 | 3; // 1 = lent, 2 = normal, 3 = rapide
  bgColor?: string;
  textColor?: string;
}

export interface SponsorCarouselLogo {
  id: string;
  url: string;
  label: string;
}

export interface SponsorCarouselConfig {
  enabled: boolean;
  position: 'top_right' | 'top_left' | 'bottom_right' | 'bottom_left';
  x?: number; // 0..100 (% from left, center-anchored — freely draggable)
  y?: number; // 0..100 (% from top, center-anchored — freely draggable)
  intervalSec: number; // 5..30
  widthPct: number; // 6..36
  showLabel: boolean;
  logos: SponsorCarouselLogo[];
}

export const resolveSponsorCarouselCoords = (
  car: SponsorCarouselConfig,
  tickerEnabled: boolean = false
): { x: number; y: number } => {
  if (typeof car.x === 'number' && typeof car.y === 'number') {
    return { x: car.x, y: car.y };
  }
  const bottomY = tickerEnabled ? 82 : 88;
  switch (car.position) {
    case 'top_left':
      return { x: 10, y: 15 };
    case 'bottom_left':
      return { x: 10, y: bottomY };
    case 'bottom_right':
      return { x: 90, y: bottomY };
    case 'top_right':
    default:
      return { x: 90, y: 15 };
  }
};

export interface LiveOverlayConfig {
  scoreboardCustomPos?: boolean;
  scoreboardX?: number; // 0..100 (% from left)
  scoreboardY?: number; // 0..100 (% from top)
  scoreboardScale?: number; // 0.6..1.5
  images: LiveOverlayImageItem[];
  texts: LiveOverlayTextItem[];
  ticker?: LiveTickerConfig;
  sponsorCarousel?: SponsorCarouselConfig;
  updatedAt: number;
}

export const DEFAULT_TICKER_CONFIG: LiveTickerConfig = {
  enabled: false,
  customMessage: '',
  includeTournamentResults: true,
  speed: 2,
  bgColor: '#0A0E16',
  textColor: '#F8FAFC'
};

export function buildLiveTickerText(params: {
  ticker?: LiveTickerConfig | null;
  matches: Record<string, Match>;
  players: Record<string, Player>;
  tables: Record<string, Table>;
  tournaments: Record<string, Tournament>;
  clubName: string;
}): string {
  const { ticker, matches, players, tables, tournaments, clubName } = params;
  const segments: string[] = [];
  if (ticker?.customMessage?.trim()) {
    segments.push(ticker.customMessage.trim());
  }

  if (ticker?.includeTournamentResults) {
    const ongoingTour = Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;
    const tourMatches = ongoingTour
      ? Object.values(matches).filter(m => m.tournamentId === ongoingTour.id)
      : Object.values(matches);

    const playing = tourMatches
      .filter(m => m.status === 'playing' && m.player1Id && m.player2Id && players[m.player1Id] && players[m.player2Id])
      .slice(0, 6);
    playing.forEach(m => {
      const tbl = m.tableId ? tables[m.tableId] : undefined;
      const tblStr = tbl ? `${tbl.name || `Billard ${tbl.number}`} : ` : '';
      segments.push(`EN COURS — ${tblStr}${players[m.player1Id].name} ${m.score1} - ${m.score2} ${players[m.player2Id].name}`);
    });

    const finished = tourMatches
      .filter(m => m.status === 'finished' && m.player1Id && m.player2Id && players[m.player1Id] && players[m.player2Id])
      .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
      .slice(0, 4);
    finished.forEach(m => {
      segments.push(`RÉSULTAT — ${players[m.player1Id].name} ${m.score1} - ${m.score2} ${players[m.player2Id].name}`);
    });

    const upcoming = tourMatches
      .filter(m => m.status === 'pending' && !m.tableId && m.player1Id && m.player2Id && players[m.player1Id] && players[m.player2Id])
      .slice(0, 2);
    upcoming.forEach(m => {
      segments.push(`PROCHAIN MATCH — ${players[m.player1Id].name} vs ${players[m.player2Id].name}`);
    });
  }

  if (segments.length === 0) {
    segments.push(`${clubName} • Direct Live Multi-Caméras`);
  }

  return segments.join('    ◆    ');
}

export const DEFAULT_SPONSOR_CAROUSEL_CONFIG: SponsorCarouselConfig = {
  enabled: false,
  position: 'top_right',
  x: 90,
  y: 15,
  intervalSec: 10,
  widthPct: 13,
  showLabel: true,
  logos: []
};

export const DEFAULT_LIVE_OVERLAY_CONFIG: LiveOverlayConfig = {
  scoreboardCustomPos: false,
  scoreboardX: 50,
  scoreboardY: 12,
  scoreboardScale: 1,
  images: [],
  texts: [],
  ticker: DEFAULT_TICKER_CONFIG,
  sponsorCarousel: DEFAULT_SPONSOR_CAROUSEL_CONFIG,
  updatedAt: 0
};

const getStorageKey = (clubId: string, channelId: string = 'live') =>
  `mb_live_overlay_cfg_${clubId || 'default'}_${channelId || 'live'}`;

let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('mb_live_overlay_sync');
  }
} catch {}

let supabaseOverlayChannel: ReturnType<typeof supabase.channel> | null = null;
let currentSubscribedKey = '';

export const loadLiveOverlayConfig = (clubId: string, channelId: string = 'live'): LiveOverlayConfig => {
  if (typeof window === 'undefined') return DEFAULT_LIVE_OVERLAY_CONFIG;
  try {
    const raw = localStorage.getItem(getStorageKey(clubId, channelId));
    if (!raw) return DEFAULT_LIVE_OVERLAY_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_LIVE_OVERLAY_CONFIG,
      ...parsed,
      images: Array.isArray(parsed.images) ? parsed.images : [],
      texts: Array.isArray(parsed.texts) ? parsed.texts : [],
      ticker: { ...DEFAULT_TICKER_CONFIG, ...(parsed.ticker || {}) },
      sponsorCarousel: {
        ...DEFAULT_SPONSOR_CAROUSEL_CONFIG,
        ...(parsed.sponsorCarousel || {}),
        logos: Array.isArray(parsed.sponsorCarousel?.logos) ? parsed.sponsorCarousel.logos : []
      }
    };
  } catch {
    return DEFAULT_LIVE_OVERLAY_CONFIG;
  }
};

export const saveLiveOverlayConfig = (
  clubId: string,
  config: LiveOverlayConfig,
  channelId: string = 'live',
  broadcast: boolean = true
): LiveOverlayConfig => {
  const stamped: LiveOverlayConfig = {
    ...config,
    updatedAt: Date.now()
  };
  if (typeof window !== 'undefined') {
    const key = getStorageKey(clubId, channelId);
    try {
      localStorage.setItem(key, JSON.stringify(stamped));
    } catch (e) {
      console.warn('Quota localStorage atteint pour les images Live:', e);
    }

    if (broadcast) {
      try {
        broadcastChannel?.postMessage({ clubId, channelId, config: stamped });
      } catch {}

      try {
        window.dispatchEvent(
          new CustomEvent('mb-live-overlay-updated', {
            detail: { clubId, channelId, config: stamped }
          })
        );
      } catch {}

      try {
        if (supabaseOverlayChannel) {
          supabaseOverlayChannel.send({
            type: 'broadcast',
            event: 'overlay_config',
            payload: { clubId, channelId, config: stamped }
          });
        }
      } catch {}
    }
  }
  return stamped;
};

export const subscribeToLiveOverlayConfig = (
  clubId: string,
  channelId: string = 'live',
  onUpdate: (cfg: LiveOverlayConfig) => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const storageKey = getStorageKey(clubId, channelId);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === storageKey && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        onUpdate({
          ...DEFAULT_LIVE_OVERLAY_CONFIG,
          ...parsed,
          images: Array.isArray(parsed.images) ? parsed.images : [],
          texts: Array.isArray(parsed.texts) ? parsed.texts : []
        });
      } catch {}
    }
  };

  const handleCustomEvent = (e: Event) => {
    const detail = (e as CustomEvent)?.detail;
    if (detail && detail.clubId === clubId && (detail.channelId || 'live') === channelId && detail.config) {
      onUpdate(detail.config);
    }
  };

  const handleBroadcastMessage = (e: MessageEvent) => {
    const data = e.data;
    if (data && data.clubId === clubId && (data.channelId || 'live') === channelId && data.config) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data.config));
      } catch {}
      onUpdate(data.config);
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener('mb-live-overlay-updated', handleCustomEvent);
  broadcastChannel?.addEventListener('message', handleBroadcastMessage);

  // Supabase Realtime Broadcast for cross-device sync (PC -> Smartphone / TV)
  const subKey = `live_overlay_${clubId}_${channelId}`;
  if (currentSubscribedKey !== subKey) {
    if (supabaseOverlayChannel) {
      try {
        supabase.removeChannel(supabaseOverlayChannel);
      } catch {}
    }
    currentSubscribedKey = subKey;
    supabaseOverlayChannel = supabase
      .channel(`public:${subKey}`)
      .on('broadcast', { event: 'overlay_config' }, (payload) => {
        const data = payload?.payload;
        if (data && data.clubId === clubId && (data.channelId || 'live') === channelId && data.config) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(data.config));
          } catch {}
          onUpdate(data.config);
        }
      })
      .on('broadcast', { event: 'request_overlay_config' }, (payload) => {
        const req = payload?.payload;
        if (req && req.clubId === clubId) {
          const current = loadLiveOverlayConfig(clubId, req.channelId || 'live');
          if (current.images.length > 0 || current.texts.length > 0 || current.scoreboardCustomPos) {
            supabaseOverlayChannel?.send({
              type: 'broadcast',
              event: 'overlay_config',
              payload: { clubId, channelId: req.channelId || 'live', config: current }
            });
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          try {
            supabaseOverlayChannel?.send({
              type: 'broadcast',
              event: 'request_overlay_config',
              payload: { clubId, channelId }
            });
          } catch {}
        }
      });
  } else if (supabaseOverlayChannel) {
    try {
      supabaseOverlayChannel.send({
        type: 'broadcast',
        event: 'request_overlay_config',
        payload: { clubId, channelId }
      });
    } catch {}
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('mb-live-overlay-updated', handleCustomEvent);
    broadcastChannel?.removeEventListener('message', handleBroadcastMessage);
  };
};

export const readOverlayImageFile = (file: File, onLoaded: (dataUrl: string) => void) => {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const src = ev.target?.result as string;
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      const maxDim = 640;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        onLoaded(canvas.toDataURL('image/png', 0.9));
      } else {
        onLoaded(src);
      }
    };
    img.onerror = () => onLoaded(src);
    img.src = src;
  };
  reader.readAsDataURL(file);
};

export interface ResolvedOverlayTextStyle {
  fontFamily: OverlayFontFamily;
  fontCss: string;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  color: string;
  bgFill: string; // rgba(...) or 'transparent'
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  letterSpacingPx: number;
  textShadow: boolean;
  hasBackground: boolean;
}

const hexToRgba = (hex: string, alpha: number): string => {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(10, 15, 25, ${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
};

export const getThemeDefaults = (theme: OverlayTextTheme) => {
  switch (theme) {
    case 'gold':
      return { textColor: '#FEF3C7', bgColor: '#121008', bgOpacity: 0.93, borderColor: '#F59E0B', borderWidth: 2, borderRadius: 12 };
    case 'emerald':
      return { textColor: '#ECFDF5', bgColor: '#05251F', bgOpacity: 0.93, borderColor: '#10B981', borderWidth: 2, borderRadius: 12 };
    case 'live_red':
      return { textColor: '#FFFFFF', bgColor: '#B91C1C', bgOpacity: 0.94, borderColor: '#FCA5A5', borderWidth: 2, borderRadius: 12 };
    case 'royal_blue':
      return { textColor: '#EFF6FF', bgColor: '#0C1E3E', bgOpacity: 0.93, borderColor: '#3B82F6', borderWidth: 2, borderRadius: 12 };
    case 'purple_neon':
      return { textColor: '#FAF5FF', bgColor: '#1D0A33', bgOpacity: 0.92, borderColor: '#C084FC', borderWidth: 2, borderRadius: 12 };
    case 'dark_glass':
      return { textColor: '#FFFFFF', bgColor: '#080E1A', bgOpacity: 0.88, borderColor: '#64748B', borderWidth: 1.5, borderRadius: 12 };
    case 'light':
      return { textColor: '#061512', bgColor: '#FFFFFF', bgOpacity: 0.95, borderColor: '#F59E0B', borderWidth: 2, borderRadius: 12 };
    case 'minimal':
    default:
      return { textColor: '#FFFFFF', bgColor: '#000000', bgOpacity: 0, borderColor: '#FFFFFF', borderWidth: 0, borderRadius: 8 };
  }
};

export const resolveOverlayTextStyle = (txt: LiveOverlayTextItem): ResolvedOverlayTextStyle => {
  const def = getThemeDefaults(txt.theme);
  const fontFamily: OverlayFontFamily = txt.fontFamily || 'Outfit';
  const fontOpt = OVERLAY_FONT_OPTIONS.find(f => f.id === fontFamily) || OVERLAY_FONT_OPTIONS[0];
  const bgOpacity = txt.bgOpacity !== undefined ? txt.bgOpacity : def.bgOpacity;
  const bgHex = txt.bgColor || def.bgColor;
  const borderWidth = txt.borderWidth !== undefined ? txt.borderWidth : def.borderWidth;
  const hasBackground = bgOpacity > 0.01 || borderWidth > 0;

  return {
    fontFamily,
    fontCss: fontOpt.css,
    fontWeight: txt.fontWeight ?? (fontFamily === 'Pacifico' || fontFamily === 'Anton' || fontFamily === 'Bebas Neue' || fontFamily === 'Russo One' ? 400 : 800),
    italic: Boolean(txt.italic),
    underline: Boolean(txt.underline),
    color: txt.textColor || def.textColor,
    bgFill: bgOpacity > 0.01 ? hexToRgba(bgHex, bgOpacity) : 'transparent',
    borderColor: txt.borderColor || def.borderColor,
    borderWidth,
    borderRadius: txt.borderRadius !== undefined ? txt.borderRadius : def.borderRadius,
    letterSpacingPx: txt.letterSpacing !== undefined ? txt.letterSpacing : (txt.uppercase ? 2 : 0.5),
    textShadow: txt.textShadow !== undefined ? txt.textShadow : true,
    hasBackground
  };
};

export const getTextThemeStyles = (theme: OverlayTextTheme): React.CSSProperties => {
  switch (theme) {
    case 'gold':
      return {
        background: 'linear-gradient(135deg, rgba(10, 15, 25, 0.94), rgba(28, 22, 8, 0.94))',
        border: '2px solid #F59E0B',
        color: '#FEF3C7',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7), 0 0 18px rgba(245, 158, 11, 0.35)',
        padding: '0.45em 1.1em',
        borderRadius: '12px'
      };
    case 'emerald':
      return {
        background: 'linear-gradient(135deg, rgba(4, 28, 24, 0.94), rgba(6, 52, 43, 0.94))',
        border: '2px solid #10B981',
        color: '#ECFDF5',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7), 0 0 18px rgba(16, 185, 129, 0.35)',
        padding: '0.45em 1.1em',
        borderRadius: '12px'
      };
    case 'live_red':
      return {
        background: 'linear-gradient(135deg, rgba(185, 28, 28, 0.95), rgba(239, 68, 68, 0.95))',
        border: '2px solid rgba(255, 255, 255, 0.45)',
        color: '#FFFFFF',
        boxShadow: '0 8px 24px rgba(185, 28, 28, 0.55)',
        padding: '0.42em 1.05em',
        borderRadius: '12px'
      };
    case 'royal_blue':
      return {
        background: 'linear-gradient(135deg, rgba(12, 30, 62, 0.95), rgba(23, 55, 115, 0.95))',
        border: '2px solid #3B82F6',
        color: '#EFF6FF',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7), 0 0 18px rgba(59, 130, 246, 0.35)',
        padding: '0.45em 1.1em',
        borderRadius: '12px'
      };
    case 'purple_neon':
      return {
        background: 'linear-gradient(135deg, rgba(29, 10, 51, 0.94), rgba(68, 18, 110, 0.94))',
        border: '2px solid #C084FC',
        color: '#FAF5FF',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7), 0 0 18px rgba(192, 132, 252, 0.4)',
        padding: '0.45em 1.1em',
        borderRadius: '12px'
      };
    case 'dark_glass':
      return {
        background: 'rgba(8, 14, 26, 0.88)',
        backdropFilter: 'blur(12px)',
        border: '1.5px solid rgba(255, 255, 255, 0.22)',
        color: '#FFFFFF',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)',
        padding: '0.45em 1.1em',
        borderRadius: '12px'
      };
    case 'light':
      return {
        background: 'rgba(255, 255, 255, 0.95)',
        border: '2px solid #F59E0B',
        color: '#061512',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        padding: '0.42em 1.05em',
        borderRadius: '12px'
      };
    case 'minimal':
    default:
      return {
        background: 'transparent',
        border: 'none',
        color: '#FFFFFF',
        textShadow: '0 3px 12px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.9)',
        padding: '0.2em 0.5em'
      };
  }
};

// ============================================================================
// PROJETS D'HABILLAGE TV ENREGISTRÉS (CRÉER, CHARGER, MODIFIER, SUPPRIMER)
// ============================================================================

const getProjectsStorageKey = (clubId: string) =>
  `mb_live_overlay_projects_${clubId || 'default'}`;

const getActiveProjectStorageKey = (clubId: string) =>
  `mb_live_overlay_active_project_${clubId || 'default'}`;

const getDeletedProjectsStorageKey = (clubId: string) =>
  `mb_live_overlay_deleted_projects_${clubId || 'default'}`;

export const OVERLAY_PROJECTS_ROW_PREFIX = '__mcb_overlay_projects_';

export const getOverlayProjectsCloudRowId = (clubId: string) =>
  `${OVERLAY_PROJECTS_ROW_PREFIX}${clubId || 'default'}`;

export const isOverlayProjectsCloudRow = (row: any): boolean => {
  if (!row) return false;
  if (typeof row.id === 'string' && row.id.startsWith(OVERLAY_PROJECTS_ROW_PREFIX)) return true;
  if (row.settings && row.settings.__kind === 'overlay_projects_v1') return true;
  return false;
};

const loadDeletedProjectIds = (clubId: string): Record<string, number> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getDeletedProjectsStorageKey(clubId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveDeletedProjectIds = (clubId: string, map: Record<string, number>) => {
  if (typeof window === 'undefined') return;
  try {
    // Keep last 60 tombstones
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 60);
    localStorage.setItem(getDeletedProjectsStorageKey(clubId), JSON.stringify(Object.fromEntries(entries)));
  } catch {}
};

const notifyOverlayProjectsChanged = (clubId: string, projects: LiveOverlayProject[], activeProjectId: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('mb-overlay-projects-updated', {
        detail: { clubId, projects, activeProjectId }
      })
    );
  } catch {}
  try {
    broadcastChannel?.postMessage({ kind: 'overlay_projects', clubId, projects, activeProjectId });
  } catch {}
};

export const loadOverlayProjects = (clubId: string): LiveOverlayProject[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getProjectsStorageKey(clubId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is LiveOverlayProject => Boolean(p && p.id && p.name && p.config))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return [];
  }
};

export const saveOverlayProjects = (clubId: string, projects: LiveOverlayProject[]): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(getProjectsStorageKey(clubId), JSON.stringify(projects));
    notifyOverlayProjectsChanged(clubId, projects, loadActiveOverlayProjectId(clubId));
    return true;
  } catch (e) {
    console.warn('Quota localStorage atteint pour les projets Habillage TV:', e);
    return false;
  }
};

export const loadActiveOverlayProjectId = (clubId: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(getActiveProjectStorageKey(clubId)) || null;
  } catch {
    return null;
  }
};

export const saveActiveOverlayProjectId = (clubId: string, projectId: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (projectId) {
      localStorage.setItem(getActiveProjectStorageKey(clubId), projectId);
    } else {
      localStorage.removeItem(getActiveProjectStorageKey(clubId));
    }
    notifyOverlayProjectsChanged(clubId, loadOverlayProjects(clubId), projectId);
  } catch {}
};

const mergeProjectLists = (
  localList: LiveOverlayProject[],
  cloudList: LiveOverlayProject[],
  deletedMap: Record<string, number>
): LiveOverlayProject[] => {
  const byId = new Map<string, LiveOverlayProject>();
  for (const p of [...cloudList, ...localList]) {
    if (!p || !p.id || !p.name || !p.config) continue;
    const delAt = deletedMap[p.id] || 0;
    if (delAt >= (p.updatedAt || 0)) continue;
    const existing = byId.get(p.id);
    if (!existing || (p.updatedAt || 0) > (existing.updatedAt || 0)) {
      byId.set(p.id, p);
    }
  }
  return Array.from(byId.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
};

export const applyCloudOverlayProjectsRow = (clubId: string, row: any): { projects: LiveOverlayProject[]; activeProjectId: string | null } | null => {
  if (!row || !isOverlayProjectsCloudRow(row)) return null;
  const expectedId = getOverlayProjectsCloudRowId(clubId);
  if (row.id !== expectedId) return null;
  const settings = row.settings || {};
  const cloudProjects: LiveOverlayProject[] = Array.isArray(settings.projects) ? settings.projects : [];
  const cloudDeleted: Record<string, number> = settings.deletedIds && typeof settings.deletedIds === 'object' ? settings.deletedIds : {};
  const localDeleted = loadDeletedProjectIds(clubId);
  const mergedDeleted: Record<string, number> = { ...localDeleted };
  for (const [k, ts] of Object.entries(cloudDeleted)) {
    mergedDeleted[k] = Math.max(mergedDeleted[k] || 0, Number(ts) || 0);
  }
  saveDeletedProjectIds(clubId, mergedDeleted);

  const localProjects = loadOverlayProjects(clubId);
  const merged = mergeProjectLists(localProjects, cloudProjects, mergedDeleted);
  try {
    localStorage.setItem(getProjectsStorageKey(clubId), JSON.stringify(merged));
  } catch {}

  const localActive = loadActiveOverlayProjectId(clubId);
  const cloudActive = typeof settings.activeProjectId === 'string' ? settings.activeProjectId : null;
  const effectiveActive =
    (localActive && merged.some(p => p.id === localActive) ? localActive : null) ||
    (cloudActive && merged.some(p => p.id === cloudActive) ? cloudActive : null);
  try {
    if (effectiveActive) localStorage.setItem(getActiveProjectStorageKey(clubId), effectiveActive);
    else localStorage.removeItem(getActiveProjectStorageKey(clubId));
  } catch {}

  notifyOverlayProjectsChanged(clubId, merged, effectiveActive);
  return { projects: merged, activeProjectId: effectiveActive };
};

export const pushOverlayProjectsToCloud = async (
  clubId: string,
  projects: LiveOverlayProject[],
  activeProjectId: string | null,
  newlyDeletedId?: string
): Promise<{ ok: boolean; error?: string }> => {
  const deletedMap = loadDeletedProjectIds(clubId);
  if (newlyDeletedId) {
    deletedMap[newlyDeletedId] = Date.now();
    saveDeletedProjectIds(clubId, deletedMap);
  }
  const rowId = getOverlayProjectsCloudRowId(clubId);
  const baseRow: Record<string, any> = {
    id: rowId,
    name: '__MCB_OVERLAY_PROJECTS__',
    format: 'poules',
    status: 'finished',
    participants: [],
    matches: [],
    settings: {
      __kind: 'overlay_projects_v1',
      clubId,
      projects,
      activeProjectId,
      deletedIds: deletedMap,
      updatedAt: Date.now()
    }
  };

  try {
    const withClub = await supabase.from('tournoi2_tournaments').upsert({ ...baseRow, club_id: clubId });
    if (!withClub.error) return { ok: true };
    if (withClub.error.message?.toLowerCase().includes('club_id')) {
      const withoutClub = await supabase.from('tournoi2_tournaments').upsert(baseRow);
      if (!withoutClub.error) return { ok: true };
      return { ok: false, error: withoutClub.error.message };
    }
    return { ok: false, error: withClub.error.message };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || 'Erreur réseau Cloud') };
  }
};

export const fetchOverlayProjectsFromCloud = async (
  clubId: string
): Promise<{ ok: boolean; projects: LiveOverlayProject[]; activeProjectId: string | null; error?: string }> => {
  const rowId = getOverlayProjectsCloudRowId(clubId);
  try {
    const { data, error } = await supabase
      .from('tournoi2_tournaments')
      .select('id, settings')
      .eq('id', rowId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        projects: loadOverlayProjects(clubId),
        activeProjectId: loadActiveOverlayProjectId(clubId),
        error: error.message
      };
    }

    if (!data) {
      // No cloud row yet: if local projects exist, push them up to initialize Cloud!
      const localList = loadOverlayProjects(clubId);
      const localActive = loadActiveOverlayProjectId(clubId);
      if (localList.length > 0) {
        const pushed = await pushOverlayProjectsToCloud(clubId, localList, localActive);
        return { ok: pushed.ok, projects: localList, activeProjectId: localActive, error: pushed.error };
      }
      return { ok: true, projects: [], activeProjectId: null };
    }

    const applied = applyCloudOverlayProjectsRow(clubId, data);
    if (applied) {
      // If local had newer/extra projects merged in, push merged result back to Cloud
      const cloudCount = Array.isArray(data.settings?.projects) ? data.settings.projects.length : 0;
      if (applied.projects.length > cloudCount) {
        pushOverlayProjectsToCloud(clubId, applied.projects, applied.activeProjectId);
      }
      return { ok: true, projects: applied.projects, activeProjectId: applied.activeProjectId };
    }
    return {
      ok: true,
      projects: loadOverlayProjects(clubId),
      activeProjectId: loadActiveOverlayProjectId(clubId)
    };
  } catch (err: any) {
    return {
      ok: false,
      projects: loadOverlayProjects(clubId),
      activeProjectId: loadActiveOverlayProjectId(clubId),
      error: String(err?.message || 'Hors-ligne')
    };
  }
};

export const subscribeToOverlayProjects = (
  clubId: string,
  onUpdate: (projects: LiveOverlayProject[], activeProjectId: string | null) => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const projKey = getProjectsStorageKey(clubId);
  const actKey = getActiveProjectStorageKey(clubId);

  const onCustom = (e: Event) => {
    const d = (e as CustomEvent)?.detail;
    if (d && d.clubId === clubId && Array.isArray(d.projects)) {
      onUpdate(d.projects, d.activeProjectId ?? null);
    }
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === projKey || e.key === actKey) {
      onUpdate(loadOverlayProjects(clubId), loadActiveOverlayProjectId(clubId));
    }
  };
  const onBc = (e: MessageEvent) => {
    const d = e.data;
    if (d && d.kind === 'overlay_projects' && d.clubId === clubId && Array.isArray(d.projects)) {
      onUpdate(d.projects, d.activeProjectId ?? null);
    }
  };

  window.addEventListener('mb-overlay-projects-updated', onCustom);
  window.addEventListener('storage', onStorage);
  broadcastChannel?.addEventListener('message', onBc);

  return () => {
    window.removeEventListener('mb-overlay-projects-updated', onCustom);
    window.removeEventListener('storage', onStorage);
    broadcastChannel?.removeEventListener('message', onBc);
  };
};

export const getImageBgStyles = (bgStyle: OverlayImageBg): React.CSSProperties => {
  switch (bgStyle) {
    case 'white':
      return {
        background: 'rgba(255, 255, 255, 0.95)',
        padding: '6px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.6)'
      };
    case 'dark':
      return {
        background: 'rgba(6, 14, 24, 0.85)',
        backdropFilter: 'blur(8px)',
        padding: '6px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.65)',
        border: '1px solid rgba(255,255,255,0.2)'
      };
    case 'gold':
      return {
        background: 'rgba(10, 14, 22, 0.88)',
        padding: '5px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.7), 0 0 14px rgba(245, 158, 11, 0.35)',
        border: '2px solid #F59E0B'
      };
    case 'emerald':
      return {
        background: 'rgba(4, 24, 20, 0.88)',
        padding: '5px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.7), 0 0 14px rgba(16, 185, 129, 0.35)',
        border: '2px solid #10B981'
      };
    case 'transparent':
    default:
      return {
        background: 'transparent',
        padding: 0,
        filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.65))'
      };
  }
};
