import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Facebook,
  Mic,
  MicOff,
  Play,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  RotateCcw,
  Settings,
  Smartphone,
  Trash2,
  Tv,
  Volume2,
  VolumeX,
  Youtube,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { useStore } from '../store';
import { Table } from '../types';
import {
  CUSTOM_VIEW_PRESETS,
  CameraSignalingHandle,
  DirectorAssignmentType,
  DirectorCameraSlot,
  DirectorCameraSourceType,
  DirectorMosaicLayout,
  MultiCamDirectorState,
  RTC_ICE_CONFIG,
  StreamDestinationsConfig,
  createCameraSignalingChannel,
  loadDirectorState,
  loadStreamDestinations,
  saveDirectorState,
  saveStreamDestinations,
  subscribeToDirectorState
} from '../utils/multiCamDirector';
import {
  BroadcasterStatusSnapshot,
  LiveCompositeBroadcaster,
  resolveCameraAssignment
} from '../utils/liveBroadcaster';
import {
  LiveOverlayConfig,
  loadLiveOverlayConfig,
  subscribeToLiveOverlayConfig
} from '../utils/liveOverlay';
import { formatEmbedVideoUrl } from '../utils/video';

interface MultiCamDirectorPanelProps {
  getAppBaseUrl: () => string;
}

interface CameraTileCardProps {
  slot: DirectorCameraSlot;
  directorState: MultiCamDirectorState;
  sortedTables: Table[];
  videoDevices: MediaDeviceInfo[];
  remoteStream: MediaStream | null;
  usbStream: MediaStream | null;
  connectionState: string;
  monitorAudioOnPc: boolean;
  onSelectFocus: (cameraId: string) => void;
  onSelectAudio: (cameraId: string) => void;
  onUpdateSlot: (cameraId: string, patch: Partial<DirectorCameraSlot>) => void;
  onRemoveSlot: (cameraId: string) => void;
  onOpenQr: (cameraId: string) => void;
  onReconnectWebRtc: (cameraId: string) => void;
  registerVideoEl: (cameraId: string, el: HTMLVideoElement | null) => void;
  canDelete: boolean;
}

