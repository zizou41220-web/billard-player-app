import { supabase } from '../supabase';

export type DirectorCameraSourceType = 'smartphone_webrtc' | 'usb' | 'vdo' | 'external';
export type DirectorAssignmentType = 'table' | 'live_match' | 'custom_view';
export type DirectorBroadcastMode = 'mosaic' | 'single';
export type DirectorMosaicLayout = 'auto' | 'side_by_side' | 'stacked' | 'grid_2x2';

export interface DirectorCameraSlot {
  id: string;
  name: string;
  enabled: boolean;
  sourceType: DirectorCameraSourceType;
  usbDeviceId?: string;
  externalUrl?: string;
  vdoRoom?: string;
  assignmentType: DirectorAssignmentType;
  tableId?: string;
  customViewTitle?: string;
  customViewShowAllScores?: boolean;
  rotation: number; // 0 | 90 | 180 | 270
  zoom: number; // 1..3
  fillMode: 'cover' | 'contain';
  forceMuted: boolean;
}

export interface StreamDestinationsConfig {
  facebookEnabled: boolean;
  facebookRtmpUrl: string;
  facebookStreamKey: string;
  youtubeEnabled: boolean;
  youtubeRtmpUrl: string;
  youtubeStreamKey: string;
  customEnabled: boolean;
  customRtmpUrl: string;
  customStreamKey: string;
  relayWsUrl: string;
}

export interface MultiCamDirectorState {
  cameras: DirectorCameraSlot[];
  broadcastMode: DirectorBroadcastMode;
  focusedCameraId: string | null;
  activeAudioCameraId: string | null;
  mosaicLayout: DirectorMosaicLayout;
  isLiveStreaming: boolean;
  liveStartedAt: number | null;
  updatedAt: number;
}

export const CUSTOM_VIEW_PRESETS: string[] = [
  "Vue d'ensemble Salle",
  'Commentateurs / Interview',
  'Podium / Remise des prix',
  'Tableau des Scores / Bracket',
  'Ambiance Club'
];

export const DEFAULT_CAMERAS: DirectorCameraSlot[] = [
  {
    id: 'cam_1',
    name: 'Caméra 1',
    enabled: true,
    sourceType: 'smartphone_webrtc',
    assignmentType: 'table',
    tableId: 't1',
    customViewTitle: "Vue d'ensemble Salle",
    customViewShowAllScores: true,
    rotation: 0,
    zoom: 1,
    fillMode: 'cover',
    forceMuted: false
  },
  {
    id: 'cam_2',
    name: 'Caméra 2',
    enabled: true,
    sourceType: 'smartphone_webrtc',
    assignmentType: 'table',
    tableId: 't2',
    customViewTitle: "Vue d'ensemble Salle",
    customViewShowAllScores: true,
    rotation: 0,
    zoom: 1,
    fillMode: 'cover',
    forceMuted: false
  },
  {
    id: 'cam_3',
    name: 'Caméra 3',
    enabled: true,
    sourceType: 'smartphone_webrtc',
    assignmentType: 'custom_view',
    customViewTitle: "Vue d'ensemble Salle",
    customViewShowAllScores: true,
    rotation: 0,
    zoom: 1,
    fillMode: 'cover',
    forceMuted: false
  },
  {
    id: 'cam_4',
    name: 'Caméra 4',
    enabled: false,
    sourceType: 'smartphone_webrtc',
    assignmentType: 'live_match',
    customViewTitle: 'Commentateurs / Interview',
    customViewShowAllScores: false,
    rotation: 0,
    zoom: 1,
    fillMode: 'cover',
    forceMuted: false
  }
];

export const DEFAULT_DIRECTOR_STATE: MultiCamDirectorState = {
  cameras: DEFAULT_CAMERAS,
  broadcastMode: 'mosaic',
  focusedCameraId: null,
  activeAudioCameraId: 'cam_1',
  mosaicLayout: 'auto',
  isLiveStreaming: false,
  liveStartedAt: null,
  updatedAt: 0
};

export const DEFAULT_DESTINATIONS_CONFIG: StreamDestinationsConfig = {
  facebookEnabled: true,
  facebookRtmpUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/',
  facebookStreamKey: '',
  youtubeEnabled: true,
  youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2/',
  youtubeStreamKey: '',
  customEnabled: false,
  customRtmpUrl: '',
  customStreamKey: '',
  relayWsUrl: ''
};

const getDirectorStorageKey = (clubId: string) =>
  `mb_director_state_${clubId || 'default'}`;

const getDestinationsStorageKey = (clubId: string) =>
  `mb_director_destinations_${clubId || 'default'}`;

