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
  Link2,
  Maximize2,
  Mic,
  MicOff,
  Minus,
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
  Trophy,
  Tv,
  Volume2,
  VolumeX,
  Youtube,
  Zap,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { useStore } from '../store';
import { Table } from '../types';
import {
  CueScoreMatch,
  CueScoreTournamentData,
  fetchCueScoreTournament
} from '../utils/cueScore';
import {
  CUSTOM_VIEW_PRESETS,
  CameraSignalingHandle,
  DEFAULT_REGIONAL_MATCH,
  DirectorAssignmentType,
  DirectorCameraSlot,
  DirectorCameraSourceType,
  DirectorLiveSituation,
  DirectorMosaicLayout,
  MultiCamDirectorState,
  RTC_ICE_CONFIG,
  RegionalMatchConfig,
  StreamDestinationsConfig,
  createCameraSignalingChannel,
  isVirtualScreenSource,
  loadDirectorState,
  loadStreamDestinations,
  saveDirectorState,
  saveStreamDestinations,
  subscribeToDirectorState
} from '../utils/multiCamDirector';
import {
  BroadcasterStatusSnapshot,
  LiveCompositeBroadcaster,
  drawVirtualScreenToCanvas,
  getMosaicGridRects,
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
  onScoreClubMatch: (matchId: string, score1: number, score2: number) => void;
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
  onScoreClubMatch,
  registerVideoEl,
  canDelete
}) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const virtualCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingCustomTitle, setEditingCustomTitle] = useState(false);

  const isVirtual = isVirtualScreenSource(slot.sourceType);
  const isExternalLive =
    directorState.situation === 'regional_match' || directorState.situation === 'cuescore_live';
  const activeStream =
    slot.sourceType === 'smartphone_webrtc'
      ? remoteStream
      : slot.sourceType === 'usb'
        ? usbStream
        : null;

  const isSingleMode = directorState.broadcastMode === 'single';
  const isFocused = isSingleMode && directorState.focusedCameraId === slot.id;
  const isInMosaic = directorState.broadcastMode === 'mosaic' && slot.enabled;

  const focusedCamObj = directorState.focusedCameraId
    ? directorState.cameras.find(c => c.id === directorState.focusedCameraId)
    : null;
  const effectiveAudioCamId =
    isSingleMode && focusedCamObj && !isVirtualScreenSource(focusedCamObj.sourceType)
      ? focusedCamObj.id
      : directorState.activeAudioCameraId;
  const isAudioSelected = !isVirtual && effectiveAudioCamId === slot.id && !slot.forceMuted;

  useEffect(() => {
    if (isVirtual) {
      registerVideoEl(slot.id, null);
      return;
    }
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
  }, [activeStream, slot.id, isVirtual, registerVideoEl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !(monitorAudioOnPc && isAudioSelected && slot.enabled);
  }, [monitorAudioOnPc, isAudioSelected, slot.enabled]);

  useEffect(() => {
    if (!isVirtual || !virtualCanvasRef.current) return;
    const canvas = virtualCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawVirtualScreenToCanvas(ctx, 0, 0, canvas.width, canvas.height, slot, {
      tables,
      matches,
      players,
      tournaments,
      currentClub
    });
  }, [isVirtual, slot, tables, matches, players, tournaments, currentClub]);

  const assignment = resolveCameraAssignment(
    slot,
    { tables, matches, players, tournaments, currentClub },
    directorState
  );

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
    ? '0 0 24px rgba(239, 68, 68, 0.5)'
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
      {/* Clickable 16:9 Live Video / Virtual Screen Viewport */}
      <div
        onClick={() => {
          if (!slot.enabled) {
            onUpdateSlot(slot.id, { enabled: true });
          }
          onSelectFocus(slot.id);
        }}
        title={
          isFocused
            ? "Diffusée seule — Cliquez pour revenir à l'Écran Multiple"
            : isVirtual
              ? 'Cliquez pour afficher cet écran en Plein Écran sur le Live'
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
        {isVirtual && (
          <canvas
            ref={virtualCanvasRef}
            width={640}
            height={360}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        )}

        {!isVirtual && (slot.sourceType === 'smartphone_webrtc' || slot.sourceType === 'usb') && (
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

        {!isVirtual && ((slot.sourceType === 'smartphone_webrtc' && !remoteStream) ||
          (slot.sourceType === 'usb' && !usbStream) ||
          (slot.sourceType === 'external' && !slot.externalUrl)) && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.3rem',
            padding: '0.5rem',
            background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.08) 0%, rgba(3, 6, 15, 0.92) 75%)',
            textAlign: 'center',
            pointerEvents: 'none'
          }}>
            <Camera size={22} color="rgba(255,255,255,0.4)" />
            <div style={{ fontSize: '0.73rem', fontWeight: 800, color: '#fff' }}>
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
          top: '6px',
          left: '6px',
          right: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.3rem',
          pointerEvents: 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{
              background: isFocused
                ? '#ef4444'
                : isInMosaic
                  ? '#f59e0b'
                  : 'rgba(15, 23, 42, 0.86)',
              color: isInMosaic && !isFocused ? '#000' : '#fff',
              padding: '2px 6px',
              borderRadius: '5px',
              fontSize: '0.62rem',
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px'
            }}>
              <Radio size={9} />
              {isFocused ? 'PLEIN ÉCRAN' : isInMosaic ? 'MOSAÏQUE' : 'VEILLE'}
            </span>
            {!isVirtual && (
              <span style={{
                background: 'rgba(4, 12, 24, 0.88)',
                border: '1px solid rgba(0, 255, 170, 0.45)',
                color: '#00ffaa',
                padding: '2px 6px',
                borderRadius: '5px',
                fontSize: '0.64rem',
                fontWeight: 800
              }}>
                {isExternalLive ? slot.name : assignment.title}
              </span>
            )}
          </div>

          {!isVirtual && (
            <span style={{
              background: isAudioSelected ? 'rgba(16, 185, 129, 0.92)' : 'rgba(15, 23, 42, 0.82)',
              color: isAudioSelected ? '#000' : 'rgba(255,255,255,0.65)',
              padding: '2px 6px',
              borderRadius: '5px',
              fontSize: '0.62rem',
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px'
            }}>
              {isAudioSelected ? <Volume2 size={10} /> : <VolumeX size={10} />}
              {isAudioSelected ? 'SON' : 'MUET'}
            </span>
          )}
        </div>

        {/* Bottom Overlay */}
        <div style={{
          position: 'absolute',
          bottom: '6px',
          left: '6px',
          right: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.3rem',
          pointerEvents: 'none'
        }}>
          <div style={{
            background: 'rgba(5, 10, 22, 0.88)',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: '5px',
            padding: '2px 7px',
            fontSize: '0.66rem',
            fontWeight: 800,
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '70%'
          }}>
            {assignment.isMatchView && assignment.p1Name && assignment.p2Name && assignment.score1 !== undefined && assignment.score2 !== undefined ? (
              <span>
                {assignment.p1Name}{' '}
                <span style={{ color: '#FBBF24', margin: '0 3px' }}>
                  {assignment.score1}-{assignment.score2}
                </span>{' '}
                {assignment.p2Name}
              </span>
            ) : (
              <span>{slot.name}</span>
            )}
          </div>

          <span style={{
            background: isFocused ? 'rgba(239,68,68,0.92)' : 'rgba(0,0,0,0.75)',
            color: '#fff',
            padding: '2px 6px',
            borderRadius: '5px',
            fontSize: '0.6rem',
            fontWeight: 800
          }}>
            {isFocused ? 'Retour Mosaïque' : 'Diffuser seul'}
          </span>
        </div>
      </div>

      {/* Controls Under Video */}
      <div style={{
        padding: '0.4rem 0.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        background: 'rgba(4, 8, 18, 0.96)'
      }}>
        {/* Club Mode Quick Live Score Row when table has an active match */}
        {!isExternalLive && !isVirtual && assignment.match && assignment.p1Name && assignment.p2Name && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.35rem',
            background: 'rgba(0, 255, 170, 0.08)',
            border: '1px solid rgba(0, 255, 170, 0.28)',
            borderRadius: '7px',
            padding: '3px 6px',
            fontSize: '0.7rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onScoreClubMatch(assignment.match!.id, Math.max(0, assignment.match!.score1 - 1), assignment.match!.score2)}
                style={{ width: '22px', height: '22px', padding: 0, justifyContent: 'center' }}
              >
                <Minus size={11} />
              </button>
              <span style={{ fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '68px' }}>
                {assignment.p1Name}
              </span>
              <span style={{ fontWeight: 900, color: '#FBBF24' }}>{assignment.match.score1}</span>
              <button
                type="button"
                className="btn btn-neon"
                onClick={() => onScoreClubMatch(assignment.match!.id, assignment.match!.score1 + 1, assignment.match!.score2)}
                style={{ width: '22px', height: '22px', padding: 0, justifyContent: 'center', color: '#000' }}
              >
                <Plus size={11} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onScoreClubMatch(assignment.match!.id, assignment.match!.score1, Math.max(0, assignment.match!.score2 - 1))}
                style={{ width: '22px', height: '22px', padding: 0, justifyContent: 'center' }}
              >
                <Minus size={11} />
              </button>
              <span style={{ fontWeight: 900, color: '#FBBF24' }}>{assignment.match.score2}</span>
              <span style={{ fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '68px' }}>
                {assignment.p2Name}
              </span>
              <button
                type="button"
                className="btn btn-neon"
                onClick={() => onScoreClubMatch(assignment.match!.id, assignment.match!.score1, assignment.match!.score2 + 1)}
                style={{ width: '22px', height: '22px', padding: 0, justifyContent: 'center', color: '#000' }}
              >
                <Plus size={11} />
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
          {!isVirtual && !isExternalLive && (
            <select
              className="input-field"
              value={assignmentSelectValue}
              onChange={(e) => handleAssignmentChange(e.target.value)}
              title="Attitrer cette caméra à un billard ou une autre vue"
              style={{
                flex: '1 1 95px',
                fontSize: '0.7rem',
                padding: '3px 5px',
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
          )}

          {/* Source Caméra ou Écran Graphique */}
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
                const nextType = v as DirectorCameraSourceType;
                const autoName =
                  nextType === 'tournament_standings'
                    ? 'Classement Tournoi'
                    : nextType === 'tournament_bracket'
                      ? 'Tableau Final'
                      : nextType === 'matches_live_board'
                        ? 'Scores Billards'
                        : nextType === 'club_leaderboard'
                          ? 'Classement Club'
                          : slot.name;
                onUpdateSlot(slot.id, {
                  sourceType: nextType,
                  name: autoName
                });
              }
            }}
            title="Source vidéo ou écran graphique en direct"
            style={{
              flex: '1 1 115px',
              fontSize: '0.7rem',
              padding: '3px 5px',
              background: '#0b1426',
              color: isVirtual ? '#34D399' : '#fff',
              fontWeight: 700
            }}
          >
            <optgroup label="📷 Caméras">
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
            </optgroup>
            <optgroup label="📊 Écrans Live (Sans quitter le direct)">
              <option value="tournament_standings">🏆 Classement du Tournoi</option>
              <option value="tournament_bracket">🌳 Tableau Phases Finales</option>
              <option value="matches_live_board">🎱 Scores de tous les Billards</option>
              <option value="club_leaderboard">👑 Classement Général Club</option>
            </optgroup>
          </select>

          {slot.sourceType === 'smartphone_webrtc' && (
            <button
              type="button"
              className="btn btn-neon"
              onClick={() => onOpenQr(slot.id)}
              style={{ width: 'auto', padding: '3px 6px', fontSize: '0.68rem', fontWeight: 900, color: '#000' }}
              title="QR Code smartphone"
            >
              <QrCode size={12} /> QR
            </button>
          )}

          {!isVirtual && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onSelectAudio(slot.id)}
              style={{
                width: 'auto',
                padding: '3px 6px',
                fontSize: '0.68rem',
                background: isAudioSelected ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                borderColor: isAudioSelected ? '#10B981' : 'rgba(255,255,255,0.18)',
                color: isAudioSelected ? '#34D399' : '#fff'
              }}
              title="Écouter uniquement le micro de cette caméra"
            >
              {isAudioSelected ? <Volume2 size={12} /> : <VolumeX size={12} />}
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowAdvanced(v => !v)}
            style={{
              width: 'auto',
              padding: '3px 6px',
              fontSize: '0.68rem',
              background: showAdvanced ? 'rgba(255,255,255,0.15)' : 'transparent'
            }}
            title="Réglages (Nom, Rotation, Zoom, Masquer, Supprimer)"
          >
            <Settings size={12} />
          </button>
        </div>

        {!isVirtual && !isExternalLive && (editingCustomTitle || (slot.assignmentType === 'custom_view' && !CUSTOM_VIEW_PRESETS.includes(slot.customViewTitle || ''))) && (
          <input
            type="text"
            className="input-field"
            placeholder="Nom de la vue (ex: Table Finale, Podium...)"
            value={slot.customViewTitle || ''}
            onChange={(e) => onUpdateSlot(slot.id, { customViewTitle: e.target.value })}
            style={{ fontSize: '0.7rem', padding: '3px 6px' }}
          />
        )}

        {slot.sourceType === 'external' && (
          <input
            type="url"
            className="input-field"
            placeholder="Collez l'URL YouTube / Caméra IP..."
            value={slot.externalUrl || ''}
            onChange={(e) => onUpdateSlot(slot.id, { externalUrl: e.target.value })}
            style={{ fontSize: '0.7rem', padding: '3px 6px' }}
          />
        )}

        {showAdvanced && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.28rem',
            paddingTop: '0.3rem',
            borderTop: '1px solid rgba(255,255,255,0.08)'
          }}>
            <input
              type="text"
              className="input-field"
              value={slot.name}
              onChange={(e) => onUpdateSlot(slot.id, { name: e.target.value })}
              style={{ width: '100px', padding: '2px 5px', fontSize: '0.7rem', fontWeight: 700 }}
              title="Renommer"
            />
            {slot.sourceType === 'smartphone_webrtc' && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => onReconnectWebRtc(slot.id)}
                style={{ width: 'auto', padding: '2px 5px', fontSize: '0.66rem' }}
                title="Reconnecter smartphone"
              >
                <RefreshCw size={11} />
              </button>
            )}
            {!isVirtual && (
              <>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onUpdateSlot(slot.id, { rotation: ((slot.rotation || 0) + 90) % 360 })}
                  style={{ width: 'auto', padding: '2px 5px', fontSize: '0.66rem' }}
                  title="Pivoter 90°"
                >
                  <RotateCcw size={11} /> {slot.rotation || 0}°
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onUpdateSlot(slot.id, { zoom: Math.max(1, Math.round(((slot.zoom || 1) - 0.2) * 10) / 10) })}
                  style={{ width: 'auto', padding: '2px 5px', fontSize: '0.66rem' }}
                >
                  <ZoomOut size={11} />
                </button>
                <span style={{ fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {Math.round((slot.zoom || 1) * 100)}%
                </span>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onUpdateSlot(slot.id, { zoom: Math.min(3, Math.round(((slot.zoom || 1) + 0.2) * 10) / 10) })}
                  style={{ width: 'auto', padding: '2px 5px', fontSize: '0.66rem' }}
                >
                  <ZoomIn size={11} />
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onUpdateSlot(slot.id, { fillMode: slot.fillMode === 'contain' ? 'cover' : 'contain' })}
                  style={{ width: 'auto', padding: '2px 5px', fontSize: '0.66rem' }}
                >
                  {slot.fillMode === 'contain' ? 'Contain' : 'Cover'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onUpdateSlot(slot.id, { forceMuted: !slot.forceMuted })}
                  style={{
                    width: 'auto',
                    padding: '2px 5px',
                    fontSize: '0.66rem',
                    color: slot.forceMuted ? '#f87171' : '#fff'
                  }}
                  title={slot.forceMuted ? 'Micro coupé' : 'Couper ce micro'}
                >
                  {slot.forceMuted ? <MicOff size={11} /> : <Mic size={11} />}
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onUpdateSlot(slot.id, { enabled: !slot.enabled })}
              style={{
                width: 'auto',
                padding: '2px 5px',
                fontSize: '0.66rem',
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
                style={{ width: 'auto', padding: '2px 5px', fontSize: '0.66rem', color: '#f87171' }}
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
  const {
    tables,
    matches,
    players,
    tournaments,
    currentClub,
    updateMatchScore
  } = useStore();
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

  const [cueScoreData, setCueScoreData] = useState<CueScoreTournamentData | null>(null);
  const [cueScoreLoading, setCueScoreLoading] = useState<boolean>(false);
  const [cueScoreError, setCueScoreError] = useState<string | null>(null);

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
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const cueScoreInputRef = useRef<HTMLInputElement | null>(null);
  const directorStateRef = useRef<MultiCamDirectorState>(directorState);
  directorStateRef.current = directorState;
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

  const updateRegionalMatch = (patch: Partial<RegionalMatchConfig>) => {
    updateDirector({
      ...directorState,
      regionalMatch: {
        ...directorState.regionalMatch,
        ...patch
      }
    });
  };

  const handleSetSituation = (situation: DirectorLiveSituation) => {
    updateDirector({
      ...directorState,
      situation
    });
  };

  const updateDestinations = (patch: Partial<StreamDestinationsConfig>) => {
    const next = { ...destinations, ...patch };
    setDestinations(next);
    saveStreamDestinations(currentClub.id, next);
  };

  const handleSelectFocus = (cameraId: string) => {
    const targetSlot = directorState.cameras.find(c => c.id === cameraId);
    if (directorState.broadcastMode === 'single' && directorState.focusedCameraId === cameraId) {
      updateDirector({ ...directorState, broadcastMode: 'mosaic', focusedCameraId: null });
    } else {
      const keepExistingMic = targetSlot && isVirtualScreenSource(targetSlot.sourceType);
      updateDirector({
        ...directorState,
        broadcastMode: 'single',
        focusedCameraId: cameraId,
        activeAudioCameraId: keepExistingMic ? directorState.activeAudioCameraId : cameraId
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
      alert('Maximum 8 fenêtres simultanées dans la régie.');
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

  const handleAddStandingsScreen = () => {
    const existing = directorState.cameras.find(c => c.sourceType === 'tournament_standings');
    if (existing) {
      if (!existing.enabled) {
        handleUpdateSlot(existing.id, { enabled: true });
      }
      return;
    }
    const disabledEmpty = directorState.cameras.find(c => !c.enabled);
    if (disabledEmpty) {
      updateDirector({
        ...directorState,
        cameras: directorState.cameras.map(c =>
          c.id === disabledEmpty.id
            ? {
                ...c,
                enabled: true,
                sourceType: 'tournament_standings',
                name: 'Classement Tournoi',
                customViewTitle: 'Classement du Tournoi'
              }
            : c
        )
      });
      return;
    }
    if (directorState.cameras.length >= 8) {
      alert('Maximum 8 fenêtres simultanées dans la régie.');
      return;
    }
    const standingsSlot: DirectorCameraSlot = {
      id: `scr_${Date.now().toString(36).slice(-4)}`,
      name: 'Classement Tournoi',
      enabled: true,
      sourceType: 'tournament_standings',
      assignmentType: 'custom_view',
      customViewTitle: 'Classement du Tournoi',
      customViewShowAllScores: false,
      rotation: 0,
      zoom: 1,
      fillMode: 'contain',
      forceMuted: true
    };
    updateDirector({ ...directorState, cameras: [...directorState.cameras, standingsSlot] });
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
  const sortedPlayers = Object.values(players).slice().sort((a, b) => a.name.localeCompare(b.name));
  const enabledCams = directorState.cameras.filter(c => c.enabled);
  const enabledCount = enabledCams.length;
  const focusedCam = directorState.focusedCameraId
    ? directorState.cameras.find(c => c.id === directorState.focusedCameraId) || null
    : null;

  const focusedAssignment = focusedCam
    ? resolveCameraAssignment(focusedCam, { tables, matches, players, tournaments, currentClub }, directorState)
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

  const handlePreviewCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (directorState.broadcastMode === 'single') {
      handleReturnToMosaic();
      return;
    }
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const cx = ((e.clientX - rect.left) / rect.width) * 1280;
    const cy = ((e.clientY - rect.top) / rect.height) * 720;

    const list = enabledCams.length > 0 ? enabledCams : directorState.cameras.slice(0, 1);
    const cells = getMosaicGridRects(list.length, directorState.mosaicLayout, 1280, 720);
    const hit = cells.find(cell => cx >= cell.x && cx <= cell.x + cell.w && cy >= cell.y && cy <= cell.y + cell.h);
    if (hit && list[hit.index]) {
      handleSelectFocus(list[hit.index].id);
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

  const rm = directorState.regionalMatch || DEFAULT_REGIONAL_MATCH;

  const playerSuggestions = (() => {
    const map = new Map<string, { id: string; name: string; club: string }>();
    sortedPlayers.forEach(p => {
      map.set(p.name.trim().toLowerCase(), {
        id: p.id,
        name: p.name,
        club: p.clubName || p.stats?.clubName || ''
      });
    });
    (cueScoreData?.players || []).forEach(csP => {
      const key = csP.name.trim().toLowerCase();
      if (!key) return;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { id: `cs_${csP.id}`, name: csP.name, club: csP.club || '' });
      } else if (!existing.club && csP.club) {
        map.set(key, { ...existing, club: csP.club });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  })();

  const autoFillPlayerClub = (typedName: string, side: 1 | 2) => {
    const found = playerSuggestions.find(p => p.name.toLowerCase() === typedName.trim().toLowerCase());
    if (side === 1) {
      updateRegionalMatch({
        player1Name: typedName,
        ...(found?.club ? { player1Club: found.club } : {})
      });
    } else {
      updateRegionalMatch({
        player2Name: typedName,
        ...(found?.club ? { player2Club: found.club } : {})
      });
    }
  };

  const autoFillCueScoreCustomClub = (typedName: string, side: 1 | 2) => {
    const found = playerSuggestions.find(p => p.name.toLowerCase() === typedName.trim().toLowerCase());
    if (side === 1) {
      updateRegionalMatch({
        cueScoreCustomP1Name: typedName,
        ...(found?.club ? { cueScoreCustomP1Club: found.club } : {})
      });
    } else {
      updateRegionalMatch({
        cueScoreCustomP2Name: typedName,
        ...(found?.club ? { cueScoreCustomP2Club: found.club } : {})
      });
    }
  };

  const buildCueScoreMatchPatch = (
    match: CueScoreMatch,
    fallbackTarget: number
  ): Partial<RegionalMatchConfig> => ({
    cueScoreHasActiveMatch: true,
    cueScoreMatchId: match.matchId,
    cueScoreCustomP1Name: match.player1Name || 'Joueur 1',
    cueScoreCustomP1Club: match.player1Club || '',
    cueScoreCustomP2Name: match.player2Name || 'Joueur 2',
    cueScoreCustomP2Club: match.player2Club || '',
    cueScoreCustomScore1: match.score1,
    cueScoreCustomScore2: match.score2,
    cueScoreCustomTargetSets: match.raceTo > 0 ? match.raceTo : fallbackTarget
  });

  const handleLoadCueScore = async (silent: boolean = false) => {
    const latestRm = directorStateRef.current.regionalMatch || DEFAULT_REGIONAL_MATCH;
    const rawInput = (latestRm.cueScoreInput || latestRm.cueScoreTournamentId || '').trim();
    if (!rawInput) {
      if (!silent) {
        setCueScoreError("Collez d'abord le lien ou l'ID du tournoi CueScore.");
      }
      return;
    }

    if (!silent) {
      setCueScoreLoading(true);
    }
    setCueScoreError(null);

    try {
      const data = await fetchCueScoreTournament(rawInput);
      setCueScoreData(data);

      const latestState = directorStateRef.current;
      const curRm = latestState.regionalMatch || DEFAULT_REGIONAL_MATCH;
      const playingMatches = data.matches.filter(m => m.status === 'playing');

      let chosen: CueScoreMatch | undefined;
      if (curRm.cueScoreTableFilter) {
        chosen = playingMatches.find(m => m.tableName === curRm.cueScoreTableFilter);
      }
      if (!chosen && curRm.cueScoreMatchId) {
        chosen = data.matches.find(m => m.matchId === curRm.cueScoreMatchId);
      }
      if (!chosen) {
        chosen = playingMatches[0];
      }

      const baseMetaPatch: Partial<RegionalMatchConfig> = {
        cueScoreTournamentId: data.tournamentId,
        cueScoreTournamentName: data.name,
        cueScoreVenueName: data.venueName,
        cueScorePlayersCount: data.players.length,
        cueScoreMatchesCount: data.matches.length,
        cueScorePlayingCount: playingMatches.length,
        cueScoreLastSyncAt: Date.now()
      };

      const matchPatch: Partial<RegionalMatchConfig> = chosen
        ? buildCueScoreMatchPatch(chosen, curRm.cueScoreCustomTargetSets || 5)
        : {
            cueScoreMatchId: '',
            cueScoreHasActiveMatch: Boolean(curRm.cueScoreShowCustomPrompt && curRm.cueScoreHasActiveMatch)
          };

      updateDirector({
        ...latestState,
        situation: 'cuescore_live',
        regionalMatch: {
          ...curRm,
          ...baseMetaPatch,
          ...matchPatch
        }
      });
    } catch (err: any) {
      setCueScoreError(err?.message || 'Erreur lors de la récupération CueScore.');
    } finally {
      if (!silent) {
        setCueScoreLoading(false);
      }
    }
  };

  const loadCueScoreRef = useRef(handleLoadCueScore);
  loadCueScoreRef.current = handleLoadCueScore;

  useEffect(() => {
    if (!rm.cueScoreAutoSync) return;
    const source = (rm.cueScoreInput || rm.cueScoreTournamentId || '').trim();
    if (!source) return;
    const timer = window.setInterval(() => {
      loadCueScoreRef.current(true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [rm.cueScoreAutoSync, rm.cueScoreInput, rm.cueScoreTournamentId]);

  const csPlayingMatches = cueScoreData ? cueScoreData.matches.filter(m => m.status === 'playing') : [];
  const csWaitingMatches = cueScoreData ? cueScoreData.matches.filter(m => m.status === 'waiting') : [];
  const csFinishedMatches = cueScoreData ? cueScoreData.matches.filter(m => m.status === 'finished') : [];

  const formatCueScoreMatchOption = (m: CueScoreMatch) => {
    const tbl = m.tableName ? `${m.tableName} • ` : '';
    const rnd = m.roundName ? ` (${m.roundName})` : '';
    return `${tbl}${m.player1Name} ${m.score1}-${m.score2} ${m.player2Name}${rnd}`;
  };

  const cueScoreTitleDisplay = rm.cueScoreTournamentName?.trim() || cueScoreData?.name || '';
  const cueScoreVenueDisplay = rm.cueScoreVenueName?.trim() || cueScoreData?.venueName || '';
  const cueScorePlayersTotal = rm.cueScorePlayersCount ?? cueScoreData?.players.length ?? 0;
  const cueScoreMatchesTotal = rm.cueScoreMatchesCount ?? cueScoreData?.matches.length ?? 0;
  const cueScorePlayingTotal = rm.cueScorePlayingCount ?? csPlayingMatches.length;

  return (
    <div style={{
      maxWidth: '1480px',
      width: '100%',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem'
    }}>
      {/* 1. SÉLECTEUR DE SITUATION + BARRE DE RÉGIE COMPACTE */}
      <div style={{
        background: directorState.broadcastMode === 'single'
          ? 'linear-gradient(90deg, rgba(185, 28, 28, 0.25), rgba(8, 14, 28, 0.94))'
          : directorState.situation === 'cuescore_live'
            ? 'linear-gradient(90deg, rgba(56, 189, 248, 0.16), rgba(8, 14, 28, 0.94))'
            : 'linear-gradient(90deg, rgba(245, 158, 11, 0.16), rgba(8, 14, 28, 0.94))',
        border: `1.5px solid ${directorState.broadcastMode === 'single' ? '#ef4444' : directorState.situation === 'cuescore_live' ? 'rgba(56, 189, 248, 0.6)' : 'rgba(245, 158, 11, 0.6)'}`,
        borderRadius: '14px',
        padding: '0.6rem 0.9rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.6rem'
      }}>
        {/* Left: Situation Switcher + Mode Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex',
            background: 'rgba(0,0,0,0.45)',
            padding: '3px',
            borderRadius: '9px',
            border: '1px solid rgba(255,255,255,0.12)',
            gap: '3px',
            flexWrap: 'wrap'
          }}>
            <button
              type="button"
              onClick={() => handleSetSituation('club_tables')}
              style={{
                background: directorState.situation === 'club_tables' ? '#10B981' : 'transparent',
                color: directorState.situation === 'club_tables' ? '#000' : 'rgba(255,255,255,0.75)',
                border: 'none',
                borderRadius: '7px',
                padding: '4px 10px',
                fontSize: '0.74rem',
                fontWeight: 900,
                cursor: 'pointer'
              }}
            >
              🏠 Live au Club (Billards)
            </button>
            <button
              type="button"
              onClick={() => handleSetSituation('regional_match')}
              style={{
                background: directorState.situation === 'regional_match' ? '#F59E0B' : 'transparent',
                color: directorState.situation === 'regional_match' ? '#000' : 'rgba(255,255,255,0.75)',
                border: 'none',
                borderRadius: '7px',
                padding: '4px 10px',
                fontSize: '0.74rem',
                fontWeight: 900,
                cursor: 'pointer'
              }}
            >
              🏆 Live Tournoi Régional / Match
            </button>
            <button
              type="button"
              onClick={() => handleSetSituation('cuescore_live')}
              style={{
                background: directorState.situation === 'cuescore_live' ? '#38BDF8' : 'transparent',
                color: directorState.situation === 'cuescore_live' ? '#000' : 'rgba(255,255,255,0.75)',
                border: 'none',
                borderRadius: '7px',
                padding: '4px 10px',
                fontSize: '0.74rem',
                fontWeight: 900,
                cursor: 'pointer'
              }}
            >
              🔗 Live CueScore{rm.cueScoreAutoSync ? ' ⚡' : ''}
            </button>
          </div>

          <span style={{
            background: directorState.broadcastMode === 'single' ? '#ef4444' : '#f59e0b',
            color: directorState.broadcastMode === 'single' ? '#fff' : '#000',
            padding: '4px 9px',
            borderRadius: '7px',
            fontSize: '0.72rem',
            fontWeight: 900,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <Radio size={12} />
            {directorState.broadcastMode === 'single'
              ? `PLEIN ÉCRAN : ${focusedCam?.name || ''} (${focusedAssignment?.title || ''})`
              : `ÉCRAN MULTIPLE (${enabledCount})`}
          </span>

          {directorState.broadcastMode === 'single' && (
            <button
              type="button"
              className="btn btn-neon"
              onClick={handleReturnToMosaic}
              style={{
                width: 'auto',
                padding: '0.4rem 0.8rem',
                fontSize: '0.74rem',
                fontWeight: 900,
                background: '#f59e0b',
                borderColor: '#f59e0b',
                color: '#000'
              }}
            >
              ⊞ Revenir Écran Multiple
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
              style={{ width: 'auto', fontSize: '0.7rem', padding: '4px 8px' }}
            >
              {directorState.mosaicLayout === 'stacked' ? '◫ Côte à côte' : '⊟ Haut / Bas'}
            </button>
          )}
        </div>

        {/* Right: Audio, Add Cam, Add Standings, Platforms Config, Start Live, TV Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {renderPlatformStatusBadge('facebook')}
          {renderPlatformStatusBadge('youtube')}

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setMonitorAudioOnPc(v => !v)}
            style={{
              width: 'auto',
              fontSize: '0.72rem',
              padding: '4px 8px',
              background: monitorAudioOnPc ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255,255,255,0.05)',
              borderColor: monitorAudioOnPc ? '#10b981' : 'rgba(255,255,255,0.2)',
              color: monitorAudioOnPc ? '#34d399' : '#fff'
            }}
            title="Activer/Couper l'écoute sur le PC"
          >
            {monitorAudioOnPc ? <Volume2 size={13} /> : <VolumeX size={13} />}
            {monitorAudioOnPc ? 'Écoute PC' : 'PC Muet'}
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={handleAddCamera}
            style={{ width: 'auto', fontSize: '0.72rem', padding: '4px 8px', color: '#00ffaa', borderColor: 'rgba(0,255,170,0.4)' }}
          >
            <Plus size={13} /> Caméra
          </button>

          {directorState.situation === 'club_tables' && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleAddStandingsScreen}
              style={{
                width: 'auto',
                fontSize: '0.72rem',
                padding: '4px 8px',
                background: 'rgba(245, 158, 11, 0.14)',
                color: '#FBBF24',
                borderColor: 'rgba(245, 158, 11, 0.5)',
                fontWeight: 800
              }}
              title="Ajouter l'écran Classement du Tournoi en direct sans quitter le live"
            >
              <Trophy size={13} /> + Classement
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowPlatformsModal(true)}
            style={{
              width: 'auto',
              fontSize: '0.72rem',
              padding: '4px 8px',
              borderColor: activePlatformsLabel.length > 0 ? 'rgba(59, 130, 246, 0.6)' : 'rgba(245, 158, 11, 0.5)',
              color: activePlatformsLabel.length > 0 ? '#93c5fd' : '#fbbf24'
            }}
          >
            <Settings size={13} />
            {activePlatformsLabel.length > 0
              ? `Clés (${activePlatformsLabel.join('+')})`
              : 'Facebook / YouTube'}
          </button>

          <button
            type="button"
            className="btn btn-neon"
            onClick={handleToggleLiveStream}
            style={{
              width: 'auto',
              padding: '0.45rem 0.9rem',
              fontSize: '0.76rem',
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
                <Play size={13} />
                {activePlatformsLabel.length > 0
                  ? `🔴 LANCER LIVE (${activePlatformsLabel.join('+')})`
                  : '🔴 LANCER LE LIVE'}
              </>
            )}
          </button>

          <a
            href={`${getAppBaseUrl()}/?overlay=director&club=${encodeURIComponent(currentClub.id)}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline"
            style={{ width: 'auto', fontSize: '0.72rem', padding: '4px 8px', textDecoration: 'none', color: '#00ffaa', borderColor: 'rgba(0,255,170,0.4)' }}
            title="Ouvrir la sortie TV plein écran"
          >
            <Tv size={13} /> Sortie TV
          </a>
        </div>
      </div>

      {/* 1B. MODE LIVE CUESCORE (GARDE UNIQUEMENT LES INFOS CUESCORE + AJOUT OPTIONNEL) */}
      {directorState.situation === 'cuescore_live' && (
        <div style={{
          background: 'rgba(8, 16, 30, 0.94)',
          border: '1.5px solid rgba(56, 189, 248, 0.55)',
          borderRadius: '14px',
          padding: '0.8rem 0.95rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem'
        }}>
          {/* Ligne 1 : Lien / ID CueScore + Charger + Sync Auto */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.76rem',
              fontWeight: 900,
              color: '#38BDF8',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap'
            }}>
              <Link2 size={14} /> Tournoi CueScore :
            </span>

            <input
              ref={cueScoreInputRef}
              id="mcb-cuescore-input"
              type="text"
              className="input-field"
              placeholder="Collez le lien ou l'ID CueScore (ex: https://cuescore.com/tournament/.../12345678)"
              value={rm.cueScoreInput || ''}
              onChange={(e) => updateRegionalMatch({ cueScoreInput: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLoadCueScore(false);
                }
              }}
              style={{ flex: '1 1 280px', fontSize: '0.78rem', padding: '5px 9px', minWidth: '220px' }}
            />

            <button
              type="button"
              className="btn btn-neon"
              disabled={cueScoreLoading}
              onClick={() => handleLoadCueScore(false)}
              style={{
                width: 'auto',
                padding: '5px 12px',
                fontSize: '0.75rem',
                fontWeight: 900,
                background: '#38BDF8',
                borderColor: '#38BDF8',
                color: '#000'
              }}
            >
              <RefreshCw size={13} className={cueScoreLoading ? 'animate-spin' : ''} />
              {cueScoreLoading ? 'Chargement...' : 'Charger CueScore'}
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => updateRegionalMatch({ cueScoreAutoSync: !rm.cueScoreAutoSync })}
              style={{
                width: 'auto',
                padding: '5px 10px',
                fontSize: '0.74rem',
                fontWeight: 800,
                background: rm.cueScoreAutoSync ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                borderColor: rm.cueScoreAutoSync ? '#10B981' : 'rgba(255,255,255,0.2)',
                color: rm.cueScoreAutoSync ? '#34D399' : '#CBD5E1'
              }}
              title="Actualise automatiquement CueScore toutes les 8 secondes pendant le live"
            >
              <Zap size={13} /> Sync Auto 8s : {rm.cueScoreAutoSync ? 'ON' : 'OFF'}
            </button>

            {rm.cueScoreLastSyncAt ? (
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                Sync {new Date(rm.cueScoreLastSyncAt).toLocaleTimeString('fr-FR')}
              </span>
            ) : null}
          </div>

          {cueScoreError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.14)',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              color: '#fecaca',
              padding: '5px 9px',
              borderRadius: '8px',
              fontSize: '0.74rem',
              fontWeight: 700
            }}>
              ⚠️ {cueScoreError}
            </div>
          )}

          {/* Ligne 2 : Récapitulatif des informations récupérées de CueScore */}
          {cueScoreTitleDisplay && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              background: 'rgba(14, 165, 233, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '10px',
              padding: '0.6rem 0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.76rem',
                  fontWeight: 900,
                  color: '#34D399',
                  background: 'rgba(16, 185, 129, 0.14)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  padding: '3px 9px',
                  borderRadius: '7px'
                }}>
                  ✅ Tournoi CueScore : {cueScoreTitleDisplay}
                </span>

                {cueScoreVenueDisplay && (
                  <span style={{ fontSize: '0.73rem', color: '#E2E8F0', background: 'rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                    📍 {cueScoreVenueDisplay}
                  </span>
                )}

                <span style={{ fontSize: '0.73rem', color: '#93C5FD', background: 'rgba(59,130,246,0.14)', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                  👥 {cueScorePlayersTotal} joueur(s) • 🎱 {cueScoreMatchesTotal} match(s) ({cueScorePlayingTotal} en cours)
                </span>
              </div>

              {cueScorePlayingTotal === 0 && !rm.cueScoreHasActiveMatch && (
                <div style={{
                  fontSize: '0.74rem',
                  color: '#BAE6FD',
                  fontWeight: 700
                }}>
                  ℹ️ Aucun match en direct sur CueScore actuellement — Le live affiche uniquement les informations CueScore du tournoi (sans joueurs fictifs ni score 0-0).
                </div>
              )}

              {cueScoreData && cueScoreData.matches.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <select
                    className="input-field"
                    value={rm.cueScoreMatchId || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        updateRegionalMatch({
                          cueScoreMatchId: '',
                          cueScoreTableFilter: '',
                          cueScoreHasActiveMatch: false
                        });
                        return;
                      }
                      const chosen = cueScoreData.matches.find(m => m.matchId === val);
                      if (chosen) {
                        updateRegionalMatch(buildCueScoreMatchPatch(chosen, rm.cueScoreCustomTargetSets || 5));
                      }
                    }}
                    title="Sélectionner un match CueScore ou rester sur les infos du tournoi uniquement"
                    style={{ flex: '1 1 280px', fontSize: '0.74rem', padding: '4px 8px', background: '#0b1426', color: '#fff', fontWeight: 700 }}
                  >
                    <option value="">— Aucun match (Infos tournoi CueScore uniquement) —</option>
                    {csPlayingMatches.length > 0 && (
                      <optgroup label="🔴 En cours">
                        {csPlayingMatches.map(m => (
                          <option key={m.matchId} value={m.matchId}>
                            {formatCueScoreMatchOption(m)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {csWaitingMatches.length > 0 && (
                      <optgroup label="⏳ À venir">
                        {csWaitingMatches.map(m => (
                          <option key={m.matchId} value={m.matchId}>
                            {formatCueScoreMatchOption(m)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {csFinishedMatches.length > 0 && (
                      <optgroup label="✅ Terminés">
                        {csFinishedMatches.map(m => (
                          <option key={m.matchId} value={m.matchId}>
                            {formatCueScoreMatchOption(m)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {cueScoreData.tables.length > 0 && (
                    <select
                      className="input-field"
                      value={rm.cueScoreTableFilter || ''}
                      onChange={(e) => {
                        const tableName = e.target.value;
                        if (!tableName) {
                          updateRegionalMatch({ cueScoreTableFilter: '' });
                          return;
                        }
                        const playingOnTable = cueScoreData.matches.find(
                          m => m.tableName === tableName && m.status === 'playing'
                        );
                        if (playingOnTable) {
                          updateRegionalMatch({
                            cueScoreTableFilter: tableName,
                            ...buildCueScoreMatchPatch(playingOnTable, rm.cueScoreCustomTargetSets || 5)
                          });
                        } else {
                          updateRegionalMatch({
                            cueScoreTableFilter: tableName,
                            cueScoreMatchId: '',
                            cueScoreHasActiveMatch: false
                          });
                        }
                      }}
                      title="Suivre automatiquement tous les matchs en cours d'une table CueScore"
                      style={{ flex: '0 1 230px', fontSize: '0.74rem', padding: '4px 8px', background: '#0b1426', color: '#FBBF24', fontWeight: 800 }}
                    >
                      <option value="">Suivi manuel</option>
                      {cueScoreData.tables.map(tbl => (
                        <option key={tbl} value={tbl}>
                          🎱 Suivre auto {tbl}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Ligne 3 : Question à l'utilisateur pour informations complémentaires */}
          {cueScoreTitleDisplay && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.6rem',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '10px',
              padding: '0.55rem 0.8rem'
            }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fff' }}>
                💬 Voulez-vous renseigner d'autres informations à afficher sur le live ?
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() =>
                    updateRegionalMatch({
                      cueScoreShowCustomPrompt: false,
                      cueScoreCustomSubtitle: '',
                      ...(!rm.cueScoreMatchId ? { cueScoreHasActiveMatch: false } : {})
                    })
                  }
                  style={{
                    background: !rm.cueScoreShowCustomPrompt ? '#10B981' : 'rgba(255,255,255,0.08)',
                    color: !rm.cueScoreShowCustomPrompt ? '#000' : '#E2E8F0',
                    border: 'none',
                    borderRadius: '7px',
                    padding: '5px 10px',
                    fontSize: '0.73rem',
                    fontWeight: 900,
                    cursor: 'pointer'
                  }}
                >
                  ✅ Garder uniquement les infos CueScore
                </button>
                <button
                  type="button"
                  onClick={() => updateRegionalMatch({ cueScoreShowCustomPrompt: true })}
                  style={{
                    background: rm.cueScoreShowCustomPrompt ? '#F59E0B' : 'rgba(245, 158, 11, 0.18)',
                    color: rm.cueScoreShowCustomPrompt ? '#000' : '#FBBF24',
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                    borderRadius: '7px',
                    padding: '5px 10px',
                    fontSize: '0.73rem',
                    fontWeight: 900,
                    cursor: 'pointer'
                  }}
                >
                  ✏️ Oui, renseigner d'autres informations
                </button>
              </div>
            </div>
          )}

          {/* Ligne 4 : Champs optionnels si l'utilisateur a choisi d'ajouter d'autres infos */}
          {rm.cueScoreShowCustomPrompt && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              background: 'rgba(245, 158, 11, 0.06)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '10px',
              padding: '0.7rem 0.8rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#FBBF24', whiteSpace: 'nowrap' }}>
                  Information / Sous-titre :
                </span>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: Tournoi dans 1 semaine • Inscriptions ouvertes, Table TV..."
                  value={rm.cueScoreCustomSubtitle || ''}
                  onChange={(e) => updateRegionalMatch({ cueScoreCustomSubtitle: e.target.value })}
                  style={{ flex: '1 1 260px', fontSize: '0.78rem', padding: '5px 9px' }}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() =>
                    updateRegionalMatch({ cueScoreHasActiveMatch: !rm.cueScoreHasActiveMatch })
                  }
                  style={{
                    width: 'auto',
                    padding: '5px 10px',
                    fontSize: '0.73rem',
                    fontWeight: 800,
                    background: rm.cueScoreHasActiveMatch ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                    borderColor: rm.cueScoreHasActiveMatch ? '#10B981' : 'rgba(255,255,255,0.2)',
                    color: rm.cueScoreHasActiveMatch ? '#34D399' : '#E2E8F0'
                  }}
                >
                  🎱 Afficher un duel / score de joueurs : {rm.cueScoreHasActiveMatch ? 'OUI' : 'NON'}
                </button>
              </div>

              {rm.cueScoreHasActiveMatch && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr auto 1.2fr',
                  gap: '0.9rem',
                  alignItems: 'center'
                }}>
                  <datalist id="mcb-cuescore-players-list">
                    {playerSuggestions.map(p => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>

                  {/* PLAYER 1 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    borderRadius: '10px',
                    padding: '0.5rem 0.65rem'
                  }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
                      <input
                        type="text"
                        list="mcb-cuescore-players-list"
                        className="input-field"
                        placeholder="Nom Joueur 1"
                        value={rm.cueScoreCustomP1Name || ''}
                        onChange={(e) => autoFillCueScoreCustomClub(e.target.value, 1)}
                        style={{ fontSize: '0.84rem', fontWeight: 800, padding: '4px 8px' }}
                      />
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Club Joueur 1"
                        value={rm.cueScoreCustomP1Club || ''}
                        onChange={(e) => updateRegionalMatch({ cueScoreCustomP1Club: e.target.value })}
                        style={{ fontSize: '0.74rem', padding: '3px 8px', color: '#34D399' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => updateRegionalMatch({ cueScoreCustomScore1: Math.max(0, (rm.cueScoreCustomScore1 || 0) - 1) })}
                        style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                      >
                        <Minus size={15} />
                      </button>
                      <span style={{ fontSize: '1.65rem', fontWeight: 900, minWidth: '30px', textAlign: 'center', color: '#FBBF24' }}>
                        {rm.cueScoreCustomScore1 || 0}
                      </span>
                      <button
                        type="button"
                        className="btn btn-neon"
                        onClick={() => updateRegionalMatch({ cueScoreCustomScore1: (rm.cueScoreCustomScore1 || 0) + 1 })}
                        style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center', color: '#000' }}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  {/* TARGET SETS & RESET */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>1er à :</span>
                      <input
                        type="number"
                        className="input-field"
                        min={0}
                        max={35}
                        value={rm.cueScoreCustomTargetSets ?? 5}
                        onChange={(e) => updateRegionalMatch({ cueScoreCustomTargetSets: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        style={{ width: '54px', padding: '3px 5px', fontSize: '0.78rem', fontWeight: 800, textAlign: 'center' }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => updateRegionalMatch({ cueScoreCustomScore1: 0, cueScoreCustomScore2: 0 })}
                      style={{ width: 'auto', padding: '4px 8px', fontSize: '0.72rem' }}
                    >
                      <RotateCcw size={12} /> 0-0
                    </button>
                  </div>

                  {/* PLAYER 2 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '10px',
                    padding: '0.5rem 0.65rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => updateRegionalMatch({ cueScoreCustomScore2: Math.max(0, (rm.cueScoreCustomScore2 || 0) - 1) })}
                        style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center' }}
                      >
                        <Minus size={15} />
                      </button>
                      <span style={{ fontSize: '1.65rem', fontWeight: 900, minWidth: '30px', textAlign: 'center', color: '#FBBF24' }}>
                        {rm.cueScoreCustomScore2 || 0}
                      </span>
                      <button
                        type="button"
                        className="btn btn-neon"
                        onClick={() => updateRegionalMatch({ cueScoreCustomScore2: (rm.cueScoreCustomScore2 || 0) + 1 })}
                        style={{ width: '32px', height: '32px', padding: 0, justifyContent: 'center', color: '#000' }}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
                      <input
                        type="text"
                        list="mcb-cuescore-players-list"
                        className="input-field"
                        placeholder="Nom Joueur 2"
                        value={rm.cueScoreCustomP2Name || ''}
                        onChange={(e) => autoFillCueScoreCustomClub(e.target.value, 2)}
                        style={{ fontSize: '0.84rem', fontWeight: 800, padding: '4px 8px', textAlign: 'right' }}
                      />
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Club Joueur 2"
                        value={rm.cueScoreCustomP2Club || ''}
                        onChange={(e) => updateRegionalMatch({ cueScoreCustomP2Club: e.target.value })}
                        style={{ fontSize: '0.74rem', padding: '3px 8px', color: '#FBBF24', textAlign: 'right' }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 1C. BANDEAU MATCH TOURNOI RÉGIONAL (JOUEURS, CLUBS & SCORE EN DIRECT) */}
      {directorState.situation === 'regional_match' && (
        <div style={{
          background: 'rgba(8, 16, 30, 0.94)',
          border: '1.5px solid rgba(245, 158, 11, 0.5)',
          borderRadius: '14px',
          padding: '0.75rem 0.95rem',
          display: 'grid',
          gridTemplateColumns: '1.2fr auto 1.2fr',
          gap: '0.9rem',
          alignItems: 'center'
        }}>
          <datalist id="mcb-regional-players-list">
            {playerSuggestions.map(p => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>

          {/* PLAYER 1 + SCORE 1 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '10px',
            padding: '0.5rem 0.65rem'
          }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
              <input
                type="text"
                list="mcb-regional-players-list"
                className="input-field"
                placeholder="Nom Joueur 1"
                value={rm.player1Name}
                onChange={(e) => autoFillPlayerClub(e.target.value, 1)}
                style={{ fontSize: '0.84rem', fontWeight: 800, padding: '4px 8px' }}
              />
              <input
                type="text"
                className="input-field"
                placeholder="Club Joueur 1 (ex: BC 41)"
                value={rm.player1Club}
                onChange={(e) => updateRegionalMatch({ player1Club: e.target.value })}
                style={{ fontSize: '0.74rem', padding: '3px 8px', color: '#34D399' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => updateRegionalMatch({ score1: Math.max(0, (rm.score1 || 0) - 1) })}
                style={{ width: '34px', height: '34px', padding: 0, justifyContent: 'center' }}
              >
                <Minus size={16} />
              </button>
              <span style={{ fontSize: '1.8rem', fontWeight: 900, minWidth: '34px', textAlign: 'center', color: '#FBBF24' }}>
                {rm.score1}
              </span>
              <button
                type="button"
                className="btn btn-neon"
                onClick={() => updateRegionalMatch({ score1: (rm.score1 || 0) + 1 })}
                style={{ width: '34px', height: '34px', padding: 0, justifyContent: 'center', color: '#000' }}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* CENTER: EVENT TITLE, FORMAT & RESET */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', minWidth: '210px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Titre (ex: Tournoi Régional - Finale)"
              value={rm.eventTitle}
              onChange={(e) => updateRegionalMatch({ eventTitle: e.target.value })}
              style={{ fontSize: '0.8rem', fontWeight: 800, padding: '4px 8px', textAlign: 'center', color: '#FBBF24' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>1er à :</span>
              <input
                type="number"
                className="input-field"
                min={0}
                max={35}
                value={rm.targetSets}
                onChange={(e) => updateRegionalMatch({ targetSets: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                style={{ width: '54px', padding: '3px 5px', fontSize: '0.78rem', fontWeight: 800, textAlign: 'center' }}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => updateRegionalMatch({ score1: 0, score2: 0 })}
                style={{ width: 'auto', padding: '4px 8px', fontSize: '0.72rem' }}
                title="Remettre le score à 0 - 0 pour un nouveau match"
              >
                <RotateCcw size={12} /> 0-0
              </button>
            </div>
          </div>

          {/* PLAYER 2 + SCORE 2 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '10px',
            padding: '0.5rem 0.65rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => updateRegionalMatch({ score2: Math.max(0, (rm.score2 || 0) - 1) })}
                style={{ width: '34px', height: '34px', padding: 0, justifyContent: 'center' }}
              >
                <Minus size={16} />
              </button>
              <span style={{ fontSize: '1.8rem', fontWeight: 900, minWidth: '34px', textAlign: 'center', color: '#FBBF24' }}>
                {rm.score2}
              </span>
              <button
                type="button"
                className="btn btn-neon"
                onClick={() => updateRegionalMatch({ score2: (rm.score2 || 0) + 1 })}
                style={{ width: '34px', height: '34px', padding: 0, justifyContent: 'center', color: '#000' }}
              >
                <Plus size={16} />
              </button>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
              <input
                type="text"
                list="mcb-regional-players-list"
                className="input-field"
                placeholder="Nom Joueur 2"
                value={rm.player2Name}
                onChange={(e) => autoFillPlayerClub(e.target.value, 2)}
                style={{ fontSize: '0.84rem', fontWeight: 800, padding: '4px 8px', textAlign: 'right' }}
              />
              <input
                type="text"
                className="input-field"
                placeholder="Club Joueur 2 (ex: BC Tours)"
                value={rm.player2Club}
                onChange={(e) => updateRegionalMatch({ player2Club: e.target.value })}
                style={{ fontSize: '0.74rem', padding: '3px 8px', color: '#FBBF24', textAlign: 'right' }}
              />
            </div>
          </div>
        </div>
      )}

      {broadcasterStatus.lastError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.14)',
          border: '1px solid rgba(239, 68, 68, 0.45)',
          color: '#fecaca',
          padding: '0.45rem 0.85rem',
          borderRadius: '10px',
          fontSize: '0.75rem',
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

      {/* 2. DISPOSITION 2 COLONNES : SOURCES À GAUCHE + APERÇU ÉCRAN MULTIPLE LIVE À DROITE */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(480px, 1.35fr) minmax(360px, 1fr)',
        gap: '1rem',
        alignItems: 'start'
      }}>
        {/* LEFT COLUMN: SOURCE WINDOWS (CAMERAS + LIVE SCREENS) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '0.75rem'
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
              onScoreClubMatch={updateMatchScore}
              registerVideoEl={registerVideoEl}
              canDelete={directorState.cameras.length > 2}
            />
          ))}
        </div>

        {/* RIGHT COLUMN (STICKY): LIVE OUTPUT PREVIEW (ÉCRAN MULTIPLE / PLEIN ÉCRAN) */}
        <div
          ref={previewContainerRef}
          style={{
            position: 'sticky',
            top: '0.5rem',
            background: 'rgba(5, 10, 22, 0.96)',
            border: `2px solid ${directorState.broadcastMode === 'single' ? 'rgba(239, 68, 68, 0.7)' : 'rgba(0, 255, 170, 0.45)'}`,
            borderRadius: '14px',
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
            boxShadow: '0 10px 30px rgba(0,0,0,0.55)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 900, color: '#00ffaa' }}>
              <MonitorPlay size={16} />
              APERÇU DU LIVE ({directorState.broadcastMode === 'single' ? 'Plein Écran' : 'Écran Multiple'})
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {directorState.broadcastMode === 'single' && (
                <button
                  type="button"
                  onClick={handleReturnToMosaic}
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '3px 8px', fontSize: '0.68rem', fontWeight: 800, color: '#FBBF24', borderColor: '#F59E0B' }}
                >
                  ⊞ Mosaïque
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    previewContainerRef.current?.requestFullscreen?.();
                  } else {
                    document.exitFullscreen?.();
                  }
                }}
                className="btn btn-outline"
                style={{ width: 'auto', padding: '3px 8px', fontSize: '0.68rem' }}
                title="Agrandir l'aperçu en plein écran"
              >
                <Maximize2 size={12} /> Plein écran
              </button>
            </div>
          </div>

          <canvas
            ref={(el) => {
              previewCanvasRef.current = el;
              broadcasterRef.current?.setPreviewCanvas(el);
            }}
            onClick={handlePreviewCanvasClick}
            width={960}
            height={540}
            title={
              directorState.broadcastMode === 'mosaic'
                ? 'Aperçu en direct de l’Écran Multiple — Cliquez sur un cadran pour le diffuser seul'
                : 'Cliquez sur l’aperçu pour revenir à l’Écran Multiple'
            }
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: '10px',
              background: '#000',
              display: 'block',
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.12)'
            }}
          />

          <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <span>
              {directorState.broadcastMode === 'mosaic'
                ? '💡 Cliquez directement sur un cadran ici (ou à gauche) pour le passer en plein écran.'
                : '💡 Cliquez sur l’aperçu (ou sur « ⊞ Mosaïque ») pour revenir à l’Écran Multiple.'}
            </span>
          </div>
        </div>
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
