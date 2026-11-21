import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Radio, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '../store';
import {
  CameraSignalingHandle,
  DirectorCameraSlot,
  MultiCamDirectorState,
  RTC_ICE_CONFIG,
  createCameraSignalingChannel,
  isVirtualScreenSource,
  loadDirectorState,
  saveDirectorState,
  subscribeToDirectorState
} from '../utils/multiCamDirector';
import { drawVirtualScreenToCanvas, resolveCameraAssignment } from '../utils/liveBroadcaster';
import { LiveOverlayConfig, loadLiveOverlayConfig, subscribeToLiveOverlayConfig } from '../utils/liveOverlay';
import { LiveCustomOverlayLayer } from './LiveCustomOverlayLayer';
import { formatEmbedVideoUrl } from '../utils/video';
import { getClubLogoUrl, defaultClubLogo } from '../utils/logo';
import { getPlayerAvatar } from '../utils/avatar';
import MatchTimerBadge from './MatchTimerBadge';
import { resolveMatchDurationMinutes } from '../utils/rules';

interface DirectorTvOutputViewProps {
  onExitToAll?: () => void;
}

interface DirectorOutputTileProps {
  slot: DirectorCameraSlot;
  directorState: MultiCamDirectorState;
  stream: MediaStream | null;
  isAudioActive: boolean;
  isFocusedFullscreen?: boolean;
  isHiddenByOtherFullscreen?: boolean;
  overlayConfig?: LiveOverlayConfig;
  onClickTile?: () => void;
}

const VirtualScreenCanvas: React.FC<{ slot: DirectorCameraSlot }> = ({ slot }) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawVirtualScreenToCanvas(ctx, 0, 0, canvas.width, canvas.height, slot, {
      tables,
      matches,
      players,
      tournaments,
      currentClub
    });
  }, [slot, tables, matches, players, tournaments, currentClub]);

  return (
    <canvas
      ref={canvasRef}
      width={1280}
      height={720}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain'
      }}
    />
  );
};

const DirectorVideoElement: React.FC<{
  slot: DirectorCameraSlot;
  stream: MediaStream | null;
  unmuteAudio: boolean;
}> = ({ slot, stream, unmuteAudio }) => {
  const { currentClub } = useStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isVirtual = isVirtualScreenSource(slot.sourceType);

  useEffect(() => {
    if (isVirtual) return;
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream, isVirtual]);

  useEffect(() => {
    if (isVirtual) return;
    const el = videoRef.current;
    if (el) {
      el.muted = !unmuteAudio;
    }
  }, [unmuteAudio, isVirtual]);

  useEffect(() => {
    if (slot.sourceType !== 'external' && slot.sourceType !== 'vdo') return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({ event: 'command', func: unmuteAudio ? 'unMute' : 'mute', args: [] }),
        '*'
      );
    } catch {}
    try {
      win.postMessage({ mute: !unmuteAudio }, '*');
    } catch {}
  }, [unmuteAudio, slot.sourceType]);

  if (isVirtual) {
    return <VirtualScreenCanvas slot={slot} />;
  }

  if (slot.sourceType === 'vdo') {
    return (
      <iframe
        ref={iframeRef}
        src={`https://vdo.ninja/?view=${encodeURIComponent(slot.vdoRoom || `MCB_${currentClub.id}_${slot.id}`)}&cleanoutput&autoplay&muted`}
        allow="autoplay; camera; microphone; fullscreen"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          transform: `rotate(${slot.rotation || 0}deg) scale(${slot.zoom || 1})`
        }}
        title={slot.name}
      />
    );
  }

  if (slot.sourceType === 'external' && slot.externalUrl) {
    return (
      <iframe
        ref={iframeRef}
        src={formatEmbedVideoUrl(slot.externalUrl)}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          transform: `rotate(${slot.rotation || 0}deg) scale(${slot.zoom || 1})`
        }}
        title={slot.name}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={!unmuteAudio}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: slot.fillMode === 'contain' ? 'contain' : 'cover',
        transform: `rotate(${slot.rotation || 0}deg) scale(${slot.zoom || 1})`,
        transformOrigin: 'center center',
        transition: 'transform 0.2s ease'
      }}
    />
  );
};

