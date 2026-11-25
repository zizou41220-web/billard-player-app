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
  Sun,
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
import { getPlayerAvatar, isCustomPlayerPhoto } from '../utils/avatar';
import {
  CueScoreMatch,
  CueScoreTournamentData,
  fetchCueScoreTournament
} from '../utils/cueScore';
import {
  CAMERA_IMAGE_PRESETS,
  CUSTOM_VIEW_PRESETS,
  CameraSignalingHandle,
  DEFAULT_MOSAIC_HEADER,
  DEFAULT_REGIONAL_MATCH,
  DEFAULT_SHOT_CLOCK,
  DirectorAssignmentType,
  DirectorCameraSlot,
  DirectorCameraSourceType,
  DirectorLiveSituation,
  DirectorMosaicLayout,
  MosaicHeaderConfig,
  MultiCamDirectorState,
  RTC_ICE_CONFIG,
  RegionalMatchConfig,
  ShotClockState,
  StreamDestinationsConfig,
  StreamQualityPreset,
  buildCameraVideoFilter,
  createCameraSignalingChannel,
  getShotClockRemainingMs,
  hasCustomCameraImageGrading,
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
  STREAM_QUALITY_PROFILES,
  drawVirtualScreenToCanvas,
  formatTournamentStageLabel,
  getMosaicGridRects,
  isActiveLiveMatch,
  resolveCameraAssignment
} from '../utils/liveBroadcaster';
import {
  DEFAULT_LIVE_OVERLAY_CONFIG,
  DEFAULT_TICKER_CONFIG,
  LiveOverlayConfig,
  LiveOverlayProject,
  fetchOverlayProjectsFromCloud,
  loadActiveOverlayProjectId,
  loadLiveOverlayConfig,
  loadOverlayProjects,
  readOverlayImageFile,
  saveActiveOverlayProjectId,
  saveLiveOverlayConfig,
  subscribeToLiveOverlayConfig,
  subscribeToOverlayProjects
} from '../utils/liveOverlay';
import { parseRtmpStreamInput } from '../utils/video';
import { ObsStatusSnapshot, checkObsStatus, startObsStream, stopObsStream } from '../utils/obsControl';

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
  onFinishClubMatch: (matchId: string) => void;
  onApplyImageToAll?: (patch: { brightness: number; contrast: number; saturation: number }) => void;
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
  onFinishClubMatch,
  onApplyImageToAll,
  registerVideoEl,
  canDelete
}) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const virtualCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showImageAdjust, setShowImageAdjust] = useState(false);
  const [editingCustomTitle, setEditingCustomTitle] = useState(false);

  const isVirtual = isVirtualScreenSource(slot.sourceType);
  const videoFilter = buildCameraVideoFilter(slot);
  const hasCustomImage = hasCustomCameraImageGrading(slot);
  const curBrightness = Math.round(slot.brightness ?? 100);
  const curContrast = Math.round(slot.contrast ?? 100);
  const curSaturation = Math.round(slot.saturation ?? 100);
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
        el.play().catch(() => { });
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
    drawVirtualScreenToCanvas(
      ctx,
      0,
      0,
      canvas.width,
      canvas.height,
      slot,
      {
        tables,
        matches,
        players,
        tournaments,
        currentClub
      },
      { hideTopHeader: true, bottomReservePx: 26 }
    );
  }, [isVirtual, slot, tables, matches, players, tournaments, currentClub]);

  const assignment = resolveCameraAssignment(
    slot,
    { tables, matches, players, tournaments, currentClub },
    directorState
  );

  const activeTournament =
    Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;
  const activeTournamentMatches = activeTournament
    ? Object.values(matches)
      .filter(
        m =>
          m.status !== 'finished' &&
          Boolean(m.player1Id && m.player2Id) &&
          m.tournamentId === activeTournament.id
      )
      .sort((a, b) => {
        if (a.status === 'playing' && b.status !== 'playing') return -1;
        if (a.status !== 'playing' && b.status === 'playing') return 1;
        return (a.tableId ? 0 : 1) - (b.tableId ? 0 : 1);
      })
    : [];

  const assignmentSelectValue = (() => {
    if (slot.assignmentType === 'table') return `table:${slot.tableId || ''}`;
    if (slot.assignmentType === 'tournament_match') {
      return `tournament_match:${assignment.match?.id || slot.tournamentMatchId || ''}`;
    }
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
        tableId: val.slice('table:'.length),
        tournamentMatchId: undefined
      });
    } else if (val.startsWith('tournament_match:')) {
      setEditingCustomTitle(false);
      onUpdateSlot(slot.id, {
        assignmentType: 'tournament_match' as DirectorAssignmentType,
        tournamentMatchId: val.slice('tournament_match:'.length)
      });
    } else if (val === 'live_match') {
      setEditingCustomTitle(false);
      onUpdateSlot(slot.id, {
        assignmentType: 'live_match',
        tournamentMatchId: undefined
      });
    } else if (val.startsWith('preset:')) {
      setEditingCustomTitle(false);
      onUpdateSlot(slot.id, {
        assignmentType: 'custom_view',
        customViewTitle: val.slice('preset:'.length),
        tournamentMatchId: undefined
      });
    } else if (val === 'custom_text') {
      setEditingCustomTitle(true);
      onUpdateSlot(slot.id, {
        assignmentType: 'custom_view',
        customViewTitle: slot.customViewTitle || 'Vue personnalisée',
        tournamentMatchId: undefined
      });
    }
  };

  const borderStyle = isFocused
    ? '2px solid #EF4444'
    : isInMosaic && isAudioSelected
      ? '1px solid rgba(212, 175, 55, 0.55)'
      : isInMosaic
        ? '1px solid rgba(255, 255, 255, 0.16)'
        : '1px solid rgba(255, 255, 255, 0.08)';

  const cardShadow = isFocused
    ? '0 0 18px rgba(239, 68, 68, 0.35)'
    : 'none';

  return (
    <div style={{
      background: isFocused ? 'rgba(32, 10, 16, 0.95)' : '#060A13',
      border: borderStyle,
      boxShadow: cardShadow,
      borderRadius: '10px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      opacity: slot.enabled ? 1 : 0.56,
      transition: 'border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease'
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

        {!isVirtual && (
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
              filter: videoFilter !== 'none' ? videoFilter : undefined,
              transition: 'transform 0.2s ease',
              display: 'block'
            }}
          />
        )}

        {!isVirtual && !activeStream && (
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
              {slot.sourceType === 'usb'
                ? 'Choisir caméra PC / USB'
                : connectionState === 'connecting'
                  ? 'Connexion smartphone...'
                  : 'Smartphone non connecté'}
            </div>
          </div>
        )}

        {/* Top Overlay: Tally + Assignment + Audio (uniform across both cameras and virtual screens) */}
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
                ? 'rgba(239, 68, 68, 0.92)'
                : isInMosaic
                  ? 'rgba(10, 14, 22, 0.88)'
                  : 'rgba(10, 14, 22, 0.78)',
              border: isFocused
                ? '1px solid #ef4444'
                : isInMosaic
                  ? '1px solid rgba(212, 175, 55, 0.65)'
                  : '1px solid rgba(255,255,255,0.14)',
              color: isFocused ? '#fff' : isInMosaic ? '#FDE68A' : 'rgba(255,255,255,0.6)',
              padding: '2px 7px',
              borderRadius: '4px',
              fontSize: '0.6rem',
              fontWeight: 800,
              letterSpacing: '0.4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: isFocused ? '#fff' : isInMosaic ? '#D4AF37' : '#64748B'
              }} />
              {isFocused ? 'PGM' : isInMosaic ? 'MOSAÏQUE' : 'VEILLE'}
            </span>
            <span style={{
              background: 'rgba(10, 14, 22, 0.86)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: isVirtual ? '#6EE7B7' : '#E2E8F0',
              padding: '2px 7px',
              borderRadius: '4px',
              fontSize: '0.62rem',
              fontWeight: 700
            }}>
              {isExternalLive ? slot.name : assignment.title}
            </span>
          </div>

          {!isVirtual && (
            <span style={{
              background: isAudioSelected ? 'rgba(16, 185, 129, 0.22)' : 'rgba(10, 14, 22, 0.78)',
              border: `1px solid ${isAudioSelected ? 'rgba(16, 185, 129, 0.65)' : 'rgba(255,255,255,0.12)'}`,
              color: isAudioSelected ? '#6EE7B7' : 'rgba(255,255,255,0.55)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '0.6rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px'
            }}>
              {isAudioSelected ? <Volume2 size={10} /> : <VolumeX size={10} />}
              {isAudioSelected ? 'AUDIO' : 'MUET'}
            </span>
          )}
        </div>

        {/* Bottom Overlay (uniform across both cameras and virtual screens) */}
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
            background: 'rgba(5, 10, 22, 0.86)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: '4px',
            padding: '2px 7px',
            fontSize: '0.64rem',
            fontWeight: 700,
            color: '#E2E8F0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '70%'
          }}>
            {!isVirtual && assignment.isMatchView && assignment.p1Name && assignment.p2Name && assignment.score1 !== undefined && assignment.score2 !== undefined ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                {assignment.p1 && (
                  <img
                    src={getPlayerAvatar(assignment.p1)}
                    alt=""
                    style={{ width: '17px', height: '17px', borderRadius: '4px', objectFit: 'cover', objectPosition: 'center 22%', border: '1px solid #10B981', flexShrink: 0 }}
                  />
                )}
                <span>{assignment.p1Name}</span>
                <span style={{ color: '#FBBF24', margin: '0 2px', fontWeight: 900 }}>
                  {assignment.score1}-{assignment.score2}
                </span>
                <span>{assignment.p2Name}</span>
                {assignment.p2 && (
                  <img
                    src={getPlayerAvatar(assignment.p2)}
                    alt=""
                    style={{ width: '17px', height: '17px', borderRadius: '4px', objectFit: 'cover', objectPosition: 'center 22%', border: '1px solid #38BDF8', flexShrink: 0 }}
                  />
                )}
              </span>
            ) : (
              <span>{isExternalLive ? slot.name : assignment.subtitle}</span>
            )}
          </div>

          <span style={{
            background: isFocused ? 'rgba(239,68,68,0.92)' : 'rgba(10,14,22,0.82)',
            border: `1px solid ${isFocused ? '#EF4444' : 'rgba(255,255,255,0.14)'}`,
            color: '#F8FAFC',
            padding: '2px 7px',
            borderRadius: '4px',
            fontSize: '0.6rem',
            fontWeight: 700
          }}>
            {isFocused ? 'Retour Mosaïque' : 'Diffuser seul'}
          </span>
        </div>
      </div>

      {/* Controls Under Video */}
      <div style={{
        padding: '0.42rem 0.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        background: '#080C15',
        borderTop: '1px solid rgba(255,255,255,0.08)'
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
              <span style={{ fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '64px' }}>
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
              <button
                type="button"
                className="btn btn-outline"
                disabled={assignment.match.score1 === assignment.match.score2}
                onClick={() => onFinishClubMatch(assignment.match!.id)}
                style={{
                  width: 'auto',
                  height: '22px',
                  padding: '0 6px',
                  fontSize: '0.62rem',
                  fontWeight: 900,
                  borderColor: assignment.match.score1 !== assignment.match.score2 ? '#10B981' : 'rgba(255,255,255,0.16)',
                  color: assignment.match.score1 !== assignment.match.score2 ? '#34D399' : 'rgba(255,255,255,0.4)'
                }}
                title={assignment.match.score1 !== assignment.match.score2 ? 'Valider la fin du match et passer au suivant' : 'Égalité : modifiez le score avant de valider'}
              >
                ✅ Fin
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.32rem', flexWrap: 'wrap' }}>
          {!isVirtual && !isExternalLive && (
            <select
              className="input-field"
              value={assignmentSelectValue}
              onChange={(e) => handleAssignmentChange(e.target.value)}
              title="Attitrer cette caméra à un billard, un match du tournoi ou une autre vue"
              style={{
                flex: '1 1 105px',
                minWidth: 0,
                height: '28px',
                fontSize: '0.7rem',
                padding: '0 6px',
                borderRadius: '6px',
                background: '#0E1525',
                borderColor: 'rgba(255,255,255,0.14)',
                color: '#FDE68A',
                fontWeight: 700
              }}
            >
              <optgroup label="🎱 Billards du Club (Rotation auto)">
                {sortedTables.map(t => {
                  const tblMatch = t.currentMatchId
                    ? matches[t.currentMatchId]
                    : Object.values(matches).find(m => m.tableId === t.id && isActiveLiveMatch(m, tournaments));
                  const validTblMatch = isActiveLiveMatch(tblMatch, tournaments) ? tblMatch : undefined;
                  const tp1 = validTblMatch ? players[validTblMatch.player1Id]?.name : undefined;
                  const tp2 = validTblMatch ? players[validTblMatch.player2Id]?.name : undefined;
                  const duelLabel = validTblMatch && tp1 && tp2 ? ` • ${tp1} ${validTblMatch.score1}-${validTblMatch.score2} ${tp2}` : '';
                  return (
                    <option key={t.id} value={`table:${t.id}`}>
                      🎱 {t.name || `Billard ${t.number}`}{duelLabel}
                    </option>
                  );
                })}
              </optgroup>
              {activeTournamentMatches.length > 0 && (
                <optgroup label="🏆 Matchs du Tournoi de l'Appli">
                  {activeTournamentMatches.map(tm => {
                    const tmP1 = players[tm.player1Id]?.name || 'Joueur 1';
                    const tmP2 = players[tm.player2Id]?.name || 'Joueur 2';
                    const tmTbl = tm.tableId ? tables[tm.tableId] : undefined;
                    const tmTour = tm.tournamentId ? tournaments[tm.tournamentId] : activeTournament;
                    const tmStage = formatTournamentStageLabel(tm, tmTour);
                    const tblPrefix = tmTbl ? `[${tmTbl.name || `Billard ${tmTbl.number}`}] ` : '';
                    const stageSuffix = tmStage ? ` • ${tmStage}` : '';
                    return (
                      <option key={tm.id} value={`tournament_match:${tm.id}`}>
                        🏆 {tblPrefix}{tmP1} {tm.score1}-{tm.score2} {tmP2}{stageSuffix}
                      </option>
                    );
                  })}
                </optgroup>
              )}
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
              const virtualDefaultNames = ['Classement Tournoi', 'Tableau Final', 'Scores Billards', 'Classement Club'];
              const fallbackCamName = virtualDefaultNames.includes(slot.name)
                ? (assignment.title || 'Caméra')
                : slot.name;
              if (v.startsWith('usb:')) {
                onUpdateSlot(slot.id, {
                  sourceType: 'usb' as DirectorCameraSourceType,
                  usbDeviceId: v.slice(4),
                  name: fallbackCamName
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
                          : fallbackCamName;
                onUpdateSlot(slot.id, {
                  sourceType: nextType,
                  name: autoName
                });
              }
            }}
            title="Source vidéo ou écran graphique en direct"
            style={{
              flex: '1.25 1 135px',
              minWidth: 0,
              height: '28px',
              fontSize: '0.7rem',
              padding: '0 6px',
              borderRadius: '6px',
              background: '#0E1525',
              borderColor: 'rgba(255,255,255,0.14)',
              color: isVirtual ? '#6EE7B7' : '#F8FAFC',
              fontWeight: 600
            }}
          >
            <optgroup label="Caméras">
              <option value="smartphone_webrtc">Smartphone (QR Code)</option>
              {videoDevices.map((d, idx) => (
                <option key={d.deviceId} value={`usb:${d.deviceId}`}>
                  {d.label || `Caméra PC #${idx + 1}`}
                </option>
              ))}
              {videoDevices.length === 0 && (
                <option value="usb">Caméra USB / PC</option>
              )}
            </optgroup>
            {!isExternalLive && (
              <optgroup label="Écrans Live (Régie)">
                <option value="tournament_standings">Classement du Tournoi</option>
                <option value="tournament_bracket">Tableau Phases Finales</option>
                <option value="matches_live_board">Scores des Billards</option>
                <option value="club_leaderboard">Classement Club</option>
              </optgroup>
            )}
          </select>

          {slot.sourceType === 'smartphone_webrtc' && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onOpenQr(slot.id)}
              style={{
                width: 'auto',
                height: '28px',
                padding: '0 8px',
                borderRadius: '6px',
                fontSize: '0.68rem',
                fontWeight: 700,
                background: '#131C2E',
                borderColor: 'rgba(212, 175, 55, 0.45)',
                color: '#FDE68A'
              }}
              title="Afficher le QR Code caméra smartphone"
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
                width: '28px',
                height: '28px',
                padding: 0,
                justifyContent: 'center',
                borderRadius: '6px',
                fontSize: '0.68rem',
                background: isAudioSelected ? 'rgba(16, 185, 129, 0.18)' : '#0E1525',
                borderColor: isAudioSelected ? 'rgba(16, 185, 129, 0.65)' : 'rgba(255,255,255,0.14)',
                color: isAudioSelected ? '#6EE7B7' : '#CBD5E1'
              }}
              title="Écouter uniquement le micro de cette caméra"
            >
              {isAudioSelected ? <Volume2 size={12} /> : <VolumeX size={12} />}
            </button>
          )}

          {!isVirtual && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setShowImageAdjust(v => {
                  const next = !v;
                  if (next) setShowAdvanced(false);
                  return next;
                });
              }}
              style={{
                width: '28px',
                height: '28px',
                padding: 0,
                justifyContent: 'center',
                borderRadius: '6px',
                fontSize: '0.68rem',
                background: showImageAdjust || hasCustomImage ? 'rgba(212, 175, 55, 0.18)' : '#0E1525',
                borderColor: showImageAdjust || hasCustomImage ? 'rgba(212, 175, 55, 0.65)' : 'rgba(255,255,255,0.14)',
                color: showImageAdjust || hasCustomImage ? '#FDE68A' : '#CBD5E1'
              }}
              title="Régler la luminosité, le contraste et la saturation de cette caméra"
            >
              <Sun size={12} />
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setShowAdvanced(v => {
                const next = !v;
                if (next) setShowImageAdjust(false);
                return next;
              });
            }}
            style={{
              width: '28px',
              height: '28px',
              padding: 0,
              justifyContent: 'center',
              borderRadius: '6px',
              fontSize: '0.68rem',
              background: showAdvanced ? '#1E293B' : '#0E1525',
              borderColor: showAdvanced ? 'rgba(212, 175, 55, 0.5)' : 'rgba(255,255,255,0.14)',
              color: showAdvanced ? '#FDE68A' : '#CBD5E1'
            }}
            title="Réglages (Nom, Rotation, Zoom, Masquer, Supprimer)"
          >
            <Settings size={12} />
          </button>
        </div>

        {!isVirtual && showImageAdjust && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            padding: '0.45rem 0.5rem',
            marginTop: '0.1rem',
            borderRadius: '7px',
            background: '#060A13',
            border: '1px solid rgba(212, 175, 55, 0.28)',
            fontSize: '0.67rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#FDE68A', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Sun size={11} /> Image
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap' }}>
                {CAMERA_IMAGE_PRESETS.map(p => {
                  const isActive =
                    curBrightness === p.brightness &&
                    curContrast === p.contrast &&
                    curSaturation === p.saturation;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        onUpdateSlot(slot.id, {
                          brightness: p.brightness,
                          contrast: p.contrast,
                          saturation: p.saturation
                        })
                      }
                      style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${isActive ? '#D4AF37' : 'rgba(255,255,255,0.14)'}`,
                        background: isActive ? 'rgba(212,175,55,0.2)' : '#0E1525',
                        color: isActive ? '#FDE68A' : '#CBD5E1'
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Luminosité */}
            <label style={{ display: 'grid', gridTemplateColumns: '64px 1fr 34px', alignItems: 'center', gap: '6px', color: '#CBD5E1' }}>
              <span style={{ fontWeight: 700 }}>Luminosité</span>
              <input
                type="range"
                min={50}
                max={180}
                step={2}
                value={curBrightness}
                onChange={(e) => onUpdateSlot(slot.id, { brightness: parseInt(e.target.value, 10) })}
                style={{ width: '100%', accentColor: '#D4AF37', cursor: 'pointer' }}
              />
              <span style={{ textAlign: 'right', fontWeight: 800, color: curBrightness !== 100 ? '#FDE68A' : '#94A3B8' }}>
                {curBrightness}%
              </span>
            </label>

            {/* Contraste */}
            <label style={{ display: 'grid', gridTemplateColumns: '64px 1fr 34px', alignItems: 'center', gap: '6px', color: '#CBD5E1' }}>
              <span style={{ fontWeight: 700 }}>Contraste</span>
              <input
                type="range"
                min={50}
                max={180}
                step={2}
                value={curContrast}
                onChange={(e) => onUpdateSlot(slot.id, { contrast: parseInt(e.target.value, 10) })}
                style={{ width: '100%', accentColor: '#D4AF37', cursor: 'pointer' }}
              />
              <span style={{ textAlign: 'right', fontWeight: 800, color: curContrast !== 100 ? '#FDE68A' : '#94A3B8' }}>
                {curContrast}%
              </span>
            </label>

            {/* Saturation */}
            <label style={{ display: 'grid', gridTemplateColumns: '64px 1fr 34px', alignItems: 'center', gap: '6px', color: '#CBD5E1' }}>
              <span style={{ fontWeight: 700 }}>Couleurs</span>
              <input
                type="range"
                min={0}
                max={200}
                step={2}
                value={curSaturation}
                onChange={(e) => onUpdateSlot(slot.id, { saturation: parseInt(e.target.value, 10) })}
                style={{ width: '100%', accentColor: '#D4AF37', cursor: 'pointer' }}
              />
              <span style={{ textAlign: 'right', fontWeight: 800, color: curSaturation !== 100 ? '#FDE68A' : '#94A3B8' }}>
                {curSaturation}%
              </span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem', paddingTop: '2px' }}>
              {hasCustomImage ? (
                <button
                  type="button"
                  onClick={() => onUpdateSlot(slot.id, { brightness: 100, contrast: 100, saturation: 100 })}
                  style={{
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.16)',
                    background: '#0E1525',
                    color: '#CBD5E1'
                  }}
                >
                  ↺ Réinitialiser
                </button>
              ) : (
                <span style={{ fontSize: '0.6rem', color: '#64748B' }}>Réglage en direct (Live + TV)</span>
              )}
              {onApplyImageToAll && (
                <button
                  type="button"
                  onClick={() =>
                    onApplyImageToAll({
                      brightness: curBrightness,
                      contrast: curContrast,
                      saturation: curSaturation
                    })
                  }
                  style={{
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid rgba(16, 185, 129, 0.45)',
                    background: 'rgba(16, 185, 129, 0.12)',
                    color: '#6EE7B7'
                  }}
                  title="Copier ces réglages de luminosité, contraste et couleurs sur toutes les caméras"
                >
                  Appliquer à toutes
                </button>
              )}
            </div>
          </div>
        )}

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
    updateMatchScore,
    startTournamentMatch,
    finishMatch,
    launchMatchOnTable
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
  const [showStreamKeys, setShowStreamKeys] = useState<boolean>(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [liveElapsedSec, setLiveElapsedSec] = useState<number>(0);
  const [replaySpeedChoice, setReplaySpeedChoice] = useState<number>(0.6);
  const [, setShotClockUiTick] = useState<number>(0);
  const [showHeaderSettings, setShowHeaderSettings] = useState<boolean>(false);
  const headerLogoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [overlayProjects, setOverlayProjects] = useState<LiveOverlayProject[]>(() =>
    loadOverlayProjects(currentClub.id)
  );
  const [activeOverlayProjectId, setActiveOverlayProjectId] = useState<string | null>(() =>
    loadActiveOverlayProjectId(currentClub.id)
  );
  const [panelWidth, setPanelWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const panelRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = panelRootRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) setPanelWidth(el.clientWidth);
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateWidth);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const isCompactPanel = panelWidth > 0 && panelWidth < 940;
  const isNarrowPanel = panelWidth > 0 && panelWidth < 720;

  const [pendingLaunchMatchId, setPendingLaunchMatchId] = useState<string>('');
  const [pendingLaunchTableId, setPendingLaunchTableId] = useState<string>('');

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
  const isObsMode = destinations.broadcastEngine === 'obs';
  const [obsStatus, setObsStatus] = useState<ObsStatusSnapshot>({ connected: false, streaming: false });
  const [obsBusy, setObsBusy] = useState<boolean>(false);
  const isAnyLiveActive = isObsMode ? obsStatus.streaming : broadcasterStatus.isStreaming;

  const refreshObsStatus = async (wsUrl?: string, pwd?: string) => {
    setObsBusy(true);
    try {
      const res = await checkObsStatus(wsUrl ?? destinations.obsWsUrl, pwd ?? destinations.obsWsPassword);
      setObsStatus(res);
      return res;
    } finally {
      setObsBusy(false);
    }
  };

  const videoElementsRef = useRef<Record<string, HTMLVideoElement | null>>({});
  const broadcasterRef = useRef<LiveCompositeBroadcaster | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const cueScoreInputRef = useRef<HTMLInputElement | null>(null);
  const regionalP1PhotoInputRef = useRef<HTMLInputElement | null>(null);
  const regionalP2PhotoInputRef = useRef<HTMLInputElement | null>(null);
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
    setOverlayProjects(loadOverlayProjects(currentClub.id));
    setActiveOverlayProjectId(loadActiveOverlayProjectId(currentClub.id));
    fetchOverlayProjectsFromCloud(currentClub.id).then(res => {
      setOverlayProjects(res.projects);
      setActiveOverlayProjectId(res.activeProjectId);
    });
    const unsubProj = subscribeToOverlayProjects(currentClub.id, (nextList, nextAct) => {
      setOverlayProjects(nextList);
      setActiveOverlayProjectId(nextAct);
    });
    return () => {
      unsubDir();
      unsubOv();
      unsubProj();
    };
  }, [currentClub.id]);

  const refreshVideoDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
    } catch { }
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
    b.setQualityPreset(destinations.qualityPreset || '720p');
    b.startRenderLoop();
    b.setReplayArmed(true);
    if (destinations.broadcastEngine === 'obs') {
      checkObsStatus(destinations.obsWsUrl, destinations.obsWsPassword).then(setObsStatus);
    } else {
      b.checkRelayAvailability(destinations.relayWsUrl);
    }

    if (directorStateRef.current.isLiveStreaming) {
      const cleaned = { ...directorStateRef.current, isLiveStreaming: false, liveStartedAt: null };
      setDirectorState(cleaned);
      saveDirectorState(currentClub.id, cleaned, true);
    }

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
    if (!isAnyLiveActive) {
      setLiveElapsedSec(0);
      return;
    }
    const start = Date.now();
    const t = window.setInterval(() => {
      setLiveElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [isAnyLiveActive]);

  const setupWebRtcForCamera = (camId: string) => {
    if (peersMapRef.current[camId]) {
      try { peersMapRef.current[camId].pc.close(); } catch { }
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
          try { peersMapRef.current[camId].pc.close(); } catch { }
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
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { }
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
          try { await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { }
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
          try { peersMapRef.current[camId].pc.close(); } catch { }
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
        try { p.pc.close(); } catch { }
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
        } catch { }
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
    if (broadcasterStatus.isStreaming && situation !== directorState.situation) {
      alert("Un direct est actuellement en cours. Arrêtez d'abord le live (⏹ ARRÊTER) avant de changer de menu.");
      return;
    }
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
    const extUrl = typeof patch.externalUrl === 'string' ? patch.externalUrl.trim() : '';
    const isCueScoreLink = Boolean(extUrl && /cuescore\.com\/tournament/i.test(extUrl));
    const currentRm = directorState.regionalMatch || DEFAULT_REGIONAL_MATCH;
    const shouldPrefillCueScore = isCueScoreLink && !(currentRm.cueScoreInput || '').trim();

    updateDirector({
      ...directorState,
      ...(shouldPrefillCueScore
        ? {
          regionalMatch: {
            ...currentRm,
            cueScoreInput: extUrl
          }
        }
        : {}),
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

  const handleAddVirtualScreen = (
    sourceType: DirectorCameraSourceType,
    name: string,
    title: string
  ) => {
    const existing = directorState.cameras.find(c => c.sourceType === sourceType);
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
              sourceType,
              name,
              customViewTitle: title
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
    const screenSlot: DirectorCameraSlot = {
      id: `scr_${Date.now().toString(36).slice(-4)}`,
      name,
      enabled: true,
      sourceType,
      assignmentType: 'custom_view',
      customViewTitle: title,
      customViewShowAllScores: false,
      rotation: 0,
      zoom: 1,
      fillMode: 'contain',
      forceMuted: true
    };
    updateDirector({ ...directorState, cameras: [...directorState.cameras, screenSlot] });
  };

  const handleAddStandingsScreen = () => {
    handleAddVirtualScreen('tournament_standings', 'Classement Tournoi', 'Classement du Tournoi');
  };

  const handleAssignTourMatchToCamera = (
    cameraId: string,
    matchId: string,
    tableId?: string,
    focus: boolean = false
  ) => {
    const nextCams = directorState.cameras.map(c => {
      if (c.id !== cameraId) return c;
      if (tableId) {
        return {
          ...c,
          enabled: true,
          assignmentType: 'table' as DirectorAssignmentType,
          tableId,
          tournamentMatchId: undefined
        };
      }
      return {
        ...c,
        enabled: true,
        assignmentType: 'tournament_match' as DirectorAssignmentType,
        tournamentMatchId: matchId
      };
    });
    const targetCam = nextCams.find(c => c.id === cameraId);
    const keepMic = targetCam && isVirtualScreenSource(targetCam.sourceType);
    updateDirector({
      ...directorState,
      cameras: nextCams,
      ...(focus
        ? {
          broadcastMode: 'single' as const,
          focusedCameraId: cameraId,
          activeAudioCameraId: keepMic ? directorState.activeAudioCameraId : cameraId
        }
        : {})
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
  const sortedPlayers = Object.values(players).slice().sort((a, b) => a.name.localeCompare(b.name));
  const isClubSituation = directorState.situation === 'club_tables';
  const enabledCams = directorState.cameras.filter(
    c => c.enabled && (isClubSituation || !isVirtualScreenSource(c.sourceType))
  );
  const enabledCount = enabledCams.length;
  const focusedCam = directorState.focusedCameraId
    ? directorState.cameras.find(c => c.id === directorState.focusedCameraId) || null
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
    destinations.youtubeEnabled && destinations.youtubeStreamKey.trim() ? 'YouTube' : null
  ].filter(Boolean);

  const handleToggleIntermission = () => {
    updateDirector({
      ...directorState,
      isIntermission: !directorState.isIntermission
    });
  };

  const handleToggleLocalRecording = async () => {
    if (broadcasterStatus.isRecordingLocal) {
      broadcasterRef.current?.stopLocalRecording();
    } else {
      await broadcasterRef.current?.startLocalRecording(destinations.qualityPreset || '720p');
    }
  };

  const handleToggleCommentatorMic = async () => {
    await broadcasterRef.current?.setCommentatorMicEnabled(!broadcasterStatus.commentatorMicActive);
  };

  // Shot Clock helpers & 200ms UI countdown refresh
  const shotClock: ShotClockState = { ...DEFAULT_SHOT_CLOCK, ...(directorState.shotClock || {}) };
  const shotClockRemainingSec = Math.ceil(getShotClockRemainingMs(shotClock) / 1000);

  useEffect(() => {
    if (!shotClock.enabled || !shotClock.running) return;
    const t = window.setInterval(() => setShotClockUiTick(v => v + 1), 200);
    return () => window.clearInterval(t);
  }, [shotClock.enabled, shotClock.running]);

  const updateShotClock = (patch: Partial<ShotClockState>, baseState?: MultiCamDirectorState) => {
    const src = baseState || directorStateRef.current;
    const curSc: ShotClockState = { ...DEFAULT_SHOT_CLOCK, ...(src.shotClock || {}) };
    const next: MultiCamDirectorState = {
      ...src,
      shotClock: { ...curSc, ...patch }
    };
    setDirectorState(next);
    saveDirectorState(currentClub.id, next, true);
  };

  const handleToggleShotClockEnabled = () => {
    const curSc: ShotClockState = { ...DEFAULT_SHOT_CLOCK, ...(directorStateRef.current.shotClock || {}) };
    if (curSc.enabled) {
      updateShotClock({ enabled: false, running: false, startedAt: null });
    } else {
      updateShotClock({
        enabled: true,
        running: false,
        remainingMs: curSc.durationSec * 1000,
        startedAt: null,
        extensionUsed: false
      });
    }
  };

  const handleToggleShotClockRunning = () => {
    const curSc: ShotClockState = { ...DEFAULT_SHOT_CLOCK, ...(directorStateRef.current.shotClock || {}) };
    const now = Date.now();
    if (curSc.running) {
      const rem = getShotClockRemainingMs(curSc, now);
      updateShotClock({ running: false, remainingMs: rem, startedAt: null });
    } else {
      const baseRem = curSc.remainingMs > 0 ? curSc.remainingMs : curSc.durationSec * 1000;
      updateShotClock({ enabled: true, running: true, remainingMs: baseRem, startedAt: now });
    }
  };

  const handleResetShotClock = (newDurationSec?: number) => {
    const curSc: ShotClockState = { ...DEFAULT_SHOT_CLOCK, ...(directorStateRef.current.shotClock || {}) };
    const dur = newDurationSec ?? curSc.durationSec;
    updateShotClock({
      durationSec: dur,
      running: false,
      remainingMs: dur * 1000,
      startedAt: null,
      extensionUsed: false
    });
  };

  const handleShotClockExtension = () => {
    const curSc: ShotClockState = { ...DEFAULT_SHOT_CLOCK, ...(directorStateRef.current.shotClock || {}) };
    if (curSc.extensionUsed) return;
    const now = Date.now();
    const curRem = getShotClockRemainingMs(curSc, now);
    const added = (curSc.extensionSec || 30) * 1000;
    updateShotClock({
      remainingMs: curRem + added,
      startedAt: curSc.running ? now : null,
      extensionUsed: true
    });
  };

  const handleToggleTickerQuick = () => {
    const curTicker = { ...DEFAULT_TICKER_CONFIG, ...(overlayConfig.ticker || {}) };
    const nextOv: LiveOverlayConfig = {
      ...overlayConfig,
      ticker: { ...curTicker, enabled: !curTicker.enabled }
    };
    setOverlayConfig(nextOv);
    saveLiveOverlayConfig(currentClub.id, nextOv, 'live', true);
  };

  const handleQuickSelectOverlayProject = (projectId: string) => {
    if (projectId === '__none__') {
      const blank: LiveOverlayConfig = {
        ...DEFAULT_LIVE_OVERLAY_CONFIG,
        images: [],
        texts: [],
        updatedAt: Date.now()
      };
      setOverlayConfig(blank);
      saveLiveOverlayConfig(currentClub.id, blank, 'live', true);
      setActiveOverlayProjectId(null);
      saveActiveOverlayProjectId(currentClub.id, null);
      return;
    }
    const found = overlayProjects.find(p => p.id === projectId);
    if (!found) return;
    const applied: LiveOverlayConfig = {
      ...DEFAULT_LIVE_OVERLAY_CONFIG,
      ...found.config,
      images: (found.config.images || []).map(i => ({ ...i })),
      texts: (found.config.texts || []).map(t => ({ ...t })),
      updatedAt: Date.now()
    };
    setOverlayConfig(applied);
    saveLiveOverlayConfig(currentClub.id, applied, 'live', true);
    setActiveOverlayProjectId(found.id);
    saveActiveOverlayProjectId(currentClub.id, found.id);
  };

  const mosaicHeader: MosaicHeaderConfig = {
    ...DEFAULT_MOSAIC_HEADER,
    ...(directorState.mosaicHeader || {})
  };

  const updateMosaicHeader = (patch: Partial<MosaicHeaderConfig>) => {
    updateDirector({
      ...directorState,
      mosaicHeader: { ...mosaicHeader, ...patch }
    });
  };

  const handleTriggerReplay = (speed?: number) => {
    if (broadcasterStatus.isReplaying) {
      broadcasterRef.current?.stopInstantReplay();
      return;
    }
    const ok = broadcasterRef.current?.triggerInstantReplay(10, speed ?? replaySpeedChoice);
    if (!ok) {
      alert("Tampon Replay en cours d'initialisation (patientez 2–3 secondes puis réessayez).");
    }
  };

  const replaySpeedRef = useRef(replaySpeedChoice);
  replaySpeedRef.current = replaySpeedChoice;

  // Broadcast keyboard shortcuts: 1-4 cameras, M mosaic, P pause, C standings, W replay, S shot clock, Space/R/E clock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const cur = directorStateRef.current;
      const isClub = cur.situation === 'club_tables';
      const activeList = cur.cameras.filter(c => c.enabled && (isClub || !isVirtualScreenSource(c.sourceType)));
      const key = e.key.toLowerCase();
      const curSc: ShotClockState = { ...DEFAULT_SHOT_CLOCK, ...(cur.shotClock || {}) };

      if (key >= '1' && key <= '4') {
        const idx = Number(key) - 1;
        const target = activeList[idx];
        if (target) {
          e.preventDefault();
          const keepMic = isVirtualScreenSource(target.sourceType);
          const next: MultiCamDirectorState = {
            ...cur,
            isIntermission: false,
            broadcastMode: 'single',
            focusedCameraId: target.id,
            activeAudioCameraId: keepMic ? cur.activeAudioCameraId : target.id
          };
          setDirectorState(next);
          saveDirectorState(currentClub.id, next, true);
        }
      } else if (key === 'm') {
        e.preventDefault();
        const next: MultiCamDirectorState = { ...cur, isIntermission: false, broadcastMode: 'mosaic', focusedCameraId: null };
        setDirectorState(next);
        saveDirectorState(currentClub.id, next, true);
      } else if (key === 'p') {
        e.preventDefault();
        const next: MultiCamDirectorState = { ...cur, isIntermission: !cur.isIntermission };
        setDirectorState(next);
        saveDirectorState(currentClub.id, next, true);
      } else if (key === 'w') {
        e.preventDefault();
        if (broadcasterRef.current?.getStatus().isReplaying) {
          broadcasterRef.current.stopInstantReplay();
        } else {
          broadcasterRef.current?.triggerInstantReplay(10, replaySpeedRef.current);
        }
      } else if (key === 's') {
        e.preventDefault();
        const nextSc: ShotClockState = curSc.enabled
          ? { ...curSc, enabled: false, running: false, startedAt: null }
          : { ...curSc, enabled: true, running: false, remainingMs: curSc.durationSec * 1000, startedAt: null, extensionUsed: false };
        const next = { ...cur, shotClock: nextSc };
        setDirectorState(next);
        saveDirectorState(currentClub.id, next, true);
      } else if (e.code === 'Space' && curSc.enabled) {
        e.preventDefault();
        const now = Date.now();
        const nextSc: ShotClockState = curSc.running
          ? { ...curSc, running: false, remainingMs: getShotClockRemainingMs(curSc, now), startedAt: null }
          : { ...curSc, running: true, remainingMs: curSc.remainingMs > 0 ? curSc.remainingMs : curSc.durationSec * 1000, startedAt: now };
        const next = { ...cur, shotClock: nextSc };
        setDirectorState(next);
        saveDirectorState(currentClub.id, next, true);
      } else if (key === 'r' && curSc.enabled) {
        e.preventDefault();
        const nextSc: ShotClockState = { ...curSc, running: false, remainingMs: curSc.durationSec * 1000, startedAt: null, extensionUsed: false };
        const next = { ...cur, shotClock: nextSc };
        setDirectorState(next);
        saveDirectorState(currentClub.id, next, true);
      } else if (key === 'e' && curSc.enabled && !curSc.extensionUsed) {
        e.preventDefault();
        const now = Date.now();
        const nextSc: ShotClockState = {
          ...curSc,
          remainingMs: getShotClockRemainingMs(curSc, now) + (curSc.extensionSec || 30) * 1000,
          startedAt: curSc.running ? now : null,
          extensionUsed: true
        };
        const next = { ...cur, shotClock: nextSc };
        setDirectorState(next);
        saveDirectorState(currentClub.id, next, true);
      } else if (key === 'c' && isClub) {
        const standingsSlot = cur.cameras.find(c => c.sourceType === 'tournament_standings');
        if (standingsSlot) {
          e.preventDefault();
          const next: MultiCamDirectorState = {
            ...cur,
            isIntermission: false,
            broadcastMode: 'single',
            focusedCameraId: standingsSlot.id
          };
          setDirectorState(next);
          saveDirectorState(currentClub.id, next, true);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentClub.id]);

  const handleToggleLiveStream = async () => {
    if (isObsMode) {
      if (obsBusy) return;
      setObsBusy(true);
      try {
        if (obsStatus.streaming) {
          await stopObsStream(destinations.obsWsUrl, destinations.obsWsPassword);
          setObsStatus({ connected: true, streaming: false });
          updateDirector({ ...directorState, isLiveStreaming: false, liveStartedAt: null });
        } else {
          await startObsStream(destinations.obsWsUrl, destinations.obsWsPassword);
          setObsStatus({ connected: true, streaming: true });
          updateDirector({ ...directorState, isLiveStreaming: true, liveStartedAt: Date.now() });
        }
      } catch (err: any) {
        setObsStatus({
          connected: false,
          streaming: false,
          error: err?.message || 'OBS Studio non joignable via WebSocket.'
        });
        setShowPlatformsModal(true);
      } finally {
        setObsBusy(false);
      }
      return;
    }

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
    const headerH = mosaicHeader.showBar !== false ? 50 : 0;
    const cells = getMosaicGridRects(list.length, directorState.mosaicLayout, 1280, 720, headerH);
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
    const map = new Map<string, { id: string; name: string; club: string; photoUrl?: string }>();
    sortedPlayers.forEach(p => {
      const hasRealPhoto =
        Boolean(p.avatarUrl) &&
        isCustomPlayerPhoto(p.avatarUrl) &&
        !p.avatarUrl!.startsWith('data:image/svg+xml');
      map.set(p.name.trim().toLowerCase(), {
        id: p.id,
        name: p.name,
        club: p.clubName || p.stats?.clubName || '',
        ...(hasRealPhoto ? { photoUrl: p.avatarUrl } : {})
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

  const handleUploadRegionalPlayerPhoto = (file: File, side: 1 | 2) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) return;
      const img = new Image();
      img.onload = () => {
        // Compress & crop cleanly to crisp 320x320 portrait JPEG so localStorage & TV sync stay lightweight
        const maxSide = 320;
        const c = document.createElement('canvas');
        c.width = maxSide;
        c.height = maxSide;
        const ctx = c.getContext('2d');
        let finalUrl = rawUrl;
        if (ctx && img.naturalWidth > 0 && img.naturalHeight > 0) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          const scale = Math.max(maxSide / img.naturalWidth, maxSide / img.naturalHeight);
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          const dx = (maxSide - dw) / 2;
          const dy = (maxSide - dh) * (dh > maxSide ? 0.22 : 0.5);
          ctx.drawImage(img, dx, dy, dw, dh);
          finalUrl = c.toDataURL('image/jpeg', 0.88);
        }
        updateRegionalMatch(side === 1 ? { player1PhotoUrl: finalUrl } : { player2PhotoUrl: finalUrl });
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  const autoFillPlayerClub = (typedName: string, side: 1 | 2) => {
    const found = playerSuggestions.find(p => p.name.toLowerCase() === typedName.trim().toLowerCase());
    if (side === 1) {
      updateRegionalMatch({
        player1Name: typedName,
        ...(found?.club ? { player1Club: found.club } : {}),
        ...(found?.photoUrl ? { player1PhotoUrl: found.photoUrl } : {})
      });
    } else {
      updateRegionalMatch({
        player2Name: typedName,
        ...(found?.club ? { player2Club: found.club } : {}),
        ...(found?.photoUrl ? { player2PhotoUrl: found.photoUrl } : {})
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

  const hasCueScoreLoaded = Boolean(rm.cueScoreInput?.trim() && rm.cueScoreTournamentId?.trim());
  const cueScoreTitleDisplay = hasCueScoreLoaded ? (rm.cueScoreTournamentName?.trim() || cueScoreData?.name || '') : '';
  const cueScoreVenueDisplay = hasCueScoreLoaded ? (rm.cueScoreVenueName?.trim() || cueScoreData?.venueName || '') : '';
  const cueScorePlayersTotal = hasCueScoreLoaded ? (rm.cueScorePlayersCount ?? cueScoreData?.players.length ?? 0) : 0;
  const cueScoreMatchesTotal = hasCueScoreLoaded ? (rm.cueScoreMatchesCount ?? cueScoreData?.matches.length ?? 0) : 0;
  const cueScorePlayingTotal = hasCueScoreLoaded ? (rm.cueScorePlayingCount ?? csPlayingMatches.length) : 0;

  const ongoingTournament =
    Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;
  const appTournament = ongoingTournament;

  const appTourMatches = appTournament
    ? Object.values(matches).filter(m => m.tournamentId === appTournament.id)
    : [];

  const getMatchEffectiveTable = (m: typeof appTourMatches[number]) =>
    (m.tableId ? tables[m.tableId] : undefined) ||
    Object.values(tables).find(t => t.currentMatchId === m.id);

  const activeTableTourMatches = appTourMatches
    .filter(m => m.status !== 'finished' && Boolean(getMatchEffectiveTable(m)))
    .sort((a, b) => {
      const ta = getMatchEffectiveTable(a)?.number ?? 999;
      const tb = getMatchEffectiveTable(b)?.number ?? 999;
      return ta - tb;
    });

  const pendingReadyTourMatches = appTourMatches.filter(
    m =>
      m.status === 'pending' &&
      !getMatchEffectiveTable(m) &&
      Boolean(m.player1Id && m.player2Id)
  );
  const finishedTourMatchesCount = appTourMatches.filter(m => m.status === 'finished').length;

  const effectiveLaunchMatchId = pendingReadyTourMatches.some(m => m.id === pendingLaunchMatchId)
    ? pendingLaunchMatchId
    : (pendingReadyTourMatches[0]?.id || '');
  const firstFreeTable = sortedTables.find(t => t.status === 'free' || !t.currentMatchId);
  const effectiveLaunchTableId = sortedTables.some(t => t.id === pendingLaunchTableId)
    ? pendingLaunchTableId
    : (firstFreeTable?.id || sortedTables[0]?.id || '');

  return (
    <div
      ref={panelRootRef}
      style={{
        maxWidth: '1480px',
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}
    >
      {/* 1. CONSOLE DE RÉGIE UNIFIÉE (DIFFUSION + PRODUCTION STUDIO) */}
      <div style={{
        background: '#0B0F17',
        border: `1px solid ${directorState.broadcastMode === 'single' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.12)'}`,
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
        overflow: 'hidden'
      }}>
        {/* LIGNE 1 : SITUATION, MODE ANTENNE & ACTIONS DIFFUSION */}
        <div style={{
          padding: '0.55rem 0.8rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.55rem'
        }}>
          {/* Left: Situation Switcher + Mode Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(() => {
              const isLiveLocked = broadcasterStatus.isStreaming;
              const lockedTitle = "Arrêtez d'abord le live en cours avant de changer de menu";
              return (
                <div style={{
                  display: 'inline-flex',
                  background: '#050811',
                  padding: '3px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  gap: '3px',
                  flexWrap: 'wrap'
                }}>
                  <button
                    type="button"
                    disabled={isLiveLocked && directorState.situation !== 'club_tables'}
                    onClick={() => handleSetSituation('club_tables')}
                    title={isLiveLocked && directorState.situation !== 'club_tables' ? lockedTitle : undefined}
                    style={{
                      background: directorState.situation === 'club_tables' ? '#1E293B' : 'transparent',
                      color: directorState.situation === 'club_tables' ? '#F8FAFC' : 'rgba(255,255,255,0.6)',
                      border: directorState.situation === 'club_tables' ? '1px solid rgba(16, 185, 129, 0.6)' : '1px solid transparent',
                      borderRadius: '6px',
                      height: '28px',
                      padding: '0 10px',
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: isLiveLocked && directorState.situation !== 'club_tables' ? 'not-allowed' : 'pointer',
                      opacity: isLiveLocked && directorState.situation !== 'club_tables' ? 0.4 : 1
                    }}
                  >
                    <Tv size={13} color={directorState.situation === 'club_tables' ? '#10B981' : 'currentColor'} />
                    Club & Tournoi
                  </button>
                  <button
                    type="button"
                    disabled={isLiveLocked && directorState.situation !== 'regional_match'}
                    onClick={() => handleSetSituation('regional_match')}
                    title={isLiveLocked && directorState.situation !== 'regional_match' ? lockedTitle : undefined}
                    style={{
                      background: directorState.situation === 'regional_match' ? '#1E293B' : 'transparent',
                      color: directorState.situation === 'regional_match' ? '#F8FAFC' : 'rgba(255,255,255,0.6)',
                      border: directorState.situation === 'regional_match' ? '1px solid rgba(212, 175, 55, 0.7)' : '1px solid transparent',
                      borderRadius: '6px',
                      height: '28px',
                      padding: '0 10px',
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: isLiveLocked && directorState.situation !== 'regional_match' ? 'not-allowed' : 'pointer',
                      opacity: isLiveLocked && directorState.situation !== 'regional_match' ? 0.4 : 1
                    }}
                  >
                    <Trophy size={13} color={directorState.situation === 'regional_match' ? '#D4AF37' : 'currentColor'} />
                    Tournoi Régional / Match
                  </button>
                  <button
                    type="button"
                    disabled={isLiveLocked && directorState.situation !== 'cuescore_live'}
                    onClick={() => handleSetSituation('cuescore_live')}
                    title={isLiveLocked && directorState.situation !== 'cuescore_live' ? lockedTitle : undefined}
                    style={{
                      background: directorState.situation === 'cuescore_live' ? '#1E293B' : 'transparent',
                      color: directorState.situation === 'cuescore_live' ? '#F8FAFC' : 'rgba(255,255,255,0.6)',
                      border: directorState.situation === 'cuescore_live' ? '1px solid rgba(56, 189, 248, 0.65)' : '1px solid transparent',
                      borderRadius: '6px',
                      height: '28px',
                      padding: '0 10px',
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: isLiveLocked && directorState.situation !== 'cuescore_live' ? 'not-allowed' : 'pointer',
                      opacity: isLiveLocked && directorState.situation !== 'cuescore_live' ? 0.4 : 1
                    }}
                  >
                    <Link2 size={13} color={directorState.situation === 'cuescore_live' ? '#38BDF8' : 'currentColor'} />
                    CueScore{rm.cueScoreAutoSync ? ' (Auto)' : ''}
                  </button>
                </div>
              );
            })()}

            <span style={{
              background: directorState.broadcastMode === 'single' ? 'rgba(239, 68, 68, 0.16)' : 'rgba(255, 255, 255, 0.05)',
              color: directorState.broadcastMode === 'single' ? '#FCA5A5' : '#CBD5E1',
              border: `1px solid ${directorState.broadcastMode === 'single' ? 'rgba(239, 68, 68, 0.45)' : 'rgba(255, 255, 255, 0.12)'}`,
              height: '30px',
              padding: '0 10px',
              borderRadius: '7px',
              fontSize: '0.72rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              boxSizing: 'border-box'
            }}>
              <Radio size={12} color={directorState.broadcastMode === 'single' ? '#EF4444' : '#94A3B8'} />
              {directorState.broadcastMode === 'single'
                ? `PGM : ${focusedCam?.name || ''}`
                : `MOSAÏQUE (${enabledCount})`}
            </span>

            {directorState.broadcastMode === 'single' && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleReturnToMosaic}
                style={{
                  width: 'auto',
                  height: '30px',
                  padding: '0 10px',
                  borderRadius: '7px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  borderColor: 'rgba(212, 175, 55, 0.5)',
                  color: '#FDE68A'
                }}
              >
                Retour Mosaïque
              </button>
            )}
          </div>

          {/* Right: Audio, Destinations, Start Live, TV Out */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {renderPlatformStatusBadge('facebook')}
            {renderPlatformStatusBadge('youtube')}

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setMonitorAudioOnPc(v => !v)}
              style={{
                width: 'auto',
                height: '30px',
                fontSize: '0.72rem',
                padding: '0 10px',
                borderRadius: '7px',
                fontWeight: 700,
                background: monitorAudioOnPc ? 'rgba(16, 185, 129, 0.14)' : '#111827',
                borderColor: monitorAudioOnPc ? 'rgba(16, 185, 129, 0.55)' : 'rgba(255,255,255,0.16)',
                color: monitorAudioOnPc ? '#6EE7B7' : '#CBD5E1'
              }}
              title="Haut-parleurs de votre PC uniquement (coupe votre retour local sans couper le son envoyé sur YouTube/Facebook)"
            >
              {monitorAudioOnPc ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {monitorAudioOnPc ? 'Haut-parleurs PC' : 'Haut-parleurs OFF'}
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowPlatformsModal(true)}
              style={{
                width: 'auto',
                height: '30px',
                fontSize: '0.72rem',
                padding: '0 10px',
                borderRadius: '7px',
                background: '#111827',
                borderColor: isObsMode || activePlatformsLabel.length > 0 ? 'rgba(59, 130, 246, 0.5)' : 'rgba(255,255,255,0.16)',
                color: isObsMode || activePlatformsLabel.length > 0 ? '#93C5FD' : '#E2E8F0',
                fontWeight: 700
              }}
            >
              <Settings size={13} />
              {isObsMode
                ? 'Mode : OBS Studio'
                : activePlatformsLabel.length > 0
                  ? `Destinations (${activePlatformsLabel.join('+')})`
                  : 'Destinations'}
            </button>

            <button
              type="button"
              className="btn"
              onClick={handleToggleLiveStream}
              disabled={obsBusy}
              style={{
                width: 'auto',
                height: '30px',
                padding: '0 13px',
                fontSize: '0.73rem',
                fontWeight: 800,
                borderRadius: '7px',
                background: isAnyLiveActive ? '#DC2626' : (isObsMode ? '#2563EB' : '#B91C1C'),
                border: '1px solid rgba(255,255,255,0.16)',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: isAnyLiveActive ? '0 0 14px rgba(220, 38, 38, 0.55)' : 'none',
                opacity: obsBusy ? 0.7 : 1
              }}
              title={
                isObsMode
                  ? 'Démarrer / Arrêter le stream dans OBS Studio (ou configurer le lien Source Navigateur OBS)'
                  : undefined
              }
            >
              {isAnyLiveActive ? (
                <>ARRÊTER {isObsMode ? 'OBS ' : ''}({formatDuration(liveElapsedSec)})</>
              ) : (
                <>
                  <Play size={13} />
                  {isObsMode
                    ? 'DÉMARRER LIVE (OBS)'
                    : activePlatformsLabel.length > 0
                      ? `DÉMARRER LIVE (${activePlatformsLabel.join('+')})`
                      : 'DÉMARRER LE LIVE'}
                </>
              )}
            </button>

            <a
              href={`${getAppBaseUrl()}/?overlay=director&club=${encodeURIComponent(currentClub.id)}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline"
              style={{
                width: 'auto',
                height: '30px',
                fontSize: '0.72rem',
                padding: '0 10px',
                borderRadius: '7px',
                textDecoration: 'none',
                background: '#111827',
                color: '#E2E8F0',
                borderColor: 'rgba(255,255,255,0.16)',
                fontWeight: 700
              }}
              title="Ouvrir la sortie TV plein écran"
            >
              <Tv size={13} /> Sortie TV
            </a>
          </div>
        </div>

        {/* LIGNE 2 : OUTILS DE PRODUCTION, AUDIO & TÉLÉMÉTRIE */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.45rem',
          background: '#070A11',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '0.45rem 0.8rem',
          fontSize: '0.72rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleToggleIntermission}
              style={{
                width: 'auto',
                height: '28px',
                padding: '0 10px',
                borderRadius: '6px',
                fontSize: '0.71rem',
                fontWeight: 700,
                background: directorState.isIntermission ? 'rgba(212, 175, 55, 0.2)' : '#111827',
                borderColor: directorState.isIntermission ? '#D4AF37' : 'rgba(255,255,255,0.14)',
                color: directorState.isIntermission ? '#FDE68A' : '#E2E8F0'
              }}
              title="Afficher l'écran Pause (logo club + prochain match) sans couper le direct — Raccourci [P]"
            >
              {directorState.isIntermission ? 'Reprendre Direct (P)' : 'Pause (P)'}
            </button>

            {/* INSTANT REPLAY 10s + SPEED */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleTriggerReplay()}
                disabled={!broadcasterStatus.isReplaying && (broadcasterStatus.replayReadySec || 0) < 2}
                style={{
                  width: 'auto',
                  height: '28px',
                  padding: '0 9px',
                  borderRadius: '6px',
                  fontSize: '0.71rem',
                  fontWeight: 700,
                  background: broadcasterStatus.isReplaying ? 'rgba(239, 68, 68, 0.24)' : '#111827',
                  borderColor: broadcasterStatus.isReplaying ? '#EF4444' : 'rgba(255,255,255,0.14)',
                  color: broadcasterStatus.isReplaying ? '#FCA5A5' : '#FDE68A',
                  opacity: !broadcasterStatus.isReplaying && (broadcasterStatus.replayReadySec || 0) < 2 ? 0.55 : 1
                }}
                title="Rediffuser les 10 dernières secondes en ralenti ou vitesse normale — Raccourci [W]"
              >
                {broadcasterStatus.isReplaying
                  ? `⏹ Fin Replay (${Math.round((broadcasterStatus.replayProgress || 0) * 100)}%)`
                  : `↺ Replay ${(broadcasterStatus.replayReadySec || 0) >= 10 ? '10s' : `${broadcasterStatus.replayReadySec || 0}s`} (W)`}
              </button>
              {!broadcasterStatus.isReplaying && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setReplaySpeedChoice(v => (v < 0.9 ? 1.0 : 0.6))}
                  style={{
                    width: 'auto',
                    height: '28px',
                    padding: '0 7px',
                    borderRadius: '6px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    background: '#0E1525',
                    borderColor: 'rgba(255,255,255,0.14)',
                    color: '#CBD5E1'
                  }}
                  title="Basculer la vitesse du Replay : Ralenti 0.6× ou Vitesse normale 1×"
                >
                  {replaySpeedChoice < 0.9 ? '0.6×' : '1×'}
                </button>
              )}
            </div>

            {/* SHOT CLOCK TOGGLE */}
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleToggleShotClockEnabled}
              style={{
                width: 'auto',
                height: '28px',
                padding: '0 9px',
                borderRadius: '6px',
                fontSize: '0.71rem',
                fontWeight: 700,
                background: shotClock.enabled ? 'rgba(212, 175, 55, 0.2)' : '#111827',
                borderColor: shotClock.enabled ? '#D4AF37' : 'rgba(255,255,255,0.14)',
                color: shotClock.enabled ? '#FDE68A' : '#E2E8F0'
              }}
              title="Afficher / Masquer le Shot Clock TV (30s / 45s / 60s + Extension) — Raccourci [S]"
            >
              ⏱️ Shot Clock {shotClock.enabled ? `(${shotClockRemainingSec}s)` : '(S)'}
            </button>

            {/* TICKER QUICK TOGGLE */}
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleToggleTickerQuick}
              style={{
                width: 'auto',
                height: '28px',
                padding: '0 9px',
                borderRadius: '6px',
                fontSize: '0.71rem',
                fontWeight: 700,
                background: overlayConfig.ticker?.enabled ? 'rgba(239, 68, 68, 0.2)' : '#111827',
                borderColor: overlayConfig.ticker?.enabled ? '#EF4444' : 'rgba(255,255,255,0.14)',
                color: overlayConfig.ticker?.enabled ? '#FCA5A5' : '#E2E8F0'
              }}
              title="Activer / Couper le bandeau défilant en bas de l'écran (paramétrable dans Habillage TV)"
            >
              📺 Ticker {overlayConfig.ticker?.enabled ? 'ON' : 'OFF'}
            </button>

            {/* SÉLECTEUR RAPIDE PROJET D'HABILLAGE TV EN PLEIN DIRECT */}
            {overlayProjects.length > 0 && (
              <select
                className="input-field"
                value={
                  activeOverlayProjectId && overlayProjects.some(p => p.id === activeOverlayProjectId)
                    ? activeOverlayProjectId
                    : (overlayConfig.images.length === 0 && overlayConfig.texts.length === 0 && !overlayConfig.ticker?.enabled && !overlayConfig.sponsorCarousel?.enabled)
                      ? '__none__'
                      : '__custom__'
                }
                onChange={(e) => {
                  if (e.target.value !== '__custom__') {
                    handleQuickSelectOverlayProject(e.target.value);
                  }
                }}
                title="Changer de Projet d'Habillage TV en 1 clic sans quitter vos caméras"
                style={{
                  width: 'auto',
                  maxWidth: '175px',
                  height: '28px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  padding: '0 8px',
                  background: '#111827',
                  borderColor: activeOverlayProjectId ? 'rgba(212, 175, 55, 0.5)' : 'rgba(255,255,255,0.14)',
                  color: activeOverlayProjectId ? '#FDE68A' : '#E2E8F0',
                  fontWeight: 700
                }}
              >
                <option value="__none__">🎨 Habillage : Aucun</option>
                {!activeOverlayProjectId && (overlayConfig.images.length > 0 || overlayConfig.texts.length > 0 || overlayConfig.ticker?.enabled || overlayConfig.sponsorCarousel?.enabled) && (
                  <option value="__custom__">🎨 Habillage : Actuel</option>
                )}
                {overlayProjects.map(p => (
                  <option key={p.id} value={p.id}>
                    🎨 {p.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              className="btn btn-outline"
              onClick={handleToggleLocalRecording}
              style={{
                width: 'auto',
                height: '28px',
                padding: '0 9px',
                borderRadius: '6px',
                fontSize: '0.71rem',
                fontWeight: 700,
                background: broadcasterStatus.isRecordingLocal ? 'rgba(220, 38, 38, 0.22)' : '#111827',
                borderColor: broadcasterStatus.isRecordingLocal ? '#EF4444' : 'rgba(255,255,255,0.14)',
                color: broadcasterStatus.isRecordingLocal ? '#FCA5A5' : '#E2E8F0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Enregistrer une copie vidéo locale (.webm) sur ce PC"
            >
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: broadcasterStatus.isRecordingLocal ? '#EF4444' : '#64748B'
              }} />
              {broadcasterStatus.isRecordingLocal
                ? `REC ${formatDuration(broadcasterStatus.localRecordingSec || 0)}`
                : 'Enregistrer (.webm)'}
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={handleToggleCommentatorMic}
              style={{
                width: 'auto',
                height: '28px',
                padding: '0 9px',
                borderRadius: '6px',
                fontSize: '0.71rem',
                fontWeight: 700,
                background: broadcasterStatus.commentatorMicActive ? 'rgba(16, 185, 129, 0.16)' : '#111827',
                borderColor: broadcasterStatus.commentatorMicActive ? 'rgba(16, 185, 129, 0.55)' : 'rgba(255,255,255,0.14)',
                color: broadcasterStatus.commentatorMicActive ? '#6EE7B7' : '#E2E8F0'
              }}
              title="Activer le microphone du PC (commentateur) dans le mix audio du live"
            >
              {broadcasterStatus.commentatorMicActive ? <Mic size={12} /> : <MicOff size={12} />}
              {broadcasterStatus.commentatorMicActive ? 'Micro Commentateur ON' : 'Micro PC OFF'}
            </button>

            {/* Real-time Audio VU-Meter */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                height: '28px',
                background: '#050811',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '0 8px',
                borderRadius: '6px',
                boxSizing: 'border-box'
              }}
              title="Niveau audio diffusé (VU-mètre temps réel)"
            >
              <span style={{ fontSize: '0.62rem', color: '#94A3B8', fontWeight: 700, marginRight: '3px' }}>VU</span>
              {Array.from({ length: 10 }).map((_, idx) => {
                const threshold = (idx + 1) * 10;
                const active = (broadcasterStatus.audioLevel || 0) >= threshold;
                const color = idx >= 8 ? '#EF4444' : idx >= 6 ? '#F59E0B' : '#10B981';
                return (
                  <span
                    key={idx}
                    style={{
                      width: '4px',
                      height: '11px',
                      borderRadius: '1px',
                      background: active ? color : 'rgba(255,255,255,0.12)',
                      transition: 'background 0.08s linear'
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Right: Quality Profile + Real-time Stream Health Telemetry */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <select
              className="input-field"
              disabled={broadcasterStatus.isStreaming}
              value={destinations.qualityPreset || '720p'}
              onChange={(e) => {
                const nextPreset = e.target.value as StreamQualityPreset;
                updateDestinations({ qualityPreset: nextPreset });
                broadcasterRef.current?.setQualityPreset(nextPreset);
              }}
              style={{
                width: 'auto',
                height: '28px',
                borderRadius: '6px',
                fontSize: '0.7rem',
                padding: '0 8px',
                background: '#111827',
                borderColor: 'rgba(255,255,255,0.14)',
                color: '#E2E8F0',
                fontWeight: 700
              }}
              title="Profil de qualité vidéo du direct (modifiable hors antenne)"
            >
              {(Object.keys(STREAM_QUALITY_PROFILES) as StreamQualityPreset[]).map(k => (
                <option key={k} value={k}>
                  {STREAM_QUALITY_PROFILES[k].label}
                </option>
              ))}
            </select>

            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: '28px',
              background: '#050811',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              padding: '0 8px',
              fontSize: '0.68rem',
              fontWeight: 700,
              boxSizing: 'border-box',
              color: broadcasterStatus.isStreaming ? '#6EE7B7' : '#94A3B8'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: !broadcasterStatus.isStreaming
                  ? '#475569'
                  : (broadcasterStatus.currentFps || 0) >= 24
                    ? '#10B981'
                    : '#F59E0B'
              }} />
              {broadcasterStatus.currentFps || 0} FPS
              {broadcasterStatus.isStreaming && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.25)' }}>|</span>
                  {(broadcasterStatus.bitrateKbps || 0) >= 100
                    ? `${((broadcasterStatus.bitrateKbps || 0) / 1000).toFixed(1)} Mbps`
                    : `${broadcasterStatus.bitrateKbps || 0} kbps`}
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => setShowPlatformsModal(true)}
              style={{
                height: '28px',
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '0 9px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                background: isObsMode
                  ? (obsStatus.connected ? 'rgba(16, 185, 129, 0.14)' : 'rgba(59, 130, 246, 0.14)')
                  : broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable
                    ? 'rgba(16, 185, 129, 0.12)'
                    : 'rgba(245, 158, 11, 0.12)',
                border: `1px solid ${
                  isObsMode
                    ? (obsStatus.connected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(59, 130, 246, 0.4)')
                    : broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable
                      ? 'rgba(16, 185, 129, 0.35)'
                      : 'rgba(245, 158, 11, 0.35)'
                }`,
                color: isObsMode
                  ? (obsStatus.connected ? '#6EE7B7' : '#93C5FD')
                  : broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable
                    ? '#6EE7B7'
                    : '#FCD34D'
              }}
              title={isObsMode ? 'Mode OBS Studio actif sur ce PC (cliquer pour configurer)' : 'Statut du Relais PC (cliquer pour configurer YouTube / Facebook ou basculer vers OBS)'}
            >
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isObsMode
                  ? (obsStatus.connected ? '#10B981' : '#3B82F6')
                  : broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable
                    ? '#10B981'
                    : '#F59E0B'
              }} />
              {isObsMode
                ? (obsStatus.streaming ? 'OBS EN DIRECT' : obsStatus.connected ? 'OBS Studio prêt' : 'Mode OBS Studio')
                : broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable
                  ? 'Relais PC prêt'
                  : 'Relais PC hors ligne'}
            </button>
          </div>
        </div>
      </div>

      {/* 1.25 BARRE PILOTAGE SHOT CLOCK TV (VISIBLE QUAND SHOT CLOCK ACTIVÉ) */}
      {shotClock.enabled && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          background: shotClockRemainingSec <= 5 ? 'rgba(185, 28, 28, 0.2)' : '#0B0F17',
          border: `1.5px solid ${shotClockRemainingSec <= 5 ? '#EF4444' : shotClockRemainingSec <= 10 ? '#F59E0B' : 'rgba(212, 175, 55, 0.45)'}`,
          borderRadius: '9px',
          padding: '0.4rem 0.8rem',
          fontSize: '0.74rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 900, color: '#FDE68A' }}>⏱️ SHOT CLOCK TV</span>
            <span style={{
              fontWeight: 900,
              fontSize: '0.96rem',
              padding: '1px 10px',
              borderRadius: '6px',
              background: shotClockRemainingSec <= 5 ? '#EF4444' : shotClockRemainingSec <= 10 ? '#F59E0B' : '#1E293B',
              color: shotClockRemainingSec <= 10 && shotClockRemainingSec > 5 ? '#000' : '#fff',
              minWidth: '46px',
              textAlign: 'center'
            }}>
              {String(shotClockRemainingSec).padStart(2, '0')}s
            </span>
            <div style={{ display: 'inline-flex', gap: '3px' }}>
              {[30, 45, 60].map(sec => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => handleResetShotClock(sec)}
                  style={{
                    padding: '2px 7px',
                    borderRadius: '5px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: `1px solid ${shotClock.durationSec === sec ? '#D4AF37' : 'rgba(255,255,255,0.16)'}`,
                    background: shotClock.durationSec === sec ? 'rgba(212,175,55,0.22)' : 'transparent',
                    color: shotClock.durationSec === sec ? '#FDE68A' : '#CBD5E1'
                  }}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-neon"
              onClick={handleToggleShotClockRunning}
              style={{ width: 'auto', padding: '4px 11px', fontSize: '0.72rem', fontWeight: 900, color: '#000' }}
              title="Démarrer ou mettre en pause le chrono — Raccourci [Espace]"
            >
              {shotClock.running ? '⏸ Pause (Espace)' : '▶ Lancer (Espace)'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleResetShotClock()}
              style={{ width: 'auto', padding: '4px 9px', fontSize: '0.72rem', fontWeight: 700 }}
              title="Réinitialiser pour le coup suivant — Raccourci [R]"
            >
              ↺ Reset (R)
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={shotClock.extensionUsed}
              onClick={handleShotClockExtension}
              style={{
                width: 'auto',
                padding: '4px 9px',
                fontSize: '0.72rem',
                fontWeight: 800,
                borderColor: shotClock.extensionUsed ? 'rgba(255,255,255,0.1)' : '#D4AF37',
                color: shotClock.extensionUsed ? '#64748B' : '#FDE68A',
                opacity: shotClock.extensionUsed ? 0.55 : 1
              }}
              title="Ajouter +30 secondes (1 fois par coup) — Raccourci [E]"
            >
              {shotClock.extensionUsed ? '✓ Ext utilisée' : `+${shotClock.extensionSec}s Ext (E)`}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => updateShotClock({ soundEnabled: !shotClock.soundEnabled })}
              style={{
                width: 'auto',
                padding: '4px 8px',
                fontSize: '0.7rem',
                borderColor: shotClock.soundEnabled ? '#10B981' : 'rgba(255,255,255,0.16)',
                color: shotClock.soundEnabled ? '#6EE7B7' : '#94A3B8'
              }}
              title="Bips sonores sur les 5 dernières secondes et buzzer à 0"
            >
              {shotClock.soundEnabled ? '🔔 Bips ON' : '🔕 Bips OFF'}
            </button>
          </div>
        </div>
      )}

      {/* 1A. 🏆 TOURNOI DE L'APPLI EN DIRECT (PILOTAGE & DIFFUSION SANS QUITTER LE LIVE) */}
      {directorState.situation === 'club_tables' && appTournament && (
        <div style={{
          background: '#0B0F17',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: '12px',
          padding: '0.75rem 0.9rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 900, color: '#34D399', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Trophy size={15} /> Tournoi Appli : {appTournament.name}
              </span>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: '6px',
                background: appTournament.finalStageLaunched ? 'rgba(245, 158, 11, 0.18)' : 'rgba(16, 185, 129, 0.16)',
                color: appTournament.finalStageLaunched ? '#FBBF24' : '#34D399',
                border: `1px solid ${appTournament.finalStageLaunched ? 'rgba(245,158,11,0.45)' : 'rgba(16,185,129,0.4)'}`
              }}>
                {appTournament.finalStageLaunched
                  ? 'Phase Finale'
                  : appTournament.status === 'ongoing'
                    ? 'Qualifications / En cours'
                    : 'Terminé'}
              </span>
              <span style={{ fontSize: '0.71rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                {activeTableTourMatches.length} sur billard • {pendingReadyTourMatches.length} en attente • {finishedTourMatchesCount} terminé(s)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleAddVirtualScreen('tournament_standings', 'Classement Tournoi', 'Classement du Tournoi')}
                style={{ width: 'auto', padding: '3px 8px', fontSize: '0.7rem', fontWeight: 800, color: '#FBBF24', borderColor: 'rgba(245,158,11,0.45)' }}
              >
                + 🏆 Écran Classement
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleAddVirtualScreen('tournament_bracket', 'Tableau Final', 'Tableau Phases Finales')}
                style={{ width: 'auto', padding: '3px 8px', fontSize: '0.7rem', fontWeight: 800, color: '#38BDF8', borderColor: 'rgba(56,189,248,0.45)' }}
              >
                + 🌳 Écran Tableau Final
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleAddVirtualScreen('matches_live_board', 'Scores Billards', 'Scores en Direct')}
                style={{ width: 'auto', padding: '3px 8px', fontSize: '0.7rem', fontWeight: 800, color: '#34D399', borderColor: 'rgba(16,185,129,0.45)' }}
              >
                + 🎱 Écran Scores
              </button>
            </div>
          </div>

          {activeTableTourMatches.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
              gap: '0.55rem'
            }}>
              {activeTableTourMatches.map(m => {
                const effTable = getMatchEffectiveTable(m);
                const p1Name = players[m.player1Id]?.name || 'Joueur 1';
                const p2Name = players[m.player2Id]?.name || 'Joueur 2';
                const stageLabel = formatTournamentStageLabel(m, appTournament);
                return (
                  <div
                    key={m.id}
                    style={{
                      background: m.status === 'playing' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                      border: `1px solid ${m.status === 'playing' ? 'rgba(16, 185, 129, 0.38)' : 'rgba(255, 255, 255, 0.14)'}`,
                      borderRadius: '10px',
                      padding: '0.5rem 0.65rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', fontSize: '0.68rem', fontWeight: 800 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span style={{ background: 'rgba(245, 158, 11, 0.18)', color: '#FBBF24', padding: '1px 6px', borderRadius: '5px' }}>
                          🎱 {effTable?.name || `Billard ${effTable?.number || ''}`}
                        </span>
                        {stageLabel && (
                          <span style={{ color: '#93C5FD' }}>{stageLabel}</span>
                        )}
                      </div>
                      <span style={{ color: m.status === 'playing' ? '#34D399' : '#CBD5E1' }}>
                        {m.status === 'playing' ? '🔴 EN COURS' : '⏳ PRÊT'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', minWidth: 0 }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => updateMatchScore(m.id, Math.max(0, m.score1 - 1), m.score2)}
                          style={{ width: '24px', height: '24px', padding: 0, justifyContent: 'center' }}
                        >
                          <Minus size={11} />
                        </button>
                        <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '88px' }}>
                          {p1Name}
                        </span>
                        <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#FBBF24', minWidth: '16px', textAlign: 'center' }}>
                          {m.score1}
                        </span>
                        <button
                          type="button"
                          className="btn btn-neon"
                          onClick={() => updateMatchScore(m.id, m.score1 + 1, m.score2)}
                          style={{ width: '24px', height: '24px', padding: 0, justifyContent: 'center', color: '#000' }}
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', minWidth: 0 }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => updateMatchScore(m.id, m.score1, Math.max(0, m.score2 - 1))}
                          style={{ width: '24px', height: '24px', padding: 0, justifyContent: 'center' }}
                        >
                          <Minus size={11} />
                        </button>
                        <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#FBBF24', minWidth: '16px', textAlign: 'center' }}>
                          {m.score2}
                        </span>
                        <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '88px' }}>
                          {p2Name}
                        </span>
                        <button
                          type="button"
                          className="btn btn-neon"
                          onClick={() => updateMatchScore(m.id, m.score1, m.score2 + 1)}
                          style={{ width: '24px', height: '24px', padding: 0, justifyContent: 'center', color: '#000' }}
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        {m.status === 'pending' && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => startTournamentMatch(m.id, false)}
                            style={{ width: 'auto', padding: '2px 7px', fontSize: '0.66rem', fontWeight: 800, color: '#00ffaa', borderColor: 'rgba(0,255,170,0.45)' }}
                          >
                            ▶️ Lancer
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={m.score1 === m.score2}
                          onClick={() => finishMatch(m.id)}
                          style={{
                            width: 'auto',
                            padding: '2px 7px',
                            fontSize: '0.66rem',
                            fontWeight: 800,
                            borderColor: m.score1 !== m.score2 ? '#10B981' : 'rgba(255,255,255,0.16)',
                            color: m.score1 !== m.score2 ? '#34D399' : 'rgba(255,255,255,0.4)'
                          }}
                          title={m.score1 !== m.score2 ? 'Valider le vainqueur et envoyer automatiquement le match suivant sur ce billard' : 'Score à égalité'}
                        >
                          ✅ Valider fin
                        </button>
                      </div>

                      <select
                        className="input-field"
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          const [action, camId] = v.split(':');
                          if (camId) {
                            handleAssignTourMatchToCamera(
                              camId,
                              m.id,
                              effTable?.id,
                              action === 'focus'
                            );
                          }
                        }}
                        style={{ flex: '1 1 130px', fontSize: '0.66rem', padding: '2px 5px', background: '#0b1426', color: '#FBBF24', fontWeight: 700 }}
                      >
                        <option value="">📷 Diffuser sur...</option>
                        {directorState.cameras.filter(c => !isVirtualScreenSource(c.sourceType)).map(cam => (
                          <React.Fragment key={cam.id}>
                            <option value={`assign:${cam.id}`}>📷 Assigner à {cam.name}</option>
                            <option value={`focus:${cam.id}`}>📺 Plein Écran sur {cam.name}</option>
                          </React.Fragment>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pendingReadyTourMatches.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              flexWrap: 'wrap',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '0.45rem 0.65rem'
            }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#FBBF24', whiteSpace: 'nowrap' }}>
                🎱 Lancer un match du tournoi :
              </span>
              <select
                className="input-field"
                value={effectiveLaunchMatchId}
                onChange={(e) => setPendingLaunchMatchId(e.target.value)}
                style={{ flex: '1 1 220px', fontSize: '0.72rem', padding: '3px 6px', background: '#0b1426', color: '#fff', fontWeight: 700 }}
              >
                {pendingReadyTourMatches.map(pm => {
                  const p1N = players[pm.player1Id]?.name || 'J1';
                  const p2N = players[pm.player2Id]?.name || 'J2';
                  const stg = formatTournamentStageLabel(pm, appTournament);
                  return (
                    <option key={pm.id} value={pm.id}>
                      {p1N} vs {p2N}{stg ? ` • ${stg}` : ''}
                    </option>
                  );
                })}
              </select>
              <select
                className="input-field"
                value={effectiveLaunchTableId}
                onChange={(e) => setPendingLaunchTableId(e.target.value)}
                style={{ flex: '0 1 170px', fontSize: '0.72rem', padding: '3px 6px', background: '#0b1426', color: '#FBBF24', fontWeight: 700 }}
              >
                {sortedTables.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name || `Billard ${t.number}`} ({t.status === 'free' ? 'Libre' : 'Occupé'})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-neon"
                disabled={!effectiveLaunchMatchId || !effectiveLaunchTableId}
                onClick={() => {
                  if (!effectiveLaunchMatchId || !effectiveLaunchTableId) return;
                  const res = launchMatchOnTable(effectiveLaunchMatchId, effectiveLaunchTableId);
                  if (!res.success) {
                    alert(res.reason || 'Impossible de lancer ce match sur ce billard.');
                    return;
                  }
                  const camOnTable =
                    directorState.cameras.find(
                      c => c.assignmentType === 'table' && c.tableId === effectiveLaunchTableId && !isVirtualScreenSource(c.sourceType)
                    ) ||
                    directorState.cameras.find(c => !isVirtualScreenSource(c.sourceType));
                  if (camOnTable) {
                    handleAssignTourMatchToCamera(
                      camOnTable.id,
                      effectiveLaunchMatchId,
                      effectiveLaunchTableId,
                      false
                    );
                  }
                }}
                style={{ width: 'auto', padding: '4px 10px', fontSize: '0.72rem', fontWeight: 900, color: '#000' }}
              >
                🎱 Envoyer sur le billard & Diffuser
              </button>
            </div>
          )}
        </div>
      )}

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
              onChange={(e) => {
                const val = e.target.value;
                if (!val.trim()) {
                  setCueScoreData(null);
                  setCueScoreError(null);
                  updateRegionalMatch({
                    cueScoreInput: '',
                    cueScoreTournamentId: '',
                    cueScoreTournamentName: '',
                    cueScoreVenueName: '',
                    cueScorePlayersCount: 0,
                    cueScoreMatchesCount: 0,
                    cueScorePlayingCount: 0,
                    cueScoreMatchId: '',
                    cueScoreHasActiveMatch: false
                  });
                } else {
                  updateRegionalMatch({ cueScoreInput: val });
                }
              }}
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
                  gridTemplateColumns: isNarrowPanel ? '1fr' : '1.2fr auto 1.2fr',
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
          background: '#0B0F17',
          border: '1px solid rgba(212, 175, 55, 0.38)',
          borderRadius: '12px',
          padding: '0.75rem 0.9rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
          display: 'grid',
          gridTemplateColumns: isNarrowPanel ? '1fr' : '1.2fr auto 1.2fr',
          gap: '0.9rem',
          alignItems: 'center'
        }}>
          <datalist id="mcb-regional-players-list">
            {playerSuggestions.map(p => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          <input
            ref={regionalP1PhotoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadRegionalPlayerPhoto(file, 1);
              e.target.value = '';
            }}
          />
          <input
            ref={regionalP2PhotoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadRegionalPlayerPhoto(file, 2);
              e.target.value = '';
            }}
          />

          {/* PLAYER 1 + PHOTO + SCORE 1 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '10px',
            padding: '0.5rem 0.65rem'
          }}>
            {/* Photo Joueur 1 */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => regionalP1PhotoInputRef.current?.click()}
                title={rm.player1PhotoUrl ? 'Changer la photo du Joueur 1' : 'Importer une photo pour Joueur 1 (HUD direct)'}
                style={{
                  width: '54px',
                  height: '54px',
                  padding: 0,
                  borderRadius: '10px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: '#060A13',
                  border: rm.player1PhotoUrl ? '2px solid #10B981' : '1.5px dashed rgba(16, 185, 129, 0.6)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  color: '#6EE7B7'
                }}
              >
                {rm.player1PhotoUrl ? (
                  <img
                    src={rm.player1PhotoUrl}
                    alt={rm.player1Name || 'Joueur 1'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 22%', display: 'block' }}
                  />
                ) : (
                  <>
                    <Camera size={16} />
                    <span style={{ fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.2px' }}>PHOTO</span>
                  </>
                )}
              </button>
              {rm.player1PhotoUrl && (
                <button
                  type="button"
                  onClick={() => updateRegionalMatch({ player1PhotoUrl: '' })}
                  title="Retirer la photo du Joueur 1"
                  style={{
                    position: 'absolute',
                    top: '-5px',
                    right: '-5px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: '#0B0F17',
                    color: '#FCA5A5',
                    fontSize: '0.62rem',
                    fontWeight: 900,
                    lineHeight: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0
                  }}
                >
                  ✕
                </button>
              )}
            </div>

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

          {/* PLAYER 2 + SCORE 2 + PHOTO */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
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
                style={{ fontSize: '0.74rem', padding: '3px 8px', color: '#7DD3FC', textAlign: 'right' }}
              />
            </div>

            {/* Photo Joueur 2 */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => regionalP2PhotoInputRef.current?.click()}
                title={rm.player2PhotoUrl ? 'Changer la photo du Joueur 2' : 'Importer une photo pour Joueur 2 (HUD direct)'}
                style={{
                  width: '54px',
                  height: '54px',
                  padding: 0,
                  borderRadius: '10px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: '#060A13',
                  border: rm.player2PhotoUrl ? '2px solid #38BDF8' : '1.5px dashed rgba(56, 189, 248, 0.6)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  color: '#7DD3FC'
                }}
              >
                {rm.player2PhotoUrl ? (
                  <img
                    src={rm.player2PhotoUrl}
                    alt={rm.player2Name || 'Joueur 2'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 22%', display: 'block' }}
                  />
                ) : (
                  <>
                    <Camera size={16} />
                    <span style={{ fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.2px' }}>PHOTO</span>
                  </>
                )}
              </button>
              {rm.player2PhotoUrl && (
                <button
                  type="button"
                  onClick={() => updateRegionalMatch({ player2PhotoUrl: '' })}
                  title="Retirer la photo du Joueur 2"
                  style={{
                    position: 'absolute',
                    top: '-5px',
                    right: '-5px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: '#0B0F17',
                    color: '#FCA5A5',
                    fontSize: '0.62rem',
                    fontWeight: 900,
                    lineHeight: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0
                  }}
                >
                  ✕
                </button>
              )}
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

      {/* 2. DISPOSITION STUDIO 2 PANNEAUX HOMOGÈNES : SOURCES À GAUCHE + PROGRAMME LIVE À DROITE */}
      {(() => {
        const visibleCameras = directorState.cameras.filter(
          slot => isClubSituation || !isVirtualScreenSource(slot.sourceType)
        );
        const outerColumns = isCompactPanel
          ? '1fr'
          : visibleCameras.length === 1
            ? 'minmax(0, 1fr) minmax(0, 1.08fr)'
            : visibleCameras.length === 2
              ? 'minmax(0, 0.64fr) minmax(0, 1.36fr)'
              : 'minmax(0, 1.05fr) minmax(0, 1.15fr)';
        const innerGridCols =
          visibleCameras.length <= 2
            ? '1fr'
            : 'repeat(2, minmax(0, 1fr))';

        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: outerColumns,
            gap: '0.85rem',
            alignItems: 'stretch',
            width: '100%',
            minWidth: 0
          }}>
            {/* LEFT PANEL: SOURCES & CAMÉRAS (MÊME CADRE STUDIO QUE PROGRAMME LIVE) */}
            <div style={{
              minWidth: 0,
              background: '#0B0F17',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              boxShadow: '0 10px 28px rgba(0,0,0,0.36)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.45rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.76rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.4px' }}>
                  <Camera size={15} color="#D4AF37" />
                  SOURCES & CAMÉRAS ({visibleCameras.length})
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {directorState.broadcastMode === 'mosaic' && enabledCount === 2 && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        const nextLayout: DirectorMosaicLayout =
                          directorState.mosaicLayout === 'stacked' ? 'side_by_side' : 'stacked';
                        updateDirector({ ...directorState, mosaicLayout: nextLayout });
                      }}
                      style={{
                        width: 'auto',
                        height: '26px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        background: '#111827',
                        borderColor: 'rgba(255,255,255,0.16)',
                        color: '#CBD5E1'
                      }}
                      title="Basculer l'agencement de la mosaïque (Côte à côte / Haut-Bas)"
                    >
                      {directorState.mosaicLayout === 'stacked' ? 'Côte à côte' : 'Haut / Bas'}
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleAddCamera}
                    style={{
                      width: 'auto',
                      height: '26px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      background: '#111827',
                      color: '#E2E8F0',
                      borderColor: 'rgba(255,255,255,0.16)'
                    }}
                  >
                    <Plus size={12} /> Caméra
                  </button>

                  {directorState.situation === 'club_tables' && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={handleAddStandingsScreen}
                      style={{
                        width: 'auto',
                        height: '26px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        background: '#111827',
                        color: '#FDE68A',
                        borderColor: 'rgba(212, 175, 55, 0.4)'
                      }}
                      title="Ajouter l'écran Classement du Tournoi en direct sans quitter le live"
                    >
                      <Trophy size={12} /> Classement
                    </button>
                  )}
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: innerGridCols,
                gap: '0.65rem',
                minWidth: 0
              }}>
                {visibleCameras.map(slot => (
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
                    onFinishClubMatch={finishMatch}
                    onApplyImageToAll={
                      visibleCameras.filter(c => !isVirtualScreenSource(c.sourceType)).length > 1
                        ? (imgPatch) => {
                            const nextCams = directorState.cameras.map(c =>
                              isVirtualScreenSource(c.sourceType) ? c : { ...c, ...imgPatch }
                            );
                            updateDirector({ ...directorState, cameras: nextCams });
                          }
                        : undefined
                    }
                    registerVideoEl={registerVideoEl}
                    canDelete={directorState.cameras.length > 2}
                  />
                ))}
              </div>

              <div style={{
                marginTop: 'auto',
                paddingTop: '0.2rem',
                fontSize: '0.67rem',
                color: '#64748B',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                <span>Cliquez sur une source pour la passer en Plein Écran (PGM)</span>
              </div>
            </div>

            {/* RIGHT PANEL: LIVE OUTPUT PREVIEW (ÉCRAN MULTIPLE / PLEIN ÉCRAN) */}
            <div
              ref={previewContainerRef}
              style={{
                minWidth: 0,
                background: '#0B0F17',
                border: `1px solid ${directorState.isIntermission ? '#D4AF37' : directorState.broadcastMode === 'single' ? 'rgba(239, 68, 68, 0.55)' : 'rgba(255, 255, 255, 0.12)'}`,
                borderRadius: '12px',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                boxShadow: '0 10px 28px rgba(0,0,0,0.36)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.76rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.4px' }}>
                  <MonitorPlay size={15} color="#D4AF37" />
                  PROGRAMME LIVE ({directorState.isIntermission ? 'Pause' : directorState.broadcastMode === 'single' ? 'Plein Écran' : 'Mosaïque'})
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setShowHeaderSettings(v => !v)}
                    className="btn btn-outline"
                    style={{
                      width: 'auto',
                      height: '26px',
                      padding: '0 9px',
                      borderRadius: '6px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      background: showHeaderSettings ? 'rgba(212, 175, 55, 0.18)' : '#111827',
                      borderColor: showHeaderSettings ? '#D4AF37' : 'rgba(255,255,255,0.16)',
                      color: showHeaderSettings ? '#FDE68A' : '#E2E8F0'
                    }}
                    title="Modifier, agrandir, remplacer ou masquer le logo et le bandeau haut (choisissez Masquer pour utiliser vos logos libres d'Habillage TV)"
                  >
                    🖼️ Logo / En-tête
                  </button>
                  {directorState.broadcastMode === 'single' && (
                    <button
                      type="button"
                      onClick={handleReturnToMosaic}
                      className="btn btn-outline"
                      style={{
                        width: 'auto',
                        height: '26px',
                        padding: '0 9px',
                        borderRadius: '6px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        background: '#111827',
                        color: '#FDE68A',
                        borderColor: 'rgba(212, 175, 55, 0.5)'
                      }}
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
                    style={{
                      width: 'auto',
                      height: '26px',
                      padding: '0 9px',
                      borderRadius: '6px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      background: '#111827',
                      borderColor: 'rgba(255,255,255,0.16)',
                      color: '#E2E8F0'
                    }}
                    title="Agrandir l'aperçu en plein écran"
                  >
                    <Maximize2 size={12} /> Plein écran
                  </button>
                </div>
              </div>

              {/* RÉGLAGE DIRECT LOGO & BANDEAU EN-TÊTE MOSAÏQUE */}
              {showHeaderSettings && (
                <div style={{
                  background: '#060A13',
                  border: '1px solid rgba(212, 175, 55, 0.3)',
                  borderRadius: '8px',
                  padding: '0.45rem 0.65rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  fontSize: '0.69rem'
                }}>
                  <input
                    ref={headerLogoFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      readOverlayImageFile(file, (dataUrl) => {
                        updateMosaicHeader({ logoMode: 'custom', customLogoUrl: dataUrl });
                      });
                      e.target.value = '';
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#FDE68A', fontWeight: 700 }}>Logo :</span>
                    {([
                      { id: 'none' as const, label: 'Masquer' },
                      { id: 'club' as const, label: 'Logo Club' },
                      { id: 'custom' as const, label: mosaicHeader.customLogoUrl ? 'Logo Perso' : 'Importer…' }
                    ]).map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          if (opt.id === 'custom' && !mosaicHeader.customLogoUrl) {
                            headerLogoFileInputRef.current?.click();
                          } else {
                            updateMosaicHeader({ logoMode: opt.id });
                          }
                        }}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '5px',
                          fontSize: '0.67rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: `1px solid ${mosaicHeader.logoMode === opt.id ? '#D4AF37' : 'rgba(255,255,255,0.14)'}`,
                          background: mosaicHeader.logoMode === opt.id ? 'rgba(212,175,55,0.2)' : '#0E1525',
                          color: mosaicHeader.logoMode === opt.id ? '#FDE68A' : '#CBD5E1'
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                    {mosaicHeader.logoMode === 'custom' && (
                      <button
                        type="button"
                        onClick={() => headerLogoFileInputRef.current?.click()}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '5px',
                          fontSize: '0.67rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: '1px solid rgba(52,211,153,0.45)',
                          background: 'rgba(16,185,129,0.14)',
                          color: '#6EE7B7'
                        }}
                      >
                        📷 Changer
                      </button>
                    )}

                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto', color: '#CBD5E1', cursor: 'pointer', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={mosaicHeader.showBar !== false}
                        onChange={(e) => updateMosaicHeader({ showBar: e.target.checked })}
                      />
                      Bandeau noir haut
                    </label>

                    {(isClubSituation || directorState.situation === 'regional_match') && (
                      <label
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#6EE7B7', cursor: 'pointer', fontWeight: 700 }}
                        title="Afficher les portraits des joueurs en mode HUD jeu vidéo sur les matchs"
                      >
                        <input
                          type="checkbox"
                          checked={mosaicHeader.showPlayerAvatars !== false}
                          onChange={(e) => updateMosaicHeader({ showPlayerAvatars: e.target.checked })}
                        />
                        Photos joueurs (HUD)
                      </label>
                    )}
                  </div>

                  {mosaicHeader.logoMode !== 'none' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 150px' }}>
                        <span style={{ color: '#94A3B8', whiteSpace: 'nowrap' }}>
                          Taille ({mosaicHeader.logoHeightPx || 56}px)
                        </span>
                        <input
                          type="range"
                          min={36}
                          max={115}
                          step={2}
                          value={mosaicHeader.logoHeightPx || 56}
                          onChange={(e) => updateMosaicHeader({ logoHeightPx: parseInt(e.target.value, 10) })}
                          style={{ flex: 1, accentColor: '#D4AF37' }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#94A3B8' }}>Forme :</span>
                        {([
                          { id: 'circle' as const, label: 'Rond Or' },
                          { id: 'transparent' as const, label: 'Transparent' },
                          { id: 'white' as const, label: 'Blanc' },
                          { id: 'dark_gold' as const, label: 'Carré Or' }
                        ]).map(bg => (
                          <button
                            key={bg.id}
                            type="button"
                            onClick={() => updateMosaicHeader({ logoBg: bg.id })}
                            style={{
                              padding: '2px 7px',
                              borderRadius: '5px',
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: `1px solid ${(mosaicHeader.logoBg || 'circle') === bg.id ? '#D4AF37' : 'rgba(255,255,255,0.14)'}`,
                              background: (mosaicHeader.logoBg || 'circle') === bg.id ? 'rgba(212,175,55,0.2)' : '#0E1525',
                              color: (mosaicHeader.logoBg || 'circle') === bg.id ? '#FDE68A' : '#CBD5E1'
                            }}
                          >
                            {bg.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16 / 9',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: '#000',
                  border: '1px solid rgba(255,255,255,0.12)'
                }}
              >
                <canvas
                  ref={(el) => {
                    previewCanvasRef.current = el;
                    broadcasterRef.current?.setPreviewCanvas(el);
                  }}
                  onClick={handlePreviewCanvasClick}
                  width={1280}
                  height={720}
                  title={
                    directorState.broadcastMode === 'mosaic'
                      ? 'Aperçu en direct de l’Écran Multiple — Cliquez sur un cadran pour le diffuser seul'
                      : 'Cliquez sur l’aperçu pour revenir à l’Écran Multiple'
                  }
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    cursor: 'pointer'
                  }}
                />
              </div>

              <div style={{
                marginTop: 'auto',
                paddingTop: '0.2rem',
                fontSize: '0.67rem',
                color: '#64748B',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.4rem'
              }}>
                <span>
                  Raccourcis : <b style={{ color: '#94A3B8' }}>[1–4]</b> Caméras • <b style={{ color: '#94A3B8' }}>[M]</b> Mosaïque • <b style={{ color: '#94A3B8' }}>[P]</b> Pause • <b style={{ color: '#94A3B8' }}>[W]</b> Replay • <b style={{ color: '#94A3B8' }}>[S]</b> Shot Clock{shotClock.enabled ? ' • [Espace/R/E] Chrono' : ''}{isClubSituation ? ' • [C] Classement' : ''}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3. MODALE CONFIGURATION FACEBOOK / YOUTUBE & RELAIS PC (REMPLAÇANT OBS) */}
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
              maxWidth: '780px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '1.5rem',
              borderRadius: '18px',
              border: '2px solid rgba(0, 255, 170, 0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Radio size={20} color="#ef4444" /> Mode de Diffusion & Destinations
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Ce réglage s'applique uniquement sur cet ordinateur (sans modifier vos autres PC).
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowStreamKeys(v => !v)}
                  style={{ width: 'auto', fontSize: '0.72rem', padding: '4px 9px' }}
                  title={isObsMode ? 'Afficher ou masquer le mot de passe OBS' : 'Afficher ou masquer les clés de stream'}
                >
                  {showStreamKeys ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showStreamKeys ? 'Masquer' : 'Voir'}
                </button>
                {isObsMode ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={obsBusy}
                    onClick={() => refreshObsStatus()}
                    style={{ width: 'auto', fontSize: '0.74rem', padding: '4px 10px' }}
                  >
                    {obsStatus.connected ? <CheckCircle2 size={14} color="#34d399" /> : <RefreshCw size={14} />}
                    {obsBusy ? 'Test OBS…' : obsStatus.connected ? 'OBS Connecté' : 'Tester OBS'}
                  </button>
                ) : (
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
                )}
              </div>
            </div>

            {/* CHOIX DU MOTEUR DE DIFFUSION SUR CE PC : RELAIS PC vs OBS STUDIO */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#CBD5E1' }}>
                Quel logiciel diffuse le live sur CE PC ?
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.55rem' }}>
                <button
                  type="button"
                  disabled={isAnyLiveActive && isObsMode}
                  onClick={() => {
                    updateDestinations({ broadcastEngine: 'relay' });
                    broadcasterRef.current?.checkRelayAvailability(destinations.relayWsUrl);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '0.65rem 0.8rem',
                    borderRadius: '10px',
                    border: `1.5px solid ${!isObsMode ? '#10B981' : 'rgba(255,255,255,0.14)'}`,
                    background: !isObsMode ? 'rgba(16, 185, 129, 0.14)' : 'rgba(255,255,255,0.03)',
                    color: '#fff',
                    cursor: isAnyLiveActive && isObsMode ? 'not-allowed' : 'pointer',
                    opacity: isAnyLiveActive && isObsMode ? 0.5 : 1
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: '0.82rem', color: !isObsMode ? '#34D399' : '#E2E8F0' }}>
                    {!isObsMode ? '✓ ' : ''}Relais PC intégré (Par défaut)
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: '1.35' }}>
                    Diffusion directe depuis ce navigateur avec « Lancer le Relais Live.bat » (aucun OBS requis).
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isAnyLiveActive && !isObsMode}
                  onClick={() => {
                    updateDestinations({ broadcastEngine: 'obs' });
                    refreshObsStatus(destinations.obsWsUrl, destinations.obsWsPassword);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '0.65rem 0.8rem',
                    borderRadius: '10px',
                    border: `1.5px solid ${isObsMode ? '#3B82F6' : 'rgba(255,255,255,0.14)'}`,
                    background: isObsMode ? 'rgba(59, 130, 246, 0.16)' : 'rgba(255,255,255,0.03)',
                    color: '#fff',
                    cursor: isAnyLiveActive && !isObsMode ? 'not-allowed' : 'pointer',
                    opacity: isAnyLiveActive && !isObsMode ? 0.5 : 1
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: '0.82rem', color: isObsMode ? '#60A5FA' : '#E2E8F0' }}>
                    {isObsMode ? '✓ ' : ''}OBS Studio (installé sur ce PC)
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: '1.35' }}>
                    Utilise OBS Studio présent sur ce PC (Source Navigateur propre ou Capture Sortie TV + pilotage 1 clic).
                  </div>
                </button>
              </div>
            </div>

            {isObsMode ? (
              (() => {
                const obsBrowserUrl = `${getAppBaseUrl()}/?overlay=director&club=${encodeURIComponent(currentClub.id)}&obs=1`;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {/* 1. SOURCE NAVIGATEUR OBS / SORTIE TV */}
                    <div style={{
                      background: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      borderRadius: '12px',
                      padding: '0.9rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem'
                    }}>
                      <div style={{ fontWeight: 900, fontSize: '0.86rem', color: '#93C5FD' }}>
                        1. Envoyer votre régie dans OBS Studio (sans aucun script .bat)
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#E2E8F0', lineHeight: '1.45' }}>
                        Dans OBS : cliquez sur <b>Sources → + → Navigateur</b>, collez le lien ci-dessous puis réglez <b>Largeur : 1920</b> et <b>Hauteur : 1080</b> (ou utilisez simplement <b>Capture de fenêtre</b> sur <b>Sortie TV</b>).
                      </div>
                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          readOnly
                          className="input-field"
                          value={obsBrowserUrl}
                          style={{ flex: '1 1 260px', fontSize: '0.72rem', padding: '0.45rem 0.65rem' }}
                        />
                        <button
                          type="button"
                          className="btn btn-neon"
                          onClick={() => {
                            navigator.clipboard?.writeText(obsBrowserUrl);
                            setCopiedLinkId('obs_browser_url');
                            setTimeout(() => setCopiedLinkId(null), 2000);
                          }}
                          style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.74rem', fontWeight: 900, color: '#000' }}
                        >
                          {copiedLinkId === 'obs_browser_url' ? '✅ Lien copié !' : '📋 Copier lien OBS'}
                        </button>
                        <a
                          href={`${getAppBaseUrl()}/?overlay=director&club=${encodeURIComponent(currentClub.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline"
                          style={{ width: 'auto', padding: '0.45rem 0.8rem', fontSize: '0.74rem', textDecoration: 'none' }}
                        >
                          <Tv size={14} /> Ouvrir Sortie TV
                        </a>
                      </div>
                    </div>

                    {/* 2. PILOTAGE OPTIONNEL OBS WEBSOCKET */}
                    <div style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '12px',
                      padding: '0.9rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 900, fontSize: '0.84rem', color: '#F8FAFC' }}>
                          2. Pilotage 1-clic depuis l'appli (OBS WebSocket intégré à OBS 28+)
                        </span>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: obsStatus.connected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.14)',
                          color: obsStatus.connected ? '#6EE7B7' : '#CBD5E1'
                        }}>
                          {obsStatus.streaming ? '🔴 En direct dans OBS' : obsStatus.connected ? '🟢 Connecté à OBS' : 'Optionnel'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        Si vous souhaitez lancer/arrêter OBS directement avec le bouton rouge de l'appli : dans OBS ouvrez <b>Outils → Paramètres du serveur WebSocket → Activer le serveur WebSocket</b> (port 4455). Sinon cliquez simplement sur « Démarrer le streaming » dans OBS.
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.55rem' }}>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: '#CBD5E1', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                            Adresse WebSocket OBS
                          </label>
                          <input
                            type="text"
                            className="input-field"
                            value={destinations.obsWsUrl ?? 'ws://127.0.0.1:4455'}
                            onChange={(e) => updateDestinations({ obsWsUrl: e.target.value })}
                            placeholder="ws://127.0.0.1:4455"
                            style={{ fontSize: '0.78rem', padding: '0.45rem 0.65rem' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: '#CBD5E1', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                            Mot de passe OBS WebSocket (si activé)
                          </label>
                          <input
                            type={showStreamKeys ? 'text' : 'password'}
                            name="mcb-obs-ws-password"
                            autoComplete="new-password"
                            data-lpignore="true"
                            className="input-field"
                            value={destinations.obsWsPassword || ''}
                            onChange={(e) => updateDestinations({ obsWsPassword: e.target.value })}
                            placeholder="Laisser vide si sans mot de passe"
                            style={{ fontSize: '0.78rem', padding: '0.45rem 0.65rem' }}
                          />
                        </div>
                      </div>
                      {obsStatus.error && (
                        <div style={{ fontSize: '0.72rem', color: '#FCA5A5', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '8px', padding: '0.45rem 0.65rem' }}>
                          {obsStatus.error}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setShowPlatformsModal(false)}
                        style={{ width: 'auto', padding: '0.55rem 1.1rem' }}
                      >
                        Fermer
                      </button>
                      {obsStatus.connected && (
                        <button
                          type="button"
                          className="btn btn-neon"
                          disabled={obsBusy}
                          onClick={() => {
                            setShowPlatformsModal(false);
                            handleToggleLiveStream();
                          }}
                          style={{
                            width: 'auto',
                            padding: '0.55rem 1.2rem',
                            fontWeight: 900,
                            color: obsStatus.streaming ? '#fff' : '#000',
                            background: obsStatus.streaming ? '#DC2626' : undefined
                          }}
                        >
                          {obsStatus.streaming ? '⏹ Arrêter le Live dans OBS' : '🔴 Démarrer le Live dans OBS'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <>
            {/* SÉLECTEUR RAPIDE 1 CLIC : FACEBOOK / YOUTUBE / LES 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#CBD5E1' }}>
                Où souhaitez-vous diffuser ?
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem' }}>
                {[
                  {
                    id: 'fb',
                    label: 'Facebook seul',
                    active: destinations.facebookEnabled && !destinations.youtubeEnabled,
                    accent: '#3b82f6',
                    bg: 'rgba(24, 119, 242, 0.22)',
                    onClick: () => updateDestinations({ facebookEnabled: true, youtubeEnabled: false })
                  },
                  {
                    id: 'yt',
                    label: 'YouTube seul',
                    active: !destinations.facebookEnabled && destinations.youtubeEnabled,
                    accent: '#ff3344',
                    bg: 'rgba(255, 0, 51, 0.2)',
                    onClick: () => updateDestinations({ facebookEnabled: false, youtubeEnabled: true })
                  },
                  {
                    id: 'both',
                    label: 'Facebook + YouTube',
                    active: destinations.facebookEnabled && destinations.youtubeEnabled,
                    accent: '#10b981',
                    bg: 'rgba(16, 185, 129, 0.2)',
                    onClick: () => updateDestinations({ facebookEnabled: true, youtubeEnabled: true })
                  }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={opt.onClick}
                    style={{
                      padding: '0.55rem 0.6rem',
                      borderRadius: '9px',
                      border: `1.5px solid ${opt.active ? opt.accent : 'rgba(255,255,255,0.12)'}`,
                      background: opt.active ? opt.bg : 'rgba(255,255,255,0.03)',
                      color: opt.active ? '#fff' : '#94A3B8',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {opt.active ? '✓ ' : ''}{opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.9rem' }}>
              {/* FACEBOOK LIVE */}
              <div style={{
                background: destinations.facebookEnabled ? 'rgba(24, 119, 242, 0.12)' : 'rgba(255,255,255,0.02)',
                border: `1.5px solid ${destinations.facebookEnabled ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                opacity: destinations.facebookEnabled ? 1 : 0.55,
                borderRadius: '12px',
                padding: '0.95rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 900, fontSize: '0.92rem', color: '#60a5fa' }}>
                    <Facebook size={17} /> Facebook Live
                    <span style={{
                      fontSize: '0.64rem',
                      padding: '2px 6px',
                      borderRadius: '999px',
                      background: destinations.facebookEnabled ? 'rgba(59,130,246,0.28)' : 'rgba(255,255,255,0.08)',
                      color: destinations.facebookEnabled ? '#bfdbfe' : '#94a3b8'
                    }}>
                      {destinations.facebookEnabled ? 'ACTIF' : 'INACTIF'}
                    </span>
                  </div>
                  <a
                    href="https://www.facebook.com/live/producer"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.71rem', color: '#93c5fd', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  >
                    Live Producer <ExternalLink size={11} />
                  </a>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.72rem', color: '#bfdbfe', fontWeight: 700 }}>
                    Clé de stream Facebook
                  </label>
                  <input
                    type={showStreamKeys ? 'text' : 'password'}
                    name="mcb-facebook-stream-key"
                    autoComplete="new-password"
                    data-lpignore="true"
                    className="input-field"
                    placeholder="Collez la Clé de stream (ex: FB-xxxx...)"
                    value={destinations.facebookStreamKey}
                    onChange={(e) => {
                      const parsed = parseRtmpStreamInput(
                        e.target.value,
                        'rtmps://live-api-s.facebook.com:443/rtmp/'
                      );
                      if (parsed.isServerUrlOnly) {
                        alert("Vous avez collé l'URL du serveur Facebook (rtmps://...), qui est déjà configurée.\n\nCopiez uniquement la « Clé de stream » (commençant par FB-...) dans Facebook Live Producer.");
                        updateDestinations({ facebookRtmpUrl: parsed.rtmpUrl, facebookStreamKey: '' });
                        return;
                      }
                      updateDestinations({
                        facebookRtmpUrl: parsed.rtmpUrl,
                        facebookStreamKey: parsed.streamKey
                      });
                    }}
                    style={{ fontSize: '0.8rem', padding: '0.55rem 0.7rem' }}
                  />
                </div>
              </div>

              {/* YOUTUBE LIVE */}
              <div style={{
                background: destinations.youtubeEnabled ? 'rgba(255, 0, 51, 0.1)' : 'rgba(255,255,255,0.02)',
                border: `1.5px solid ${destinations.youtubeEnabled ? '#ff3344' : 'rgba(255,255,255,0.08)'}`,
                opacity: destinations.youtubeEnabled ? 1 : 0.55,
                borderRadius: '12px',
                padding: '0.95rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 900, fontSize: '0.92rem', color: '#ff6b81' }}>
                    <Youtube size={17} /> YouTube Live
                    <span style={{
                      fontSize: '0.64rem',
                      padding: '2px 6px',
                      borderRadius: '999px',
                      background: destinations.youtubeEnabled ? 'rgba(255,51,68,0.28)' : 'rgba(255,255,255,0.08)',
                      color: destinations.youtubeEnabled ? '#fecdd3' : '#94a3b8'
                    }}>
                      {destinations.youtubeEnabled ? 'ACTIF' : 'INACTIF'}
                    </span>
                  </div>
                  <a
                    href="https://studio.youtube.com/channel/UC/livestreaming"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.71rem', color: '#fda4af', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  >
                    YouTube Studio <ExternalLink size={11} />
                  </a>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.72rem', color: '#fecdd3', fontWeight: 700 }}>
                    Clé de stream YouTube
                  </label>
                  <input
                    type={showStreamKeys ? 'text' : 'password'}
                    name="mcb-youtube-stream-key"
                    autoComplete="new-password"
                    data-lpignore="true"
                    className="input-field"
                    placeholder="Collez la Clé de flux (ex: xxxx-xxxx-xxxx-xxxx-xxxx)"
                    value={destinations.youtubeStreamKey}
                    onChange={(e) => {
                      const parsed = parseRtmpStreamInput(
                        e.target.value,
                        'rtmp://a.rtmp.youtube.com/live2/'
                      );
                      if (parsed.isServerUrlOnly) {
                        alert("Vous avez collé l'URL du serveur (rtmp://a.rtmp.youtube.com/live2), qui est déjà configurée.\n\nCopiez uniquement la « Clé de flux » (masquée par des points ••••-••••) dans YouTube Studio.");
                        updateDestinations({ youtubeRtmpUrl: parsed.rtmpUrl, youtubeStreamKey: '' });
                        return;
                      }
                      updateDestinations({
                        youtubeRtmpUrl: parsed.rtmpUrl,
                        youtubeStreamKey: parsed.streamKey
                      });
                    }}
                    style={{ fontSize: '0.8rem', padding: '0.55rem 0.7rem' }}
                  />
                </div>
              </div>
            </div>

            <div style={{
              background: broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable
                ? 'rgba(16, 185, 129, 0.08)'
                : 'rgba(245, 158, 11, 0.08)',
              border: `1px solid ${broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
              borderRadius: '10px',
              padding: '0.7rem 0.9rem',
              fontSize: '0.74rem',
              color: broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable ? '#d1fae5' : '#fef3c7',
              lineHeight: '1.45',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}>
              <div>
                {broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable ? (
                  <span><b>🟢 Relais PC prêt :</b> cliquez sur « Lancer le Live » pour diffuser la mosaïque directement (sans OBS).</span>
                ) : (
                  <>
                    <b>Relais PC non démarré :</b> lancez <b>« Lancer le Relais Live.bat »</b> dans le dossier de l'appli sur ce PC.
                  </>
                )}
              </div>
              {!(broadcasterStatus.connectedToRelay && broadcasterStatus.ffmpegAvailable) && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    navigator.clipboard?.writeText('npm run relay');
                    setCopiedLinkId('relay_cmd');
                    setTimeout(() => setCopiedLinkId(null), 1800);
                  }}
                  style={{ width: 'auto', fontSize: '0.7rem', padding: '3px 8px' }}
                >
                  {copiedLinkId === 'relay_cmd' ? '✅ Copié !' : '📋 Copier "npm run relay"'}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowPlatformsModal(false)}
                style={{ width: 'auto', padding: '0.55rem 1.1rem' }}
              >
                Fermer
              </button>
              {activePlatformsLabel.length > 0 && !broadcasterStatus.isStreaming && (
                <button
                  type="button"
                  className="btn btn-neon"
                  onClick={() => {
                    setShowPlatformsModal(false);
                    handleToggleLiveStream();
                  }}
                  style={{ width: 'auto', padding: '0.55rem 1.2rem', fontWeight: 900, color: '#000' }}
                >
                  🔴 Lancer le Live ({activePlatformsLabel.join(' + ')})
                </button>
              )}
            </div>
              </>
            )}
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
