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
  Maximize2,
  Mic,
  MicOff,
  MonitorPlay,
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
  const isHighlightedOnAir = isFocused || isInMosaic;

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
    ? '0 0 28px rgba(239, 68, 68, 0.55), inset 0 0 20px rgba(239, 68, 68, 0.2)'
    : isInMosaic
      ? '0 0 14px rgba(245, 158, 11, 0.2)'
      : 'none';

  return (
    <div style={{
      background: isFocused ? 'rgba(40, 10, 16, 0.92)' : 'rgba(7, 13, 26, 0.92)',
      border: borderStyle,
      boxShadow: cardShadow,
      borderRadius: '14px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      opacity: slot.enabled ? 1 : 0.62,
      transition: 'all 0.2s ease'
    }}>
      {/* Clickable Live Video Viewport */}
      <div
        onClick={() => {
          if (!slot.enabled) {
            onUpdateSlot(slot.id, { enabled: true });
          }
          onSelectFocus(slot.id);
        }}
        title={
          isFocused
            ? 'Caméra actuellement diffusée seule — Cliquez pour revenir à l\'Écran Multiple'
            : 'Cliquez ici pour mettre en surbrillance, diffuser cette caméra seule et écouter son son'
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

        {/* Waiting placeholder when no stream yet */}
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
            gap: '0.45rem',
            padding: '0.75rem',
            background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.1) 0%, rgba(3, 6, 15, 0.92) 75%)',
            textAlign: 'center',
            pointerEvents: 'none'
          }}>
            <Camera size={28} color="rgba(255,255,255,0.45)" />
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff' }}>
              {slot.sourceType === 'smartphone_webrtc'
                ? connectionState === 'connecting'
                  ? 'Connexion du smartphone en cours...'
                  : 'Aucun smartphone connecté'
                : slot.sourceType === 'usb'
                  ? 'Sélectionnez une caméra USB ci-dessous'
                  : 'Collez un lien vidéo externe'}
            </div>
            {slot.sourceType === 'smartphone_webrtc' && (
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}>
                Flashez le QR Code (« 📱 QR Code ») avec le téléphone
              </div>
            )}
          </div>
        )}

        {/* Top Overlay: Tally + Assignment + Score */}
        <div style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          right: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.4rem',
          pointerEvents: 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{
              background: isFocused
                ? '#ef4444'
                : isInMosaic
                  ? '#f59e0b'
                  : 'rgba(15, 23, 42, 0.85)',
              color: isInMosaic && !isFocused ? '#000' : '#fff',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '0.68rem',
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: isFocused ? '0 0 12px rgba(239,68,68,0.8)' : 'none'
            }}>
              <Radio size={11} />
              {isFocused
                ? 'EN DIRECT SEUL'
                : isInMosaic
                  ? 'LIVE MOSAÏQUE'
                  : 'EN VEILLE'}
            </span>

            <span style={{
              background: 'rgba(4, 12, 24, 0.88)',
              border: '1px solid rgba(0, 255, 170, 0.45)',
              color: '#00ffaa',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '0.7rem',
              fontWeight: 800
            }}>
              {assignment.title}
            </span>
          </div>

          <span style={{
            background: isAudioSelected ? 'rgba(16, 185, 129, 0.92)' : 'rgba(15, 23, 42, 0.82)',
            color: isAudioSelected ? '#000' : 'rgba(255,255,255,0.65)',
            padding: '3px 8px',
            borderRadius: '6px',
            fontSize: '0.68rem',
            fontWeight: 900,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {isAudioSelected ? <Volume2 size={12} /> : <VolumeX size={12} />}
            {isAudioSelected ? 'SON ACTIF' : 'MUET'}
          </span>
        </div>

        {/* Bottom Overlay: Match Score or View Subtitle + Click Hint */}
        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          right: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.4rem',
          pointerEvents: 'none'
        }}>
          <div style={{
            background: 'rgba(5, 10, 22, 0.88)',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: '7px',
            padding: '4px 9px',
            fontSize: '0.72rem',
            fontWeight: 800,
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '70%'
          }}>
            {assignment.match && assignment.p1 && assignment.p2 ? (
              <span>
                {assignment.p1.name}{' '}
                <span style={{ color: '#FBBF24', margin: '0 4px' }}>
                  {assignment.match.score1} - {assignment.match.score2}
                </span>{' '}
                {assignment.p2.name}
              </span>
            ) : (
              <span>{assignment.subtitle}</span>
            )}
          </div>

          <span style={{
            background: isHighlightedOnAir && isFocused ? 'rgba(239,68,68,0.9)' : 'rgba(0,0,0,0.75)',
            color: '#fff',
            padding: '3px 8px',
            borderRadius: '6px',
            fontSize: '0.66rem',
            fontWeight: 800
          }}>
            {isFocused ? 'Cliquer = Retour Mosaïque' : 'Cliquer = Diffuser seul + Son'}
          </span>
        </div>
      </div>

      {/* Controls Toolbar Under Video */}
      <div style={{
        padding: '0.7rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.55rem',
        background: 'rgba(4, 8, 18, 0.95)'
      }}>
        {/* Row 1: Camera Name + Enable/Disable + Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: '120px' }}>
            <input
              type="text"
              className="input-field"
              value={slot.name}
              onChange={(e) => onUpdateSlot(slot.id, { name: e.target.value })}
              style={{
                padding: '3px 7px',
                fontSize: '0.78rem',
                fontWeight: 800,
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '6px',
                maxWidth: '130px'
              }}
              title="Renommer cette caméra"
            />
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onSelectAudio(slot.id)}
              style={{
                width: 'auto',
                padding: '4px 8px',
                fontSize: '0.7rem',
                fontWeight: 800,
                background: isAudioSelected ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                borderColor: isAudioSelected ? '#10B981' : 'rgba(255,255,255,0.18)',
                color: isAudioSelected ? '#34D399' : '#fff'
              }}
              title="Écouter uniquement le micro de cette caméra"
            >
              {isAudioSelected ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {isAudioSelected ? 'Écoutée' : 'Écouter'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { forceMuted: !slot.forceMuted })}
              style={{
                width: 'auto',
                padding: '4px 7px',
                fontSize: '0.68rem',
                color: slot.forceMuted ? '#f87171' : 'rgba(255,255,255,0.8)',
                borderColor: slot.forceMuted ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.16)'
              }}
              title={slot.forceMuted ? 'Micro bloqué (cliquer pour réactiver)' : 'Couper le micro de cette caméra'}
            >
              {slot.forceMuted ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { enabled: !slot.enabled })}
              style={{
                width: 'auto',
                padding: '4px 7px',
                fontSize: '0.68rem',
                color: slot.enabled ? '#34D399' : '#f87171',
                borderColor: slot.enabled ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)'
              }}
              title={slot.enabled ? 'Incluse dans la mosaïque (cliquer pour masquer)' : 'Masquée de la mosaïque (cliquer pour activer)'}
            >
              {slot.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            {canDelete && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onRemoveSlot(slot.id)}
                style={{ width: 'auto', padding: '4px 7px', fontSize: '0.68rem', color: '#f87171', borderColor: 'rgba(248,113,113,0.35)' }}
                title="Retirer cette caméra"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Attitrer à (Billard ou Vue souhaitée) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', color: '#FBBF24', fontWeight: 800, whiteSpace: 'nowrap' }}>
              Attitrer à :
            </span>
            <select
              className="input-field"
              value={assignmentSelectValue}
              onChange={(e) => handleAssignmentChange(e.target.value)}
              style={{
                flex: 1,
                fontSize: '0.75rem',
                padding: '4px 7px',
                background: '#0b1426',
                color: '#fff',
                fontWeight: 700
              }}
            >
              <optgroup label="🎱 Billards du Club (Score automatique)">
                {sortedTables.map(t => {
                  const tm = t.currentMatchId ? matches[t.currentMatchId] : undefined;
                  const p1n = tm && tm.status !== 'finished' ? players[tm.player1Id]?.name : '';
                  const p2n = tm && tm.status !== 'finished' ? players[tm.player2Id]?.name : '';
                  return (
                    <option key={t.id} value={`table:${t.id}`}>
                      🎱 {t.name || `Billard ${t.number}`}{p1n && p2n ? ` (${p1n} vs ${p2n})` : ''}
                    </option>
                  );
                })}
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
                <option value="custom_text">✏️ Titre de vue libre...</option>
              </optgroup>
            </select>
          </div>

          {(editingCustomTitle || (slot.assignmentType === 'custom_view' && !CUSTOM_VIEW_PRESETS.includes(slot.customViewTitle || ''))) && (
            <input
              type="text"
              className="input-field"
              placeholder="Nom de la vue (ex: Table d'honneur, Bar, Remise coupes...)"
              value={slot.customViewTitle || ''}
              onChange={(e) => onUpdateSlot(slot.id, { customViewTitle: e.target.value })}
              style={{ fontSize: '0.74rem', padding: '4px 8px' }}
            />
          )}
        </div>

        {/* Row 3: Source Caméra (Smartphone QR, USB, VDO, Externe) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 800, whiteSpace: 'nowrap' }}>
            Source :
          </span>
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
            style={{
              flex: 1,
              minWidth: '140px',
              fontSize: '0.74rem',
              padding: '4px 7px',
              background: '#0b1426',
              color: '#fff',
              fontWeight: 700
            }}
          >
            <option value="smartphone_webrtc">📱 Smartphone Sans-Fil (QR Code)</option>
            {videoDevices.map((d, idx) => (
              <option key={d.deviceId} value={`usb:${d.deviceId}`}>
                🎥 {d.label || `Caméra PC / USB #${idx + 1}`}
              </option>
            ))}
            {videoDevices.length === 0 && (
              <option value="usb">🎥 Caméra USB / HDMI du PC</option>
            )}
            <option value="vdo">📡 VDO.Ninja (Sans-fil secours)</option>
            <option value="external">🌐 Lien Vidéo Externe</option>
          </select>

          {slot.sourceType === 'smartphone_webrtc' && (
            <>
              <button
                type="button"
                className="btn btn-neon"
                onClick={() => onOpenQr(slot.id)}
                style={{ width: 'auto', padding: '4px 9px', fontSize: '0.72rem', fontWeight: 900, color: '#000' }}
                title="Afficher le QR Code pour connecter un smartphone sur cette caméra"
              >
                <QrCode size={13} /> QR Code
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onReconnectWebRtc(slot.id)}
                style={{ width: 'auto', padding: '4px 7px', fontSize: '0.7rem' }}
                title="Relancer la connexion vidéo avec le smartphone"
              >
                <RefreshCw size={12} />
              </button>
            </>
          )}
        </div>

        {slot.sourceType === 'external' && (
          <input
            type="url"
            className="input-field"
            placeholder="Collez l'URL YouTube / Caméra IP..."
            value={slot.externalUrl || ''}
            onChange={(e) => onUpdateSlot(slot.id, { externalUrl: e.target.value })}
            style={{ fontSize: '0.73rem', padding: '4px 8px' }}
          />
        )}

        {/* Row 4: Image Framing Tools (Rotate, Zoom, Fill) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.45rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { rotation: ((slot.rotation || 0) + 90) % 360 })}
              style={{ width: 'auto', padding: '2px 7px', fontSize: '0.68rem' }}
              title="Pivoter 90°"
            >
              <RotateCcw size={11} /> {slot.rotation || 0}°
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { zoom: Math.max(1, Math.round(((slot.zoom || 1) - 0.2) * 10) / 10) })}
              style={{ width: 'auto', padding: '2px 6px', fontSize: '0.68rem' }}
              title="Dézoomer"
            >
              <ZoomOut size={11} />
            </button>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', minWidth: '30px', textAlign: 'center' }}>
              {Math.round((slot.zoom || 1) * 100)}%
            </span>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { zoom: Math.min(3, Math.round(((slot.zoom || 1) + 0.2) * 10) / 10) })}
              style={{ width: 'auto', padding: '2px 6px', fontSize: '0.68rem' }}
              title="Zoomer"
            >
              <ZoomIn size={11} />
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { fillMode: slot.fillMode === 'contain' ? 'cover' : 'contain' })}
              style={{ width: 'auto', padding: '2px 7px', fontSize: '0.68rem' }}
              title="Plein cadre / Voir tout"
            >
              {slot.fillMode === 'contain' ? 'Contain' : 'Plein cadre'}
            </button>
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onSelectFocus(slot.id)}
            style={{
              width: 'auto',
              padding: '3px 8px',
              fontSize: '0.68rem',
              fontWeight: 800,
              background: isFocused ? '#ef4444' : 'rgba(245, 158, 11, 0.16)',
              borderColor: isFocused ? '#ef4444' : 'rgba(245, 158, 11, 0.45)',
              color: isFocused ? '#fff' : '#FBBF24'
            }}
          >
            <Maximize2 size={11} /> {isFocused ? 'En direct seul' : 'Diffuser seul'}
          </button>
        </div>
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
  const [copiedCamUrl, setCopiedCamUrl] = useState<boolean>(false);
  const [showCustomRtmp, setShowCustomRtmp] = useState<boolean>(false);
  const [showRelayHelp, setShowRelayHelp] = useState<boolean>(false);
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
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signalingMapRef = useRef<Record<string, CameraSignalingHandle>>({});
  const peersMapRef = useRef<Record<string, { pc: RTCPeerConnection; sessionId: string }>>({});
  const usbStreamsRef = useRef<Record<string, { deviceId: string; stream: MediaStream }>>({});
  const viewerIdRef = useRef<string>(`pc_${Math.random().toString(36).slice(2, 8)}`);

  // Sync directorState & overlayConfig
  useEffect(() => {
    setDirectorState(loadDirectorState(currentClub.id));
    setDestinations(loadStreamDestinations(currentClub.id));
    setOverlayConfig(loadLiveOverlayConfig(currentClub.id, 'live'));

    const unsubDir = subscribeToDirectorState(currentClub.id, (next) => {
      setDirectorState(next);
    });
    const unsubOv = subscribeToLiveOverlayConfig(currentClub.id, 'live', (cfg) => {
      setOverlayConfig(cfg);
    });
    return () => {
      unsubDir();
      unsubOv();
    };
  }, [currentClub.id]);

  // Enumerate USB / PC cameras
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

  // Initialize Composite Broadcaster & check local RTMP relay
  useEffect(() => {
    const b = new LiveCompositeBroadcaster((snap) => {
      setBroadcasterStatus(snap);
    });
    broadcasterRef.current = b;
    if (previewCanvasRef.current) {
      b.setPreviewCanvas(previewCanvasRef.current);
    }
    b.startRenderLoop();
    b.checkRelayAvailability(destinations.relayWsUrl);

    return () => {
      b.destroy();
      broadcasterRef.current = null;
    };
  }, []);

  // Push fresh context to broadcaster whenever cameras, streams, scores, or overlay change
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

  // Live timer
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

  // Manage WebRTC receivers for all enabled smartphone_webrtc slots
  const setupWebRtcForCamera = (camId: string) => {
    // Cleanup old peer + signaling
    if (peersMapRef.current[camId]) {
      try {
        peersMapRef.current[camId].pc.close();
      } catch {}
      delete peersMapRef.current[camId];
    }
    if (signalingMapRef.current[camId]) {
      signalingMapRef.current[camId].destroy();
      delete signalingMapRef.current[camId];
    }

    const viewerId = viewerIdRef.current;
    const pendingIce: RTCIceCandidateInit[] = [];
    const sig = createCameraSignalingChannel(currentClub.id, camId, {
      onSubscribed: () => {
        sig.requestOffer(viewerId);
      },
      onSenderOnline: () => {
        const curPeer = peersMapRef.current[camId]?.pc;
        if (!curPeer || curPeer.connectionState !== 'connected') {
          sig.requestOffer(viewerId);
        }
      },
      onOffer: async (sdp, sessionId, targetViewerId) => {
        if (targetViewerId !== viewerId) return;
        if (peersMapRef.current[camId]) {
          try {
            peersMapRef.current[camId].pc.close();
          } catch {}
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
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch {}
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
          try {
            await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {}
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

    // Cleanup removed/disabled
    Object.keys(signalingMapRef.current).forEach(camId => {
      if (!activeIds.has(camId)) {
        signalingMapRef.current[camId].destroy();
        delete signalingMapRef.current[camId];
        if (peersMapRef.current[camId]) {
          try {
            peersMapRef.current[camId].pc.close();
          } catch {}
          delete peersMapRef.current[camId];
        }
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[camId];
          return next;
        });
      }
    });

    // Setup newly active
    activeIds.forEach(camId => {
      if (!signalingMapRef.current[camId]) {
        setupWebRtcForCamera(camId);
      }
    });
  }, [webrtcKey, currentClub.id]);

  // Cleanup all WebRTC on unmount
  useEffect(() => {
    return () => {
      Object.values(signalingMapRef.current).forEach(s => s.destroy());
      Object.values(peersMapRef.current).forEach(p => {
        try {
          p.pc.close();
        } catch {}
      });
      Object.values(usbStreamsRef.current).forEach(u => {
        u.stream.getTracks().forEach(t => t.stop());
      });
    };
  }, []);

  // Manage local USB / PC cameras for slots configured as 'usb'
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

    // Stop stale USB streams
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

    // Start new USB streams
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

  // Click on camera window -> highlight & broadcast ONLY that camera + ONLY its audio
  // Click again on the already-focused camera -> return to Multi-Screen Mosaic
  const handleSelectFocus = (cameraId: string) => {
    if (directorState.broadcastMode === 'single' && directorState.focusedCameraId === cameraId) {
      updateDirector({
        ...directorState,
        broadcastMode: 'mosaic',
        focusedCameraId: null
      });
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
    updateDirector({
      ...directorState,
      broadcastMode: 'mosaic',
      focusedCameraId: null
    });
  };

  const handleSelectAudio = (cameraId: string) => {
    updateDirector({
      ...directorState,
      activeAudioCameraId: cameraId
    });
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
    const newId = `cam_${Date.now().toString(36).slice(-4)}`;
    const newSlot: DirectorCameraSlot = {
      id: newId,
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
    updateDirector({
      ...directorState,
      cameras: [...directorState.cameras, newSlot]
    });
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
    const mm = String(m % 60).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
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

    try {
      await broadcasterRef.current?.startLiveStream(destinations);
      updateDirector({ ...directorState, isLiveStreaming: true, liveStartedAt: Date.now() });
    } catch (err: any) {
      alert(err?.message || 'Impossible de démarrer la diffusion Live.');
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
          🟡 Connexion...
        </span>
      );
    }
    if (st.status === 'live') {
      return (
        <span style={{ fontSize: '0.68rem', background: '#ef4444', color: '#fff', padding: '2px 7px', borderRadius: '999px', fontWeight: 900 }}>
          🔴 EN DIRECT
        </span>
      );
    }
    return (
      <span style={{ fontSize: '0.68rem', background: 'rgba(239,68,68,0.2)', color: '#fca5a5', padding: '2px 7px', borderRadius: '999px', fontWeight: 800 }} title={st.message}>
        ⚠️ Erreur
      </span>
    );
  };

  return (
    <div style={{
      maxWidth: '1400px',
      width: '100%',
      margin: '0 auto 1.6rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }}>
      {/* 1. DIFFUSION DIRECTE FACEBOOK + YOUTUBE (SIMULTANÉE) & MONITEUR PROGRAMME */}
      <div className="glass-card" style={{
        padding: '1.35rem',
        border: broadcasterStatus.isStreaming
          ? '2px solid #ef4444'
          : '1.5px solid rgba(0, 255, 170, 0.35)',
        boxShadow: broadcasterStatus.isStreaming
          ? '0 0 32px rgba(239, 68, 68, 0.25)'
          : '0 10px 30px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: broadcasterStatus.isStreaming ? '#ef4444' : 'rgba(255, 34, 68, 0.16)',
              border: '1px solid rgba(255, 34, 68, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Radio size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#fff' }}>
                Régie Multi-Caméras & Diffusion Directe (Facebook + YouTube)
              </h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Partez de l'Écran Multiple, cliquez sur une caméra pour l'isoler en surbrillance + écouter son son, ou revenez à la mosaïque en direct.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => broadcasterRef.current?.checkRelayAvailability(destinations.relayWsUrl)}
              style={{
                width: 'auto',
                fontSize: '0.74rem',
                padding: '5px 10px',
                borderColor: broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable
                  ? 'rgba(16,185,129,0.5)'
                  : 'rgba(245,158,11,0.45)',
                color: broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable ? '#34d399' : '#fbbf24'
              }}
              title="Tester la passerelle PC de diffusion vers Facebook & YouTube"
            >
              {broadcasterStatus.connectedToRelay ? (
                broadcasterStatus.ffmpegAvailable ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />
              ) : (
                <RefreshCw size={14} />
              )}
              {broadcasterStatus.connectedToRelay
                ? broadcasterStatus.ffmpegAvailable
                  ? 'Relais PC + FFmpeg Prêts'
                  : 'Relais OK • FFmpeg manquant'
                : 'Tester Relais PC'}
            </button>

            <a
              href={`${getAppBaseUrl()}/?overlay=director&club=${encodeURIComponent(currentClub.id)}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline"
              style={{ width: 'auto', fontSize: '0.75rem', padding: '5px 11px', textDecoration: 'none', color: '#00ffaa', borderColor: 'rgba(0,255,170,0.4)' }}
              title="Ouvrir la sortie TV en plein écran (synchronisée en temps réel avec vos clics)"
            >
              <Tv size={14} /> Écran Sortie Live <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Destinations + Launch Controls + Live Program Monitor */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 1.45fr) minmax(260px, 1fr)',
          gap: '1rem',
          alignItems: 'stretch'
        }}>
          {/* Left: Platform Cards + Start Live Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.75rem' }}>
              {/* FACEBOOK LIVE CARD */}
              <div style={{
                background: destinations.facebookEnabled ? 'rgba(24, 119, 242, 0.12)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${destinations.facebookEnabled ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '12px',
                padding: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontWeight: 900, fontSize: '0.86rem', color: '#60a5fa' }}>
                    <input
                      type="checkbox"
                      checked={destinations.facebookEnabled}
                      onChange={(e) => updateDestinations({ facebookEnabled: e.target.checked })}
                      disabled={broadcasterStatus.isStreaming}
                    />
                    <Facebook size={16} /> Facebook Live
                  </label>
                  {renderPlatformStatusBadge('facebook')}
                </div>

                <input
                  type="password"
                  className="input-field"
                  placeholder="Collez votre clé de stream Facebook..."
                  value={destinations.facebookStreamKey}
                  onChange={(e) => updateDestinations({ facebookStreamKey: e.target.value })}
                  disabled={broadcasterStatus.isStreaming}
                  style={{ fontSize: '0.76rem', padding: '0.45rem 0.65rem' }}
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                  <a
                    href="https://www.facebook.com/live/producer"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.7rem', color: '#93c5fd', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  >
                    Récupérer ma clé Facebook <ExternalLink size={11} />
                  </a>
                  <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>RTMPS sécurisé</span>
                </div>
              </div>

              {/* YOUTUBE LIVE CARD */}
              <div style={{
                background: destinations.youtubeEnabled ? 'rgba(255, 0, 51, 0.1)' : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${destinations.youtubeEnabled ? '#ff3344' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '12px',
                padding: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontWeight: 900, fontSize: '0.86rem', color: '#ff6b81' }}>
                    <input
                      type="checkbox"
                      checked={destinations.youtubeEnabled}
                      onChange={(e) => updateDestinations({ youtubeEnabled: e.target.checked })}
                      disabled={broadcasterStatus.isStreaming}
                    />
                    <Youtube size={16} /> YouTube Live
                  </label>
                  {renderPlatformStatusBadge('youtube')}
                </div>

                <input
                  type="password"
                  className="input-field"
                  placeholder="Collez votre clé de stream YouTube..."
                  value={destinations.youtubeStreamKey}
                  onChange={(e) => updateDestinations({ youtubeStreamKey: e.target.value })}
                  disabled={broadcasterStatus.isStreaming}
                  style={{ fontSize: '0.76rem', padding: '0.45rem 0.65rem' }}
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                  <a
                    href="https://studio.youtube.com/channel/UC/livestreaming"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.7rem', color: '#fda4af', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  >
                    Récupérer ma clé YouTube <ExternalLink size={11} />
                  </a>
                  <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>RTMP 720p30</span>
                </div>
              </div>
            </div>

            {/* Optional Custom RTMP */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowCustomRtmp(v => !v)}
                style={{ width: 'auto', fontSize: '0.72rem', padding: '3px 9px' }}
              >
                <Settings size={12} /> {showCustomRtmp ? 'Masquer options RTMP avancées' : '+ Autre plateforme (Twitch / TikTok / Relais)'}
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowRelayHelp(v => !v)}
                style={{ width: 'auto', fontSize: '0.72rem', padding: '3px 9px', color: '#fbbf24', borderColor: 'rgba(245,158,11,0.35)' }}
              >
                ℹ️ Aide mise en route sur PC
              </button>
            </div>

            {showCustomRtmp && (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                padding: '0.65rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '0.5rem',
                alignItems: 'center'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={destinations.customEnabled}
                    onChange={(e) => updateDestinations({ customEnabled: e.target.checked })}
                    disabled={broadcasterStatus.isStreaming}
                  />
                  Activer 3ème flux RTMP
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Serveur RTMP (rtmp://...)"
                  value={destinations.customRtmpUrl}
                  onChange={(e) => updateDestinations({ customRtmpUrl: e.target.value })}
                  style={{ fontSize: '0.73rem', padding: '0.4rem 0.6rem' }}
                />
                <input
                  type="password"
                  className="input-field"
                  placeholder="Clé de stream RTMP"
                  value={destinations.customStreamKey}
                  onChange={(e) => updateDestinations({ customStreamKey: e.target.value })}
                  style={{ fontSize: '0.73rem', padding: '0.4rem 0.6rem' }}
                />
              </div>
            )}

            {showRelayHelp && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '10px',
                padding: '0.75rem 0.9rem',
                fontSize: '0.75rem',
                color: '#fef3c7',
                lineHeight: '1.5'
              }}>
                <b>Comment fonctionne l'envoi direct vers Facebook & YouTube ?</b>
                <ul style={{ margin: '4px 0 0 1.1rem', padding: 0 }}>
                  <li>L'appli assemble vos caméras + scores + audio en direct et envoie le flux vers Facebook et YouTube via <b>FFmpeg</b> sur le PC du club.</li>
                  <li>Si FFmpeg n'est pas encore sur le PC, installez-le en 1 commande PowerShell : <code>winget install Gyan.FFmpeg</code> puis redémarrez.</li>
                  <li>Si vous utilisez l'appli depuis Vercel en ligne, lancez <code>npm run relay</code> dans le dossier du projet sur le PC pour activer le relais local.</li>
                </ul>
              </div>
            )}

            {/* Main Launch / Stop Live Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: 'auto' }}>
              <button
                type="button"
                className="btn btn-neon"
                onClick={handleToggleLiveStream}
                style={{
                  flex: 1,
                  minWidth: '240px',
                  padding: '0.85rem 1.2rem',
                  fontSize: '0.96rem',
                  fontWeight: 900,
                  justifyContent: 'center',
                  background: broadcasterStatus.isStreaming ? '#ef4444' : 'linear-gradient(135deg, #ef4444, #f59e0b)',
                  borderColor: 'transparent',
                  color: '#fff',
                  boxShadow: broadcasterStatus.isStreaming ? '0 0 24px rgba(239,68,68,0.65)' : '0 0 18px rgba(239,68,68,0.35)'
                }}
              >
                {broadcasterStatus.isStreaming ? (
                  <>⏹ ARRÊTER LE LIVE ({formatDuration(liveElapsedSec)})</>
                ) : (
                  <>
                    <Play size={18} />
                    {activePlatformsLabel.length > 0
                      ? `🔴 LANCER LE LIVE (${activePlatformsLabel.join(' + ')})`
                      : '🔴 LANCER LE LIVE (Saisissez une clé ci-dessus)'}
                  </>
                )}
              </button>

              {broadcasterStatus.isStreaming && (
                <div style={{ fontSize: '0.76rem', color: '#34d399', fontWeight: 800 }}>
                  📡 Flux envoyé : {(broadcasterStatus.bytesSent / (1024 * 1024)).toFixed(1)} Mo
                </div>
              )}
            </div>

            {broadcasterStatus.lastError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.14)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                color: '#fecaca',
                padding: '0.55rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700
              }}>
                ⚠️ {broadcasterStatus.lastError}
              </div>
            )}
          </div>

          {/* Right: Live Program Monitor Output Preview */}
          <div style={{
            background: '#03060d',
            border: '1.5px solid rgba(255,255,255,0.16)',
            borderRadius: '12px',
            padding: '0.65rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', fontWeight: 800 }}>
              <span style={{ color: '#00ffaa', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <MonitorPlay size={14} /> MONITEUR DIFFUSION (Sortie Facebook / YouTube)
              </span>
              <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.68rem' }}>
                {directorState.broadcastMode === 'single' && focusedCam
                  ? `Plein écran : ${focusedCam.name}`
                  : `Mosaïque (${enabledCount} cam.)`}
              </span>
            </div>
            <canvas
              ref={(el) => {
                previewCanvasRef.current = el;
                broadcasterRef.current?.setPreviewCanvas(el);
              }}
              width={480}
              height={270}
              style={{
                width: '100%',
                aspectRatio: '16 / 9',
                borderRadius: '8px',
                background: '#000',
                display: 'block'
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. BARRE D'ÉTAT DU SWITCHER & RETOUR ÉCRAN MULTIPLE */}
      <div style={{
        background: directorState.broadcastMode === 'single'
          ? 'linear-gradient(90deg, rgba(185, 28, 28, 0.28), rgba(15, 23, 42, 0.92))'
          : 'linear-gradient(90deg, rgba(245, 158, 11, 0.2), rgba(15, 23, 42, 0.92))',
        border: `2px solid ${directorState.broadcastMode === 'single' ? '#ef4444' : '#f59e0b'}`,
        borderRadius: '14px',
        padding: '0.85rem 1.15rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{
            background: directorState.broadcastMode === 'single' ? '#ef4444' : '#f59e0b',
            color: directorState.broadcastMode === 'single' ? '#fff' : '#000',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '0.76rem',
            fontWeight: 900
          }}>
            {directorState.broadcastMode === 'single' ? '🔴 CAMÉRA SEULE EN LIVE' : '⊞ ÉCRAN MULTIPLE EN LIVE'}
          </span>

          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fff' }}>
            {directorState.broadcastMode === 'single' && focusedCam ? (
              <>
                Diffusion actuelle : <span style={{ color: '#fca5a5' }}>{focusedCam.name}</span>{' '}
                <span style={{ color: '#00ffaa' }}>({focusedAssignment?.title})</span> •{' '}
                <span style={{ color: '#34d399' }}>🔊 Son de cette caméra uniquement</span>
              </>
            ) : (
              <>
                Mosaïque multi-caméras active ({enabledCount} fenêtre{enabledCount > 1 ? 's' : ''}) —{' '}
                <span style={{ color: '#fde68a' }}>Cliquez sur une fenêtre pour la diffuser seule + écouter son son</span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {directorState.broadcastMode === 'single' && (
            <button
              type="button"
              className="btn btn-neon"
              onClick={handleReturnToMosaic}
              style={{
                width: 'auto',
                padding: '0.55rem 1rem',
                fontSize: '0.82rem',
                fontWeight: 900,
                background: '#f59e0b',
                borderColor: '#f59e0b',
                color: '#000',
                boxShadow: '0 0 18px rgba(245, 158, 11, 0.5)'
              }}
            >
              ⊞ Revenir à l'Écran Multiple en Live
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
              style={{ width: 'auto', fontSize: '0.74rem', padding: '5px 9px' }}
            >
              {directorState.mosaicLayout === 'stacked' ? '◫ Côte à côte' : '⊟ Haut / Bas'}
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setMonitorAudioOnPc(v => !v)}
            style={{
              width: 'auto',
              fontSize: '0.74rem',
              padding: '5px 10px',
              background: monitorAudioOnPc ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255,255,255,0.05)',
              borderColor: monitorAudioOnPc ? '#10b981' : 'rgba(255,255,255,0.2)',
              color: monitorAudioOnPc ? '#34d399' : '#fff'
            }}
            title="Activer/Couper le retour son sur les haut-parleurs du PC (n'affecte pas le son envoyé sur Facebook/YouTube)"
          >
            {monitorAudioOnPc ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {monitorAudioOnPc ? 'Écoute PC : ON' : 'Écoute PC : Coupée'}
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={refreshVideoDevices}
            style={{ width: 'auto', fontSize: '0.74rem', padding: '5px 9px' }}
            title="Actualiser les caméras USB / HDMI branchées au PC"
          >
            <RefreshCw size={13} /> Caméras PC ({videoDevices.length})
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={handleAddCamera}
            style={{ width: 'auto', fontSize: '0.75rem', padding: '5px 10px', color: '#00ffaa', borderColor: 'rgba(0,255,170,0.45)' }}
          >
            <Plus size={14} /> Ajouter Caméra
          </button>
        </div>
      </div>

      {/* 3. GRILLE INTERACTIVE DES CAMÉRAS (ÉCRAN MULTIPLE) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: '1rem'
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
              maxWidth: '420px',
              width: '100%',
              padding: '1.5rem',
              borderRadius: '18px',
              border: '2px solid rgba(0, 255, 170, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              textAlign: 'center'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 900, fontSize: '1.15rem', color: '#00ffaa' }}>
              <Smartphone size={22} /> Connecter {qrCamObj.name}
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>
              Flashez ce QR Code avec l'appareil photo de votre smartphone. Il transmettra sa vidéo et son micro directement dans l'application, sans rien installer !
            </div>

            <div style={{ background: '#fff', padding: '14px', borderRadius: '14px' }}>
              <QRCode value={qrCamUrl} size={200} />
            </div>

            <div style={{ display: 'flex', gap: '0.45rem', width: '100%' }}>
              <input
                type="text"
                readOnly
                className="input-field"
                value={qrCamUrl}
                style={{ flex: 1, fontSize: '0.72rem', padding: '0.45rem 0.65rem' }}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  navigator.clipboard.writeText(qrCamUrl);
                  setCopiedCamUrl(true);
                  setTimeout(() => setCopiedCamUrl(false), 2000);
                }}
                style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.75rem' }}
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