const DirectorOutputTile: React.FC<DirectorOutputTileProps> = ({
  slot,
  directorState,
  stream,
  isAudioActive,
  isFocusedFullscreen = false,
  isHiddenByOtherFullscreen = false,
  overlayConfig,
  onClickTile
}) => {
  const { tables, matches, players, tournaments, currentClub } = useStore();
  const activeTournament = Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;
  const isVirtual = isVirtualScreenSource(slot.sourceType);
  const assignment = resolveCameraAssignment(
    slot,
    { tables, matches, players, tournaments, currentClub },
    directorState
  );
  const hasMatchBanner =
    assignment.isMatchView &&
    assignment.p1Name &&
    assignment.p2Name &&
    assignment.score1 !== undefined &&
    assignment.score2 !== undefined;

  return (
    <div
      onClick={isFocusedFullscreen || isHiddenByOtherFullscreen ? undefined : onClickTile}
      style={{
        position: isFocusedFullscreen ? 'fixed' : 'relative',
        inset: isFocusedFullscreen ? 0 : undefined,
        zIndex: isFocusedFullscreen ? 20 : isHiddenByOtherFullscreen ? 0 : 1,
        width: isFocusedFullscreen ? '100vw' : '100%',
        height: isFocusedFullscreen ? '100vh' : '100%',
        background: '#050814',
        borderRadius: isFocusedFullscreen ? 0 : '12px',
        overflow: 'hidden',
        border: isFocusedFullscreen
          ? 'none'
          : isAudioActive
            ? '2.5px solid #10b981'
            : '1.5px solid rgba(255,255,255,0.16)',
        opacity: isHiddenByOtherFullscreen ? 0 : 1,
        pointerEvents: isHiddenByOtherFullscreen ? 'none' : 'auto',
        cursor: !isFocusedFullscreen && onClickTile ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: isFocusedFullscreen ? '1.5rem' : '0.65rem',
        boxSizing: 'border-box'
      }}
      title={isFocusedFullscreen ? undefined : 'Cliquer pour mettre en surbrillance et diffuser cette fenêtre en plein écran'}
    >
      <DirectorVideoElement slot={slot} stream={stream} unmuteAudio={isAudioActive} />

      {isFocusedFullscreen && overlayConfig && (
        <LiveCustomOverlayLayer config={overlayConfig} interactive={false} previewScale={1} />
      )}

      {!isVirtual ? (
        <div style={{
          position: 'relative',
          zIndex: 15,
          width: '100%',
          maxWidth: isFocusedFullscreen ? '900px' : '620px',
          margin: '0 auto',
          background: isFocusedFullscreen ? 'rgba(8, 13, 28, 0.9)' : 'rgba(6, 11, 24, 0.88)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderTop: isFocusedFullscreen ? '2.5px solid #00ffaa' : '2px solid #F59E0B',
          borderRadius: isFocusedFullscreen ? '14px' : '10px',
          padding: isFocusedFullscreen ? '0.6rem 1.2rem' : '0.4rem 0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          boxShadow: isFocusedFullscreen ? '0 10px 30px rgba(0,0,0,0.75)' : 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: isFocusedFullscreen ? '0.82rem' : '0.72rem', fontWeight: 800 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isFocusedFullscreen ? '0.6rem' : '0.45rem' }}>
              <span style={{ background: '#ff2244', color: '#fff', padding: isFocusedFullscreen ? '2px 8px' : '1px 6px', borderRadius: isFocusedFullscreen ? '6px' : '4px', fontSize: isFocusedFullscreen ? '0.7rem' : '0.62rem', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {isFocusedFullscreen ? <Radio size={11} /> : null} LIVE
              </span>
              <span style={{ color: '#00ffaa', fontWeight: 900 }}>{assignment.title}</span>
              {assignment.match && (
                <MatchTimerBadge
                  startTime={assignment.match.startTime}
                  durationMinutes={assignment.match.durationMinutes ?? resolveMatchDurationMinutes(assignment.match, activeTournament)}
                  status={assignment.match.status}
                  size="sm"
                />
              )}
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: isFocusedFullscreen ? 'rgba(255,255,255,0.75)' : (isAudioActive ? '#34d399' : 'rgba(255,255,255,0.55)'),
              fontSize: isFocusedFullscreen ? '0.76rem' : '0.68rem'
            }}>
              {isFocusedFullscreen ? (
                assignment.rulesLabel || currentClub.name
              ) : (
                <>
                  {isAudioActive ? <Volume2 size={12} /> : <VolumeX size={12} />}
                  {slot.name}
                </>
              )}
            </span>
          </div>

          {hasMatchBanner ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: isFocusedFullscreen ? '1rem' : '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isFocusedFullscreen ? '0.75rem' : '0.4rem', minWidth: 0 }}>
                {assignment.p1 && (
                  <img src={getPlayerAvatar(assignment.p1)} alt="" style={{ width: isFocusedFullscreen ? '44px' : '26px', height: isFocusedFullscreen ? '44px' : '26px', borderRadius: '50%', objectFit: 'cover', border: isFocusedFullscreen ? '2px solid #00ffaa' : '1.5px solid #F59E0B' }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ color: '#fff', fontWeight: 800, fontSize: isFocusedFullscreen ? '1.25rem' : '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {assignment.p1Name}
                  </span>
                  {assignment.p1Club && (
                    <span style={{ color: '#34D399', fontWeight: 700, fontSize: isFocusedFullscreen ? '0.78rem' : '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {assignment.p1Club}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ background: '#F59E0B', color: '#000', fontWeight: 900, fontSize: isFocusedFullscreen ? '2rem' : '1.05rem', padding: isFocusedFullscreen ? '2px 18px' : '1px 10px', borderRadius: isFocusedFullscreen ? '10px' : '7px' }}>
                {assignment.score1} - {assignment.score2}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: isFocusedFullscreen ? '0.75rem' : '0.4rem', minWidth: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>
                  <span style={{ color: '#fff', fontWeight: 800, fontSize: isFocusedFullscreen ? '1.25rem' : '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {assignment.p2Name}
                  </span>
                  {assignment.p2Club && (
                    <span style={{ color: '#FBBF24', fontWeight: 700, fontSize: isFocusedFullscreen ? '0.78rem' : '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {assignment.p2Club}
                    </span>
                  )}
                </div>
                {assignment.p2 && (
                  <img src={getPlayerAvatar(assignment.p2)} alt="" style={{ width: isFocusedFullscreen ? '44px' : '26px', height: isFocusedFullscreen ? '44px' : '26px', borderRadius: '50%', objectFit: 'cover', border: isFocusedFullscreen ? '2px solid #00ffaa' : '1.5px solid #F59E0B' }} />
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: isFocusedFullscreen ? '0.88rem' : '0.74rem', color: 'rgba(255,255,255,0.78)', textAlign: 'center' }}>
              {assignment.subtitle}
            </div>
          )}
        </div>
      ) : (
        <div />
      )}

      {!isFocusedFullscreen && (
        <div style={{
          position: 'relative',
          zIndex: 10,
          alignSelf: 'flex-end',
          background: 'rgba(0,0,0,0.65)',
          color: 'rgba(255,255,255,0.8)',
          fontSize: '0.66rem',
          fontWeight: 700,
          padding: '2px 7px',
          borderRadius: '5px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <Maximize2 size={10} /> Cliquer pour diffuser seul
        </div>
      )}
    </div>
  );
};

export const DirectorTvOutputView: React.FC<DirectorTvOutputViewProps> = ({ onExitToAll }) => {
  const { tournaments, currentClub } = useStore();
  const [directorState, setDirectorState] = useState<MultiCamDirectorState>(() =>
    loadDirectorState(currentClub.id)
  );
  const [overlayConfig, setOverlayConfig] = useState<LiveOverlayConfig>(() =>
    loadLiveOverlayConfig(currentClub.id, 'live')
  );
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream | null>>({});
  const [usbStreams, setUsbStreams] = useState<Record<string, MediaStream | null>>({});
  const [soundAllowed, setSoundAllowed] = useState<boolean>(true);

  const viewerIdRef = useRef<string>(`tv_${Math.random().toString(36).slice(2, 8)}`);
  const signalingRef = useRef<Record<string, CameraSignalingHandle>>({});
  const peersRef = useRef<Record<string, { pc: RTCPeerConnection; sessionId: string }>>({});
  const usbRef = useRef<Record<string, { deviceId: string; stream: MediaStream }>>({});

  useEffect(() => {
    setDirectorState(loadDirectorState(currentClub.id));
    setOverlayConfig(loadLiveOverlayConfig(currentClub.id, 'live'));
    const u1 = subscribeToDirectorState(currentClub.id, setDirectorState);
    const u2 = subscribeToLiveOverlayConfig(currentClub.id, 'live', setOverlayConfig);
    return () => {
      u1();
      u2();
    };
  }, [currentClub.id]);

  const webrtcIds = directorState.cameras
    .filter(c => c.enabled && c.sourceType === 'smartphone_webrtc')
    .map(c => c.id)
    .join(',');

  useEffect(() => {
    const active = new Set(webrtcIds ? webrtcIds.split(',') : []);
    Object.keys(signalingRef.current).forEach(camId => {
      if (!active.has(camId)) {
        signalingRef.current[camId].destroy();
        delete signalingRef.current[camId];
        if (peersRef.current[camId]) {
          try { peersRef.current[camId].pc.close(); } catch {}
          delete peersRef.current[camId];
        }
      }
    });

    active.forEach(camId => {
      if (signalingRef.current[camId]) return;
      const viewerId = viewerIdRef.current;
      const pendingIce: RTCIceCandidateInit[] = [];
      const sig = createCameraSignalingChannel(currentClub.id, camId, {
        onSubscribed: () => sig.requestOffer(viewerId),
        onSenderOnline: () => {
          const cur = peersRef.current[camId]?.pc;
          if (!cur || cur.connectionState !== 'connected') sig.requestOffer(viewerId);
        },
        onOffer: async (sdp, sessionId, targetViewerId) => {
          if (targetViewerId !== viewerId) return;
          if (peersRef.current[camId]) {
            try { peersRef.current[camId].pc.close(); } catch {}
          }
          pendingIce.length = 0;
          const pc = new RTCPeerConnection(RTC_ICE_CONFIG);
          peersRef.current[camId] = { pc, sessionId };
          pc.ontrack = (ev) => {
            const s = ev.streams?.[0] || new MediaStream([ev.track]);
            setRemoteStreams(prev => ({ ...prev, [camId]: s }));
          };
          pc.onicecandidate = (ev) => {
            if (ev.candidate) sig.sendIceCandidate(ev.candidate.toJSON(), 'receiver', sessionId, viewerId);
          };
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            for (const c of pendingIce) {
              try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
            }
            pendingIce.length = 0;
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            if (pc.localDescription) sig.sendAnswer(pc.localDescription, sessionId, viewerId);
          } catch {}
        },
        onIceCandidate: async (candidate, role, sessionId, targetViewerId) => {
          const entry = peersRef.current[camId];
          if (targetViewerId !== viewerId || role !== 'sender' || !entry || entry.sessionId !== sessionId) return;
          if (entry.pc.remoteDescription) {
            try { await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
          } else {
            pendingIce.push(candidate);
          }
        }
      });
      signalingRef.current[camId] = sig;
    });
  }, [webrtcIds, currentClub.id]);

  const usbKey = directorState.cameras
    .filter(c => c.enabled && c.sourceType === 'usb')
    .map(c => `${c.id}:${c.usbDeviceId || 'default'}`)
    .join('|');

  useEffect(() => {
    const wanted = new Map<string, string>();
    directorState.cameras.forEach(c => {
      if (c.enabled && c.sourceType === 'usb') wanted.set(c.id, c.usbDeviceId || 'default');
    });

    Object.keys(usbRef.current).forEach(camId => {
      const cur = usbRef.current[camId];
      if (!wanted.has(camId) || wanted.get(camId) !== cur.deviceId) {
        cur.stream.getTracks().forEach(t => t.stop());
        delete usbRef.current[camId];
        setUsbStreams(prev => {
          const next = { ...prev };
          delete next[camId];
          return next;
        });
      }
    });

    wanted.forEach(async (devId, camId) => {
      if (usbRef.current[camId]) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: devId !== 'default' ? { deviceId: { exact: devId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
        usbRef.current[camId] = { deviceId: devId, stream };
        setUsbStreams(prev => ({ ...prev, [camId]: stream }));
      } catch {}
    });
  }, [usbKey]);

  useEffect(() => {
    return () => {
      Object.values(signalingRef.current).forEach(s => s.destroy());
      Object.values(peersRef.current).forEach(p => {
        try { p.pc.close(); } catch {}
      });
      Object.values(usbRef.current).forEach(u => u.stream.getTracks().forEach(t => t.stop()));
    };
  }, []);

  const getStreamForSlot = (slot: DirectorCameraSlot): MediaStream | null => {
    if (slot.sourceType === 'smartphone_webrtc') return remoteStreams[slot.id] || null;
    if (slot.sourceType === 'usb') return usbStreams[slot.id] || null;
    return null;
  };

  const updateState = (next: MultiCamDirectorState) => {
    setDirectorState(next);
    saveDirectorState(currentClub.id, next, true);
  };

  const activeTournament = Object.values(tournaments).slice().reverse().find(t => t.status === 'ongoing') || null;
  const isClubSituation = directorState.situation === 'club_tables';
  const enabledCams = directorState.cameras.filter(
    c => c.enabled && (isClubSituation || !isVirtualScreenSource(c.sourceType))
  );
  const focusedCandidate = directorState.broadcastMode === 'single' && directorState.focusedCameraId
    ? directorState.cameras.find(c => c.id === directorState.focusedCameraId)
    : null;
  const focusedCam = (focusedCandidate && (isClubSituation || !isVirtualScreenSource(focusedCandidate.sourceType)) ? focusedCandidate : null)
    || (directorState.broadcastMode === 'single' ? enabledCams[0] : null);

  const baseList = enabledCams.length > 0
    ? enabledCams
    : directorState.cameras.filter(c => isClubSituation || !isVirtualScreenSource(c.sourceType)).slice(0, 1);
  const list =
    focusedCam && !baseList.some(c => c.id === focusedCam.id)
      ? [...baseList, focusedCam]
      : baseList;
  const count = list.length;
  const gridCols = count <= 1
    ? '1fr'
    : count === 2
      ? (directorState.mosaicLayout === 'stacked' ? '1fr' : '1fr 1fr')
      : count <= 4
        ? '1fr 1fr'
        : 'repeat(3, 1fr)';
  const gridRows = count <= 1
    ? '1fr'
    : count === 2
      ? (directorState.mosaicLayout === 'stacked' ? '1fr 1fr' : '1fr')
      : '1fr 1fr';

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      backgroundColor: '#02040a',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      padding: '0.6rem',
      gap: '0.6rem',
      boxSizing: 'border-box',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(10, 15, 30, 0.92)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '10px',
        padding: '0.45rem 1rem',
        color: '#fff',
        flexShrink: 0,
        gap: '0.6rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          <div style={{ background: '#fff', padding: '2px 6px', borderRadius: '6px', display: 'inline-flex' }}>
            <img
              src={getClubLogoUrl(currentClub.logoUrl)}
              alt={currentClub.name}
              style={{ height: '24px', objectFit: 'contain' }}
              onError={(e) => { e.currentTarget.src = defaultClubLogo; }}
            />
          </div>
          <span style={{ fontWeight: 900, fontSize: '0.95rem', color: '#F59E0B' }}>
            📺 ÉCRAN MULTIPLE LIVE • {directorState.situation === 'cuescore_live' ? ((directorState.regionalMatch.cueScoreInput?.trim() && directorState.regionalMatch.cueScoreTournamentId?.trim() && directorState.regionalMatch.cueScoreTournamentName?.trim()) ? directorState.regionalMatch.cueScoreTournamentName : 'Live CueScore') : directorState.situation === 'regional_match' ? (directorState.regionalMatch.eventTitle || 'Tournoi Régional') : currentClub.name}
          </span>
          {directorState.situation === 'club_tables' && activeTournament && (
            <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
              🏆 {activeTournament.name}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <button
            type="button"
            onClick={() => setSoundAllowed(v => !v)}
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer' }}
          >
            {soundAllowed ? '🔊 Son ON' : '🔇 Muet'}
          </button>
          {onExitToAll && (
            <button
              type="button"
              onClick={onExitToAll}
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
            >
              🎱 Vue Billards
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
              else document.exitFullscreen?.();
            }}
            style={{ background: '#00ffaa', color: '#000', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '0.76rem', fontWeight: 900, cursor: 'pointer' }}
          >
            ⛶ PLEIN ÉCRAN
          </button>
        </div>
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: gridCols,
        gridTemplateRows: gridRows,
        gap: '0.6rem',
        width: '100%',
        height: '100%'
      }}>
        {list.map(slot => {
          const isFocusedTile = Boolean(focusedCam && focusedCam.id === slot.id);
          const isHiddenByOther = Boolean(focusedCam && focusedCam.id !== slot.id);
          const isTileAudioActive = isFocusedTile
            ? (soundAllowed && !slot.forceMuted && !isVirtualScreenSource(slot.sourceType))
            : focusedCam
              ? false
              : (soundAllowed && !slot.forceMuted && !isVirtualScreenSource(slot.sourceType) && directorState.activeAudioCameraId === slot.id);

          return (
            <DirectorOutputTile
              key={slot.id}
              slot={slot}
              directorState={directorState}
              stream={getStreamForSlot(slot)}
              isAudioActive={isTileAudioActive}
              isFocusedFullscreen={isFocusedTile}
              isHiddenByOtherFullscreen={isHiddenByOther}
              overlayConfig={overlayConfig}
              onClickTile={() => {
                const keepMic = isVirtualScreenSource(slot.sourceType);
                updateState({
                  ...directorState,
                  broadcastMode: 'single',
                  focusedCameraId: slot.id,
                  activeAudioCameraId: keepMic ? directorState.activeAudioCameraId : slot.id
                });
              }}
            />
          );
        })}
      </div>

      {focusedCam && (
        <div style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 25,
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          background: 'rgba(5, 8, 22, 0.85)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.18)',
          padding: '6px 10px',
          borderRadius: '10px'
        }}>
          <button
            type="button"
            onClick={() => updateState({ ...directorState, broadcastMode: 'mosaic', focusedCameraId: null })}
            style={{ background: '#f59e0b', color: '#000', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer' }}
          >
            ⊞ Revenir à l'Écran Multiple
          </button>
          <button
            type="button"
            onClick={() => setSoundAllowed(v => !v)}
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 9px', fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer' }}
          >
            {soundAllowed ? '🔊 Son ON' : '🔇 Muet'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
              else document.exitFullscreen?.();
            }}
            style={{ background: '#00ffaa', color: '#000', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer' }}
          >
            ⛶ Plein écran
          </button>
        </div>
      )}
    </div>
  );
};

export default DirectorTvOutputView;