let directorBc: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    directorBc = new BroadcastChannel('mb_director_state_sync');
  }
} catch {}

let supabaseDirectorChannel: ReturnType<typeof supabase.channel> | null = null;
let currentSubscribedClubKey = '';

export const loadDirectorState = (clubId: string): MultiCamDirectorState => {
  if (typeof window === 'undefined') return DEFAULT_DIRECTOR_STATE;
  try {
    const raw = localStorage.getItem(getDirectorStorageKey(clubId));
    if (!raw) return DEFAULT_DIRECTOR_STATE;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_DIRECTOR_STATE,
      ...parsed,
      cameras: Array.isArray(parsed.cameras) && parsed.cameras.length > 0
        ? parsed.cameras
        : DEFAULT_CAMERAS
    };
  } catch {
    return DEFAULT_DIRECTOR_STATE;
  }
};

export const saveDirectorState = (
  clubId: string,
  state: MultiCamDirectorState,
  broadcast: boolean = true
): MultiCamDirectorState => {
  const stamped: MultiCamDirectorState = {
    ...state,
    updatedAt: Date.now()
  };

  if (typeof window !== 'undefined') {
    const key = getDirectorStorageKey(clubId);
    try {
      localStorage.setItem(key, JSON.stringify(stamped));
    } catch {}

    if (broadcast) {
      try {
        directorBc?.postMessage({ clubId, state: stamped });
      } catch {}

      try {
        window.dispatchEvent(
          new CustomEvent('mb-director-state-updated', {
            detail: { clubId, state: stamped }
          })
        );
      } catch {}

      try {
        supabaseDirectorChannel?.send({
          type: 'broadcast',
          event: 'director_state',
          payload: { clubId, state: stamped }
        });
      } catch {}
    }
  }
  return stamped;
};

export const subscribeToDirectorState = (
  clubId: string,
  onUpdate: (state: MultiCamDirectorState) => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const storageKey = getDirectorStorageKey(clubId);

  const normalize = (parsed: any): MultiCamDirectorState => ({
    ...DEFAULT_DIRECTOR_STATE,
    ...parsed,
    cameras: Array.isArray(parsed?.cameras) && parsed.cameras.length > 0
      ? parsed.cameras
      : DEFAULT_CAMERAS
  });

  const handleStorage = (e: StorageEvent) => {
    if (e.key === storageKey && e.newValue) {
      try {
        onUpdate(normalize(JSON.parse(e.newValue)));
      } catch {}
    }
  };

  const handleCustomEvent = (e: Event) => {
    const detail = (e as CustomEvent)?.detail;
    if (detail && detail.clubId === clubId && detail.state) {
      onUpdate(normalize(detail.state));
    }
  };

  const handleBcMessage = (e: MessageEvent) => {
    const data = e.data;
    if (data && data.clubId === clubId && data.state) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data.state));
      } catch {}
      onUpdate(normalize(data.state));
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener('mb-director-state-updated', handleCustomEvent);
  directorBc?.addEventListener('message', handleBcMessage);

  const subKey = `director_state_${clubId}`;
  if (currentSubscribedClubKey !== subKey) {
    if (supabaseDirectorChannel) {
      try {
        supabase.removeChannel(supabaseDirectorChannel);
      } catch {}
    }
    currentSubscribedClubKey = subKey;
    supabaseDirectorChannel = supabase
      .channel(`public:${subKey}`)
      .on('broadcast', { event: 'director_state' }, (payload) => {
        const data = payload?.payload;
        if (data && data.clubId === clubId && data.state) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(data.state));
          } catch {}
          onUpdate(normalize(data.state));
        }
      })
      .on('broadcast', { event: 'request_director_state' }, (payload) => {
        const req = payload?.payload;
        if (req && req.clubId === clubId) {
          const current = loadDirectorState(clubId);
          if (current.updatedAt > 0) {
            supabaseDirectorChannel?.send({
              type: 'broadcast',
              event: 'director_state',
              payload: { clubId, state: current }
            });
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          try {
            supabaseDirectorChannel?.send({
              type: 'broadcast',
              event: 'request_director_state',
              payload: { clubId }
            });
          } catch {}
        }
      });
  } else if (supabaseDirectorChannel) {
    try {
      supabaseDirectorChannel.send({
        type: 'broadcast',
        event: 'request_director_state',
        payload: { clubId }
      });
    } catch {}
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('mb-director-state-updated', handleCustomEvent);
    directorBc?.removeEventListener('message', handleBcMessage);
  };
};

