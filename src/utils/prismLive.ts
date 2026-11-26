import { supabase } from '../supabase';

export type PrismSourceMode = 'table' | 'quick';
export type PrismLogoPosition = 'left' | 'right' | 'none';
export type PrismBarPosition = 'bottom' | 'top';

export interface PrismQuickMatchState {
  roomId: string;
  eventTitle: string;
  player1Name: string;
  player1Club: string;
  player2Name: string;
  player2Club: string;
  score1: number;
  score2: number;
  targetSets: number;
  barPos: PrismBarPosition;
  logoPos: PrismLogoPosition;
  updatedAt: number;
}

export const DEFAULT_PRISM_QUICK_STATE: PrismQuickMatchState = {
  roomId: 'live1',
  eventTitle: 'Match Live',
  player1Name: 'Joueur 1',
  player1Club: '',
  player2Name: 'Joueur 2',
  player2Club: '',
  score1: 0,
  score2: 0,
  targetSets: 5,
  barPos: 'bottom',
  logoPos: 'left',
  updatedAt: 0
};

const getPrismStorageKey = (clubId: string, roomId: string) =>
  `mb_prism_quick_${clubId || 'default'}_${roomId || 'live1'}`;

let prismBc: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    prismBc = new BroadcastChannel('mb_prism_live_sync');
  }
} catch {}

let prismChannel: ReturnType<typeof supabase.channel> | null = null;
let currentPrismSubKey = '';

const normalizeQuickState = (raw: any, roomId: string): PrismQuickMatchState => ({
  ...DEFAULT_PRISM_QUICK_STATE,
  ...(raw && typeof raw === 'object' ? raw : {}),
  roomId: roomId || raw?.roomId || 'live1',
  score1: Math.max(0, Number(raw?.score1 ?? 0) || 0),
  score2: Math.max(0, Number(raw?.score2 ?? 0) || 0),
  targetSets: Math.max(0, Number(raw?.targetSets ?? 5) || 0),
  barPos: raw?.barPos === 'top' ? 'top' : 'bottom',
  logoPos: raw?.logoPos === 'right' || raw?.logoPos === 'none' ? raw.logoPos : 'left',
  updatedAt: Number(raw?.updatedAt || 0)
});

export const loadPrismQuickState = (
  clubId: string,
  roomId: string = 'live1'
): PrismQuickMatchState => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PRISM_QUICK_STATE, roomId };
  }
  try {
    const raw = localStorage.getItem(getPrismStorageKey(clubId, roomId));
    if (!raw) return { ...DEFAULT_PRISM_QUICK_STATE, roomId };
    return normalizeQuickState(JSON.parse(raw), roomId);
  } catch {
    return { ...DEFAULT_PRISM_QUICK_STATE, roomId };
  }
};

export const savePrismQuickState = (
  clubId: string,
  state: PrismQuickMatchState,
  broadcast: boolean = true
): PrismQuickMatchState => {
  const stamped: PrismQuickMatchState = {
    ...normalizeQuickState(state, state.roomId),
    updatedAt: Date.now()
  };

  if (typeof window !== 'undefined') {
    const key = getPrismStorageKey(clubId, stamped.roomId);
    try {
      localStorage.setItem(key, JSON.stringify(stamped));
    } catch {}

    if (broadcast) {
      try {
        prismBc?.postMessage({ clubId, roomId: stamped.roomId, state: stamped });
      } catch {}

      try {
        window.dispatchEvent(
          new CustomEvent('mb-prism-state-updated', {
            detail: { clubId, roomId: stamped.roomId, state: stamped }
          })
        );
      } catch {}

      try {
        prismChannel?.send({
          type: 'broadcast',
          event: 'prism_state',
          payload: { clubId, roomId: stamped.roomId, state: stamped }
        });
      } catch {}
    }
  }

  return stamped;
};