const CameraTileCard: React.FC<CameraTileCardProps> = ({
  slot,
  directorState,
  sortedTables,
  videoDevices,
  remoteStream,
  usbStream,
  connectionState,
  monitorAudioOnPc,
  onSelectFocus,
  onSelectAudio,
  onUpdateSlot,
  onRemoveSlot,
  onOpenQr,
  onReconnectWebRtc,
  registerVideoEl,
  canDelete
}) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingCustomTitle, setEditingCustomTitle] = useState(false);

  const activeStream =
    slot.sourceType === 'smartphone_webrtc'
      ? remoteStream
      : slot.sourceType === 'usb'
        ? usbStream
        : null;

  const isSingleMode = directorState.broadcastMode === 'single';
  const isFocused = isSingleMode && directorState.focusedCameraId === slot.id;
  const isInMosaic = directorState.broadcastMode === 'mosaic' && slot.enabled;

  const effectiveAudioCamId =
    isSingleMode && directorState.focusedCameraId
      ? directorState.focusedCameraId
      : directorState.activeAudioCameraId;
  const isAudioSelected = effectiveAudioCamId === slot.id && !slot.forceMuted;

  useEffect(() => {
    const el = videoRef.current;
    registerVideoEl(slot.id, el);
    if (el) {
      if (el.srcObject !== activeStream) {
        el.srcObject = activeStream;
      }
      if (activeStream) {
        el.play().catch(() => {});
      }
    }
    return () => {
      registerVideoEl(slot.id, null);
    };
  }, [activeStream, slot.id, registerVideoEl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !(monitorAudioOnPc && isAudioSelected && slot.enabled);
  }, [monitorAudioOnPc, isAudioSelected, slot.enabled]);

  const assignment = resolveCameraAssignment(slot, {
    tables,
    matches,
    players,
    tournaments,
    currentClub
  });

  const assignmentSelectValue = (() => {
    if (slot.assignmentType === 'table') return `table:${slot.tableId || ''}`;
    if (slot.assignmentType === 'live_match') return 'live_match';
    const title = slot.customViewTitle || CUSTOM_VIEW_PRESETS[0];
    if (CUSTOM_VIEW_PRESETS.includes(title)) return `preset:${title}`;
    return 'custom_text';
  })();

  const handleAssignmentChange = (val: string) => {
    if (val.startsWith('table:')) {
      setEditingCustomTitle(false);
      onUpdateSlot(slot.id, {
        assignmentType: 'table' as DirectorAssignmentType,
        tableId: val.slice('table:'.length)
      });
    } else if (val === 'live_match') {
      setEditingCustomTitle(false);
      onUpdateSlot(slot.id, { assignmentType: 'live_match' });
    } else if (val.startsWith('preset:')) {
      setEditingCustomTitle(false);
      onUpdateSlot(slot.id, {
        assignmentType: 'custom_view',
        customViewTitle: val.slice('preset:'.length)
      });
    } else if (val === 'custom_text') {
      setEditingCustomTitle(true);
      onUpdateSlot(slot.id, {
        assignmentType: 'custom_view',
        customViewTitle: slot.customViewTitle || 'Vue personnalisée'
      });
    }
  };

  const borderStyle = isFocused
    ? '3px solid #ef4444'
    : isInMosaic
      ? '2px solid rgba(245, 158, 11, 0.7)'
      : '1.5px solid rgba(255, 255, 255, 0.14)';

  const cardShadow = isFocused
    ? '0 0 26px rgba(239, 68, 68, 0.5)'
    : isInMosaic
      ? '0 0 12px rgba(245, 158, 11, 0.16)'
      : 'none';

  return (
    <div style={{
      background: isFocused ? 'rgba(38, 10, 16, 0.94)' : 'rgba(7, 13, 26, 0.94)',
      border: borderStyle,
      boxShadow: cardShadow,
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      opacity: slot.enabled ? 1 : 0.58,
      transition: 'all 0.2s ease'
    }}>
      {/* Clickable 16:9 Live Video Viewport */}
      <div
        onClick={() => {
          if (!slot.enabled) {
            onUpdateSlot(slot.id, { enabled: true });
          }
          onSelectFocus(slot.id);
        }}
        title={
          isFocused
            ? "Caméra diffusée seule — Cliquez pour revenir à l'Écran Multiple"
            : 'Cliquez pour diffuser cette caméra seule + écouter son son'
        }
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: '#03060f',
          overflow: 'hidden',
          cursor: 'pointer'
        }}
      >
        {(slot.sourceType === 'smartphone_webrtc' || slot.sourceType === 'usb') && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={!monitorAudioOnPc || !isAudioSelected}
            style={{
              width: '100%',
              height: '100%',
              objectFit: slot.fillMode === 'contain' ? 'contain' : 'cover',
              transform: `rotate(${slot.rotation || 0}deg) scale(${slot.zoom || 1})`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease',
              display: 'block'
            }}
          />
        )}

        {slot.sourceType === 'vdo' && (
          <iframe
            src={`https://vdo.ninja/?view=${encodeURIComponent(slot.vdoRoom || `MCB_${currentClub.id}_${slot.id}`)}&cleanoutput&autoplay&muted`}
            allow="autoplay; camera; microphone; fullscreen"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              pointerEvents: 'none',
              transform: `rotate(${slot.rotation || 0}deg) scale(${slot.zoom || 1})`
            }}
            title={slot.name}
          />
        )}

        {slot.sourceType === 'external' && slot.externalUrl && (
          <iframe
            src={formatEmbedVideoUrl(slot.externalUrl)}
            allow="autoplay; encrypted-media; picture-in-picture"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              pointerEvents: 'none',
              transform: `rotate(${slot.rotation || 0}deg) scale(${slot.zoom || 1})`
            }}
            title={slot.name}
          />
        )}

        {/* Waiting placeholder */}
        {((slot.sourceType === 'smartphone_webrtc' && !remoteStream) ||
          (slot.sourceType === 'usb' && !usbStream) ||
          (slot.sourceType === 'external' && !slot.externalUrl)) && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
            padding: '0.6rem',
            background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.08) 0%, rgba(3, 6, 15, 0.92) 75%)',
            textAlign: 'center',
            pointerEvents: 'none'
          }}>
            <Camera size={24} color="rgba(255,255,255,0.4)" />
            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#fff' }}>
              {slot.sourceType === 'smartphone_webrtc'
                ? connectionState === 'connecting'
                  ? 'Connexion smartphone...'
                  : 'Smartphone non connecté'
                : slot.sourceType === 'usb'
                  ? 'Choisir caméra PC / USB'
                  : 'Coller un lien vidéo'}
            </div>
          </div>
        )}

        {/* Top Overlay: Tally + Assignment + Audio */}
        <div style={{
          position: 'absolute',
          top: '7px',
          left: '7px',
          right: '7px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.35rem',
          pointerEvents: 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
            <span style={{
              background: isFocused
                ? '#ef4444'
                : isInMosaic
                  ? '#f59e0b'
                  : 'rgba(15, 23, 42, 0.86)',
              color: isInMosaic && !isFocused ? '#000' : '#fff',
              padding: '2px 7px',
              borderRadius: '5px',
              fontSize: '0.65rem',
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <Radio size={10} />
              {isFocused ? 'EN DIRECT SEUL' : isInMosaic ? 'LIVE MOSAÏQUE' : 'EN VEILLE'}
            </span>
            <span style={{
              background: 'rgba(4, 12, 24, 0.88)',
              border: '1px solid rgba(0, 255, 170, 0.45)',
              color: '#00ffaa',
              padding: '2px 7px',
              borderRadius: '5px',
              fontSize: '0.68rem',
              fontWeight: 800
            }}>
              {assignment.title}
            </span>
          </div>

          <span style={{
            background: isAudioSelected ? 'rgba(16, 185, 129, 0.92)' : 'rgba(15, 23, 42, 0.82)',
            color: isAudioSelected ? '#000' : 'rgba(255,255,255,0.65)',
            padding: '2px 7px',
            borderRadius: '5px',
            fontSize: '0.65rem',
            fontWeight: 900,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px'
          }}>
            {isAudioSelected ? <Volume2 size={11} /> : <VolumeX size={11} />}
            {isAudioSelected ? 'SON' : 'MUET'}
          </span>
        </div>

        {/* Bottom Overlay: Score / View + Cam Name */}
        <div style={{
          position: 'absolute',
          bottom: '7px',
          left: '7px',
          right: '7px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.35rem',
          pointerEvents: 'none'
        }}>
          <div style={{
            background: 'rgba(5, 10, 22, 0.88)',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '0.7rem',
            fontWeight: 800,
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '72%'
          }}>
            {assignment.match && assignment.p1 && assignment.p2 ? (
              <span>
                {assignment.p1.name}{' '}
                <span style={{ color: '#FBBF24', margin: '0 3px' }}>
                  {assignment.match.score1} - {assignment.match.score2}
                </span>{' '}
                {assignment.p2.name}
              </span>
            ) : (
              <span>{slot.name} • {assignment.subtitle}</span>
            )}
          </div>

          <span style={{
            background: isFocused ? 'rgba(239,68,68,0.92)' : 'rgba(0,0,0,0.75)',
            color: '#fff',
            padding: '2px 7px',
            borderRadius: '5px',
            fontSize: '0.64rem',
            fontWeight: 800
          }}>
            {isFocused ? 'Revenir Mosaïque' : 'Diffuser seul'}
          </span>
        </div>
      </div>

      {/* Single Compact Control Row Under Video */}
      <div style={{
        padding: '0.45rem 0.55rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        background: 'rgba(4, 8, 18, 0.96)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          {/* Attitrer à */}
          <select
            className="input-field"
            value={assignmentSelectValue}
            onChange={(e) => handleAssignmentChange(e.target.value)}
            title="Attitrer cette caméra à un billard ou une autre vue"
            style={{
              flex: '1 1 115px',
              fontSize: '0.72rem',
              padding: '4px 6px',
              background: '#0b1426',
              color: '#FBBF24',
              fontWeight: 800
            }}
          >
            <optgroup label="🎱 Billards du Club">
              {sortedTables.map(t => (
                <option key={t.id} value={`table:${t.id}`}>
                  🎱 {t.name || `Billard ${t.number}`}
                </option>
              ))}
            </optgroup>
            <optgroup label="🎥 Match Spécial">
              <option value="live_match">🎥 Match Studio Live</option>
            </optgroup>
            <optgroup label="🏟️ Autres Vues">
              {CUSTOM_VIEW_PRESETS.map(p => (
                <option key={p} value={`preset:${p}`}>
                  🏟️ {p}
                </option>
              ))}
              <option value="custom_text">✏️ Titre libre...</option>
            </optgroup>
          </select>

          {/* Source Caméra */}
          <select
            className="input-field"
            value={
              slot.sourceType === 'usb' && slot.usbDeviceId
                ? `usb:${slot.usbDeviceId}`
                : slot.sourceType
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith('usb:')) {
                onUpdateSlot(slot.id, {
                  sourceType: 'usb' as DirectorCameraSourceType,
                  usbDeviceId: v.slice(4)
                });
              } else {
                onUpdateSlot(slot.id, {
                  sourceType: v as DirectorCameraSourceType
                });
              }
            }}
            title="Source vidéo de cette caméra"
            style={{
              flex: '1 1 115px',
              fontSize: '0.72rem',
              padding: '4px 6px',
              background: '#0b1426',
              color: '#fff',
              fontWeight: 700
            }}
          >
            <option value="smartphone_webrtc">📱 Smartphone (QR)</option>
            {videoDevices.map((d, idx) => (
              <option key={d.deviceId} value={`usb:${d.deviceId}`}>
                🎥 {d.label || `Caméra PC #${idx + 1}`}
              </option>
            ))}
            {videoDevices.length === 0 && (
              <option value="usb">🎥 Caméra USB / PC</option>
            )}
            <option value="vdo">📡 VDO.Ninja</option>
            <option value="external">🌐 Lien Externe</option>
          </select>

          {slot.sourceType === 'smartphone_webrtc' && (
            <button
              type="button"
              className="btn btn-neon"
              onClick={() => onOpenQr(slot.id)}
              style={{ width: 'auto', padding: '4px 7px', fontSize: '0.7rem', fontWeight: 900, color: '#000' }}
              title="QR Code pour connecter le smartphone"
            >
              <QrCode size={13} /> QR
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onSelectAudio(slot.id)}
            style={{
              width: 'auto',
              padding: '4px 7px',
              fontSize: '0.7rem',
              background: isAudioSelected ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              borderColor: isAudioSelected ? '#10B981' : 'rgba(255,255,255,0.18)',
              color: isAudioSelected ? '#34D399' : '#fff'
            }}
            title="Écouter uniquement le micro de cette caméra"
          >
            {isAudioSelected ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowAdvanced(v => !v)}
            style={{
              width: 'auto',
              padding: '4px 7px',
              fontSize: '0.7rem',
              background: showAdvanced ? 'rgba(255,255,255,0.15)' : 'transparent'
            }}
            title="Réglages de la caméra (Nom, Rotation, Zoom, Micro, Masquer)"
          >
            <Settings size={13} />
          </button>
        </div>

        {/* Custom title input if user chose custom_text */}
        {(editingCustomTitle || (slot.assignmentType === 'custom_view' && !CUSTOM_VIEW_PRESETS.includes(slot.customViewTitle || ''))) && (
          <input
            type="text"
            className="input-field"
            placeholder="Nom de la vue (ex: Table Finale, Podium...)"
            value={slot.customViewTitle || ''}
            onChange={(e) => onUpdateSlot(slot.id, { customViewTitle: e.target.value })}
            style={{ fontSize: '0.72rem', padding: '3px 7px' }}
          />
        )}

        {slot.sourceType === 'external' && (
          <input
            type="url"
            className="input-field"
            placeholder="Collez l'URL YouTube / Caméra IP..."
            value={slot.externalUrl || ''}
            onChange={(e) => onUpdateSlot(slot.id, { externalUrl: e.target.value })}
            style={{ fontSize: '0.72rem', padding: '3px 7px' }}
          />
        )}

        {/* Expandable Advanced Camera Controls */}
        {showAdvanced && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.3rem',
            paddingTop: '0.35rem',
            borderTop: '1px solid rgba(255,255,255,0.08)'
          }}>
            <input
              type="text"
              className="input-field"
              value={slot.name}
              onChange={(e) => onUpdateSlot(slot.id, { name: e.target.value })}
              style={{ width: '105px', padding: '2px 6px', fontSize: '0.72rem', fontWeight: 700 }}
              title="Renommer cette caméra"
            />
            {slot.sourceType === 'smartphone_webrtc' && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onReconnectWebRtc(slot.id)}
                style={{ width: 'auto', padding: '3px 6px', fontSize: '0.68rem' }}
                title="Reconnecter le smartphone"
              >
                <RefreshCw size={11} />
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { rotation: ((slot.rotation || 0) + 90) % 360 })}
              style={{ width: 'auto', padding: '3px 6px', fontSize: '0.68rem' }}
              title="Pivoter 90°"
            >
              <RotateCcw size={11} /> {slot.rotation || 0}°
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { zoom: Math.max(1, Math.round(((slot.zoom || 1) - 0.2) * 10) / 10) })}
              style={{ width: 'auto', padding: '3px 6px', fontSize: '0.68rem' }}
            >
              <ZoomOut size={11} />
            </button>
            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              {Math.round((slot.zoom || 1) * 100)}%
            </span>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { zoom: Math.min(3, Math.round(((slot.zoom || 1) + 0.2) * 10) / 10) })}
              style={{ width: 'auto', padding: '3px 6px', fontSize: '0.68rem' }}
            >
              <ZoomIn size={11} />
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { fillMode: slot.fillMode === 'contain' ? 'cover' : 'contain' })}
              style={{ width: 'auto', padding: '3px 6px', fontSize: '0.68rem' }}
            >
              {slot.fillMode === 'contain' ? 'Contain' : 'Cover'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { forceMuted: !slot.forceMuted })}
              style={{
                width: 'auto',
                padding: '3px 6px',
                fontSize: '0.68rem',
                color: slot.forceMuted ? '#f87171' : '#fff'
              }}
              title={slot.forceMuted ? 'Micro coupé' : 'Couper ce micro'}
            >
              {slot.forceMuted ? <MicOff size={11} /> : <Mic size={11} />}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { enabled: !slot.enabled })}
              style={{
                width: 'auto',
                padding: '3px 6px',
                fontSize: '0.68rem',
                color: slot.enabled ? '#34D399' : '#f87171'
              }}
              title={slot.enabled ? 'Masquer de la mosaïque' : 'Afficher dans la mosaïque'}
            >
              {slot.enabled ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>
            {canDelete && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onRemoveSlot(slot.id)}
                style={{ width: 'auto', padding: '3px 6px', fontSize: '0.68rem', color: '#f87171' }}
                title="Supprimer"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const MultiCamDirectorPanel: React.FC<MultiCamDirectorPanelProps> = ({ getAppBaseUrl }) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
  const [directorState, setDirectorState] = useState<MultiCamDirectorState>(() =>
    loadDirectorState(currentClub.id)
  );
  const [destinations, setDestinations] = useState<StreamDestinationsConfig>(() =>
    loadStreamDestinations(currentClub.id)
  );
  const [overlayConfig, setOverlayConfig] = useState<LiveOverlayConfig>(() =>
    loadLiveOverlayConfig(currentClub.id, 'live')
  );
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream | null>>({});
  const [usbStreams, setUsbStreams] = useState<Record<string, MediaStream | null>>({});
  const [rtcStates, setRtcStates] = useState<Record<string, string>>({});
  const [monitorAudioOnPc, setMonitorAudioOnPc] = useState<boolean>(true);
  const [qrModalCamId, setQrModalCamId] = useState<string | null>(null);
  const [showPlatformsModal, setShowPlatformsModal] = useState<boolean>(false);
  const [copiedCamUrl, setCopiedCamUrl] = useState<boolean>(false);
  const [showCustomRtmp, setShowCustomRtmp] = useState<boolean>(false);
  const [liveElapsedSec, setLiveElapsedSec] = useState<number>(0);

  const [broadcasterStatus, setBroadcasterStatus] = useState<BroadcasterStatusSnapshot>({
    connectedToRelay: false,
    ffmpegAvailable: null,
    isStreaming: false,
    bytesSent: 0,
    targetStatuses: {},
    lastError: null
  });

  const videoElementsRef = useRef<Record<string, HTMLVideoElement | null>>({});
  const broadcasterRef = useRef<LiveCompositeBroadcaster | null>(null);
  const signalingMapRef = useRef<Record<string, CameraSignalingHandle>>({});
  const peersMapRef = useRef<Record<string, { pc: RTCPeerConnection; sessionId: string }>>({});
  const usbStreamsRef = useRef<Record<string, { deviceId: string; stream: MediaStream }>>({});
  const viewerIdRef = useRef<string>(`pc_${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    setDirectorState(loadDirectorState(currentClub.id));
    setDestinations(loadStreamDestinations(currentClub.id));
    setOverlayConfig(loadLiveOverlayConfig(currentClub.id, 'live'));

    const unsubDir = subscribeToDirectorState(currentClub.id, setDirectorState);
    const unsubOv = subscribeToLiveOverlayConfig(currentClub.id, 'live', setOverlayConfig);
    return () => {
      unsubDir();
      unsubOv();
    };
  }, [currentClub.id]);

  const refreshVideoDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
    } catch {}
  };

  useEffect(() => {
    refreshVideoDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshVideoDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshVideoDevices);
    };
  }, []);

  useEffect(() => {
    const b = new LiveCompositeBroadcaster(setBroadcasterStatus);
    broadcasterRef.current = b;
    b.startRenderLoop();
    b.checkRelayAvailability(destinations.relayWsUrl);

    return () => {
      b.destroy();
      broadcasterRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mergedStreams: Record<string, MediaStream | null> = {};
    directorState.cameras.forEach(cam => {
      mergedStreams[cam.id] =
        cam.sourceType === 'smartphone_webrtc'
          ? (remoteStreams[cam.id] || null)
          : cam.sourceType === 'usb'
            ? (usbStreams[cam.id] || null)
            : null;
    });

    broadcasterRef.current?.updateContext({
      directorState,
      videoElements: videoElementsRef.current,
      mediaStreams: mergedStreams,
      tables,
      matches,
      players,
      tournaments,
      currentClub,
      overlayConfig
    });
  }, [directorState, remoteStreams, usbStreams, tables, matches, players, tournaments, currentClub, overlayConfig]);

  useEffect(() => {
    if (!broadcasterStatus.isStreaming) {
      setLiveElapsedSec(0);
      return;
    }
    const start = Date.now();
    const t = window.setInterval(() => {
      setLiveElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [broadcasterStatus.isStreaming]);

  const setupWebRtcForCamera = (camId: string) => {
    if (peersMapRef.current[camId]) {
      try { peersMapRef.current[camId].pc.close(); } catch {}
      delete peersMapRef.current[camId];
    }
    if (signalingMapRef.current[camId]) {
      signalingMapRef.current[camId].destroy();
      delete signalingMapRef.current[camId];
    }

    const viewerId = viewerIdRef.current;
    const pendingIce: RTCIceCandidateInit[] = [];
    const sig = createCameraSignalingChannel(currentClub.id, camId, {
      onSubscribed: () => sig.requestOffer(viewerId),
      onSenderOnline: () => {
        const curPeer = peersMapRef.current[camId]?.pc;
        if (!curPeer || curPeer.connectionState !== 'connected') {
          sig.requestOffer(viewerId);
        }
      },
      onOffer: async (sdp, sessionId, targetViewerId) => {
        if (targetViewerId !== viewerId) return;
        if (peersMapRef.current[camId]) {
          try { peersMapRef.current[camId].pc.close(); } catch {}
        }
        pendingIce.length = 0;
        const pc = new RTCPeerConnection(RTC_ICE_CONFIG);
        peersMapRef.current[camId] = { pc, sessionId };
        setRtcStates(prev => ({ ...prev, [camId]: 'connecting' }));

        pc.ontrack = (ev) => {
          const stream = ev.streams?.[0] || new MediaStream([ev.track]);
          setRemoteStreams(prev => ({ ...prev, [camId]: stream }));
        };

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            sig.sendIceCandidate(ev.candidate.toJSON(), 'receiver', sessionId, viewerId);
          }
        };

        pc.onconnectionstatechange = () => {
          const st = pc.connectionState;
          setRtcStates(prev => ({ ...prev, [camId]: st }));
          if (st === 'failed' || st === 'disconnected' || st === 'closed') {
            setRemoteStreams(prev => ({ ...prev, [camId]: null }));
          }
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          for (const c of pendingIce) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
          }
          pendingIce.length = 0;
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (pc.localDescription) {
            sig.sendAnswer(pc.localDescription, sessionId, viewerId);
          }
        } catch (err) {
          console.warn(`WebRTC offer error (${camId}):`, err);
        }
      },
      onIceCandidate: async (candidate, role, sessionId, targetViewerId) => {
        const entry = peersMapRef.current[camId];
        if (targetViewerId !== viewerId || role !== 'sender' || !entry || entry.sessionId !== sessionId) return;
        if (entry.pc.remoteDescription) {
          try { await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
        } else {
          pendingIce.push(candidate);
        }
      }
    });
    signalingMapRef.current[camId] = sig;
  };

  const webrtcKey = directorState.cameras
    .filter(c => c.enabled && c.sourceType === 'smartphone_webrtc')
    .map(c => c.id)
    .join(',');

  useEffect(() => {
    const activeIds = new Set(webrtcKey ? webrtcKey.split(',') : []);

    Object.keys(signalingMapRef.current).forEach(camId => {
      if (!activeIds.has(camId)) {
        signalingMapRef.current[camId].destroy();
        delete signalingMapRef.current[camId];
        if (peersMapRef.current[camId]) {
          try { peersMapRef.current[camId].pc.close(); } catch {}
          delete peersMapRef.current[camId];
        }
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[camId];
          return next;
        });
      }
    });

    activeIds.forEach(camId => {
      if (!signalingMapRef.current[camId]) {
        setupWebRtcForCamera(camId);
      }
    });
  }, [webrtcKey, currentClub.id]);

  useEffect(() => {
    return () => {
      Object.values(signalingMapRef.current).forEach(s => s.destroy());
      Object.values(peersMapRef.current).forEach(p => {
        try { p.pc.close(); } catch {}
      });
      Object.values(usbStreamsRef.current).forEach(u => {
        u.stream.getTracks().forEach(t => t.stop());
      });
    };
  }, []);

  const usbKey = directorState.cameras
    .filter(c => c.enabled && c.sourceType === 'usb')
    .map(c => `${c.id}:${c.usbDeviceId || 'default'}`)
    .join('|');

  useEffect(() => {
    const wanted = new Map<string, string>();
    directorState.cameras.forEach(c => {
      if (c.enabled && c.sourceType === 'usb') {
        wanted.set(c.id, c.usbDeviceId || 'default');
      }
    });

    Object.keys(usbStreamsRef.current).forEach(camId => {
      const cur = usbStreamsRef.current[camId];
      if (!wanted.has(camId) || wanted.get(camId) !== cur.deviceId) {
        cur.stream.getTracks().forEach(t => t.stop());
        delete usbStreamsRef.current[camId];
        setUsbStreams(prev => {
          const next = { ...prev };
          delete next[camId];
          return next;
        });
      }
    });

    wanted.forEach(async (devId, camId) => {
      if (usbStreamsRef.current[camId]) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: devId !== 'default'
            ? { deviceId: { exact: devId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
        usbStreamsRef.current[camId] = { deviceId: devId, stream };
        setUsbStreams(prev => ({ ...prev, [camId]: stream }));
        refreshVideoDevices();
      } catch {
        try {
          const videoOnly = await navigator.mediaDevices.getUserMedia({
            video: devId !== 'default' ? { deviceId: { exact: devId } } : true,
            audio: false
          });
          usbStreamsRef.current[camId] = { deviceId: devId, stream: videoOnly };
          setUsbStreams(prev => ({ ...prev, [camId]: videoOnly }));
        } catch {}
      }
    });
  }, [usbKey]);

  const updateDirector = (next: MultiCamDirectorState) => {
    setDirectorState(next);
    saveDirectorState(currentClub.id, next, true);
  };

  const updateDestinations = (patch: Partial<StreamDestinationsConfig>) => {
    const next = { ...destinations, ...patch };
    setDestinations(next);
    saveStreamDestinations(currentClub.id, next);
  };

  const handleSelectFocus = (cameraId: string) => {
    if (directorState.broadcastMode === 'single' && directorState.focusedCameraId === cameraId) {
      updateDirector({ ...directorState, broadcastMode: 'mosaic', focusedCameraId: null });
    } else {
      updateDirector({
        ...directorState,
        broadcastMode: 'single',
        focusedCameraId: cameraId,
        activeAudioCameraId: cameraId
      });
    }
  };

  const handleReturnToMosaic = () => {
    updateDirector({ ...directorState, broadcastMode: 'mosaic', focusedCameraId: null });
  };

  const handleSelectAudio = (cameraId: string) => {
    updateDirector({ ...directorState, activeAudioCameraId: cameraId });
  };

  const handleUpdateSlot = (cameraId: string, patch: Partial<DirectorCameraSlot>) => {
    updateDirector({
      ...directorState,
      cameras: directorState.cameras.map(c => (c.id === cameraId ? { ...c, ...patch } : c))
    });
  };

  const handleAddCamera = () => {
    if (directorState.cameras.length >= 8) {
      alert('Maximum 8 caméras simultanées dans la régie.');
      return;
    }
    const nextNum = directorState.cameras.length + 1;
    const newSlot: DirectorCameraSlot = {
      id: `cam_${Date.now().toString(36).slice(-4)}`,
      name: `Caméra ${nextNum}`,
      enabled: true,
      sourceType: 'smartphone_webrtc',
      assignmentType: 'custom_view',
      customViewTitle: "Vue d'ensemble Salle",
      customViewShowAllScores: true,
      rotation: 0,
      zoom: 1,
      fillMode: 'cover',
      forceMuted: false
    };
    updateDirector({ ...directorState, cameras: [...directorState.cameras, newSlot] });
  };

  const handleRemoveSlot = (cameraId: string) => {
    if (directorState.cameras.length <= 2) return;
    const remaining = directorState.cameras.filter(c => c.id !== cameraId);
    updateDirector({
      ...directorState,
      cameras: remaining,
      focusedCameraId: directorState.focusedCameraId === cameraId ? null : directorState.focusedCameraId,
      broadcastMode: directorState.focusedCameraId === cameraId ? 'mosaic' : directorState.broadcastMode,
      activeAudioCameraId: directorState.activeAudioCameraId === cameraId ? (remaining[0]?.id || null) : directorState.activeAudioCameraId
    });
  };

  const registerVideoEl = useRef((cameraId: string, el: HTMLVideoElement | null) => {
    videoElementsRef.current[cameraId] = el;
  }).current;

  const sortedTables = Object.values(tables).sort((a, b) => a.number - b.number);
  const enabledCount = directorState.cameras.filter(c => c.enabled).length;
  const focusedCam = directorState.focusedCameraId
    ? directorState.cameras.find(c => c.id === directorState.focusedCameraId) || null
    : null;

  const focusedAssignment = focusedCam
    ? resolveCameraAssignment(focusedCam, { tables, matches, players, tournaments, currentClub })
    : null;

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const h = Math.floor(m / 60);
    return h > 0
      ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const activePlatformsLabel = [
    destinations.facebookEnabled && destinations.facebookStreamKey.trim() ? 'Facebook' : null,
    destinations.youtubeEnabled && destinations.youtubeStreamKey.trim() ? 'YouTube' : null,
    destinations.customEnabled && destinations.customStreamKey.trim() ? 'RTMP' : null
  ].filter(Boolean);

  const handleToggleLiveStream = async () => {
    if (broadcasterStatus.isStreaming) {
      broadcasterRef.current?.stopLiveStream();
      updateDirector({ ...directorState, isLiveStreaming: false, liveStartedAt: null });
      return;
    }

    if (activePlatformsLabel.length === 0) {
      setShowPlatformsModal(true);
      return;
    }

    try {
      await broadcasterRef.current?.startLiveStream(destinations);
      updateDirector({ ...directorState, isLiveStreaming: true, liveStartedAt: Date.now() });
    } catch (err: any) {
      alert(err?.message || 'Impossible de démarrer la diffusion Live.');
      setShowPlatformsModal(true);
    }
  };

  const qrCamObj = qrModalCamId ? directorState.cameras.find(c => c.id === qrModalCamId) : null;
  const qrCamUrl = qrModalCamId
    ? `${getAppBaseUrl()}/?camera=${encodeURIComponent(qrModalCamId)}&club=${encodeURIComponent(currentClub.id)}`
    : '';

  const renderPlatformStatusBadge = (id: string) => {
    const st = broadcasterStatus.targetStatuses[id];
    if (!st || st.status === 'idle' || st.status === 'stopped') return null;
    if (st.status === 'connecting') {
      return (
        <span style={{ fontSize: '0.68rem', background: 'rgba(245,158,11,0.2)', color: '#fbbf24', padding: '2px 7px', borderRadius: '999px', fontWeight: 800 }}>
          🟡 {st.label || id}...
        </span>
      );
    }
    if (st.status === 'live') {
      return (
        <span style={{ fontSize: '0.68rem', background: '#ef4444', color: '#fff', padding: '2px 7px', borderRadius: '999px', fontWeight: 900 }}>
          🔴 {st.label || id}
        </span>
      );
    }
    return (
      <span style={{ fontSize: '0.68rem', background: 'rgba(239,68,68,0.2)', color: '#fca5a5', padding: '2px 7px', borderRadius: '999px', fontWeight: 800 }} title={st.message}>
        ⚠️ {st.label || id}
      </span>
    );
  };

  return (
    <div style={{
      maxWidth: '1440px',
      width: '100%',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.9rem'
    }}>
      {/* 1. BARRE DE RÉGIE COMPACTE (1 SEULE LIGNE) */}
      <div style={{
        background: directorState.broadcastMode === 'single'
          ? 'linear-gradient(90deg, rgba(185, 28, 28, 0.25), rgba(8, 14, 28, 0.94))'
          : 'linear-gradient(90deg, rgba(245, 158, 11, 0.16), rgba(8, 14, 28, 0.94))',
        border: `1.5px solid ${directorState.broadcastMode === 'single' ? '#ef4444' : 'rgba(245, 158, 11, 0.6)'}`,
        borderRadius: '14px',
        padding: '0.7rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.65rem'
      }}>
        {/* Left: Mode Indicator & Return to Mosaic */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{
            background: directorState.broadcastMode === 'single' ? '#ef4444' : '#f59e0b',
            color: directorState.broadcastMode === 'single' ? '#fff' : '#000',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '0.74rem',
            fontWeight: 900,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <Radio size={13} />
            {directorState.broadcastMode === 'single' ? 'CAMÉRA SEULE' : 'ÉCRAN MULTIPLE'}
          </span>

          <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff' }}>
            {directorState.broadcastMode === 'single' && focusedCam ? (
              <>
                <span style={{ color: '#fca5a5' }}>{focusedCam.name}</span>{' '}
                <span style={{ color: '#00ffaa' }}>({focusedAssignment?.title})</span>
              </>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Cliquez sur une caméra pour l'isoler + écouter son son
              </span>
            )}
          </span>

          {directorState.broadcastMode === 'single' && (
            <button
              type="button"
              className="btn btn-neon"
              onClick={handleReturnToMosaic}
              style={{
                width: 'auto',
                padding: '0.45rem 0.9rem',
                fontSize: '0.78rem',
                fontWeight: 900,
                background: '#f59e0b',
                borderColor: '#f59e0b',
                color: '#000'
              }}
            >
              ⊞ Revenir à l'Écran Multiple
            </button>
          )}

          {directorState.broadcastMode === 'mosaic' && enabledCount === 2 && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                const nextLayout: DirectorMosaicLayout =
                  directorState.mosaicLayout === 'stacked' ? 'side_by_side' : 'stacked';
                updateDirector({ ...directorState, mosaicLayout: nextLayout });
              }}
              style={{ width: 'auto', fontSize: '0.72rem', padding: '4px 8px' }}
            >
              {directorState.mosaicLayout === 'stacked' ? '◫ Côte à côte' : '⊟ Haut / Bas'}
            </button>
          )}
        </div>

        {/* Right: Audio, Add Cam, Platforms Config, Start Live, TV Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          {renderPlatformStatusBadge('facebook')}
          {renderPlatformStatusBadge('youtube')}

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setMonitorAudioOnPc(v => !v)}
            style={{
              width: 'auto',
              fontSize: '0.74rem',
              padding: '5px 9px',
              background: monitorAudioOnPc ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255,255,255,0.05)',
              borderColor: monitorAudioOnPc ? '#10b981' : 'rgba(255,255,255,0.2)',
              color: monitorAudioOnPc ? '#34d399' : '#fff'
            }}
            title="Activer/Couper l'écoute sur le PC"
          >
            {monitorAudioOnPc ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {monitorAudioOnPc ? 'Écoute PC' : 'PC Muet'}
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={handleAddCamera}
            style={{ width: 'auto', fontSize: '0.74rem', padding: '5px 9px', color: '#00ffaa', borderColor: 'rgba(0,255,170,0.4)' }}
          >
            <Plus size={14} /> Caméra
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowPlatformsModal(true)}
            style={{
              width: 'auto',
              fontSize: '0.74rem',
              padding: '5px 10px',
              borderColor: activePlatformsLabel.length > 0 ? 'rgba(59, 130, 246, 0.6)' : 'rgba(245, 158, 11, 0.5)',
              color: activePlatformsLabel.length > 0 ? '#93c5fd' : '#fbbf24'
            }}
          >
            <Settings size={14} />
            {activePlatformsLabel.length > 0
              ? `Clés Live (${activePlatformsLabel.join(' + ')})`
              : 'Configurer Facebook / YouTube'}
          </button>

          <button
            type="button"
            className="btn btn-neon"
            onClick={handleToggleLiveStream}
            style={{
              width: 'auto',
              padding: '0.5rem 1rem',
              fontSize: '0.8rem',
              fontWeight: 900,
              background: broadcasterStatus.isStreaming ? '#ef4444' : 'linear-gradient(135deg, #ef4444, #f59e0b)',
              borderColor: 'transparent',
              color: '#fff',
              boxShadow: broadcasterStatus.isStreaming ? '0 0 18px rgba(239,68,68,0.65)' : 'none'
            }}
          >
            {broadcasterStatus.isStreaming ? (
              <>⏹ ARRÊTER ({formatDuration(liveElapsedSec)})</>
            ) : (
              <>
                <Play size={14} />
                {activePlatformsLabel.length > 0
                  ? `🔴 LANCER LIVE (${activePlatformsLabel.join(' + ')})`
                  : '🔴 LANCER LE LIVE'}
              </>
            )}
          </button>

          <a
            href={`${getAppBaseUrl()}/?overlay=director&club=${encodeURIComponent(currentClub.id)}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline"
            style={{ width: 'auto', fontSize: '0.74rem', padding: '5px 9px', textDecoration: 'none', color: '#00ffaa', borderColor: 'rgba(0,255,170,0.4)' }}
            title="Ouvrir la sortie TV plein écran"
          >
            <Tv size={14} /> Sortie TV
          </a>
        </div>
      </div>

      {broadcasterStatus.lastError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.14)',
          border: '1px solid rgba(239, 68, 68, 0.45)',
          color: '#fecaca',
          padding: '0.5rem 0.85rem',
          borderRadius: '10px',
          fontSize: '0.76rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem'
        }}>
          <span>⚠️ {broadcasterStatus.lastError}</span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowPlatformsModal(true)}
            style={{ width: 'auto', fontSize: '0.7rem', padding: '2px 8px' }}
          >
            Voir détails
          </button>
        </div>
      )}

      {/* 2. GRILLE MULTI-CAMÉRAS (VISIBLE IMMÉDIATEMENT SANS SCROLLER) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '0.85rem'
      }}>
        {directorState.cameras.map(slot => (
          <CameraTileCard
            key={slot.id}
            slot={slot}
            directorState={directorState}
            sortedTables={sortedTables}
            videoDevices={videoDevices}
            remoteStream={remoteStreams[slot.id] || null}
            usbStream={usbStreams[slot.id] || null}
            connectionState={rtcStates[slot.id] || 'idle'}
            monitorAudioOnPc={monitorAudioOnPc}
            onSelectFocus={handleSelectFocus}
            onSelectAudio={handleSelectAudio}
            onUpdateSlot={handleUpdateSlot}
            onRemoveSlot={handleRemoveSlot}
            onOpenQr={setQrModalCamId}
            onReconnectWebRtc={setupWebRtcForCamera}
            registerVideoEl={registerVideoEl}
            canDelete={directorState.cameras.length > 2}
          />
        ))}
      </div>

      {/* 3. MODALE CONFIGURATION FACEBOOK / YOUTUBE & RELAIS PC */}
      {showPlatformsModal && (
        <div
          onClick={() => setShowPlatformsModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.82)',
            zIndex: 10050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            className="glass-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '720px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.5rem',
              borderRadius: '18px',
              border: '2px solid rgba(0, 255, 170, 0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem' }}>
              <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Radio size={20} color="#ef4444" /> Diffusion Directe Facebook & YouTube
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => broadcasterRef.current?.checkRelayAvailability(destinations.relayWsUrl)}
                style={{ width: 'auto', fontSize: '0.74rem', padding: '4px 10px' }}
              >
                {broadcasterStatus.connectedToRelay ? (
                  broadcasterStatus.ffmpegAvailable ? <CheckCircle2 size={14} color="#34d399" /> : <AlertTriangle size={14} color="#fbbf24" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {broadcasterStatus.connectedToRelay
                  ? broadcasterStatus.ffmpegAvailable ? 'Relais + FFmpeg OK' : 'FFmpeg manquant'
                  : 'Tester Relais PC'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
              {/* FACEBOOK */}
              <div style={{
                background: destinations.facebookEnabled ? 'rgba(24, 119, 242, 0.12)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${destinations.facebookEnabled ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '12px',
                padding: '0.9rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontWeight: 900, fontSize: '0.9rem', color: '#60a5fa' }}>
                  <input
                    type="checkbox"
                    checked={destinations.facebookEnabled}
                    onChange={(e) => updateDestinations({ facebookEnabled: e.target.checked })}
                  />
                  <Facebook size={17} /> Facebook Live
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Collez votre clé de stream Facebook..."
                  value={destinations.facebookStreamKey}
                  onChange={(e) => updateDestinations({ facebookStreamKey: e.target.value })}
                  style={{ fontSize: '0.78rem', padding: '0.5rem 0.7rem' }}
                />
                <a
                  href="https://www.facebook.com/live/producer"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.72rem', color: '#93c5fd', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  Ouvrir Facebook Live Producer <ExternalLink size={11} />
                </a>
              </div>

              {/* YOUTUBE */}
              <div style={{
                background: destinations.youtubeEnabled ? 'rgba(255, 0, 51, 0.1)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${destinations.youtubeEnabled ? '#ff3344' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '12px',
                padding: '0.9rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontWeight: 900, fontSize: '0.9rem', color: '#ff6b81' }}>
                  <input
                    type="checkbox"
                    checked={destinations.youtubeEnabled}
                    onChange={(e) => updateDestinations({ youtubeEnabled: e.target.checked })}
                  />
                  <Youtube size={17} /> YouTube Live
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Collez votre clé de stream YouTube..."
                  value={destinations.youtubeStreamKey}
                  onChange={(e) => updateDestinations({ youtubeStreamKey: e.target.value })}
                  style={{ fontSize: '0.78rem', padding: '0.5rem 0.7rem' }}
                />
                <a
                  href="https://studio.youtube.com/channel/UC/livestreaming"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.72rem', color: '#fda4af', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  Ouvrir YouTube Studio Live <ExternalLink size={11} />
                </a>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowCustomRtmp(v => !v)}
              style={{ width: 'auto', alignSelf: 'flex-start', fontSize: '0.74rem', padding: '4px 10px' }}
            >
              {showCustomRtmp ? 'Masquer autre RTMP' : '+ Autre plateforme (Twitch / TikTok / RTMP)'}
            </button>

            {showCustomRtmp && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={destinations.customEnabled}
                    onChange={(e) => updateDestinations({ customEnabled: e.target.checked })}
                  />
                  Activer 3ème destination RTMP
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Serveur RTMP (rtmp://...)"
                  value={destinations.customRtmpUrl}
                  onChange={(e) => updateDestinations({ customRtmpUrl: e.target.value })}
                  style={{ fontSize: '0.75rem', padding: '0.45rem' }}
                />
                <input
                  type="password"
                  className="input-field"
                  placeholder="Clé de stream"
                  value={destinations.customStreamKey}
                  onChange={(e) => updateDestinations({ customStreamKey: e.target.value })}
                  style={{ fontSize: '0.75rem', padding: '0.45rem' }}
                />
              </div>
            )}

            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '10px',
              padding: '0.7rem 0.9rem',
              fontSize: '0.74rem',
              color: '#fef3c7',
              lineHeight: '1.45'
            }}>
              <b>Prérequis sur le PC du club :</b>
              <ul style={{ margin: '3px 0 0 1.1rem', padding: 0 }}>
                <li>Installer FFmpeg si absent (1 fois) : <code>winget install Gyan.FFmpeg</code></li>
                <li>Si l'appli est ouverte via Vercel/GitHub Pages, lancez <code>npm run relay</code> sur le PC pour relayer le flux.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowPlatformsModal(false)}
                style={{ width: 'auto', padding: '0.55rem 1.1rem' }}
              >
                Fermer
              </button>
              <button
                type="button"
                className="btn btn-neon"
                onClick={() => {
                  setShowPlatformsModal(false);
                  if (!broadcasterStatus.isStreaming && activePlatformsLabel.length > 0) {
                    handleToggleLiveStream();
                  }
                }}
                style={{ width: 'auto', padding: '0.55rem 1.2rem', fontWeight: 900, color: '#000' }}
              >
                Enregistrer {activePlatformsLabel.length > 0 && !broadcasterStatus.isStreaming ? '& Lancer le Live' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODALE QR CODE SMARTPHONE CAMERA */}
      {qrModalCamId && qrCamObj && (
        <div
          onClick={() => setQrModalCamId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.82)',
            zIndex: 10050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            className="glass-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '400px',
              width: '100%',
              padding: '1.4rem',
              borderRadius: '18px',
              border: '2px solid rgba(0, 255, 170, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.9rem',
              textAlign: 'center'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 900, fontSize: '1.1rem', color: '#00ffaa' }}>
              <Smartphone size={20} /> Connecter {qrCamObj.name}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              Flashez ce QR Code avec l'appareil photo du smartphone (vidéo + micro en direct sans application).
            </div>
            <div style={{ background: '#fff', padding: '12px', borderRadius: '12px' }}>
              <QRCode value={qrCamUrl} size={190} />
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', width: '100%' }}>
              <input
                type="text"
                readOnly
                className="input-field"
                value={qrCamUrl}
                style={{ flex: 1, fontSize: '0.7rem', padding: '0.4rem 0.6rem' }}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  navigator.clipboard.writeText(qrCamUrl);
                  setCopiedCamUrl(true);
                  setTimeout(() => setCopiedCamUrl(false), 2000);
                }}
                style={{ width: 'auto', padding: '0.4rem 0.7rem' }}
              >
                {copiedCamUrl ? <Check size={14} color="#00ffaa" /> : <Copy size={14} />}
              </button>
            </div>
            <button
              type="button"
              className="btn btn-neon"
              onClick={() => setQrModalCamId(null)}
              style={{ width: '100%', justifyContent: 'center', fontWeight: 900, color: '#000' }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiCamDirectorPanel;