export const loadStreamDestinations = (clubId: string): StreamDestinationsConfig => {
  if (typeof window === 'undefined') return DEFAULT_DESTINATIONS_CONFIG;
  try {
    const raw = localStorage.getItem(getDestinationsStorageKey(clubId));
    if (!raw) return DEFAULT_DESTINATIONS_CONFIG;
    return {
      ...DEFAULT_DESTINATIONS_CONFIG,
      ...JSON.parse(raw)
    };
  } catch {
    return DEFAULT_DESTINATIONS_CONFIG;
  }
};

export const saveStreamDestinations = (clubId: string, config: StreamDestinationsConfig) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getDestinationsStorageKey(clubId), JSON.stringify(config));
  } catch {}
};

export const RTC_ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export interface CameraSignalingHandle {
  channel: ReturnType<typeof supabase.channel>;
  requestOffer: (viewerId?: string) => void;
  sendSenderOnline: () => void;
  sendOffer: (sdp: RTCSessionDescriptionInit, sessionId: string, viewerId?: string) => void;
  sendAnswer: (sdp: RTCSessionDescriptionInit, sessionId: string, viewerId?: string) => void;
  sendIceCandidate: (candidate: RTCIceCandidateInit, role: 'sender' | 'receiver', sessionId: string, viewerId?: string) => void;
  destroy: () => void;
}

export interface CameraSignalingCallbacks {
  onRequestOffer?: (viewerId: string) => void;
  onSenderOnline?: () => void;
  onOffer?: (sdp: RTCSessionDescriptionInit, sessionId: string, viewerId: string) => void;
  onAnswer?: (sdp: RTCSessionDescriptionInit, sessionId: string, viewerId: string) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit, role: 'sender' | 'receiver', sessionId: string, viewerId: string) => void;
  onSubscribed?: () => void;
}

/**
 * Crée un canal de signalisation WebRTC dédié à une caméra via Supabase Realtime.
 * Permet au smartphone (sender) de transmettre sa vidéo + micro à un ou plusieurs écrans PC/TV sans app tierce.
 */
export const createCameraSignalingChannel = (
  clubId: string,
  cameraId: string,
  callbacks: CameraSignalingCallbacks
): CameraSignalingHandle => {
  const topic = `mcb_cam_sig_${clubId || 'bc41'}_${cameraId}`;
  const channel = supabase.channel(`public:${topic}`, {
    config: { broadcast: { self: false } }
  });

  channel
    .on('broadcast', { event: 'request_offer' }, (msg) => {
      callbacks.onRequestOffer?.(msg?.payload?.viewerId || 'default');
    })
    .on('broadcast', { event: 'sender_online' }, () => {
      callbacks.onSenderOnline?.();
    })
    .on('broadcast', { event: 'offer' }, (msg) => {
      const p = msg?.payload;
      if (p?.sdp && p?.sessionId) {
        callbacks.onOffer?.(p.sdp, p.sessionId, p.viewerId || 'default');
      }
    })
    .on('broadcast', { event: 'answer' }, (msg) => {
      const p = msg?.payload;
      if (p?.sdp && p?.sessionId) {
        callbacks.onAnswer?.(p.sdp, p.sessionId, p.viewerId || 'default');
      }
    })
    .on('broadcast', { event: 'ice_candidate' }, (msg) => {
      const p = msg?.payload;
      if (p?.candidate && p?.role && p?.sessionId) {
        callbacks.onIceCandidate?.(p.candidate, p.role, p.sessionId, p.viewerId || 'default');
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        callbacks.onSubscribed?.();
      }
    });

  return {
    channel,
    requestOffer: (viewerId = 'default') => {
      try {
        channel.send({ type: 'broadcast', event: 'request_offer', payload: { ts: Date.now(), viewerId } });
      } catch {}
    },
    sendSenderOnline: () => {
      try {
        channel.send({ type: 'broadcast', event: 'sender_online', payload: { ts: Date.now() } });
      } catch {}
    },
    sendOffer: (sdp, sessionId, viewerId = 'default') => {
      try {
        channel.send({ type: 'broadcast', event: 'offer', payload: { sdp, sessionId, viewerId } });
      } catch {}
    },
    sendAnswer: (sdp, sessionId, viewerId = 'default') => {
      try {
        channel.send({ type: 'broadcast', event: 'answer', payload: { sdp, sessionId, viewerId } });
      } catch {}
    },
    sendIceCandidate: (candidate, role, sessionId, viewerId = 'default') => {
      try {
        channel.send({ type: 'broadcast', event: 'ice_candidate', payload: { candidate, role, sessionId, viewerId } });
      } catch {}
    },
    destroy: () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    }
  };
};