export const subscribeToPrismQuickState = (
  clubId: string,
  roomId: string,
  onUpdate: (state: PrismQuickMatchState) => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const storageKey = getPrismStorageKey(clubId, roomId);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === storageKey && e.newValue) {
      try {
        onUpdate(normalizeQuickState(JSON.parse(e.newValue), roomId));
      } catch {}
    }
  };

  const handleCustomEvent = (e: Event) => {
    const detail = (e as CustomEvent)?.detail;
    if (detail && detail.clubId === clubId && detail.roomId === roomId && detail.state) {
      onUpdate(normalizeQuickState(detail.state, roomId));
    }
  };

  const handleBcMessage = (e: MessageEvent) => {
    const data = e.data;
    if (data && data.clubId === clubId && data.roomId === roomId && data.state) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data.state));
      } catch {}
      onUpdate(normalizeQuickState(data.state, roomId));
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener('mb-prism-state-updated', handleCustomEvent);
  prismBc?.addEventListener('message', handleBcMessage);

  const subKey = `prism_live_${clubId}_${roomId}`;
  if (currentPrismSubKey !== subKey) {
    if (prismChannel) {
      try {
        supabase.removeChannel(prismChannel);
      } catch {}
    }
    currentPrismSubKey = subKey;
    prismChannel = supabase
      .channel(`public:${subKey}`)
      .on('broadcast', { event: 'prism_state' }, (payload) => {
        const data = payload?.payload;
        if (data && data.clubId === clubId && data.roomId === roomId && data.state) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(data.state));
          } catch {}
          onUpdate(normalizeQuickState(data.state, roomId));
        }
      })
      .on('broadcast', { event: 'request_prism_state' }, (payload) => {
        const req = payload?.payload;
        if (req && req.clubId === clubId && req.roomId === roomId) {
          const current = loadPrismQuickState(clubId, roomId);
          if (current.updatedAt > 0) {
            prismChannel?.send({
              type: 'broadcast',
              event: 'prism_state',
              payload: { clubId, roomId, state: current }
            });
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          try {
            prismChannel?.send({
              type: 'broadcast',
              event: 'request_prism_state',
              payload: { clubId, roomId }
            });
          } catch {}
        }
      });
  } else if (prismChannel) {
    try {
      prismChannel.send({
        type: 'broadcast',
        event: 'request_prism_state',
        payload: { clubId, roomId }
      });
    } catch {}
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('mb-prism-state-updated', handleCustomEvent);
    prismBc?.removeEventListener('message', handleBcMessage);
    if (currentPrismSubKey === subKey && prismChannel) {
      try {
        supabase.removeChannel(prismChannel);
      } catch {}
      prismChannel = null;
      currentPrismSubKey = '';
    }
  };
};

export const getPublicAppBaseUrl = (): string => {
  if (typeof window === 'undefined') return '';
  const cleanPath = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
  if (window.location.hostname === 'localhost') {
    return typeof __LAN_URL__ === 'string' ? __LAN_URL__.replace(/\/+$/, '') : window.location.origin;
  }
  return `${window.location.origin}${cleanPath}`;
};

export const buildPrismOverlayUrl = (
  baseUrl: string,
  clubId: string,
  opts: {
    sourceMode: PrismSourceMode;
    tableId?: string;
    barPos: PrismBarPosition;
    logoPos: PrismLogoPosition;
    quickState?: PrismQuickMatchState;
  }
): string => {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (opts.sourceMode === 'table') {
    params.set('prism', 'table');
    if (opts.tableId) params.set('table', opts.tableId);
    params.set('club', clubId);
    params.set('pos', opts.barPos);
    params.set('logo', opts.logoPos);
  } else {
    const qs = opts.quickState || DEFAULT_PRISM_QUICK_STATE;
    params.set('prism', 'quick');
    params.set('room', qs.roomId || 'live1');
    params.set('club', clubId);
    params.set('pos', opts.barPos);
    params.set('logo', opts.logoPos);
    if (qs.eventTitle.trim()) params.set('t', qs.eventTitle.trim());
    if (qs.player1Name.trim()) params.set('p1', qs.player1Name.trim());
    if (qs.player1Club.trim()) params.set('c1', qs.player1Club.trim());
    if (qs.player2Name.trim()) params.set('p2', qs.player2Name.trim());
    if (qs.player2Club.trim()) params.set('c2', qs.player2Club.trim());
    params.set('race', String(qs.targetSets ?? 5));
  }
  return `${cleanBase}/?${params.toString()}`;
};

export const buildPrismRemoteUrl = (
  baseUrl: string,
  clubId: string,
  roomId: string = 'live1'
): string => {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams();
  params.set('prism_remote', roomId || 'live1');
  params.set('club', clubId);
  return `${cleanBase}/?${params.toString()}`;
};
