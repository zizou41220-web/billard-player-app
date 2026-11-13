import { supabase } from '../supabase';

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

export type OverlayTextTheme = 'gold' | 'emerald' | 'live_red' | 'dark_glass' | 'light' | 'minimal';

export interface LiveOverlayTextItem {
  id: string;
  text: string;
  x: number; // 0..100 (% from left, center-anchored)
  y: number; // 0..100 (% from top, center-anchored)
  scale: number; // 0.6..2.8 (font scale multiplier)
  theme: OverlayTextTheme;
  uppercase: boolean;
  visible: boolean;
}

export interface LiveOverlayConfig {
  scoreboardCustomPos?: boolean;
  scoreboardX?: number; // 0..100 (% from left)
  scoreboardY?: number; // 0..100 (% from top)
  scoreboardScale?: number; // 0.6..1.5
  images: LiveOverlayImageItem[];
  texts: LiveOverlayTextItem[];
  updatedAt: number;
}

export const DEFAULT_LIVE_OVERLAY_CONFIG: LiveOverlayConfig = {
  scoreboardCustomPos: false,
  scoreboardX: 50,
  scoreboardY: 12,
  scoreboardScale: 1,
  images: [],
  texts: [],
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
      texts: Array.isArray(parsed.texts) ? parsed.texts : []
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
